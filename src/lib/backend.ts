import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { TABLES, emptyData, type Data, type TableName } from './types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const supabaseConfigured = !!(url && anon)
/** Only the public anon key is ever used in the browser. Access is enforced by row-level security. */
export const supabase: SupabaseClient | null = supabaseConfigured ? createClient(url!, anon!) : null
export const BUCKET = 'progress-photos'

export interface Backend {
  mode: 'supabase' | 'local'
  userId: string
  loadAll(): Promise<Data>
  upsert(table: TableName, rows: object[]): Promise<void>
  remove(table: TableName, ids: string[]): Promise<void>
  uploadPhoto(path: string, blob: Blob): Promise<void>
  photoUrl(path: string): Promise<string>
  photoBlob(path: string): Promise<Blob>
  removePhotos(paths: string[]): Promise<void>
  /** Permanently deletes every row and photo (and, on Supabase, the login itself). */
  deleteEverything(photoPaths: string[]): Promise<void>
}

const fail = (what: string, error: { message: string } | null) => {
  if (error) throw new Error(`${what}: ${error.message}`)
}

export function supabaseBackend(userId: string): Backend {
  const sb = supabase!
  const urlCache = new Map<string, { url: string; exp: number }>()
  return {
    mode: 'supabase',
    userId,
    async loadAll() {
      const data = emptyData()
      await Promise.all(TABLES.map(async t => {
        // PostgREST returns at most 1000 rows per request, so page through.
        for (let from = 0; ; from += 1000) {
          const { data: rows, error } = await sb.from(t).select('*').order('id').range(from, from + 999)
          fail(`Loading ${t}`, error)
          ;(data[t] as object[]).push(...(rows ?? []))
          if (!rows || rows.length < 1000) break
        }
      }))
      return data
    },
    async upsert(table, rows) {
      if (!rows.length) return
      const { error } = await sb.from(table).upsert(rows.map(r => ({ ...r, user_id: userId })))
      fail('Save failed', error)
    },
    async remove(table, ids) {
      if (!ids.length) return
      const { error } = await sb.from(table).delete().in('id', ids)
      fail('Delete failed', error)
    },
    async uploadPhoto(path, blob) {
      const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false })
      fail('Photo upload failed', error)
    },
    async photoUrl(path) {
      const hit = urlCache.get(path)
      if (hit && hit.exp > Date.now()) return hit.url
      // Signed URLs expire after an hour; the bucket itself is private.
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, 3600)
      fail('Could not load photo', error)
      urlCache.set(path, { url: data!.signedUrl, exp: Date.now() + 50 * 60 * 1000 })
      return data!.signedUrl
    },
    async photoBlob(path) {
      const { data, error } = await sb.storage.from(BUCKET).download(path)
      fail('Could not download photo', error)
      return data!
    },
    async removePhotos(paths) {
      if (!paths.length) return
      const { error } = await sb.storage.from(BUCKET).remove(paths)
      fail('Photo delete failed', error)
    },
    async deleteEverything(photoPaths) {
      await this.removePhotos(photoPaths)
      const { error } = await sb.rpc('delete_my_account')
      fail('Account deletion failed', error)
      await sb.auth.signOut()
    },
  }
}

// ---- Local mode: used only when Supabase isn't configured. Data stays in this browser. ----
const DB = 'leantrack-local'
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => { req.result.createObjectStore('rows'); req.result.createObjectStore('photos') }
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
}
async function tx<T>(store: 'rows' | 'photos', mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await idb()
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode)
    const req = fn(t.objectStore(store))
    t.oncomplete = () => { db.close(); res(req.result) }
    t.onerror = t.onabort = () => { db.close(); rej(t.error ?? new Error('Local storage error')) }
  })
}

export function localBackend(): Backend {
  const urls = new Map<string, string>()
  // Writes are read-modify-write, so run them one at a time.
  let chain: Promise<unknown> = Promise.resolve()
  const queue = <T,>(fn: () => Promise<T>): Promise<T> => {
    const p = chain.then(fn, fn)
    chain = p.catch(() => undefined)
    return p
  }
  const read = async (t: TableName) => ((await tx<unknown>('rows', 'readonly', s => s.get(t))) as { id: string }[] | undefined) ?? []
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
      await tx('rows', 'readwrite', s => s.put([...cur.filter(r => !ids.has(r.id)), ...incoming], table))
    }),
    remove: (table, ids) => queue(async () => {
      const cur = await read(table)
      await tx('rows', 'readwrite', s => s.put(cur.filter(r => !ids.includes(r.id)), table))
    }),
    async uploadPhoto(path, blob) {
      // Stored as bytes + type: some browsers can't persist Blob objects in IndexedDB reliably.
      const buf = await blob.arrayBuffer()
      await tx('photos', 'readwrite', s => s.put({ buf, type: blob.type || 'image/jpeg' }, path))
    },
    async photoBlob(path) {
      const rec = (await tx<unknown>('photos', 'readonly', s => s.get(path))) as { buf: ArrayBuffer; type: string } | undefined
      if (!rec) throw new Error('Photo not found on this device')
      return new Blob([rec.buf], { type: rec.type })
    },
    async photoUrl(path) {
      const hit = urls.get(path)
      if (hit) return hit
      const u = URL.createObjectURL(await this.photoBlob(path))
      urls.set(path, u)
      return u
    },
    async removePhotos(paths) {
      for (const p of paths) {
        await tx('photos', 'readwrite', s => s.delete(p))
        const u = urls.get(p)
        if (u) { URL.revokeObjectURL(u); urls.delete(p) }
      }
    },
    async deleteEverything() {
      await tx('rows', 'readwrite', s => s.clear())
      await tx('photos', 'readwrite', s => s.clear())
    },
  }
}
