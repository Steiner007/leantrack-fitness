import { useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Camera, Columns2, ImagePlus, Trash2 } from 'lucide-react'
import { MonthGrid, PhotoImg } from '../components/photo'
import { Btn, Card, DateNav, Header, ask, inputCls, useRun, useToast } from '../components/ui'
import { ARTIFACT } from '../lib/claudeBackend'
import { showWeight } from '../lib/calc'
import { fmtLong, today } from '../lib/dates'
import { compressImage } from '../lib/photos'
import { uid } from '../lib/seed'
import { dayTotals, foodOn, measureOn, noteFor, photosOn, sessionFor, weightOn } from '../lib/select'
import { useStore } from '../lib/store'
import type { Photo, Pose } from '../lib/types'

const SLOTS: { pose: Pose; label: string }[] = [{ pose: 'front', label: 'Front' }, { pose: 'side', label: 'Side' }, { pose: 'back', label: 'Back' }]

export function usePhotoActions(date: string) {
  const { backend, save, remove } = useStore()
  const run = useRun()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)

  /** Uploads a new photo; when `replacing` is given the old one is removed only after the new one is safely saved. */
  async function add(file: File | undefined, pose: Pose, replacing?: Photo) {
    if (!file) return
    if (!file.type.startsWith('image/')) return toast('That file is not an image.', 'err')
    setBusy(pose)
    await run(async () => {
      const { blob, width, height } = await compressImage(file)
      const path = await backend.uploadPhoto(`${backend.userId}/${date}/${pose}-${uid()}.jpg`, blob)
      try {
        await save('progress_photos', { id: uid(), date, pose, storage_path: path, width, height })
      } catch (e) {
        await backend.removePhotos([path]).catch(() => {})
        throw e
      }
      if (replacing) {
        await backend.removePhotos([replacing.storage_path])
        await remove('progress_photos', replacing.id)
      }
    }, replacing ? 'Photo replaced' : 'Photo saved')
    setBusy(null)
  }
  async function del(p: Photo) {
    if (!(await ask('Delete this photo permanently?', 'Delete'))) return
    await run(async () => { await backend.removePhotos([p.storage_path]); await remove('progress_photos', p.id) }, 'Photo deleted')
  }
  return { add, del, busy }
}

function Pickers({ onFile, label, compact }: { onFile: (f: File | undefined) => void; label: string; compact?: boolean }) {
  const cam = useRef<HTMLInputElement>(null)
  const lib = useRef<HTMLInputElement>(null)
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => { onFile(e.target.files?.[0]); e.target.value = '' }
  return (
    <div className="flex gap-1.5">
      {/* capture="environment" opens the phone camera directly; the second input opens the photo library. */}
      {!ARTIFACT && <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={pick} aria-label={`${label} camera`} />}
      <input ref={lib} type="file" accept="image/*" hidden onChange={pick} aria-label={`${label} gallery`} />
      {!ARTIFACT && <button onClick={() => cam.current?.click()} className="flex-1 min-h-[40px] rounded-lg bg-raised border border-line text-xs inline-flex items-center justify-center gap-1"><Camera size={14} />{!compact && ' Camera'}</button>}
      <button onClick={() => lib.current?.click()} className="flex-1 min-h-[40px] rounded-lg bg-raised border border-line text-xs inline-flex items-center justify-center gap-1"><ImagePlus size={14} />{ARTIFACT ? (compact ? ' Add' : ' Add photo') : !compact && ' Gallery'}</button>
    </div>
  )
}

