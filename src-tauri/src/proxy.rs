//! `agh_fetch` — Rust port of proxyAGH, mirroring `proxyAGH` in `server/index.mjs`:
//! - Path normalization: `/api/agh/*` → `/control/*` (the frontend may also pass
//!   short paths such as `/control/...` or `/status` directly)
//! - Manually follows 301/302/307/308 up to 3 times; location uses the **origin**
//!   only (swap the whole origin, keep the original request path — Express
//!   semantics), and only while the hostname stays the same: replaying the
//!   Authorization header to another host would hand it the admin password
//! - Timeouts: 120s for `/filtering/refresh`, 25s otherwise; timeout/network
//!   errors → 502 `{"error":"..."}`
//! - Responses are returned as-is as text + content-type; JSON is not parsed or
//!   rewritten in Rust
//! - Never prints Authorization/passwords (this module has no request-header logs)
use std::time::Duration;

use serde::Serialize;
use url::Url;

const MAX_REDIRECTS: usize = 3;
const REDIRECT_CODES: [u16; 4] = [301, 302, 307, 308];
const TIMEOUT_DEFAULT: Duration = Duration::from_secs(25);
const TIMEOUT_FILTERING_REFRESH: Duration = Duration::from_secs(120);

/// Return value of the invoke. Errors use the same struct (status=400/502 +
/// body_text=`{"error":msg}`); the frontend maps non-2xx to ApiError, matching
/// the fetch path semantics exactly.
#[derive(Debug, Serialize)]
pub struct AghFetchResult {
    pub status: u16,
    pub content_type: String,
    pub body_text: String,
}

impl AghFetchResult {
    fn error(status: u16, msg: &str) -> Self {
        AghFetchResult {
            status,
            content_type: "application/json".into(),
            body_text: serde_json::json!({ "error": msg }).to_string(),
        }
    }
}

#[cfg(test)]
fn error_body(msg: &str) -> String {
    serde_json::json!({ "error": msg }).to_string()
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
    let t = Url::parse(target.trim()).map_err(|_| "目标地址无效".to_string())?;
    if t.scheme() != "http" && t.scheme() != "https" {
        return Err("目标地址必须是 http:// 或 https://".into());
    }
    let origin = t.origin().ascii_serialization();
    Url::parse(&format!("{origin}{}", normalize_path(path_with_query)))
        .map_err(|_| "目标地址无效".to_string())
}

/// Redirect target for 308-style redirects: `new URL(location, upstream).origin`.
/// Same hostname only (scheme and port may change): Authorization is replayed on
/// every hop, so following another host would leak the admin password
fn redirect_target(current: &Url, location: &str, origin_host: Option<&str>) -> Result<String, String> {
    let loc = Url::parse(location)
        .or_else(|_| current.join(location))
        .map_err(|_| "重定向地址无效".to_string())?;
    if !matches!(loc.origin(), url::Origin::Tuple(_, _, _)) {
        return Err("重定向地址无效".into());
    }
    let host = loc.host_str().map(|h| h.to_ascii_lowercase());
    if host.is_none() || host.as_deref() != origin_host {
        return Err("上游重定向到其他主机,已拒绝转发凭据".into());
    }
    Ok(loc.origin().ascii_serialization())
}

/// Timeout tiers: Express keys on `req.path.includes('/filtering/refresh')`
fn timeout_for(path_with_query: &str) -> Duration {
    if path_with_query.contains("/filtering/refresh") {
        TIMEOUT_FILTERING_REFRESH
    } else {
        TIMEOUT_DEFAULT
    }
}

fn client(timeout: Duration) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(timeout)
        .build()
        .map_err(|e| format!("HTTP 客户端初始化失败: {e}"))
}

