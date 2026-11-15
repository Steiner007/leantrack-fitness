import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Card, Header, Num, inputCls, useRun } from '../components/ui'
import { DAY_NAMES } from '../lib/dates'
import { uid } from '../lib/seed'
import { exercisesFor } from '../lib/select'
import { useStore } from '../lib/store'
import type { Exercise, Kind, Template, Unit } from '../lib/types'

const ORDER = [1, 2, 3, 4, 5, 6, 0]
const small = 'min-h-[40px] rounded-lg bg-bg border border-line px-2 text-sm text-ink focus:outline-none focus:border-volt'

export default function EditSchedule() {
  const { data, program, save } = useStore()
  const run = useRun()
  const templates = data.workout_templates.filter(t => !t.archived)

  const saveT = (t: Template, patch: Partial<Template>) => run(() => save('workout_templates', { ...t, ...patch }))
  const saveE = (e: Exercise, patch: Partial<Exercise>) => run(() => save('exercises', { ...e, ...patch }))
  // Moving a workout to another day swaps it with whatever is on that day.
  const move = (t: Template, to: number) => {
    const other = templates.find(x => x.weekday === to)
    return run(() => save('workout_templates', other ? [{ ...t, weekday: to }, { ...other, weekday: t.weekday }] : [{ ...t, weekday: to }]), 'Schedule updated')
  }
  const swap = (list: Exercise[], i: number, j: number) =>
    run(() => save('exercises', [{ ...list[i], position: list[j].position }, { ...list[j], position: list[i].position }]))
  const addDay = (weekday: number) => run(() => save('workout_templates', { id: uid(), program_id: program.id, weekday, name: 'New workout', kind: 'lifting', archived: false }))

  return (
    <div>
      <Header title="Edit schedule" back="/workouts" />
      <p className="text-xs text-mute mb-3">Changes apply to future workouts. Workouts you've already logged keep exactly what you did. Edits save as you leave each field.</p>
      {ORDER.map(wd => {
        const t = templates.find(x => x.weekday === wd)
        if (!t) return (
          <Card key={wd} className="mb-3 flex items-center justify-between">
            <span className="text-sm text-mute">{DAY_NAMES[wd]} — nothing scheduled</span>
            <button onClick={() => addDay(wd)} className="text-sm text-volt min-h-[44px] px-2">Add workout</button>
          </Card>
        )
        const list = exercisesFor(data, t.id)
        return (
          <Card key={t.id} className="mb-3">
            <div className="flex gap-2 mb-2">
              <select aria-label="Day" className={small + ' w-28'} value={t.weekday} onChange={e => move(t, Number(e.target.value))}>
                {ORDER.map(d => <option key={d} value={d}>{DAY_NAMES[d]}</option>)}
              </select>
              <select aria-label="Type" className={small + ' flex-1'} value={t.kind} onChange={e => saveT(t, { kind: e.target.value as Kind })}>
                <option value="lifting">Lifting</option><option value="cardio">Cardio / core</option><option value="recovery">Recovery</option>
              </select>
            </div>
            <input aria-label="Workout name" className={inputCls + ' font-semibold mb-3'} defaultValue={t.name} key={t.name}
              onBlur={e => e.target.value.trim() && e.target.value !== t.name && saveT(t, { name: e.target.value.trim() })} />
            {list.map((e, i) => (
              <div key={e.id} className="border-t border-line/60 py-2">
                <div className="flex gap-1 items-center">
                  <input aria-label="Exercise name" className={small + ' flex-1 min-w-0'} defaultValue={e.name} key={e.name}
                    onBlur={ev => ev.target.value.trim() && ev.target.value !== e.name && saveE(e, { name: ev.target.value.trim() })} />
                  <button aria-label="Move up" disabled={i === 0} onClick={() => swap(list, i, i - 1)} className="h-10 w-8 grid place-items-center text-mute disabled:opacity-30"><ArrowUp size={16} /></button>
                  <button aria-label="Move down" disabled={i === list.length - 1} onClick={() => swap(list, i, i + 1)} className="h-10 w-8 grid place-items-center text-mute disabled:opacity-30"><ArrowDown size={16} /></button>
                  <button aria-label={`Remove ${e.name}`} onClick={() => saveE(e, { archived: true })} className="h-10 w-8 grid place-items-center text-bad"><Trash2 size={16} /></button>
                </div>
                <div className="flex gap-1.5 items-center mt-1.5 text-xs text-mute">
                  <Num label="Sets" value={e.sets} onCommit={n => n && n >= 1 && saveE(e, { sets: Math.min(20, Math.round(n)) })} className={small + ' w-12 text-center'} /> ×
                  <Num label="Low" value={e.rep_low} onCommit={n => saveE(e, { rep_low: n })} className={small + ' w-14 text-center'} /> –
                  <Num label="High" value={e.rep_high} placeholder="—" onCommit={n => saveE(e, { rep_high: n })} className={small + ' w-14 text-center'} />
                  <select aria-label="Unit" className={small} value={e.unit} onChange={ev => saveE(e, { unit: ev.target.value as Unit })}>
                    <option value="reps">reps</option><option value="sec">sec</option><option value="min">min</option>
                  </select>
                  <label className="flex items-center gap-1 ml-auto"><input type="checkbox" checked={e.per_side} onChange={ev => saveE(e, { per_side: ev.target.checked })} className="h-4 w-4 accent-[#b9f04a]" /> per side</label>
                </div>
              </div>
            ))}
            <button className="mt-2 w-full min-h-[44px] rounded-xl border border-dashed border-line text-sm text-mute inline-flex items-center justify-center gap-1.5"
              onClick={() => run(() => save('exercises', { id: uid(), template_id: t.id, name: 'New exercise', sets: 3, rep_low: 10, rep_high: 12, unit: 'reps', per_side: false, optional: false, instructions: null, position: (list[list.length - 1]?.position ?? -1) + 1, archived: false }))}>
              <Plus size={16} /> Add exercise
            </button>
            <button className="mt-1 w-full min-h-[40px] text-xs text-mute" onClick={() => window.confirm(`Remove ${t.name} from ${DAY_NAMES[t.weekday]}? Logged history is kept.`) && saveT(t, { archived: true })}>Remove this workout day</button>
          </Card>
        )
      })}
    </div>
  )
}
