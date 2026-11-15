/**
 * Backend for the version hosted as a Claude artifact. Rows live in the
 * artifact's document store under the viewer's private subtree
 * (data/users/<id>/...).
 */
import type { Backend } from './backend'
import { TABLES, emptyData, type TableName } from './types'

export const ARTIFACT = import.meta.env.VITE_TARGET === 'artifact'

interface Snap { id: string; exists: boolean; data(): Record<string, unknown> | undefined }
interface Query {
  where(f: string, op: string, v: unknown): Query; orderBy(f: string): Query; limit(n: number): Query
  get(): Promise<{ docs: Snap[] }>
}
interface DocRef { set(d: Record<string, unknown>): Promise<void>; delete(): Promise<void>; collection(p: string): Query & { doc(id: string): DocRef } }
interface Db { doc(path: string): DocRef }
interface Downloads { save(r: { filename: string; data: Blob | string }): Promise<unknown> }
interface User { id(): Promise<string | null> }
type Claude = { use(name: string): Promise<unknown> }
const claude = () => (window as unknown as { claude?: Claude }).claude

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const withTimeout = <T,>(p: Promise<T>, ms: number, what: string) =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${what} timed out. Check your connection and try again.`)), ms))])
/** Retries the transient store codes with backoff; everything else is thrown with a readable message. */
async function call<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try { return await fn() } catch (e) {
      const code = (e as { code?: string })?.code
      if ((code === 'unavailable' || code === 'resource_exhausted' || code === 'store_unavailable' || code === 'rate_limited') && i < 4) { await sleep(400 * 2 ** i + Math.random() * 300); continue }
      const msg = (e as { message?: string })?.message
      throw new Error(code === 'quota_exceeded' || code === 'quota_or_state' ? 'Storage for this app is full.' : msg || code || 'Storage error')
    }
  }
}
/** Runs tasks a few at a time so bursts (seeding, starting a workout) stay under the store's write limits. */
async function pool<T>(items: T[], fn: (x: T) => Promise<unknown>, n = 3) {
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]) }))
}

/** Resolves null when this page isn't running inside Claude with saved data available. */
export async function claudeBackend(): Promise<Backend | null> {
  const c = claude()
  if (!c) return null
  const [db, user] = await Promise.all([c.use('db'), c.use('user')]) as [Db | null, User | null]
  const uid = db && user ? await user.id() : null
  if (!db || !uid) return null
  const root = db.doc(`data/users/${uid}/leantrack`)
  const col = (t: TableName) => root.collection(t)
  const b: Backend = {
    mode: 'claude',
    userId: uid,
    async loadAll() {
      const data = emptyData()
      await withTimeout(Promise.all(TABLES.map(async t => {
        for (let last: string | null = null; ;) {
          let q: Query = col(t).orderBy('id').limit(1000)
          if (last) q = col(t).where('id', '>', last).orderBy('id').limit(1000)
          const { docs } = await call(() => q.get())
          const rows = docs.filter(d => d.exists).map(d => ({ ...d.data() })) as { id: string }[]
          ;(data[t] as object[]).push(...rows)
          if (docs.length < 1000) break
          last = rows[rows.length - 1].id
        }
      })), 20000, 'Loading your data')
      return data
    },
    async upsert(table, rows) {
      // JSON round-trip drops undefined fields, which the store rejects.
      await pool(rows as { id: string }[], r => call(() => col(table).doc(r.id).set(JSON.parse(JSON.stringify(r)))))
    },
    async remove(table, ids) {
      await pool(ids, id => call(() => col(table).doc(id).delete()))
    },
    async deleteEverything() {
      const all = await b.loadAll()
      for (const t of [...TABLES].reverse()) await b.remove(t, (all[t] as { id: string }[]).map(r => r.id))
    },
  }
  return b
}

/** Saves a generated file: through Claude's download prompt in the hosted version, a normal browser download elsewhere. */
export async function saveFile(blob: Blob, filename: string) {
  if (ARTIFACT && claude()) {
    const d = await claude()!.use('downloads') as Downloads | null
    if (!d) throw new Error('Downloads are not available in this view.')
    try { await d.save({ filename, data: blob }) } catch (e) {
      if ((e as { code?: string })?.code === 'declined') return
      throw new Error((e as { message?: string })?.message || 'Download failed')
    }
    return
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 10000)
}
