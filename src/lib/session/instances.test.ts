import { describe, expect, it } from 'vitest'
import {
  activeConfig,
  fromV1,
  labelFromUrl,
  loadStoreFrom,
  newId,
  parseStore,
  type InstanceStoreData,
} from './instances'

describe('newId', () => {
  it('generates unique, non-empty ids', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newId()))
    expect(ids.size).toBe(200)
    for (const id of ids) expect(id.length).toBeGreaterThan(4)
  })
})

describe('labelFromUrl', () => {
  it('derives host:port, host only without port, and survives bad input', () => {
    expect(labelFromUrl('http://192.168.1.2:3000')).toBe('192.168.1.2:3000')
    expect(labelFromUrl('https://agh.example.com')).toBe('agh.example.com')
    // URL parsing drops the default port, so the label reads clean
    expect(labelFromUrl('https://agh.example.com:443/x/')).toBe('agh.example.com')
    expect(labelFromUrl('not a url')).toBe('not a url')
    expect(labelFromUrl('agh.local')).toBe('agh.local')
  })
})

const inst = (id: string, url: string): InstanceStoreData['instances'][number] => ({
  id,
  label: id,
  endpoints: [{ url, username: 'admin', password: 'p' }],
})

describe('parseStore', () => {
  it('accepts a valid store untouched', () => {
    const raw = { instances: [inst('a', 'http://x:3000'), inst('b', 'http://y:3000')], activeId: 'b' }
    expect(parseStore(raw)).toEqual(raw)
  })

  it('repairs a dangling activeId and missing labels', () => {
    const out = parseStore({
      instances: [
        { id: 'a', endpoints: [{ url: 'http://x:3000', username: 'admin' }] },
        { id: 'b', label: '', endpoints: [{ url: 'http://y:3000', username: 'admin', password: '' }] },
      ],
      activeId: 'gone',
    })
    expect(out).not.toBeNull()
    expect(out!.activeId).toBe('a')
    expect(out!.instances[0].label).toBe('x:3000')
    expect(out!.instances[1].label).toBe('y:3000')
  })

  it('rejects garbage: null, non-objects, instances without endpoints, empty lists', () => {
    expect(parseStore(null)).toBeNull()
    expect(parseStore('x')).toBeNull()
    expect(parseStore({})).toBeNull()
    expect(parseStore({ instances: 'no' })).toBeNull()
    expect(parseStore({ instances: [{ id: 'a' }], activeId: 'a' })).toBeNull()
    expect(parseStore({ instances: [inst('a', 'http://x')], activeId: 'a', extra: 1 })).toEqual({
      instances: [inst('a', 'http://x')],
      activeId: 'a',
    })
  })
})

describe('fromV1', () => {
  it('wraps the v1 config as the single active instance', () => {
    const out = fromV1({ url: 'http://192.168.1.2:3000', username: 'admin', password: 'pw' })
    expect(out.instances).toHaveLength(1)
    expect(out.activeId).toBe(out.instances[0].id)
    expect(out.instances[0].label).toBe('192.168.1.2:3000')
    expect(out.instances[0].endpoints[0]).toEqual({
      url: 'http://192.168.1.2:3000',
      username: 'admin',
      password: 'pw',
    })
  })

  it('defaults a missing password to empty string', () => {
    const out = fromV1({ url: 'http://x:3000', username: 'a', password: undefined as unknown as string })
    expect(out.instances[0].endpoints[0].password).toBe('')
  })
})

describe('loadStoreFrom', () => {
  it('prefers a usable v2 payload', () => {
    const v2 = JSON.stringify({ instances: [inst('a', 'http://x')], activeId: 'a' })
    const out = loadStoreFrom(v2, '{"url":"http://old","username":"u"}')
    expect(out.store?.activeId).toBe('a')
    expect(out.migrated).toBeNull()
  })

  it('migrates v1 when v2 is absent, empty or corrupt', () => {
    for (const v2 of [null, '', 'not json', '{"instances":[]}', '{"instances":[{}]}']) {
      const out = loadStoreFrom(v2, JSON.stringify({ url: 'http://192.168.1.2:3000/', username: 'admin', password: 'p' }))
      expect(out.migrated).not.toBeNull()
      expect(out.store).toEqual(out.migrated)
      expect(out.store!.instances[0].endpoints[0].url).toBe('http://192.168.1.2:3000/')
    }
  })

  it('yields null when neither version is usable', () => {
    expect(loadStoreFrom(null, null).store).toBeNull()
    expect(loadStoreFrom(null, 'garbage').store).toBeNull()
    expect(loadStoreFrom(null, '{"username":"u"}').store).toBeNull()
  })
})

describe('activeConfig', () => {
  it('returns the flat cfg of the active instance', () => {
    const store: InstanceStoreData = {
      instances: [inst('a', 'http://x:3000'), inst('b', 'http://y:3000')],
      activeId: 'b',
    }
    expect(activeConfig(store)).toEqual({ url: 'http://y:3000', username: 'admin', password: 'p' })
  })

  it('falls back to the first instance when activeId dangles', () => {
    const store: InstanceStoreData = { instances: [inst('a', 'http://x')], activeId: 'gone' }
    expect(activeConfig(store)?.url).toBe('http://x')
  })
})
