import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { addDays, relLabel, today } from '../lib/dates'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

export function Card({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return <div onClick={onClick} className={cx('rounded-2xl bg-card border border-line/60 p-4', onClick && 'active:bg-raised cursor-pointer', className)}>{children}</div>
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'soft' | 'ghost' | 'danger'; busy?: boolean; full?: boolean }
export function Btn({ variant = 'soft', busy, full, className, children, disabled, ...p }: BtnProps) {
  const v = {
    primary: 'bg-volt text-black font-semibold active:brightness-90',
    soft: 'bg-raised text-ink border border-line active:bg-line',
    ghost: 'text-mute active:text-ink',
    danger: 'bg-bad/15 text-bad border border-bad/40 active:bg-bad/25',
  }[variant]
  return (
    <button {...p} disabled={disabled || busy}
      className={cx('min-h-[44px] rounded-xl px-4 text-sm inline-flex items-center justify-center gap-2 transition disabled:opacity-50', v, full && 'w-full', className)}>
      {busy ? 'Saving…' : children}
    </button>
  )
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="rise relative w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl bg-card border-t border-line p-4 safe-b">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="h-11 w-11 -mr-2 grid place-items-center text-mute"><X size={22} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block mb-3">
      <span className="block text-xs text-mute mb-1">{label}</span>
      {children}
      {hint && <span className="block text-xs text-mute mt-1">{hint}</span>}
    </label>
  )
}
export const inputCls = 'w-full min-h-[44px] rounded-xl bg-bg border border-line px-3 text-ink placeholder:text-mute/60 focus:outline-none focus:border-volt'

/**
 * Numeric input. By default it commits a number (or null) when you leave the
 * field; with `live` it commits on every keystroke (for forms with a Save button).
 */
export function Num({ value, onCommit, placeholder, className, label, live }: {
  value: number | null | undefined; onCommit: (n: number | null) => void; placeholder?: string; className?: string; label?: string; live?: boolean
}) {
  const show = (v: number | null | undefined) => (v == null ? '' : String(v))
  const parseNum = (t: string) => (t.trim() === '' ? null : Number(t.replace(',', '.')))
  const [s, setS] = useState(show(value))
  // Only overwrite what's typed when the outside value really differs (keeps "12." while typing).
  useEffect(() => { if (parseNum(s) !== (value ?? null)) setS(show(value)) }, [value])
  const ok = (n: number | null) => n === null || (isFinite(n) && n >= 0)
  return (
    <input inputMode="decimal" aria-label={label} placeholder={placeholder} value={s} className={className ?? inputCls}
      onFocus={e => e.target.select()}
      onChange={e => {
        setS(e.target.value)
        const n = parseNum(e.target.value)
        if (live && ok(n)) onCommit(n)
      }}
      onBlur={() => {
        const n = parseNum(s)
        if (!ok(n)) return setS(show(value))
        if (!live && n !== (value ?? null)) onCommit(n)
      }} />
  )
}

