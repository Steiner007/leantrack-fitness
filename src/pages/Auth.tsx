import { useState } from 'react'
import { supabase } from '../lib/backend'
import { Btn, Field, inputCls } from '../components/ui'

const Logo = () => (
  <div className="flex items-center gap-3 mb-8">
    <img src={import.meta.env.BASE_URL + 'icon.svg'} alt="" className="h-12 w-12 rounded-2xl" />
    <div>
      <div className="text-2xl font-bold tracking-tight">LeanTrack</div>
      <div className="text-xs text-mute">12-week recomposition tracker</div>
    </div>
  </div>
)

export function AuthScreen() {
  const [mode, setMode] = useState<'in' | 'up' | 'reset'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    const sb = supabase!
    try {
      if (mode === 'in') {
        const { error } = await sb.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else if (mode === 'up') {
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL } })
        if (error) throw error
        if (!data.session) setMsg({ text: 'Check your email to confirm your account, then sign in.', ok: true })
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + import.meta.env.BASE_URL })
        if (error) throw error
        setMsg({ text: 'If that address has an account, a reset link is on its way.', ok: true })
      }
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : 'Something went wrong.', ok: false })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm">
        <Logo />
        <h1 className="text-xl font-semibold mb-4">{mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create account' : 'Reset password'}</h1>
        <Field label="Email">
          <input className={inputCls} type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
        </Field>
        {mode !== 'reset' && (
          <Field label="Password" hint={mode === 'up' ? 'At least 8 characters.' : undefined}>
            <input className={inputCls} type="password" required minLength={8} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} />
          </Field>
        )}
        {msg && <p role="alert" className={`text-sm mb-3 ${msg.ok ? 'text-volt' : 'text-bad'}`}>{msg.text}</p>}
        <Btn variant="primary" full type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create account' : 'Send reset link'}</Btn>
        <div className="flex justify-between mt-4 text-sm text-mute">
          {mode !== 'in' ? <button type="button" onClick={() => { setMode('in'); setMsg(null) }}>Back to sign in</button> : <button type="button" onClick={() => { setMode('up'); setMsg(null) }}>Create account</button>}
          {mode === 'in' && <button type="button" onClick={() => { setMode('reset'); setMsg(null) }}>Forgot password?</button>}
        </div>
      </form>
    </div>
  )
}

export function RecoveryScreen({ done }: { done: () => void }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr('')
    const { error } = await supabase!.auth.updateUser({ password })
    setBusy(false)
    if (error) return setErr(error.message)
    window.history.replaceState(null, '', window.location.pathname)
    done()
  }
  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm">
        <Logo />
        <h1 className="text-xl font-semibold mb-4">Choose a new password</h1>
        <Field label="New password" hint="At least 8 characters.">
          <input className={inputCls} type="password" required minLength={8} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} />
        </Field>
        {err && <p role="alert" className="text-sm text-bad mb-3">{err}</p>}
        <Btn variant="primary" full type="submit" disabled={busy}>{busy ? 'Please wait…' : 'Save new password'}</Btn>
      </form>
    </div>
  )
}
