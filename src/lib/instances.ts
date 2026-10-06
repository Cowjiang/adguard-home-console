/**
 * Multi-instance model and storage v2 (agh.console.cfg.v2). The runtime `cfg`
 * handed to pages stays the flat {url, username, password} of the active
 * instance's active endpoint — that is what keeps src/pages unchanged.
 * MVP: every instance holds exactly one endpoint; the array is reserved for
 * Away Connection.
 */

/** Flat runtime connection config — the shape api() and all pages consume */
export interface SvrConfig {
  url: string
  username: string
  password: string
}

export interface Endpoint extends SvrConfig {
  /** Accept self-signed TLS certificates; reserved, not implemented yet */
  insecure?: boolean
}

export interface Instance {
  id: string
  /** Human-facing name; derived from host[:port] until a rename UI exists */
  label: string
  endpoints: Endpoint[]
}

export interface InstanceStoreData {
  instances: Instance[]
  /** Must reference an entry of `instances`; parseStore repairs dangling ids */
  activeId: string
}

export const CFG_V2_KEY = 'agh.console.cfg.v2'
/** Kept after migration so an older app version can still read its config */
export const CFG_V1_KEY = 'agh.console.cfg.v1'

/** crypto.randomUUID is only exposed in secure contexts (WKWebView included),
 *  so never rely on it alone: fall back to timestamp + two random draws */
export function newId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return (
    'i-' +
    Date.now().toString(36) +
    '-' +
    Math.random().toString(36).slice(2, 10) +
    '-' +
    Math.random().toString(36).slice(2, 10)
  )
}

/** Instance label derived from host[:port]; falls back to the raw URL minus
 *  scheme/slashes when URL parsing fails */
export function labelFromUrl(url: string): string {
  try {
    const u = new URL(url)
    return u.port ? `${u.hostname}:${u.port}` : u.hostname
  } catch {
    return url.replace(/^[a-z]+:\/\//i, '').replace(/\/+$/, '')
  }
}

function isEndpoint(v: unknown): v is Endpoint {
  if (!v || typeof v !== 'object') return false
  const e = v as Partial<Endpoint>
  return typeof e.url === 'string' && e.url !== '' && typeof e.username === 'string'
}

/** Validate + normalize a parsed v2 payload; null when unusable. Repairs a
 *  dangling activeId (falls back to the first instance) and missing labels */
export function parseStore(raw: unknown): InstanceStoreData | null {
  if (!raw || typeof raw !== 'object') return null
  const d = raw as Partial<InstanceStoreData>
  if (!Array.isArray(d.instances)) return null
  const instances: Instance[] = []
  for (const it of d.instances) {
    if (!it || typeof it !== 'object') continue
    const i = it as Partial<Instance>
    const endpoints = (Array.isArray(i.endpoints) ? i.endpoints : []).filter(isEndpoint)
    if (typeof i.id !== 'string' || i.id === '' || endpoints.length === 0) continue
    instances.push({
      id: i.id,
      label: typeof i.label === 'string' && i.label ? i.label : labelFromUrl(endpoints[0].url),
      endpoints,
    })
  }
  if (instances.length === 0) return null
  const activeId = instances.some((x) => x.id === d.activeId) ? (d.activeId as string) : instances[0].id
  return { instances, activeId }
}

/** v1 config → v2 store: the old connection becomes the first instance */
export function fromV1(cfg: SvrConfig): InstanceStoreData {
  const endpoint: Endpoint = { url: cfg.url, username: cfg.username, password: cfg.password ?? '' }
  const instance: Instance = { id: newId(), label: labelFromUrl(endpoint.url), endpoints: [endpoint] }
  return { instances: [instance], activeId: instance.id }
}

function safeJson(raw: string | null): unknown {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * Pure core of loadStore, testable without a Storage: v2 wins; without a
 * usable v2 a present v1 migrates (`migrated` must then be persisted).
 */
export function loadStoreFrom(
  v2Raw: string | null,
  v1Raw: string | null
): { store: InstanceStoreData | null; migrated: InstanceStoreData | null } {
  const fromV2 = parseStore(safeJson(v2Raw))
  if (fromV2) return { store: fromV2, migrated: null }
  const v1 = safeJson(v1Raw) as Partial<SvrConfig> | null
  if (!v1 || typeof v1.url !== 'string' || !v1.url || typeof v1.username !== 'string') {
    return { store: null, migrated: null }
  }
  const migrated = fromV1(v1 as SvrConfig)
  return { store: migrated, migrated }
}

/** Load the instance store; migrates v1 → v2 in place (v1 is kept, not deleted) */
export function loadStore(): InstanceStoreData | null {
  try {
    const { store, migrated } = loadStoreFrom(
      localStorage.getItem(CFG_V2_KEY),
      localStorage.getItem(CFG_V1_KEY)
    )
    if (migrated) saveStore(migrated)
    return store
  } catch {
    return null
  }
}

export function saveStore(d: InstanceStoreData): void {
  try {
    localStorage.setItem(CFG_V2_KEY, JSON.stringify(d))
  } catch {
    /* Storage unavailable (private mode etc.): session-only */
  }
}

/** Remove everything, including the migrated v1 copy — otherwise a fresh load
 *  would resurrect the deleted config */
export function clearStore(): void {
  try {
    localStorage.removeItem(CFG_V2_KEY)
    localStorage.removeItem(CFG_V1_KEY)
  } catch {
    /* ignore */
  }
}

/** MVP endpoint selection: first endpoint wins */
export function activeEndpoint(inst: Instance): Endpoint | null {
  return inst.endpoints[0] ?? null
}

/** Runtime cfg of a store: flat shape of the active instance's active endpoint */
export function activeConfig(store: InstanceStoreData): SvrConfig | null {
  const inst = store.instances.find((x) => x.id === store.activeId) ?? store.instances[0]
  const ep = inst ? activeEndpoint(inst) : null
  return ep ? { url: ep.url, username: ep.username, password: ep.password } : null
}
