import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react'
import { addDays, parse, toStr, today } from '../lib/dates'
import { useStore } from '../lib/store'
import { cx } from './ui'

/** Loads a private photo through the backend (signed URL on Supabase). Never crops or filters: object-contain only. */
export function PhotoImg({ path, alt, className }: { path: string; alt: string; className?: string }) {
  const { backend } = useStore()
  const [url, setUrl] = useState<string | null>(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    let live = true
    setUrl(null)
    setErr(false)
    backend.photoUrl(path).then(u => live && setUrl(u), () => live && setErr(true))
    return () => { live = false }
  }, [path, backend])
  if (err) return <div className={cx('grid place-items-center bg-raised text-mute text-xs', className)}><div className="text-center"><ImageOff className="mx-auto mb-1" size={20} />Couldn't load</div></div>
  if (!url) return <div className={cx('bg-raised animate-pulse', className)} role="img" aria-label={`${alt} loading`} />
  return <img src={url} alt={alt} onError={() => setErr(true)} className={cx('object-contain bg-black', className)} draggable={false} />
}

/** Month grid. `marks(date)` returns small indicators to draw under the day number. */
export function MonthGrid({ month, onMonth, selected, onSelect, marks }: {
  month: string; onMonth: (m: string) => void; selected?: string; onSelect: (d: string) => void; marks: (date: string) => React.ReactNode
}) {
  const first = parse(month)
  first.setDate(1)
  const firstStr = toStr(first)
  const lead = (first.getDay() + 6) % 7 // Monday-first
  const daysIn = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  const shift = (n: number) => { const d = parse(firstStr); d.setMonth(d.getMonth() + n); onMonth(toStr(d)) }
  const t = today()
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button aria-label="Previous month" onClick={() => shift(-1)} className="h-11 w-11 grid place-items-center text-mute"><ChevronLeft size={20} /></button>
        <span className="text-sm font-semibold">{first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
        <button aria-label="Next month" onClick={() => shift(1)} className="h-11 w-11 grid place-items-center text-mute"><ChevronRight size={20} /></button>
      </div>
      <div className="grid grid-cols-7 text-center text-[10px] text-mute mb-1">{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i}>{d}</span>)}</div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
        {Array.from({ length: daysIn }, (_, i) => {
          const d = addDays(firstStr, i)
          return (
            <button key={d} onClick={() => onSelect(d)} aria-label={parse(d).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })} aria-pressed={d === selected}
              className={cx('min-h-[48px] rounded-lg flex flex-col items-center justify-start pt-1 text-xs tnum', d === selected ? 'bg-volt/20 ring-1 ring-volt' : 'bg-card', d === t && 'font-bold text-volt', d > t && 'opacity-40')}>
              {i + 1}
              <span className="flex flex-wrap justify-center gap-0.5 mt-0.5 min-h-[12px]">{marks(d)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
