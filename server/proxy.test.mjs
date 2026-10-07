/**
 * Contract runner for the Express adapter: loads contract/agh-proxy.contract.json
 * (the same file the Rust runner in src-tauri/src/proxy.rs loads) and drives
 * createAghProxy() against scripted origin servers, so a semantic change on
 * either side fails here or there. Also pins Express-only behavior (the 4mb
 * body limit of express.json) and the shared timeoutFor rule.
 * Run: npm run test:server  (node --test server/)
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import http from 'node:http'
import express from 'express'
import { createAghProxy, timeoutFor, DEFAULT_TIMEOUT_MS, REFRESH_TIMEOUT_MS } from './proxy.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const contract = JSON.parse(readFileSync(path.join(ROOT, 'contract', 'agh-proxy.contract.json'), 'utf8'))

const AUTH = 'Basic dGVzdDp0ZXN0'
// Short backstop so the timeout scenario (s12, origin delay 2000ms) runs fast;
// production defaults live in proxy.mjs and are pinned by the timeoutFor tests
const BACKSTOP_MS = 300

/** Scripted origin: replays consumed per hit in order; records every observed
 *  request into the scenario-shared `hits` array (global chronological order) */
function startOrigin(name, replies, hits, urls) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      res.on('error', () => {})
      const chunks = []
      req.on('data', (c) => chunks.push(c))
      req.on('error', () => {})
      req.on('end', async () => {
        const reply = replies[server.served++] ?? { status: 500, json: { error: 'origin script exhausted' } }
        server.hits.push({
          origin: name,
          method: req.method,
          path: req.url,
          auth: req.headers.authorization ?? null,
          body: Buffer.concat(chunks).toString('utf8'),
          headers: req.headers,
        })
        if (reply.delayMs) {
          await new Promise((r) => {
            const t = setTimeout(r, reply.delayMs)
            t.unref?.()
          })
          if (res.destroyed) return
        }
        const headers = {}
        for (const [k, v] of Object.entries(reply.headers ?? {})) {
          let out = String(v)
          for (const [n, url] of Object.entries(urls)) out = out.replaceAll(`{${n}}`, url)
          headers[k] = out
        }
        const body = reply.json !== undefined ? JSON.stringify(reply.json) : (reply.body ?? '')
        res.writeHead(reply.status, { 'Content-Type': 'application/json', ...headers })
        res.end(body)
      })
    })
    server.served = 0
    server.hits = hits
    server.listen(0, '127.0.0.1', () => resolve(server))
    server.on('error', reject)
  })
}

function closeServer(server) {
  return new Promise((resolve) => {
    server.closeAllConnections?.()
    server.close(() => resolve())
  })
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server))
  })
}

function buildApp() {
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({ limit: '4mb' }))
  app.use('/api/agh', createAghProxy({ defaultTimeoutMs: BACKSTOP_MS, refreshTimeoutMs: BACKSTOP_MS }))
  return app
}

