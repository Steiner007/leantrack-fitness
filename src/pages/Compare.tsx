import { useEffect, useRef, useState } from 'react'
import { Maximize2, X } from 'lucide-react'
import { PhotoImg } from '../components/photo'
import { Btn, Empty, Header, Tabs, inputCls } from '../components/ui'
import { showWeight } from '../lib/calc'
import { fmt } from '../lib/dates'
import { useStore } from '../lib/store'
import type { Photo, Pose } from '../lib/types'

const full = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' } as const

function Slider({ before, after }: { before: Photo; after: Photo }) {
  const [pct, setPct] = useState(50)
  const box = useRef<HTMLDivElement>(null)
  const move = (clientX: number) => {
    const r = box.current!.getBoundingClientRect()
    setPct(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)))
  }
  return (
    <div ref={box} className="relative h-full w-full overflow-hidden rounded-xl bg-black select-none touch-none"
      onPointerDown={e => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); move(e.clientX) }}
      onPointerMove={e => e.buttons > 0 && move(e.clientX)}>
      <PhotoImg path={after.storage_path} alt="After photo" className="absolute inset-0 h-full w-full" />
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}>
        <PhotoImg path={before.storage_path} alt="Before photo" className="absolute inset-0 h-full w-full" />
      </div>
      <div className="absolute inset-y-0 w-0.5 bg-white pointer-events-none" style={{ left: `${pct}%` }}>
        <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white text-black grid place-items-center text-xs font-bold shadow-lg">◂▸</div>
      </div>
      <span className="absolute top-2 left-2 text-[10px] bg-black/70 rounded px-1.5 py-0.5">Before</span>
      <span className="absolute top-2 right-2 text-[10px] bg-black/70 rounded px-1.5 py-0.5">After</span>
      <input type="range" min={0} max={100} value={Math.round(pct)} onChange={e => setPct(Number(e.target.value))} aria-label="Before and after slider position" className="sr-only" />
    </div>
  )
}

export default function Compare() {
  const { data, profile } = useStore()
  const dates = [...new Set(data.progress_photos.map(p => p.date))].sort()
  const [a, setA] = useState(dates[0] ?? '')
  const [b, setB] = useState(dates[dates.length - 1] ?? '')
  const [pose, setPose] = useState<Pose>('front')
  const [mode, setMode] = useState<'side' | 'slider'>('side')
  const [fs, setFs] = useState(false)
  useEffect(() => { if (!a && dates[0]) { setA(dates[0]); setB(dates[dates.length - 1]) } }, [dates.length])

  const find = (d: string) => data.progress_photos.find(p => p.date === d && p.pose === pose)
  const pa = find(a), pb = find(b)
  const caption = (d: string) => (
    <div className="text-center mt-1.5">
      <div className="text-xs font-medium">{d ? fmt(d, full) : '—'}</div>
      <div className="text-xs text-mute tnum">{showWeight(data.weight_entries.find(w => w.date === d)?.weight_lb, profile.weight_unit)}</div>
    </div>
  )
  const missing = (d: string) => <div className="h-full w-full rounded-xl bg-card border border-line/60 grid place-items-center text-xs text-mute text-center p-3">No {pose} photo{d ? ` on ${fmt(d)}` : ''}</div>

  const view = (tall: boolean) => (
    <div className={tall ? 'flex-1 min-h-0 flex flex-col' : ''}>
      {mode === 'slider' && pa && pb ? (
        <>
          <div className={tall ? 'flex-1 min-h-0' : 'aspect-[3/4]'}><Slider before={pa} after={pb} /></div>
          <div className="grid grid-cols-2 gap-2">{caption(a)}{caption(b)}</div>
        </>
      ) : (
        <div className={`grid grid-cols-2 gap-2 ${tall ? 'flex-1 min-h-0' : ''}`}>
          {[[a, pa, 'Before'], [b, pb, 'After']].map(([d, p, label]) => (
            <div key={label as string} className={tall ? 'flex flex-col min-h-0' : ''}>
              <div className={tall ? 'flex-1 min-h-0' : 'aspect-[3/4]'}>
                {p ? <PhotoImg path={(p as Photo).storage_path} alt={`${label} ${pose} photo`} className="h-full w-full rounded-xl" /> : missing(d as string)}
              </div>
              {caption(d as string)}
            </div>
          ))}
        </div>
      )}
      {mode === 'slider' && !(pa && pb) && <p className="text-xs text-mute text-center mt-2">The slider needs a {pose} photo on both dates.</p>}
    </div>
  )

  return (
    <div>
      <Header title="Before / after" back />
      {dates.length === 0 ? <Empty>Add progress photos on at least one day to compare.</Empty> : (
        <>
          <div className="grid grid-cols-2 gap-2 mb-3">
            {([['Before', a, setA], ['After', b, setB]] as const).map(([label, v, set]) => (
              <label key={label} className="block">
                <span className="block text-xs text-mute mb-1">{label}</span>
                <select className={inputCls} value={v} onChange={e => set(e.target.value)} aria-label={`${label} date`}>
                  {dates.map(d => <option key={d} value={d}>{fmt(d, { month: 'short', day: 'numeric', year: 'numeric' })}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div className="mb-2"><Tabs value={pose} onChange={setPose} options={[{ value: 'front', label: 'Front' }, { value: 'side', label: 'Side' }, { value: 'back', label: 'Back' }]} /></div>
          <div className="mb-3"><Tabs value={mode} onChange={setMode} options={[{ value: 'side', label: 'Side by side' }, { value: 'slider', label: 'Slider' }]} /></div>
          {view(false)}
          <Btn full className="mt-3" onClick={() => setFs(true)}><Maximize2 size={16} /> Full screen</Btn>
          <p className="text-[11px] text-mute mt-3">Photos are shown exactly as taken, at their original proportions. For a fair comparison use the same lighting, distance and time of day.</p>
        </>
      )}
      {fs && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col p-2 safe-t safe-b" role="dialog" aria-label="Full screen comparison">
          <button onClick={() => setFs(false)} aria-label="Exit full screen" className="self-end h-11 w-11 grid place-items-center"><X size={24} /></button>
          {view(true)}
        </div>
      )}
    </div>
  )
}