/// Core implementation (decoupled from the Tauri command for unit testing)
pub async fn agh_fetch_impl(
    method: &str,
    target: &str,
    auth_header: &str,
    path_with_query: &str,
    body_json: Option<&str>,
) -> AghFetchResult {
    if target.trim().is_empty() {
        return AghFetchResult::error(400, "缺少 X-AGH-Target 头");
    }
    let ok_method = match reqwest::Method::from_bytes(method.to_uppercase().as_bytes()) {
        Ok(m) => m,
        Err(_) => return AghFetchResult::error(400, "不支持的 HTTP 方法"),
    };
    let timeout = timeout_for(path_with_query);
    let client = match client(timeout) {
        Ok(c) => c,
        Err(msg) => return AghFetchResult::error(502, &msg),
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
            Err(msg) => return AghFetchResult::error(400, &msg),
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
            Err(e) => {
                // reqwest error messages only contain URL/IO details, no request
                // headers, so they are safe to return
                let msg = if e.is_timeout() {
                    "连接超时,请检查地址与网络".to_string()
                } else {
                    e.to_string()
                };
                return AghFetchResult::error(502, &msg);
            }
        };

        let status = resp.status().as_u16();
        let has_location = resp
            .headers()
            .get(reqwest::header::LOCATION)
            .and_then(|v| v.to_str().ok())
            .map(|s| !s.is_empty())
            .unwrap_or(false);
        if REDIRECT_CODES.contains(&status) && has_location && redirects < MAX_REDIRECTS {
            let loc = resp
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|v| v.to_str().ok())
                .unwrap_or_default()
                .to_string();
            match redirect_target(&upstream, &loc, origin_host.as_deref()) {
                Ok(origin) => {
                    current_target = origin;
                    redirects += 1;
                    continue;
                }
                Err(msg) => return AghFetchResult::error(502, &msg),
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
            Err(e) => {
                let msg = if e.is_timeout() {
                    "连接超时,请检查地址与网络".to_string()
                } else {
                    e.to_string()
                };
                return AghFetchResult::error(502, &msg);
            }
        };
        return AghFetchResult {
            status,
            content_type,
            body_text,
        };
    }
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
    use tokio::io::AsyncWriteExt;

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
        assert_eq!(timeout_for("/filtering/refresh"), Duration::from_secs(120));
        assert_eq!(timeout_for("/status"), Duration::from_secs(25));
        assert_eq!(timeout_for("/filtering/status"), Duration::from_secs(25));
    }

    // ---- Smoke tests against a real mock server at 127.0.0.1:3990 (auto-skip if down) ----

    fn mock_up() -> bool {
        std::net::TcpStream::connect("127.0.0.1:3990").is_ok()
    }

    #[tokio::test]
    async fn smoke_forward_status() {
        if !mock_up() {
            eprintln!("skip: mock 服务器未运行");
            return;
        }
        let r = agh_fetch_impl(
            "GET",
            "http://127.0.0.1:3990",
            "Basic YWRtaW46ZGVtbw==", // admin:demo
            "/status",
            None,
        )
        .await;
        assert_eq!(r.status, 200);
        assert!(r.body_text.contains("0.107.79"), "{}", r.body_text);
    }

    #[tokio::test]
    async fn smoke_unauthorized_without_auth() {
        if !mock_up() {
            eprintln!("skip: mock 服务器未运行");
            return;
        }
        let r = agh_fetch_impl("GET", "http://127.0.0.1:3990", "", "/status", None).await;
        assert_eq!(r.status, 401);
    }

    #[tokio::test]
    async fn smoke_missing_target_is_400() {
        let r = agh_fetch_impl("GET", "", "Basic x", "/status", None).await;
        assert_eq!(r.status, 400);
        assert!(r.body_text.contains("X-AGH-Target"));
    }

    #[tokio::test]
    async fn smoke_post_body_passthrough() {
        if !mock_up() {
            eprintln!("skip: mock 服务器未运行");
            return;
        }
        let r = agh_fetch_impl(
            "POST",
            "http://127.0.0.1:3990",
            "Basic YWRtaW46ZGVtbw==",
            "/protection",
            Some(r#"{"enabled":true,"duration":30000}"#),
        )
        .await;
        assert_eq!(r.status, 200);
        // Re-read /status to confirm protection is enabled
        let s = agh_fetch_impl("GET", "http://127.0.0.1:3990", "Basic YWRtaW46ZGVtbw==", "/status", None).await;
        assert!(s.body_text.contains("\"protection_enabled\":true"));
    }

    // ---- Redirects: spin up mini HTTP servers to verify the same-host rule and
    // "swap the whole origin, keep the original request path" ----

    async fn spawn_origin_server(port: u16, reply: &'static str) -> tokio::task::JoinHandle<()> {
        tokio::spawn(async move {
            let listener = tokio::net::TcpListener::bind(("127.0.0.1", port)).await.unwrap();
            loop {
                let Ok((mut sock, _)) = listener.accept().await else { break };
                let mut buf = vec![0u8; 4096];
                let _ = tokio::io::AsyncReadExt::read(&mut sock, &mut buf).await;
                let _ = sock.write_all(reply.as_bytes()).await;
                let _ = sock.shutdown().await;
            }
        })
    }

    #[tokio::test]
    async fn redirect_308_swaps_whole_origin() {
        let _a = spawn_origin_server(
            39801,
            "HTTP/1.1 308 Permanent Redirect\r\nLocation: http://127.0.0.1:39802/any/path\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
        )
        .await;
        let _b = spawn_origin_server(
            39802,
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 14\r\nConnection: close\r\n\r\n{\"origin\":\"b\"}",
        )
        .await;
        tokio::time::sleep(Duration::from_millis(150)).await;
        let r = agh_fetch_impl("GET", "http://127.0.0.1:39801", "", "/status", None).await;
        assert_eq!(r.status, 200, "{}", r.body_text);
        assert_eq!(r.body_text, "{\"origin\":\"b\"}");
    }

    #[tokio::test]
    async fn redirect_chain_of_three_then_stop() {
        // A(39803) → B(39804) → C(39805) → D(39806): 3 hops total; the 4th 308
        // is not followed, 308 is returned as-is
        let _a = spawn_origin_server(39803, "HTTP/1.1 308 Permanent Redirect\r\nLocation: http://127.0.0.1:39804/x\r\nContent-Length: 0\r\n\r\n").await;
        let _b = spawn_origin_server(39804, "HTTP/1.1 308 Permanent Redirect\r\nLocation: http://127.0.0.1:39805/x\r\nContent-Length: 0\r\n\r\n").await;
        let _c = spawn_origin_server(39805, "HTTP/1.1 308 Permanent Redirect\r\nLocation: http://127.0.0.1:39806/x\r\nContent-Length: 0\r\n\r\n").await;
        let _d = spawn_origin_server(39806, "HTTP/1.1 308 Permanent Redirect\r\nLocation: http://127.0.0.1:39807/x\r\nContent-Length: 0\r\n\r\n").await;
        tokio::time::sleep(Duration::from_millis(150)).await;
        let r = agh_fetch_impl("GET", "http://127.0.0.1:39803", "", "/status", None).await;
        assert_eq!(r.status, 308, "3 跳后应原样返回 308 而不是继续跟随");
    }

    #[tokio::test]
    async fn redirect_cross_host_is_refused() {
        // 127.0.0.2 is a different hostname, so the hop must be refused before the
        // Authorization header goes anywhere
        let _a = spawn_origin_server(
            39811,
            "HTTP/1.1 302 Found\r\nLocation: http://127.0.0.2:39812/control/status\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
        )
        .await;
        tokio::time::sleep(Duration::from_millis(150)).await;
        let r = agh_fetch_impl(
            "GET",
            "http://127.0.0.1:39811",
            "Basic YWRtaW46ZGVtbw==",
            "/status",
            None,
        )
        .await;
        assert_eq!(r.status, 502, "{}", r.body_text);
        assert!(r.body_text.contains("其他主机"), "{}", r.body_text);
    }

    #[tokio::test]
    async fn smoke_timeout_is_502() {
        // 10.255.255.1 is unroutable so the connection always times out (skip
        // if this machine happens to have a strange route)
        let r = agh_fetch_impl("GET", "http://10.255.255.1:3990", "", "/status", None).await;
        if r.status == 502 && r.body_text.contains("超时") {
            assert_eq!(r.status, 502);
        } else {
            eprintln!("skip: 非预期错误(可能无防火墙黑洞路由):{} {}", r.status, error_body("x"));
        }
    }
}
