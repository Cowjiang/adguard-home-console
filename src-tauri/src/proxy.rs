//! `agh_fetch` — the Tauri-shell adapter of the frontend-owned proxy contract
//! in `src/lib/api.ts`, pinned by `contract/agh-proxy.contract.json` (the
//! Express adapter implements the same file via `server/proxy.test.mjs`):
//! - Path normalization: `/api/agh/*` → `/control/*` (short paths such as
//!   `/control/...` or `/status` are also accepted)
//! - Manually follows 301/302/307/308 up to 3 times; each hop swaps the whole
//!   origin and replays the original request path, and only while the hostname
//!   stays the same: replaying the Authorization header to another host would
//!   hand it the admin password. Other statuses (303 etc.) pass through.
//! - Backstop timeouts keyed on the query-stripped path: 120s for
//!   `/filtering/refresh`, 25s otherwise (same rule and unit tests as Express)
//! - Adapter-generated failures return the same struct as upstream responses
//!   (status=400/502 + `{"error":detail,"kind":...}` body). `kind` is
//!   machine-readable; all user-facing copy lives in the frontend i18n, so no
//!   error text is mirrored here. Upstream responses pass through untouched and
//!   JSON is not parsed or rewritten in Rust. `content_type` is carried for
//!   contract completeness; the frontend currently ignores it.
//! - Never prints Authorization/passwords (this module has no request-header logs)
//! Allowed variance vs the Express adapter: no request-body size limit (local
//! IPC), and reqwest error details are English technical text.
use std::sync::OnceLock;
use std::time::Duration;

use serde::Serialize;
use url::Url;

const MAX_REDIRECTS: usize = 3;
const REDIRECT_CODES: [u16; 4] = [301, 302, 307, 308];
const TIMEOUT_DEFAULT: Duration = Duration::from_secs(25);
const TIMEOUT_FILTERING_REFRESH: Duration = Duration::from_secs(120);

/// Machine-readable error kinds emitted in the body (`{"error","kind"}`); the
/// frontend maps them to localized copy (i18n `proxy.*` keys)
const KIND_MISSING_TARGET: &str = "missing_target";
const KIND_INVALID_TARGET: &str = "invalid_target";
const KIND_TIMEOUT: &str = "timeout";
const KIND_CROSS_HOST_REDIRECT: &str = "cross_host_redirect";
const KIND_INVALID_REDIRECT: &str = "invalid_redirect";
const KIND_NETWORK: &str = "network";

/// Return value of the invoke. Errors use the same struct (status=400/502 +
/// body_text=`{"error":detail,"kind":...}`); the frontend maps non-2xx to
/// ApiError, matching the fetch path semantics exactly.
#[derive(Debug, Serialize)]
pub struct AghFetchResult {
    pub status: u16,
    pub content_type: String,
    pub body_text: String,
}

impl AghFetchResult {
    fn error(status: u16, kind: &str, detail: &str) -> Self {
        AghFetchResult {
            status,
            content_type: "application/json".into(),
            body_text: serde_json::json!({ "error": detail, "kind": kind }).to_string(),
        }
    }
}

/// Maps a reqwest failure onto the adapter's 502 envelope; timeouts keep their
/// own kind so the frontend can say "timed out" instead of "network".
fn net_error(e: &reqwest::Error) -> AghFetchResult {
    if e.is_timeout() {
        AghFetchResult::error(502, KIND_TIMEOUT, "upstream request timed out")
    } else {
        // reqwest error messages only contain URL/IO details, no request headers
        AghFetchResult::error(502, KIND_NETWORK, &e.to_string())
    }
}

/// Path normalization: mirrors Express
/// `req.originalUrl.replace(/^\/api\/agh/, '/control')`
fn normalize_path(path_with_query: &str) -> String {
    let p = path_with_query.trim();
    let p = if p.is_empty() { "/" } else { p };
    let with_control = if let Some(rest) = p.strip_prefix("/api/agh") {
        format!("/control{rest}")
    } else if p.starts_with("/control") {
        p.to_string()
    } else if let Some(rest) = p.strip_prefix('/') {
        format!("/control/{rest}")
    } else {
        format!("/control/{p}")
    };
    with_control
}

