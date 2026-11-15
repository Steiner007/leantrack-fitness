import { useEffect, useState } from 'react'
import { kgToLb, lbToKg, round } from '../lib/calc'
import { fmtLong, today } from '../lib/dates'
import { uid } from '../lib/seed'
import { measureOn, weightOn } from '../lib/select'
import { useStore } from '../lib/store'
import type { Measurement } from '../lib/types'
import { Btn, Field, Sheet, Tabs, inputCls, useRun } from './ui'

export function WeightSheet({ open, onClose, date: initial }: { open: boolean; onClose: () => void; date?: string }) {
  const { data, profile, save, remove } = useStore()
  const run = useRun()
  const [date, setDate] = useState(initial ?? today())
  const [unit, setUnit] = useState<'lb' | 'kg'>(profile.weight_unit)
  const [val, setVal] = useState('')
  const [busy, setBusy] = useState(false)
  const existing = weightOn(data, date)

  useEffect(() => { if (open) { setDate(initial ?? today()); setUnit(profile.weight_unit) } }, [open, initial, profile.weight_unit])
  useEffect(() => {
    setVal(existing ? String(round(unit === 'kg' ? lbToKg(existing.weight_lb) : existing.weight_lb, 1)) : '')
  }, [existing?.id, existing?.weight_lb, unit, date, open])

  const n = Number(val.replace(',', '.'))
  const valid = val.trim() !== '' && isFinite(n) && n > 0 && n < (unit === 'kg' ? 500 : 1100)
  async function submit() {
    setBusy(true)
    const weight_lb = round(unit === 'kg' ? kgToLb(n) : n, 2)
    const ok = await run(() => save('weight_entries', { id: existing?.id ?? uid(), date, weight_lb }), 'Weight saved')
    setBusy(false)
    if (ok) onClose()
  }
  return (
    <Sheet open={open} onClose={onClose} title={existing ? 'Edit weight' : 'Log weight'}>
      <Field label="Date"><input type="date" className={inputCls} value={date} max={today()} onChange={e => e.target.value && setDate(e.target.value)} /></Field>
      <div className="flex gap-2 items-end mb-3">
        <div className="flex-1">
          <span className="block text-xs text-mute mb-1">Weight ({unit})</span>
          <input autoFocus inputMode="decimal" aria-label="Weight" className={inputCls + ' text-2xl font-semibold h-14'} placeholder={unit === 'kg' ? '79.4' : '175.0'}
            value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && valid && submit()} />
        </div>
        <div className="w-28"><Tabs value={unit} onChange={setUnit} options={[{ value: 'lb', label: 'lb' }, { value: 'kg', label: 'kg' }]} /></div>
      </div>
      <p className="text-xs text-mute mb-3">{fmtLong(date)}{existing ? ' · updating the existing entry' : ''}</p>
      <Btn variant="primary" full busy={busy} disabled={!valid} onClick={submit}>Save weight</Btn>
      {existing && (
        <Btn variant="ghost" full className="mt-2" onClick={async () => { if (await run(() => remove('weight_entries', existing.id), 'Entry deleted')) onClose() }}>Delete this entry</Btn>
      )}
    </Sheet>
  )
}

const M_FIELDS: { key: keyof Omit<Measurement, 'id' | 'date' | 'user_id' | 'created_at'>; label: string }[] = [
  { key: 'waist_in', label: 'Waist' }, { key: 'chest_in', label: 'Chest (optional)' }, { key: 'arms_in', label: 'Arms (optional)' },
  { key: 'hips_in', label: 'Hips (optional)' }, { key: 'thighs_in', label: 'Thighs (optional)' },
]
export function MeasureSheet({ open, onClose, date: initial }: { open: boolean; onClose: () => void; date?: string }) {
  const { data, save, remove } = useStore()
  const run = useRun()
  const [date, setDate] = useState(initial ?? today())
  const [vals, setVals] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const existing = measureOn(data, date)
  useEffect(() => { if (open) setDate(initial ?? today()) }, [open, initial])
  useEffect(() => {
    setVals(Object.fromEntries(M_FIELDS.map(f => [f.key, existing?.[f.key] != null ? String(existing[f.key]) : ''])))
  }, [existing?.id, date, open])

  const parsed = Object.fromEntries(M_FIELDS.map(f => {
    const s = (vals[f.key] ?? '').trim()
    const n = Number(s.replace(',', '.'))
    return [f.key, s === '' || !isFinite(n) || n <= 0 ? null : n]
  })) as Pick<Measurement, 'waist_in' | 'chest_in' | 'arms_in' | 'hips_in' | 'thighs_in'>
  const any = Object.values(parsed).some(v => v != null)
  async function submit() {
    setBusy(true)
    const ok = await run(() => save('body_measurements', { id: existing?.id ?? uid(), date, ...parsed }), 'Measurements saved')
    setBusy(false)
    if (ok) onClose()
  }
  return (
    <Sheet open={open} onClose={onClose} title="Body measurements">
      <Field label="Date"><input type="date" className={inputCls} value={date} max={today()} onChange={e => e.target.value && setDate(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-x-3">
        {M_FIELDS.map(f => (
          <Field key={f.key} label={`${f.label} (in)`}>
            <input inputMode="decimal" className={inputCls} value={vals[f.key] ?? ''} onChange={e => setVals(v => ({ ...v, [f.key]: e.target.value }))} />
          </Field>
        ))}
      </div>
      <p className="text-xs text-mute mb-3">Measure your waist at the navel, relaxed, at the same time of day each week.</p>
      <Btn variant="primary" full busy={busy} disabled={!any} onClick={submit}>Save measurements</Btn>
      {existing && <Btn variant="ghost" full className="mt-2" onClick={async () => { if (await run(() => remove('body_measurements', existing.id), 'Entry deleted')) onClose() }}>Delete this entry</Btn>}
    </Sheet>
  )
}
