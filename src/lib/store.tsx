import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { localBackend, supabase, supabaseBackend, supabaseConfigured, type Backend } from './backend'
import { buildSeed } from './seed'
import { TABLES, emptyData, type Data, type Profile, type Program, type TableName, type Tables } from './types'

type Phase = 'loading' | 'signed-out' | 'ready' | 'error'
interface Store {
  data: Data
  backend: Backend
  profile: Profile
  program: Program
  email: string | null
  online: boolean
  save<T extends TableName>(table: T, rows: Tables[T] | Tables[T][]): Promise<void>
  remove(table: TableName, ids: string | string[]): Promise<void>
  signOut(): Promise<void>
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

export function StoreProvider({ children, authScreen, recoveryScreen }: {
  children: ReactNode
  authScreen: ReactNode
  recoveryScreen: (done: () => void) => ReactNode
}) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [backend, setBackend] = useState<Backend | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [data, setData] = useState<Data>(emptyData)
  const [error, setError] = useState('')
  // True while the user is setting a new password from a reset email link.
  const [recovering, setRecovering] = useState(() => /type=recovery/.test(window.location.hash))
  const online = useOnline()
  const userRef = useRef<string | null>(null)

  const load = useCallback(async (b: Backend) => {
    setPhase('loading')
    try {
      let d = await b.loadAll()
      if (!d.profiles.length) {
        // First sign-in: create the profile, program and preloaded routine.
        const seed = buildSeed()
        for (const t of TABLES) await b.upsert(t, seed[t])
        d = await b.loadAll()
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
    if (!supabaseConfigured || !supabase) { void load(localBackend()); return }
    const apply = (userId: string | null, mail: string | null) => {
      if (userId === userRef.current) return
      userRef.current = userId
      setEmail(mail)
      if (userId) void load(supabaseBackend(userId))
      else { setBackend(null); setData(emptyData()); setPhase('signed-out') }
    }
    void supabase.auth.getSession().then(({ data: s }) => {
      if (userRef.current === null && !s.session) setPhase('signed-out')
      else apply(s.session?.user.id ?? null, s.session?.user.email ?? null)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      // Defer: Supabase warns against calling its API synchronously inside this callback.
      setTimeout(() => apply(session?.user.id ?? null, session?.user.email ?? null), 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [load])

  const store = useMemo<Store | null>(() => {
    if (!backend || phase !== 'ready' || !data.profiles[0]) return null
    return {
      data, backend, email, online,
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
      async signOut() { await supabase?.auth.signOut() },
    }
  }, [backend, phase, data, email, online])

  if (recovering && supabaseConfigured) return <>{recoveryScreen(() => setRecovering(false))}</>
  if (phase === 'signed-out') return <>{authScreen}</>
  if (phase === 'error')
    return (
      <div className="min-h-full grid place-items-center p-6 text-center">
        <div>
          <h1 className="text-xl font-semibold mb-2">{online ? "Couldn't load your data" : "You're offline"}</h1>
          <p className="text-sm text-mute mb-4">{online ? error : 'LeanTrack needs a connection to load your data. Nothing has been lost.'}</p>
          <button className="min-h-[44px] rounded-xl bg-volt text-black font-semibold px-6" onClick={() => backend && load(backend)}>Try again</button>
          {supabaseConfigured && <button className="block mx-auto mt-3 text-sm text-mute" onClick={() => supabase?.auth.signOut()}>Sign out</button>}
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