/// Builds the final upstream URL. Express uses `targetUrl.origin` plus the
/// normalized path (any path inside target is dropped)
fn upstream_url(target: &str, path_with_query: &str) -> Result<Url, String> {
    let t = Url::parse(target.trim()).map_err(|_| "invalid target URL".to_string())?;
    if t.scheme() != "http" && t.scheme() != "https" {
        return Err("target must be an http(s) URL".into());
    }
    let origin = t.origin().ascii_serialization();
    Url::parse(&format!("{origin}{}", normalize_path(path_with_query)))
        .map_err(|_| "invalid target URL".to_string())
}

/// Redirect target for 308-style redirects: `new URL(location, upstream).origin`.
/// Same hostname only (scheme and port may change): Authorization is replayed on
/// every hop, so following another host would leak the admin password
fn redirect_target(current: &Url, location: &str, origin_host: Option<&str>) -> Result<String, (&'static str, String)> {
    let loc = Url::parse(location)
        .or_else(|_| current.join(location))
        .map_err(|_| (KIND_INVALID_REDIRECT, "invalid redirect location".to_string()))?;
    if !matches!(loc.origin(), url::Origin::Tuple(_, _, _)) {
        return Err((KIND_INVALID_REDIRECT, "invalid redirect location".into()));
    }
    let host = loc.host_str().map(|h| h.to_ascii_lowercase());
    if host.is_none() || host.as_deref() != origin_host {
        return Err((
            KIND_CROSS_HOST_REDIRECT,
            "upstream redirected to another host; credentials not forwarded".into(),
        ));
    }
    Ok(loc.origin().ascii_serialization())
}

/// Backstop timeout for one upstream attempt, keyed on the query-stripped path
/// (both adapters share this rule and its unit tests)
fn timeout_for(path_with_query: &str, default_timeout: Duration, refresh_timeout: Duration) -> Duration {
    let path = path_with_query.split('?').next().unwrap_or("");
    if path.contains("/filtering/refresh") {
        refresh_timeout
    } else {
        default_timeout
    }
}

/// One process-wide client. reqwest pools connections per host, so building a
/// client per request (the previous shape) redid TCP+TLS on every call — the
/// shell fires several AGH requests per page plus the 15s probes. The backstop
/// timeout is applied per request instead, which also gives each redirect hop
/// its own budget.
fn shared_client() -> Result<&'static reqwest::Client, String> {
    static CLIENT: OnceLock<Result<reqwest::Client, String>> = OnceLock::new();
    CLIENT
        .get_or_init(|| {
            reqwest::Client::builder()
                .redirect(reqwest::redirect::Policy::none())
                .build()
                .map_err(|e| format!("HTTP client init failed: {e}"))
        })
        .as_ref()
        .map_err(|e| e.clone())
}

