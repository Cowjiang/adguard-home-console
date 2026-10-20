/**
 * Generic IndexedDB store driver with in-memory Map fallback.
 * Supports cross-store transactions via explicit `tx`.
 */
export const isIdbAvailable = (): boolean => typeof globalThis.indexedDB !== 'undefined'
const getNestedValue = (obj: unknown, path: string): unknown =>
  path.split('.').reduce((acc: any, part) => acc?.[part], obj)
export type DbOpener = () => Promise<IDBDatabase>

export class IdbStore<T> {
  static defaultOpenDb?: DbOpener
  private readonly memoryMap = new Map<string, T>()

  constructor(
    readonly storeName: string,
    readonly keyPath: string,
    private readonly openDbFn?: DbOpener
  ) {}

  private async getDb(): Promise<IDBDatabase> {
    const fn = this.openDbFn ?? IdbStore.defaultOpenDb
    if (!fn) throw new Error(`IndexedDB opener not configured for store "${this.storeName}"`)
    return fn()
  }

  async get(key: IDBValidKey): Promise<T | null> {
    if (!isIdbAvailable()) {
      const val = this.memoryMap.get(String(key))
      return val ? JSON.parse(JSON.stringify(val)) : null
    }
    const db = await this.getDb()
    return new Promise<T | null>((resolve, reject) => {
      const req = db.transaction(this.storeName, 'readonly').objectStore(this.storeName).get(key)
      req.onsuccess = () => resolve(req.result ?? null)
      req.onerror = () => reject(req.error)
    })
  }

  async put(item: T, tx?: IDBTransaction): Promise<void> {
    if (!isIdbAvailable()) {
      this.memoryMap.set(String(getNestedValue(item, this.keyPath) ?? ''), JSON.parse(JSON.stringify(item)))
      return
    }
    const execute = (store: IDBObjectStore) =>
      new Promise<void>((resolve, reject) => {
        const req = store.put(item)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      })
    if (tx) return execute(tx.objectStore(this.storeName))
    const db = await this.getDb()
    return execute(db.transaction(this.storeName, 'readwrite').objectStore(this.storeName))
  }

  async getAll(query?: IDBValidKey | IDBKeyRange): Promise<T[]> {
    if (!isIdbAvailable()) {
      return Array.from(this.memoryMap.values()).map((v) => JSON.parse(JSON.stringify(v)))
    }
    const db = await this.getDb()
    return new Promise<T[]>((resolve, reject) => {
      const store = db.transaction(this.storeName, 'readonly').objectStore(this.storeName)
      const req = query !== undefined ? store.getAll(query) : store.getAll()
      req.onsuccess = () => resolve(req.result ?? [])
      req.onerror = () => reject(req.error)
    })
  }

  async delete(key: IDBValidKey, tx?: IDBTransaction): Promise<boolean> {
    if (!isIdbAvailable()) return this.memoryMap.delete(String(key))
    const execute = (store: IDBObjectStore) =>
      new Promise<boolean>((resolve, reject) => {
        const req = store.delete(key)
        req.onsuccess = () => resolve(true)
        req.onerror = () => reject(req.error)
      })
    if (tx) return execute(tx.objectStore(this.storeName))
    const db = await this.getDb()
    return execute(db.transaction(this.storeName, 'readwrite').objectStore(this.storeName))
  }

  async clear(): Promise<void> {
    this.memoryMap.clear()
    if (!isIdbAvailable()) return
    const db = await this.getDb()
    return new Promise<void>((resolve, reject) => {
      const req = db.transaction(this.storeName, 'readwrite').objectStore(this.storeName).clear()
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }

  clearMemory(): void {
    this.memoryMap.clear()
  }
}
