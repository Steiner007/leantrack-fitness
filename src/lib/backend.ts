import { TABLES, emptyData, type Data, type TableName } from './types'

export interface Backend {
  mode: 'local' | 'claude'
  userId: string
  loadAll(): Promise<Data>
  upsert(table: TableName, rows: object[]): Promise<void>
  remove(table: TableName, ids: string[]): Promise<void>
  /** Permanently deletes every row. */
  deleteEverything(): Promise<void>
}

// Everything is stored in this browser (IndexedDB). No account, no server.
const DB = 'leantrack-local'
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => { req.result.createObjectStore('rows'); req.result.createObjectStore('photos') }
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await idb()
  return new Promise((res, rej) => {
    const t = db.transaction('rows', mode)
    const req = fn(t.objectStore('rows'))
    t.oncomplete = () => { db.close(); res(req.result) }
    t.onerror = t.onabort = () => { db.close(); rej(t.error ?? new Error('Local storage error')) }
  })
}

export function localBackend(): Backend {
  // Writes are read-modify-write, so run them one at a time.
  let chain: Promise<unknown> = Promise.resolve()
  const queue = <T,>(fn: () => Promise<T>): Promise<T> => {
    const p = chain.then(fn, fn)
    chain = p.catch(() => undefined)
    return p
  }
  const read = async (t: TableName) => ((await tx<unknown>('readonly', s => s.get(t))) as { id: string }[] | undefined) ?? []
  return {
    mode: 'local',
    userId: 'local',
    async loadAll() {
      const data = emptyData()
      for (const t of TABLES) (data[t] as object[]) = await read(t)
      return data
    },
    upsert: (table, rows) => queue(async () => {
      const cur = await read(table)
      const incoming = rows as { id: string }[]
      const ids = new Set(incoming.map(r => r.id))
      await tx('readwrite', s => s.put([...cur.filter(r => !ids.has(r.id)), ...incoming], table))
    }),
    remove: (table, ids) => queue(async () => {
      const cur = await read(table)
      await tx('readwrite', s => s.put(cur.filter(r => !ids.includes(r.id)), table))
    }),
    deleteEverything: () => queue(() => tx('readwrite', s => s.clear())),
  }
}