/// Core implementation with injectable backstop timeouts (contract runner uses
/// short ones); production entry points use the constants
async fn agh_fetch_impl_with_timeouts(
    method: &str,
    target: &str,
    auth_header: &str,
    path_with_query: &str,
    body_json: Option<&str>,
    default_timeout: Duration,
    refresh_timeout: Duration,
) -> AghFetchResult {
    if target.trim().is_empty() {
        return AghFetchResult::error(400, KIND_MISSING_TARGET, "missing X-AGH-Target header");
    }
    let ok_method = match reqwest::Method::from_bytes(method.to_uppercase().as_bytes()) {
        Ok(m) => m,
        Err(_) => return AghFetchResult::error(400, KIND_INVALID_TARGET, "unsupported HTTP method"),
    };
    let timeout = timeout_for(path_with_query, default_timeout, refresh_timeout);
    let client = match shared_client() {
        Ok(c) => c,
        Err(msg) => return AghFetchResult::error(502, KIND_NETWORK, &msg),
    };

    // Manual redirect following: same hostname only, origin swap with the request
    // path kept unchanged (Express semantics). The caller's target pins the host.
    let origin_host = Url::parse(target.trim())
        .ok()
        .and_then(|u| u.host_str().map(|h| h.to_ascii_lowercase()));
    let mut redirects: usize = 0;
    let mut current_target = target.to_string();
    loop {
        let upstream = match upstream_url(&current_target, path_with_query) {
            Ok(u) => u,
            Err(msg) => return AghFetchResult::error(400, KIND_INVALID_TARGET, &msg),
        };
        let mut req = client
            .request(ok_method.clone(), upstream.clone())
            .timeout(timeout);
        if !auth_header.is_empty() {
            req = req.header(reqwest::header::AUTHORIZATION, auth_header);
        }
        if ok_method != reqwest::Method::GET && ok_method != reqwest::Method::HEAD {
            let body = body_json.unwrap_or("{}");
            req = req
                .header(reqwest::header::CONTENT_TYPE, "application/json")
                .body(body.to_string());
        }

        let resp = match req.send().await {
            Ok(r) => r,
            Err(e) => return net_error(&e),
        };

        let status = resp.status().as_u16();
        // A hop only counts when upstream named a target: a redirect status
        // without one passes through untouched, as does one past the hop budget
        let location = resp
            .headers()
            .get(reqwest::header::LOCATION)
            .and_then(|v| v.to_str().ok())
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        if REDIRECT_CODES.contains(&status) && redirects < MAX_REDIRECTS {
            if let Some(loc) = location {
                match redirect_target(&upstream, &loc, origin_host.as_deref()) {
                    Ok(origin) => {
                        current_target = origin;
                        redirects += 1;
                        continue;
                    }
                    Err((kind, msg)) => return AghFetchResult::error(502, kind, &msg),
                }
            }
        }

        let content_type = resp
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("application/json")
            .to_string();
        let body_text = match resp.text().await {
            Ok(t) => t,
            Err(e) => return net_error(&e),
        };
        return AghFetchResult {
            status,
            content_type,
            body_text,
        };
    }
}

/// Core implementation (production timeouts)
async fn agh_fetch_impl(
    method: &str,
    target: &str,
    auth_header: &str,
    path_with_query: &str,
    body_json: Option<&str>,
) -> AghFetchResult {
    agh_fetch_impl_with_timeouts(
        method,
        target,
        auth_header,
        path_with_query,
        body_json,
        TIMEOUT_DEFAULT,
        TIMEOUT_FILTERING_REFRESH,
    )
    .await
}

/// Tauri command: always returns Ok with the result struct; error semantics
/// live inside the struct (consistent with Express)
#[tauri::command]
pub async fn agh_fetch(
    method: String,
    target: String,
    auth_header: String,
    path_with_query: String,
    body_json: Option<String>,
) -> AghFetchResult {
    agh_fetch_impl(
        &method,
        &target,
        &auth_header,
        &path_with_query,
        body_json.as_deref(),
    )
    .await
}