/** Drives one contract scenario end to end through the Express adapter */
async function runScenario(scn) {
  const hits = []
  const names = Object.keys(scn.origins ?? {})
  // Shared, populated after boot: handlers resolve {A}/{B} at request time
  const urls = {}
  const servers = await Promise.all(names.map((name) => startOrigin(name, scn.origins[name], hits, urls)))
  for (const [i, s] of servers.entries()) urls[names[i]] = `http://127.0.0.1:${s.address().port}`

  const app = buildApp()
  const server = await listen(app)
  try {
    const reqSpec = scn.request
    const headers = {}
    if (reqSpec.target !== null) headers['X-AGH-Target'] = (reqSpec.target ?? '{A}').replaceAll('{A}', urls.A).replaceAll('{B}', urls.B)
    if (reqSpec.auth) headers['Authorization'] = reqSpec.auth
    for (const [k, v] of Object.entries(reqSpec.extraHeaders ?? {})) headers[k] = v
    const body = reqSpec.method === 'GET' ? undefined : (reqSpec.body !== undefined ? JSON.stringify(reqSpec.body) : undefined)
    if (body !== undefined) headers['Content-Type'] = 'application/json' // mirrors api.ts
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/agh${reqSpec.path}`, {
      method: reqSpec.method,
      headers,
      body,
      redirect: 'manual',
    })
    const text = await res.text()
    let data
    try { data = text ? JSON.parse(text) : undefined } catch { /* non-JSON passthrough */ }

    assert.equal(res.status, scn.expect.status, `${scn.id}: status`)
    if (scn.expect.kind) {
      assert.equal(data?.kind, scn.expect.kind, `${scn.id}: kind`)
      assert.ok(data?.error, `${scn.id}: kind errors carry a technical detail`)
    } else {
      assert.equal(data?.kind, undefined, `${scn.id}: no kind expected`)
    }
    if (scn.expect.json) assert.deepStrictEqual(data, scn.expect.json, `${scn.id}: body`)

    // seen absent = the scenario does not pin origin observations
    if (!Object.hasOwn(scn.expect, 'seen')) return
    const seenSpec = scn.expect.seen ?? []
    assert.equal(hits.length, seenSpec.length, `${scn.id}: hit count (${JSON.stringify(hits.map((h) => h.origin))})`)
    for (let i = 0; i < seenSpec.length; i++) {
      const obs = hits[i]
      const spec = seenSpec[i]
      assert.equal(obs.origin, spec.origin, `${scn.id}: hit ${i} origin`)
      if (spec.method !== undefined) assert.equal(obs.method, spec.method, `${scn.id}: hit ${i} method`)
      if (Object.hasOwn(spec, 'path')) assert.equal(obs.path, spec.path, `${scn.id}: hit ${i} path`)
      if (Object.hasOwn(spec, 'auth')) {
        if (spec.auth === null) assert.equal(obs.auth, null, `${scn.id}: hit ${i} auth must be absent`)
        else assert.equal(obs.auth, spec.auth, `${scn.id}: hit ${i} auth`)
      }
      if (Object.hasOwn(spec, 'body')) {
        if (spec.body === null) assert.equal(obs.body, '', `${scn.id}: hit ${i} body must be empty`)
        else if (typeof spec.body === 'object') assert.deepStrictEqual(JSON.parse(obs.body), spec.body, `${scn.id}: hit ${i} body`)
        else assert.equal(obs.body, spec.body, `${scn.id}: hit ${i} body`)
      }
      for (const h of spec.absentHeaders ?? []) {
        assert.ok(!(h in obs.headers), `${scn.id}: hit ${i} must not forward ${h}`)
      }
    }
  } finally {
    await closeServer(server)
    await Promise.all(servers.map(closeServer))
  }
}

for (const scn of contract.scenarios) {
  test(`contract ${scn.id}`, async () => {
    await runScenario(scn)
  })
}

test('timeoutFor keys on the query-stripped path (both adapters share the rule)', () => {
  assert.equal(timeoutFor('/filtering/refresh'), REFRESH_TIMEOUT_MS)
  assert.equal(timeoutFor('/filtering/refresh?x=1'), REFRESH_TIMEOUT_MS)
  assert.equal(timeoutFor('/stats'), DEFAULT_TIMEOUT_MS)
  // Counter-case: a marker appearing only in the query must not widen the tier
  assert.equal(timeoutFor('/stats?search=/filtering/refresh'), DEFAULT_TIMEOUT_MS)
  assert.equal(timeoutFor('/stats?search=/filtering/refresh', { defaultTimeoutMs: 1, refreshTimeoutMs: 2 }), 1)
})

test('express-only: oversized bodies are rejected by the 4mb json limit', async () => {
  const server = await listen(buildApp())
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/agh/filtering/set_rules`, {
      method: 'POST',
      headers: { 'X-AGH-Target': 'http://127.0.0.1:1', Authorization: AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ rules: 'x'.repeat(5 * 1024 * 1024) }),
    })
    assert.equal(res.status, 413)
  } finally {
    await closeServer(server)
  }
})

test('express-only: malformed JSON bodies are rejected before the proxy', async () => {
  const server = await listen(buildApp())
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/agh/protection`, {
      method: 'POST',
      headers: { 'X-AGH-Target': 'http://127.0.0.1:1', Authorization: AUTH, 'Content-Type': 'application/json' },
      body: '{not json',
    })
    assert.equal(res.status, 400)
  } finally {
    await closeServer(server)
  }
})