export function Bar({ value, max, color = 'bg-volt' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return <div className="h-2 rounded-full bg-raised overflow-hidden"><div className={cx('h-full rounded-full transition-all', value > max * 1.05 ? 'bg-warn' : color)} style={{ width: `${pct}%` }} /></div>
}

export function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="flex rounded-xl bg-raised p-1 gap-1" role="tablist">
      {options.map(o => (
        <button key={o.value} role="tab" aria-selected={o.value === value} onClick={() => onChange(o.value)}
          className={cx('flex-1 min-h-[36px] rounded-lg text-xs font-medium transition', o.value === value ? 'bg-volt text-black' : 'text-mute')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Header({ title, back, right, sub }: { title: string; back?: boolean | string; right?: ReactNode; sub?: string }) {
  const nav = useNavigate()
  return (
    <header className="flex items-center gap-2 pt-4 pb-3">
      {back && (
        <button aria-label="Back" onClick={() => (typeof back === 'string' ? nav(back) : nav(-1))} className="h-11 w-9 -ml-2 grid place-items-center text-mute">
          <ChevronLeft size={24} />
        </button>
      )}
      <div className="flex-1 min-w-0">
        <h1 className="text-2xl font-bold tracking-tight truncate">{title}</h1>
        {sub && <p className="text-xs text-mute truncate">{sub}</p>}
      </div>
      {right}
    </header>
  )
}

export function DateNav({ date, onChange, max = today() }: { date: string; onChange: (d: string) => void; max?: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-card border border-line/60 mb-3">
      <button aria-label="Previous day" className="h-11 w-11 grid place-items-center text-mute" onClick={() => onChange(addDays(date, -1))}><ChevronLeft size={20} /></button>
      <label className="relative text-sm font-medium">
        {relLabel(date)}
        <input type="date" value={date} max={max} aria-label="Pick date" onChange={e => e.target.value && onChange(e.target.value)} className="absolute inset-0 opacity-0 w-full" />
      </label>
      <button aria-label="Next day" disabled={date >= max} className="h-11 w-11 grid place-items-center text-mute disabled:opacity-30" onClick={() => onChange(addDays(date, 1))}><ChevronRight size={20} /></button>
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-mute text-center py-6">{children}</p>
}
export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <div className="rounded-2xl bg-card border border-line/60 p-3">
      <div className="text-[11px] uppercase tracking-wide text-mute">{label}</div>
      <div className={cx('text-xl font-semibold tnum mt-0.5', tone)}>{value}</div>
      {sub && <div className="text-xs text-mute mt-0.5">{sub}</div>}
    </div>
  )
}
export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={cx('relative h-7 w-12 rounded-full transition shrink-0', on ? 'bg-volt' : 'bg-line')}>
      <span className={cx('absolute top-0.5 h-6 w-6 rounded-full bg-white transition-all', on ? 'left-[22px]' : 'left-0.5')} />
    </button>
  )
}

// ---- Toasts ----
type Toast = { id: number; msg: string; kind: 'ok' | 'err' }
const ToastCtx = createContext<(msg: string, kind?: 'ok' | 'err') => void>(() => {})
export const useToast = () => useContext(ToastCtx)
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const n = useRef(0)
  const push = useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => {
    const id = ++n.current
    setToasts(t => [...t.slice(-2), { id, msg, kind }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), kind === 'err' ? 6000 : 2200)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed top-0 inset-x-0 z-50 safe-t pointer-events-none flex flex-col items-center gap-2 p-3" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} role={t.kind === 'err' ? 'alert' : 'status'}
            className={cx('rise rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg max-w-sm', t.kind === 'ok' ? 'bg-volt text-black' : 'bg-bad text-white')}>
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

/** Runs an async save. The success message is shown only after the promise resolves. */
export function useRun() {
  const toast = useToast()
  return useCallback(async (fn: () => Promise<unknown>, okMsg?: string): Promise<boolean> => {
    try {
      await fn()
      if (okMsg) toast(okMsg)
      return true
    } catch (e) {
      const offline = typeof navigator !== 'undefined' && !navigator.onLine
      toast(offline ? "Not saved — you're offline. Try again when you're connected." : `Not saved. ${e instanceof Error ? e.message : ''}`, 'err')
      return false
    }
  }, [toast])
}

// ---- In-page confirm / text prompts (browser dialogs are unavailable in embedded views) ----
type Dlg = { message: string; confirm: string; text?: string; resolve: (v: boolean | string | null) => void }
let openDlg: (d: Dlg) => void = d => d.resolve(d.text == null ? false : null)
export const ask = (message: string, confirm = 'OK') => new Promise<boolean>(res => openDlg({ message, confirm, resolve: v => res(v === true) }))
export const askText = (message: string, initial = '') => new Promise<string | null>(res => openDlg({ message, confirm: 'Save', text: initial, resolve: v => res(typeof v === 'string' ? v : null) }))
export function Dialogs() {
  const [d, setD] = useState<Dlg | null>(null)
  const [text, setText] = useState('')
  useEffect(() => { openDlg = x => { setText(x.text ?? ''); setD(x) }; return () => { openDlg = x => x.resolve(x.text == null ? false : null) } }, [])
  if (!d) return null
  const close = (v: boolean | string | null) => { d.resolve(v); setD(null) }
  const isText = d.text != null
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-6" role="alertdialog" aria-modal="true" aria-label={d.message}>
      <div className="absolute inset-0 bg-black/70" onClick={() => close(isText ? null : false)} />
      <div className="rise relative w-full max-w-sm rounded-2xl bg-card border border-line p-4">
        <p className="text-sm leading-relaxed mb-3">{d.message}</p>
        {isText && <input autoFocus aria-label={d.message} className={inputCls + ' mb-3'} value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && text.trim() && close(text)} />}
        <div className="flex gap-2">
          <Btn className="flex-1" onClick={() => close(isText ? null : false)}>Cancel</Btn>
          <Btn className="flex-1" variant={isText ? 'primary' : 'danger'} disabled={isText && !text.trim()} onClick={() => close(isText ? text : true)}>{d.confirm}</Btn>
        </div>
      </div>
    </div>
  )
}