// ---------- Unit tests ----------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_path_cases() {
        assert_eq!(normalize_path("/status"), "/control/status");
        assert_eq!(normalize_path("/status?x=1"), "/control/status?x=1");
        assert_eq!(normalize_path("/api/agh/stats"), "/control/stats");
        assert_eq!(normalize_path("/api/agh/querylog?limit=5"), "/control/querylog?limit=5");
        assert_eq!(normalize_path("/control/stats"), "/control/stats");
        assert_eq!(normalize_path(""), "/control/");
    }

    #[test]
    fn upstream_cases() {
        let u = upstream_url("http://127.0.0.1:3990", "/status").unwrap();
        assert_eq!(u.as_str(), "http://127.0.0.1:3990/control/status");
        // Origin semantics when target has a path: drop the target path
        // (mirrors new URL(path, origin))
        let u2 = upstream_url("http://127.0.0.1:3990/sub", "/status").unwrap();
        assert_eq!(u2.as_str(), "http://127.0.0.1:3990/control/status");
        // Reject non-http schemes
        assert!(upstream_url("ftp://example.com", "/status").is_err());
        assert!(upstream_url("file:///etc/passwd", "/status").is_err());
    }

    #[test]
    fn redirect_same_host_only() {
        let cur = Url::parse("http://a.example:8080/control/status").unwrap();
        // Same host with another scheme/port: allowed (the http->https upgrade is why
        // redirects are followed at all); origin serialization has no trailing slash
        assert_eq!(
            redirect_target(&cur, "https://a.example:8443/other", Some("a.example")).unwrap(),
            "https://a.example:8443"
        );
        // Relative location resolves against the current upstream: same host
        assert_eq!(
            redirect_target(&cur, "/control/other", Some("a.example")).unwrap(),
            "http://a.example:8080"
        );
        // Another host: refused, Authorization would be replayed to it
        assert!(redirect_target(&cur, "https://b.example/x", Some("a.example")).is_err());
        assert!(redirect_target(&cur, "//c.example/control", Some("a.example")).is_err());
    }

    #[test]
    fn timeout_cases() {
        // Keyed on the query-stripped path; a marker appearing only in the
        // query must not widen the tier
        assert_eq!(timeout_for("/filtering/refresh", TIMEOUT_DEFAULT, TIMEOUT_FILTERING_REFRESH), TIMEOUT_FILTERING_REFRESH);
        assert_eq!(timeout_for("/filtering/refresh?x=1", TIMEOUT_DEFAULT, TIMEOUT_FILTERING_REFRESH), TIMEOUT_FILTERING_REFRESH);
        assert_eq!(timeout_for("/status", TIMEOUT_DEFAULT, TIMEOUT_FILTERING_REFRESH), TIMEOUT_DEFAULT);
        assert_eq!(timeout_for("/stats?search=/filtering/refresh", TIMEOUT_DEFAULT, TIMEOUT_FILTERING_REFRESH), TIMEOUT_DEFAULT);
    }
}

// ---------- Contract fixture runner ----------
// Drives agh_fetch_impl_with_timeouts against scripted origin servers using the
// SAME scenario file as the Express runner (server/proxy.test.mjs), so a
// semantic change on either adapter fails here or there. The runner rules are
// documented in the fixture's `comment` header.

#[cfg(test)]
mod contract {
    use super::*;
    use serde::Deserialize;
    use serde_json::{json, Value};
    use std::collections::HashMap;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;
    use tokio::sync::Mutex;

    const CONTRACT_JSON: &str = include_str!("../../contract/agh-proxy.contract.json");
    /// Short backstop so the timeout scenario (origin delay 2000ms) runs fast
    const BACKSTOP_MS: Duration = Duration::from_millis(300);

    #[derive(Deserialize)]
    struct Contract {
        scenarios: Vec<Scenario>,
    }

    #[derive(Deserialize)]
    struct Scenario {
        id: String,
        request: ReqSpec,
        #[serde(default)]
        origins: HashMap<String, Vec<OriginReply>>,
        expect: ExpectSpec,
    }

    #[derive(Deserialize)]
    struct ReqSpec {
        method: String,
        path: String,
        /// missing → default origin A; null → omit target; value → explicit target
        #[serde(default)]
        target: Option<Option<String>>,
        #[serde(default)]
        auth: Option<String>,
        #[serde(default)]
        body: Option<Value>,
        /// No Rust-side input exists for extra client headers (the impl takes
        /// none); the whitelist contract is exercised by the Express runner
        #[serde(default, rename = "extraHeaders")]
        #[allow(dead_code)]
        extra_headers: HashMap<String, String>,
    }

    #[derive(Deserialize, Clone)]
    struct OriginReply {
        status: u16,
        #[serde(default)]
        headers: HashMap<String, String>,
        #[serde(default)]
        json: Option<Value>,
        #[serde(default)]
        body: Option<String>,
        #[serde(default, rename = "delayMs")]
        delay_ms: Option<u64>,
    }

    #[derive(Deserialize)]
    struct ExpectSpec {
        status: u16,
        #[serde(default)]
        json: Option<Value>,
        #[serde(default)]
        kind: Option<String>,
        /// missing = the scenario does not pin origin observations
        #[serde(default)]
        seen: Option<Vec<SeenSpec>>,
    }

    #[derive(Deserialize)]
    struct SeenSpec {
        origin: String,
        #[serde(default)]
        method: Option<String>,
        #[serde(default)]
        path: Option<String>,
        /// null = the header must be absent
        #[serde(default)]
        auth: Option<Option<String>>,
        /// null = the body must be empty; value = parsed deep-equal
        #[serde(default)]
        body: Option<Option<Value>>,
        #[serde(default, rename = "absentHeaders")]
        absent_headers: Vec<String>,
    }