export function PhotoDay({ date }: { date: string }) {
  const { data, save } = useStore()
  const run = useRun()
  const { add, del, busy } = usePhotoActions(date)
  const [view, setView] = useState<Photo | null>(null)
  const photos = photosOn(data, date)
  const extras = photos.filter(p => p.pose === 'extra')
  const note = noteFor(data, date)

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {SLOTS.map(s => {
          const p = photos.find(x => x.pose === s.pose)
          return (
            <div key={s.pose}>
              <div className="text-xs text-mute mb-1 text-center">{s.label}</div>
              <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-card border border-line/60">
                {busy === s.pose ? <div className="absolute inset-0 grid place-items-center text-xs text-mute">Uploading…</div>
                  : p ? <button className="absolute inset-0" onClick={() => setView(p)} aria-label={`View ${s.label} photo`}><PhotoImg path={p.storage_path} alt={`${s.label} photo`} className="h-full w-full" /></button>
                  : <div className="absolute inset-0 grid place-items-center text-mute"><Camera size={22} /></div>}
              </div>
              <div className="mt-1.5"><Pickers compact label={`${p ? 'Replace' : 'Add'} ${s.label}`} onFile={f => add(f, s.pose, p)} /></div>
              {p && <button onClick={() => del(p)} className="w-full min-h-[36px] text-xs text-bad inline-flex items-center justify-center gap-1"><Trash2 size={12} /> Delete</button>}
            </div>
          )
        })}
      </div>
      <p className="text-[11px] text-mute mb-3">{ARTIFACT ? 'Tap Add to take a photo or choose one from your library. Adding again replaces it.' : 'Camera icon retakes or replaces; the picture icon uploads from your gallery.'}</p>

      <div className="text-xs text-mute mb-1">Additional photos</div>
      <div className="grid grid-cols-4 gap-2 mb-2">
        {extras.map(p => (
          <div key={p.id} className="relative aspect-[3/4] rounded-lg overflow-hidden bg-card border border-line/60">
            <button className="absolute inset-0" onClick={() => setView(p)} aria-label="View additional photo"><PhotoImg path={p.storage_path} alt="Additional photo" className="h-full w-full" /></button>
            <button onClick={() => del(p)} aria-label="Delete additional photo" className="absolute top-1 right-1 h-7 w-7 rounded-full bg-black/70 grid place-items-center text-bad"><Trash2 size={13} /></button>
          </div>
        ))}
        {busy === 'extra' && <div className="aspect-[3/4] rounded-lg bg-card grid place-items-center text-[10px] text-mute">Uploading…</div>}
      </div>
      <div className="mb-3 max-w-[200px]"><Pickers label="Add additional" onFile={f => add(f, 'extra')} /></div>

      <textarea aria-label="Photo notes" placeholder="Photo notes (optional) — lighting, time of day, how you feel" rows={2} defaultValue={note.photo_note ?? ''} key={date + (note.photo_note ?? '')}
        className={inputCls + ' py-2'} onBlur={e => e.target.value !== (note.photo_note ?? '') && run(() => save('daily_notes', { ...note, photo_note: e.target.value || null }), 'Note saved')} />

      {view && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col" role="dialog" aria-label="Photo full screen">
          <PhotoImg path={view.storage_path} alt="Progress photo" className="flex-1 min-h-0 w-full" />
          <div className="p-3 safe-b flex gap-2"><Btn full onClick={() => setView(null)}>Close</Btn></div>
        </div>
      )}
    </div>
  )
}

export default function Photos() {
  const { data, profile, backend } = useStore()
  const [params, setParams] = useSearchParams()
  const date = params.get('date') ?? today()
  const setDate = (d: string) => setParams({ date: d }, { replace: true })
  const [month, setMonth] = useState(date)
  const withPhotos = new Set(data.progress_photos.map(p => p.date))
  const w = weightOn(data, date)
  const m = measureOn(data, date)
  const s = sessionFor(data, date)
  const hasFood = foodOn(data, date).length > 0
  const note = noteFor(data, date)

  return (
    <div>
      <Header title="Progress photos" back
        right={<Link to="/compare" className="h-11 px-3 rounded-xl bg-card border border-line/60 text-sm inline-flex items-center gap-1.5"><Columns2 size={16} /> Compare</Link>} />
      <DateNav date={date} onChange={d => { setDate(d); setMonth(d) }} />
      <PhotoDay date={date} />

      <Card className="mt-3 mb-3">
        <div className="text-[11px] uppercase tracking-wide text-mute mb-2">{fmtLong(date)}</div>
        <div className="grid grid-cols-2 gap-y-1.5 text-sm">
          <span className="text-mute">Weight</span><span className="text-right tnum">{showWeight(w?.weight_lb, profile.weight_unit)}</span>
          <span className="text-mute">Waist</span><span className="text-right tnum">{m?.waist_in != null ? `${m.waist_in} in` : '—'}</span>
          <span className="text-mute">Workout</span><span className="text-right">{s?.completed_at ? `${s.name} ✓` : s ? `${s.name} (in progress)` : '—'}</span>
          <span className="text-mute">Calories</span><span className="text-right tnum">{hasFood ? Math.round(dayTotals(data, date).calories).toLocaleString() : '—'}</span>
        </div>
        {note.note && <p className="text-xs text-mute mt-2 border-t border-line/60 pt-2">{note.note}</p>}
        <Link to={`/day/${date}`} className="block text-xs text-volt mt-2">Open full day →</Link>
      </Card>

      <Card>
        <MonthGrid month={month} onMonth={setMonth} selected={date} onSelect={d => d <= today() && setDate(d)}
          marks={d => withPhotos.has(d) ? <Camera size={11} className="text-volt" aria-label="Has photos" /> : null} />
      </Card>
      <p className="text-[11px] text-mute mt-3">{backend.mode === 'claude' ? 'Photos are stored with this Claude artifact: keep it unshared, because anyone you share it with could load them. They are shown' : 'Photos are stored privately and shown'} at their original proportions with no filters or retouching. Large photos are resized to 1600 px on the long edge.</p>
    </div>
  )
}
