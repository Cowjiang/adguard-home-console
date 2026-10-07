/**
 * AGH reverse proxy — the Express adapter of the frontend-owned proxy contract
 * in `src/lib/api.ts`, pinned by `contract/agh-proxy.contract.json` (runner:
 * `server/proxy.test.mjs`; the Rust adapter implements the same file via
 * `src-tauri/src/proxy.rs` tests). Semantics:
 * - `/api/agh/*` → `/control/*`, query preserved
 * - only `Authorization` and `Content-Type` are forwarded upstream
 * - upstream 301/302/307/308 followed manually, at most 3 hops: the redirect
 *   target's origin replaces the target, the original request path is replayed,
 *   and only while the hostname stays the same — Authorization is replayed on
 *   every hop, so another host would receive the admin password. Other
 *   redirect statuses (303 etc.) pass through untouched.
 * - backstop timeouts: 25s, 120s for `/filtering/refresh`, keyed on the
 *   query-stripped path (same rule as the Rust adapter)
 * - adapter-generated failures are `{error, kind}` JSON with status 400/502;
 *   `kind` is machine-readable (see api.ts) and all user-facing copy lives in
 *   the frontend i18n — no error text is mirrored here. Upstream responses
 *   (including their errors) pass through untouched.
 * Allowed variance vs the Rust adapter: request bodies go through
 * `express.json({limit:'4mb'})` in index.mjs, so oversized (413) and malformed
 * (400) bodies never reach this module; the Rust side forwards without a limit.
 */
const MAX_REDIRECTS = 3
const REDIRECT_CODES = new Set([301, 302, 307, 308])

export const DEFAULT_TIMEOUT_MS = 25_000
export const REFRESH_TIMEOUT_MS = 120_000

/** Backstop timeout for one upstream attempt, keyed on the query-stripped path
 *  (both adapters share this rule and its unit tests) */
export function timeoutFor(pathWithQuery, { defaultTimeoutMs = DEFAULT_TIMEOUT_MS, refreshTimeoutMs = REFRESH_TIMEOUT_MS } = {}) {
  const path = pathWithQuery.split('?')[0]
  return path.includes('/filtering/refresh') ? refreshTimeoutMs : defaultTimeoutMs
}

/**
 * Builds the `/api/agh` request handler. Timeouts are injectable so the
 * contract runner can exercise the timeout branch quickly.
 */
export function createAghProxy({ defaultTimeoutMs = DEFAULT_TIMEOUT_MS, refreshTimeoutMs = REFRESH_TIMEOUT_MS } = {}) {
  function fail(res, status, kind, detail) {
    res.status(status).json({ error: detail, kind })
  }

  async function proxyAGH(req, res, target, authHeader, redirects = 0, originHost) {
    try {
      const targetUrl = new URL(target)
      if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
        return fail(res, 400, 'invalid_target', 'target must be an http(s) URL')
      }
      // First hop pins the host; every later hop must stay on it (see the redirect branch)
      const pinnedHost = originHost ?? targetUrl.hostname
      const upstream = new URL(req.originalUrl.replace(/^\/api\/agh/, '/control'), targetUrl.origin)

      const headers = {}
      if (authHeader) headers['Authorization'] = authHeader
      const ct = req.headers['content-type']
      if (ct) headers['Content-Type'] = ct

      let body
      if (!['GET', 'HEAD'].includes(req.method)) {
        body = JSON.stringify(req.body ?? {})
        headers['Content-Type'] = headers['Content-Type'] || 'application/json'
      }

      const r = await fetch(upstream, {
        method: req.method,
        headers,
        body,
        redirect: 'manual',
        // Full filter refresh downloads rules from each URL, far slower than normal endpoints
        signal: AbortSignal.timeout(timeoutFor(req.originalUrl, { defaultTimeoutMs, refreshTimeoutMs })),
      })

      if (REDIRECT_CODES.has(r.status) && r.headers.get('location') && redirects < MAX_REDIRECTS) {
        let loc
        try {
          loc = new URL(r.headers.get('location'), upstream)
        } catch {
          return fail(res, 502, 'invalid_redirect', 'upstream redirect location is not a valid URL')
        }
        if (loc.hostname !== pinnedHost) {
          return fail(res, 502, 'cross_host_redirect', 'upstream redirected to another host; credentials not forwarded')
        }
        return proxyAGH(req, res, loc.origin, authHeader, redirects + 1, pinnedHost)
      }

      const text = await r.text()
      res.status(r.status).type(r.headers.get('content-type') || 'application/json').send(text)
    } catch (err) {
      const detail = String(err?.cause?.message || err?.message || err)
      if (err?.name === 'TimeoutError') return fail(res, 502, 'timeout', detail)
      fail(res, 502, 'network', detail)
    }
  }

  return function aghProxy(req, res) {
    const target = req.get('X-AGH-Target')
    if (!target) return fail(res, 400, 'missing_target', 'missing X-AGH-Target header')
    void proxyAGH(req, res, target.trim(), req.get('Authorization'))
  }
}