    #[derive(Clone, Debug)]
    struct Hit {
        origin: String,
        method: String,
        path: String,
        auth: Option<String>,
        body: String,
        headers: HashMap<String, String>,
    }

    fn status_text(code: u16) -> &'static str {
        match code {
            200 => "OK",
            302 => "Found",
            303 => "See Other",
            308 => "Permanent Redirect",
            400 => "Bad Request",
            401 => "Unauthorized",
            404 => "Not Found",
            500 => "Internal Server Error",
            503 => "Service Unavailable",
            _ => "",
        }
    }

    /// Scripted origin server: replies consumed per hit in order, every request
    /// recorded into the scenario-shared `hits` (chronological across origins)
    async fn spawn_scripted_origin(
        name: String,
        replies: Vec<OriginReply>,
        hits: Arc<Mutex<Vec<Hit>>>,
        urls: Arc<Mutex<HashMap<String, String>>>,
    ) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let replies = Arc::new(replies);
        let served = Arc::new(AtomicUsize::new(0));
        tokio::spawn(async move {
            loop {
                let Ok((mut sock, _)) = listener.accept().await else { break };
                let replies = replies.clone();
                let hits = hits.clone();
                let urls = urls.clone();
                let name = name.clone();
                let served = served.clone();
                tokio::spawn(async move {
                    let mut buf: Vec<u8> = Vec::new();
                    let mut tmp = [0u8; 4096];
                    let head_end = loop {
                        let n = sock.read(&mut tmp).await.unwrap_or(0);
                        if n == 0 { return; }
                        buf.extend_from_slice(&tmp[..n]);
                        if let Some(pos) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
                            break pos;
                        }
                        if buf.len() > 1_048_576 { return; }
                    };
                    let head = String::from_utf8_lossy(&buf[..head_end]).to_string();
                    let mut body_bytes = buf[head_end + 4..].to_vec();
                    let content_len = head
                        .to_ascii_lowercase()
                        .split("\r\n")
                        .find_map(|l| l.strip_prefix("content-length:").and_then(|v| v.trim().parse::<usize>().ok()))
                        .unwrap_or(0);
                    while body_bytes.len() < content_len {
                        let n = sock.read(&mut tmp).await.unwrap_or(0);
                        if n == 0 { break; }
                        body_bytes.extend_from_slice(&tmp[..n]);
                    }
                    let mut lines = head.split("\r\n");
                    let request_line = lines.next().unwrap_or("");
                    let mut parts = request_line.split_whitespace();
                    let method = parts.next().unwrap_or("").to_string();
                    let path = parts.next().unwrap_or("").to_string();
                    let mut auth = None;
                    let mut headers = HashMap::new();
                    for line in lines {
                        if let Some((k, v)) = line.split_once(':') {
                            let key = k.trim().to_ascii_lowercase();
                            let val = v.trim().to_string();
                            if key == "authorization" { auth = Some(val.clone()); }
                            headers.insert(key, val);
                        }
                    }
                    hits.lock().await.push(Hit {
                        origin: name,
                        method,
                        path,
                        auth,
                        body: String::from_utf8_lossy(&body_bytes).to_string(),
                        headers,
                    });

                    let idx = served.fetch_add(1, Ordering::SeqCst);
                    let reply = replies.get(idx).cloned().unwrap_or(OriginReply {
                        status: 500,
                        headers: HashMap::new(),
                        json: Some(json!({ "error": "origin script exhausted" })),
                        body: None,
                        delay_ms: None,
                    });
                    if let Some(d) = reply.delay_ms {
                        tokio::time::sleep(Duration::from_millis(d)).await;
                    }
                    let mut out_headers = String::new();
                    for (k, v) in &reply.headers {
                        let mut val = v.clone();
                        for (n, url) in urls.lock().await.iter() {
                            val = val.replace(&format!("{{{n}}}"), url);
                        }
                        out_headers.push_str(&format!("{k}: {val}\r\n"));
                    }
                    let body_out = match (&reply.json, &reply.body) {
                        (Some(j), _) => j.to_string(),
                        (None, Some(b)) => b.clone(),
                        _ => String::new(),
                    };
                    let resp = format!(
                        "HTTP/1.1 {} {}\r\ncontent-type: application/json\r\ncontent-length: {}\r\n{}connection: close\r\n\r\n{}",
                        reply.status,
                        status_text(reply.status),
                        body_out.len(),
                        out_headers,
                        body_out
                    );
                    let _ = sock.write_all(resp.as_bytes()).await;
                    let _ = sock.flush().await;
                    let _ = sock.shutdown().await;
                });
            }
        });
        base
    }

    fn resolve_placeholders(raw: &str, bases: &[(String, String)]) -> String {
        let mut out = raw.to_string();
        for (n, b) in bases {
            out = out.replace(&format!("{{{n}}}"), b);
        }
        out
    }

    fn err_str(e: serde_json::Error) -> String {
        e.to_string()
    }

    async fn run_scenario(scn: &Scenario) -> Result<(), String> {
        let hits = Arc::new(Mutex::new(Vec::new()));
        let urls = Arc::new(Mutex::new(HashMap::new()));
        let mut bases: Vec<(String, String)> = Vec::new();
        for (name, replies) in &scn.origins {
            let base = spawn_scripted_origin(name.clone(), replies.clone(), hits.clone(), urls.clone()).await;
            bases.push((name.clone(), base));
        }
        {
            let mut u = urls.lock().await;
            for (n, b) in &bases {
                u.insert(n.clone(), b.clone());
            }
        }

        let target = match &scn.request.target {
            None => bases.iter().find(|(n, _)| n == "A").map(|(_, b)| b.clone()).unwrap_or_default(),
            Some(None) => String::new(),
            Some(Some(t)) => resolve_placeholders(t, &bases),
        };
        let body_json = scn.request.body.as_ref().map(|b| b.to_string());
        let result = agh_fetch_impl_with_timeouts(
            &scn.request.method,
            &target,
            scn.request.auth.as_deref().unwrap_or(""),
            &format!("/api/agh{}", scn.request.path),
            body_json.as_deref(),
            BACKSTOP_MS,
            BACKSTOP_MS,
        )
        .await;

        let expect = &scn.expect;
        if result.status != expect.status {
            return Err(format!("status {} != {} (body: {})", result.status, expect.status, result.body_text));
        }
        let parsed: Option<Value> = if result.body_text.is_empty() {
            None
        } else {
            serde_json::from_str(&result.body_text).map_err(err_str).ok()
        };
        match &expect.kind {
            Some(k) => {
                let got = parsed.as_ref().and_then(|v| v.get("kind")).and_then(|v| v.as_str());
                if got != Some(k.as_str()) {
                    return Err(format!("kind {got:?} != {k:?} (body: {})", result.body_text));
                }
                if parsed.as_ref().and_then(|v| v.get("error")).and_then(|v| v.as_str()).is_none() {
                    return Err("kind errors must carry a technical detail".into());
                }
            }
            None => {
                if parsed.as_ref().and_then(|v| v.get("kind")).is_some() {
                    return Err(format!("unexpected kind (body: {})", result.body_text));
                }
            }
        }
        if let Some(want) = &expect.json {
            if parsed.as_ref() != Some(want) {
                return Err(format!("body {:?} != {:?}", parsed, want));
            }
        }
        if let Some(seen_spec) = &expect.seen {
            let observed = hits.lock().await;
            let origins: Vec<String> = observed.iter().map(|h| h.origin.clone()).collect();
            if observed.len() != seen_spec.len() {
                return Err(format!("hit count {} != {} ({:?})", observed.len(), seen_spec.len(), origins));
            }
            for (i, spec) in seen_spec.iter().enumerate() {
                let h = &observed[i];
                let ctx = format!("hit {i} ({:?})", h);
                if h.origin != spec.origin {
                    return Err(format!("{ctx}: origin {} != {}", h.origin, spec.origin));
                }
                if let Some(m) = &spec.method {
                    if &h.method != m {
                        return Err(format!("{ctx}: method {} != {}", h.method, m));
                    }
                }
                if let Some(p) = &spec.path {
                    if &h.path != p {
                        return Err(format!("{ctx}: path {} != {}", h.path, p));
                    }
                }
                if let Some(a) = &spec.auth {
                    match a {
                        None => {
                            if h.auth.is_some() {
                                return Err(format!("{ctx}: auth must be absent"));
                            }
                        }
                        Some(v) => {
                            if h.auth.as_deref() != Some(v.as_str()) {
                                return Err(format!("{ctx}: auth {:?} != {:?}", h.auth, v));
                            }
                        }
                    }
                }
                if let Some(b) = &spec.body {
                    match b {
                        None => {
                            if !h.body.is_empty() {
                                return Err(format!("{ctx}: body must be empty, got {:?}", h.body));
                            }
                        }
                        Some(v) => match serde_json::from_str::<Value>(&h.body) {
                            Ok(got) => {
                                if &got != v {
                                    return Err(format!("{ctx}: body {got} != {v}"));
                                }
                            }
                            Err(_) => return Err(format!("{ctx}: body {:?} is not JSON", h.body)),
                        },
                    }
                }
                for name in &spec.absent_headers {
                    if h.headers.contains_key(name) {
                        return Err(format!("{ctx}: must not forward header {name}"));
                    }
                }
            }
        }
        Ok(())
    }

    #[tokio::test]
    async fn contract_scenarios() {
        let contract: Contract = serde_json::from_str(CONTRACT_JSON).expect("fixture must parse");
        let mut failures = Vec::new();
        for scn in &contract.scenarios {
            if let Err(msg) = run_scenario(scn).await {
                failures.push(format!("{}: {msg}", scn.id));
            }
        }
        assert!(failures.is_empty(), "contract failures:\n{}", failures.join("\n"));
    }
}

