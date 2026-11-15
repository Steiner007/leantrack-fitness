import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { localBackend, type Backend } from './backend'
import { ARTIFACT, claudeBackend } from './claudeBackend'
import { STARTING_WEIGHTS, buildSeed } from './seed'
import { TABLES, emptyData, type Data, type Profile, type Program, type TableName, type Tables } from './types'

type Phase = 'loading' | 'ready' | 'error'
interface Store {
  data: Data
  backend: Backend
  profile: Profile
  program: Program
  online: boolean
  save<T extends TableName>(table: T, rows: Tables[T] | Tables[T][]): Promise<void>
  remove(table: TableName, ids: string | string[]): Promise<void>
  /** Re-reads everything from the backend (re-seeding if it is now empty). */
  reload(): void
}
const Ctx = createContext<Store | null>(null)
export const useStore = () => {
  const s = useContext(Ctx)
  if (!s) throw new Error('Store not ready')
  return s
}

export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return online
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [backend, setBackend] = useState<Backend | null>(null)
  const [data, setData] = useState<Data>(emptyData)
  const [error, setError] = useState('')
  const online = useOnline()

  const load = useCallback(async (b: Backend) => {
    setPhase('loading')
    try {
      let d = await b.loadAll()
      if (!d.profiles.length) {
        // First sign-in: create the profile, program and preloaded routine.
        // Anything already there is left over from a first run that was interrupted: clear it so the routine isn't duplicated.
        for (const t of [...TABLES].reverse()) await b.remove(t, (d[t] as { id: string }[]).map(r => r.id))
        const seed = buildSeed()
        // The profile is written last, so its presence means seeding finished.
        for (const t of [...TABLES.filter(x => x !== 'profiles'), 'profiles' as const]) await b.upsert(t, seed[t])
        d = await b.loadAll()
      }
      // Installs from before starting weights existed: fill them in once (only where the field was never set).
      const missing = d.exercises.filter(e => e.start_weight_lb === undefined && e.unit === 'reps' && STARTING_WEIGHTS[e.name] != null)
      if (missing.length) {
        const filled = missing.map(e => ({ ...e, start_weight_lb: STARTING_WEIGHTS[e.name] }))
        try {
          await b.upsert('exercises', filled)
          d = { ...d, exercises: d.exercises.map(e => filled.find(f => f.id === e.id) ?? e) }
        } catch { /* not critical: workouts still fall back to the built-in suggestion */ }
      }
      setData(d)
      setBackend(b)
      setPhase('ready')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your data.')
      setBackend(b)
      setPhase('error')
    }
  }, [])

  useEffect(() => {
    if (ARTIFACT) { void claudeBackend().catch(() => null).then(b => load(b ?? localBackend())); return }
    void load(localBackend())
  }, [load])

  const store = useMemo<Store | null>(() => {
    if (!backend || phase !== 'ready' || !data.profiles[0]) return null
    return {
      data, backend, online,
      profile: data.profiles[0],
      program: data.programs.find(p => p.is_active) ?? data.programs[0],
      async save(table, rows) {
        const list = (Array.isArray(rows) ? rows : [rows]) as { id: string }[]
        await backend.upsert(table, list) // throws on failure, so state only changes after a real save
        const ids = new Set(list.map(r => r.id))
        setData(d => ({ ...d, [table]: [...(d[table] as { id: string }[]).filter(r => !ids.has(r.id)), ...list] }))
      },
      async remove(table, ids) {
        const list = Array.isArray(ids) ? ids : [ids]
        await backend.remove(table, list)
        setData(d => ({ ...d, [table]: (d[table] as { id: string }[]).filter(r => !list.includes(r.id)) }))
      },
      reload() { void load(backend) },
    }
  }, [backend, phase, data, online, load])

  if (phase === 'error')
    return (
      <div className="min-h-full grid place-items-center p-6 text-center">
        <div>
          <h1 className="text-xl font-semibold mb-2">Couldn't load your data</h1>
          <p className="text-sm text-mute mb-4">{error}</p>
          <button className="min-h-[44px] rounded-xl bg-volt text-black font-semibold px-6" onClick={() => backend && load(backend)}>Try again</button>
        </div>
      </div>
    )
  if (!store)
    return (
      <div className="min-h-full grid place-items-center" role="status" aria-label="Loading">
        <div className="h-10 w-10 rounded-full border-2 border-line border-t-volt animate-spin" />
      </div>
    )
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}
