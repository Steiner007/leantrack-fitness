import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { MeasureSheet, WeightSheet } from '../components/sheets'
import { Card, DateNav, Header, Num, inputCls, useRun } from '../components/ui'
import { programPos, rollingAvg, showWeight } from '../lib/calc'
import { today } from '../lib/dates'
import { dayTotals, foodOn, measureOn, noteFor, sessionFor, setsFor, templateFor, weightOn } from '../lib/select'
import { useStore } from '../lib/store'

export default function Day() {
  const { date = today() } = useParams()
  const { data, profile, program, save } = useStore()
  const nav = useNavigate()
  const run = useRun()
  const [sheet, setSheet] = useState<'weight' | 'measure' | null>(null)
  const w = weightOn(data, date)
  const m = measureOn(data, date)
  const s = sessionFor(data, date)
  const tpl = templateFor(data, date)
  const sets = s ? setsFor(data, s.id) : []
  const food = foodOn(data, date)
  const totals = dayTotals(data, date)
  const note = noteFor(data, date)
  const pos = programPos(program.start_date, date, program.weeks)
  const avg = rollingAvg(data.weight_entries, date)
  const Row = ({ label, value, onClick }: { label: string; value: React.ReactNode; onClick: () => void }) => (
    <button onClick={onClick} className="w-full flex items-center justify-between gap-3 px-4 min-h-[52px] text-left active:bg-raised">
      <span className="text-sm text-mute">{label}</span>
      <span className="flex items-center gap-1 text-sm text-right tnum">{value}<ChevronRight size={16} className="text-mute shrink-0" /></span>
    </button>
  )
  return (
    <div>
      <Header title="Day" back sub={pos.status === 'active' ? `Week ${pos.week} · Day ${pos.day}` : undefined} />
      <DateNav date={date} onChange={d => nav(`/day/${d}`, { replace: true })} />
      <Card className="!p-0 divide-y divide-line/60 mb-3">
        <Row label="Weight" value={w ? <>{showWeight(w.weight_lb, profile.weight_unit)}<span className="text-xs text-mute ml-1">avg {showWeight(avg, profile.weight_unit)}</span></> : 'Add'} onClick={() => setSheet('weight')} />
        <Row label="Waist" value={m?.waist_in != null ? `${m.waist_in} in` : m ? 'Other measurements' : 'Add'} onClick={() => setSheet('measure')} />
        <Row label="Workout" value={s ? `${s.name} · ${sets.filter(x => x.completed).length}/${sets.length} sets${s.completed_at ? ' ✓' : ''}` : tpl ? `${tpl.name} — not logged` : 'None'} onClick={() => nav(`/session/${date}`)} />
        <Row label="Food" value={food.length ? `${Math.round(totals.calories).toLocaleString()} kcal · ${Math.round(totals.protein_g)} g protein` : 'Not logged'} onClick={() => nav(`/food?date=${date}`)} />
      </Card>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <Card className="!p-3">
          <div className="text-[11px] uppercase tracking-wide text-mute mb-1">Water (oz)</div>
          <Num label="Water ounces" value={note.water_oz || null} placeholder="0" onCommit={n => run(() => save('daily_notes', { ...note, water_oz: n ?? 0 }), 'Water saved')} className={inputCls} />
        </Card>
        <Card className="!p-3">
          <div className="text-[11px] uppercase tracking-wide text-mute mb-1">Steps</div>
          <Num label="Steps" value={note.steps} placeholder="—" onCommit={n => run(() => save('daily_notes', { ...note, steps: n == null ? null : Math.round(n) }), 'Steps saved')} className={inputCls} />
        </Card>
      </div>
      <Card>
        <div className="text-sm font-semibold mb-2">Notes</div>
        <textarea aria-label="Daily notes" rows={3} placeholder="How did today go?" defaultValue={note.note ?? ''} key={date + (note.note ?? '')} className={inputCls + ' py-2'}
          onBlur={e => e.target.value !== (note.note ?? '') && run(() => save('daily_notes', { ...note, note: e.target.value || null }), 'Note saved')} />
      </Card>
      <WeightSheet open={sheet === 'weight'} date={date} onClose={() => setSheet(null)} />
      <MeasureSheet open={sheet === 'measure'} date={date} onClose={() => setSheet(null)} />
    </div>
  )
}