// ---------- Connection pooling ----------
// Not part of the contract fixture: reuse is adapter-internal, and the fixture's
// scripted origins reply with `connection: close` (each scenario asserts one
// request), so they cannot observe pooling. This origin keeps its connection
// open and counts accepts instead.

#[cfg(test)]
mod pool {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    /// Serves any number of GETs on one connection (no request bodies).
    async fn spawn_keepalive_origin(accepts: Arc<AtomicUsize>) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        tokio::spawn(async move {
            loop {
                let Ok((mut sock, _)) = listener.accept().await else { break };
                accepts.fetch_add(1, Ordering::SeqCst);
                tokio::spawn(async move {
                    let mut buf: Vec<u8> = Vec::new();
                    let mut tmp = [0u8; 1024];
                    loop {
                        // One request head per iteration, then reply and wait for
                        // the next one on the same socket.
                        let head_end = loop {
                            if let Some(pos) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
                                break pos;
                            }
                            let n = sock.read(&mut tmp).await.unwrap_or(0);
                            if n == 0 { return; }
                            buf.extend_from_slice(&tmp[..n]);
                        };
                        buf.drain(..head_end + 4);
                        let body = r#"{"ok":true}"#;
                        let resp = format!(
                            "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\n\r\n{}",
                            body.len(),
                            body
                        );
                        if sock.write_all(resp.as_bytes()).await.is_err() { return; }
                        let _ = sock.flush().await;
                    }
                });
            }
        });
        base
    }

    /// Two sequential requests to the same origin must share one TCP connection:
    /// an accept count of two means the client (not the pool) was rebuilt per call.
    #[tokio::test]
    async fn sequential_requests_reuse_the_connection() {
        let accepts = Arc::new(AtomicUsize::new(0));
        let base = spawn_keepalive_origin(accepts.clone()).await;
        for _ in 0..2 {
            let r = agh_fetch_impl_with_timeouts(
                "GET",
                &base,
                "",
                "/status",
                None,
                Duration::from_secs(5),
                Duration::from_secs(5),
            )
            .await;
            assert_eq!(r.status, 200, "body: {}", r.body_text);
        }
        // A second accept would land immediately; give it a moment before asserting
        tokio::time::sleep(Duration::from_millis(100)).await;
        assert_eq!(
            accepts.load(Ordering::SeqCst),
            1,
            "the adapter opened a new connection per request"
        );
    }
}
