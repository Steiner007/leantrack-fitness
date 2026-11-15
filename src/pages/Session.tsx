import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Check, Info, Minus, MoreVertical, Plus, Timer, Trophy, X } from 'lucide-react'
import { Btn, Card, Empty, Field, Header, Num, Sheet, cx, inputCls, useRun, useToast } from '../components/ui'
import { isPR, lowerIsBetter, personalBests, targetText } from '../lib/calc'
import { fmt, fmtLong, today } from '../lib/dates'
import { uid } from '../lib/seed'
import { buildSession, buildSets, datedSets, exercisesFor, lastPerformance, sessionFor, setsFor, templateFor } from '../lib/select'
import { useStore } from '../lib/store'
import type { SetRow, Unit } from '../lib/types'

const REST_KEY = 'leantrack.rest'
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

function useRestTimer() {
  const [end, setEnd] = useState<number | null>(null)
  const [left, setLeft] = useState(0)
  const [len, setLen] = useState(() => Number(localStorage.getItem(REST_KEY)) || 90)
  useEffect(() => {
    if (end == null) return
    const tick = () => {
      const s = Math.max(0, Math.round((end - Date.now()) / 1000))
      setLeft(s)
      if (s === 0) { setEnd(null); navigator.vibrate?.([200, 100, 200]) }
    }
    tick()
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [end])
  return {
    running: end != null, left, len,
    start: (secs = len) => setEnd(Date.now() + secs * 1000),
    add: (secs: number) => setEnd(e => (e == null ? e : e + secs * 1000)),
    stop: () => setEnd(null),
    setLen: (n: number) => { setLen(n); localStorage.setItem(REST_KEY, String(n)) },
  }
}

export default function SessionPage() {
  const { date = today() } = useParams()
  const { data, save, remove } = useStore()
  const nav = useNavigate()
  const loc = useLocation()
  const run = useRun()
  const toast = useToast()
  const timer = useRestTimer()
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState<string | null>(null)
  const [menu, setMenu] = useState<string | null>(null) // exercise name
  const [adding, setAdding] = useState(false)
  const [subFor, setSubFor] = useState<string | null>(null)

  const tpl = templateFor(data, date)
  const session = sessionFor(data, date)
  const sets = session ? setsFor(data, session.id) : []
  const allDated = useMemo(() => datedSets(data), [data.exercise_sets, data.workout_sessions])
  const prior = useMemo(() => personalBests(allDated, date), [allDated, date])
  const knownNames = useMemo(() => [...new Set([...data.exercises.map(e => e.name), ...data.exercise_sets.map(s => s.exercise_name)])].sort(), [data.exercises, data.exercise_sets])
  const instructionsFor = (name: string) => data.exercises.find(e => e.name === name && e.instructions)?.instructions ?? null

  async function start() {
    if (busy || sessionFor(data, date)) return
    setBusy(true)
    const built = buildSession(data, date)
    await run(async () => { await save('workout_sessions', built.session); await save('exercise_sets', built.sets) })
    setBusy(false)
  }
  // "Start Workout" on the dashboard lands here and begins immediately.
  const autoStarted = useRef(false)
  useEffect(() => {
    if ((loc.state as { start?: boolean } | null)?.start && !session && !autoStarted.current && date <= today()) {
      autoStarted.current = true
      void start()
    }
  }, [])

  if (!session) {
    const list = exercisesFor(data, tpl?.id)
    return (
      <div>
        <Header title={tpl?.name ?? 'Rest day'} sub={fmtLong(date)} back />
        {date <= today() ? <Btn variant="primary" full busy={busy} onClick={start} className="mb-3">Start Workout</Btn>
          : <p className="text-xs text-mute mb-3">This workout is in the future. You can log it on the day.</p>}
        {list.length === 0 ? <Empty>Nothing is scheduled for this day. Starting creates an empty workout you can add exercises to.</Empty> : list.map(e => (
          <Card key={e.id} className="mb-2">
            <div className="flex justify-between gap-2"><span className="font-medium">{e.name}</span><span className="text-sm text-mute shrink-0">{targetText(e)}</span></div>
            {e.instructions && <p className="text-xs text-mute mt-1">{e.instructions}</p>}
          </Card>
        ))}
      </div>
    )
  }

  // Group set rows by exercise, in order.
  const groups: { name: string; position: number; rows: SetRow[] }[] = []
  for (const s of sets) {
    const g = groups.find(x => x.name === s.exercise_name && x.position === s.position)
    if (g) g.rows.push(s)
    else groups.push({ name: s.exercise_name, position: s.position, rows: [s] })
  }
  const done = sets.filter(s => s.completed).length
  const saveSet = (s: SetRow, patch: Partial<SetRow>) => run(() => save('exercise_sets', { ...s, ...patch }))

  async function toggle(s: SetRow) {
    if (!s.completed && s.reps == null) return toast(s.unit === 'reps' ? 'Enter the reps you did first.' : 'Enter the time you did first.', 'err')
    const ok = await saveSet(s, { completed: !s.completed })
    if (ok && !s.completed && s.unit === 'reps') timer.start()
  }
  const addSet = (g: (typeof groups)[number]) => {
    const last = g.rows[g.rows.length - 1]
    return saveSet({ ...last, id: uid(), set_number: last.set_number + 1, completed: false }, {})
  }
  const removeSet = (g: (typeof groups)[number]) => g.rows.length > 1 && run(() => remove('exercise_sets', g.rows[g.rows.length - 1].id))
  const removeExercise = (g: (typeof groups)[number]) => run(() => remove('exercise_sets', g.rows.map(r => r.id)), 'Exercise removed from this workout')

  async function complete() {
    setBusy(true)
    const ok = await run(() => save('workout_sessions', { ...session!, completed_at: new Date().toISOString() }), 'Workout saved')
    setBusy(false)
    if (ok) { timer.stop(); nav('/') }
  }
  async function deleteSession() {
    if (!window.confirm('Delete this logged workout and all its sets?')) return
    const ok = await run(async () => { await remove('exercise_sets', sets.map(s => s.id)); await remove('workout_sessions', session!.id) }, 'Workout deleted')
    if (ok) nav('/workouts')
  }

  return (
    <div className="pb-20">
      <Header title={session.name} sub={`${fmtLong(date)} · ${done}/${sets.length} sets done`} back />

      {groups.length === 0 && <Empty>No exercises yet. Add one below.</Empty>}
      {groups.map(g => {
        const last = lastPerformance(data, g.name, date)
        const best = prior.get(g.name)
        const unit: Unit = g.rows[0].unit
        const how = instructionsFor(g.name)
        const note = session.exercise_notes?.[g.name] ?? ''
        const hasPR = g.rows.some(r => isPR(r, best))
        return (
          <Card key={g.name + g.position} className="mb-3">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-semibold flex items-center gap-2 flex-wrap">
                  {g.name}
                  {hasPR && <span className="inline-flex items-center gap-1 rounded-full bg-volt text-black text-[10px] font-bold px-2 py-0.5"><Trophy size={11} /> NEW PR</span>}
                </div>
                <div className="text-xs text-mute">{g.rows[0].target}</div>
              </div>
              {how && <button aria-label={`How to do ${g.name}`} onClick={() => setInfo(info === g.name ? null : g.name)} className={cx('h-10 w-9 grid place-items-center', info === g.name ? 'text-volt' : 'text-mute')}><Info size={18} /></button>}
              <button aria-label={`Options for ${g.name}`} onClick={() => setMenu(g.name)} className="h-10 w-8 grid place-items-center text-mute"><MoreVertical size={18} /></button>
            </div>
            {info === g.name && how && <p className="text-xs text-ink/80 bg-raised rounded-lg p-2.5 mt-2">{how}</p>}
            <div className="text-xs text-mute mt-2 space-y-0.5 tnum">
              <div>Last time: {last ? `${fmt(last.date)} — ${last.sets.map(s => (unit === 'reps' ? `${s.weight_lb ?? 0}×${s.reps}` : `${s.reps} ${unit}`)).join(', ')}` : 'no earlier record'}</div>
              {unit === 'reps' && <div>Personal best: {best ? `${best.weight_lb} lb × ${best.reps} (${fmt(best.date)})${lowerIsBetter(g.name) ? ' · least assistance' : ''}` : 'set after your first logged session'}</div>}
            </div>

            <div className="mt-3 space-y-2">
              {g.rows.map(r => (
                <div key={r.id} className="flex items-center gap-2">
                  <span className="w-6 text-center text-xs text-mute tnum">{r.set_number}</span>
                  {unit === 'reps' ? (
                    <>
                      <div className="flex-1 relative">
                        <Num label={`${g.name} set ${r.set_number} weight`} value={r.weight_lb} placeholder="0" onCommit={n => saveSet(r, { weight_lb: n })} className={inputCls + ' pr-8 text-center tnum'} />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-mute">lb</span>
                      </div>
                      <div className="flex-1 relative">
                        <Num label={`${g.name} set ${r.set_number} reps`} value={r.reps} placeholder="—" onCommit={n => saveSet(r, { reps: n })} className={inputCls + ' pr-10 text-center tnum'} />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-mute">reps</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 relative">
                      <Num label={`${g.name} set ${r.set_number} time`} value={r.reps} placeholder="—" onCommit={n => saveSet(r, { reps: n })} className={inputCls + ' pr-10 text-center tnum'} />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-mute">{unit}</span>
                    </div>
                  )}
                  <button role="checkbox" aria-checked={r.completed} aria-label={`${g.name} set ${r.set_number} done`} onClick={() => toggle(r)}
                    className={cx('h-11 w-11 shrink-0 rounded-xl grid place-items-center border transition', r.completed ? 'bg-volt border-volt text-black' : 'border-line text-transparent')}>
                    <Check size={22} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <button onClick={() => addSet(g)} className="min-h-[40px] flex-1 rounded-lg bg-raised text-xs text-mute inline-flex items-center justify-center gap-1"><Plus size={14} /> Set</button>
              <button onClick={() => removeSet(g)} disabled={g.rows.length <= 1} className="min-h-[40px] flex-1 rounded-lg bg-raised text-xs text-mute inline-flex items-center justify-center gap-1 disabled:opacity-40"><Minus size={14} /> Set</button>
            </div>
            <input aria-label={`Notes for ${g.name}`} placeholder="Notes (optional)" defaultValue={note} key={note}
              className="mt-2 w-full min-h-[40px] bg-transparent border-b border-line/60 text-sm placeholder:text-mute/60 focus:outline-none focus:border-volt"
              onBlur={e => e.target.value !== note && run(() => save('workout_sessions', { ...session, exercise_notes: { ...session.exercise_notes, [g.name]: e.target.value } }))} />
          </Card>
        )
      })}

      <button onClick={() => setAdding(true)} className="w-full min-h-[48px] rounded-2xl border border-dashed border-line text-sm text-mute inline-flex items-center justify-center gap-1.5 mb-3"><Plus size={16} /> Add exercise</button>

      <textarea aria-label="Workout notes" placeholder="Workout notes (optional)" defaultValue={session.notes ?? ''} rows={2}
        className={inputCls + ' py-2 mb-3'}
        onBlur={e => e.target.value !== (session.notes ?? '') && run(() => save('workout_sessions', { ...session, notes: e.target.value || null }), 'Notes saved')} />

      {session.completed_at ? (
        <div className="text-center">
          <p className="text-sm text-volt mb-2 inline-flex items-center gap-1.5"><Check size={16} /> Completed {new Date(session.completed_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
          <Btn full onClick={() => run(() => save('workout_sessions', { ...session, completed_at: null }), 'Workout reopened')}>Mark as not completed</Btn>
        </div>
      ) : <Btn variant="primary" full busy={busy} onClick={complete}><Check size={18} /> Complete Workout</Btn>}
      <Btn variant="ghost" full className="mt-2" onClick={deleteSession}>Delete this workout</Btn>

      {/* Rest timer */}
      <div className="fixed bottom-[76px] inset-x-0 z-20 px-4 pointer-events-none">
        <div className="mx-auto max-w-lg pointer-events-auto rounded-2xl bg-raised border border-line shadow-xl px-3 py-2 flex items-center gap-2">
          <Timer size={18} className={timer.running ? 'text-volt' : 'text-mute'} />
          {timer.running ? (
            <>
              <span className="text-lg font-semibold tnum flex-1" role="timer" aria-label="Rest time left">{mmss(timer.left)}</span>
              <button onClick={() => timer.add(15)} className="min-h-[40px] px-3 rounded-lg bg-card text-xs">+15s</button>
              <button onClick={timer.stop} aria-label="Stop rest timer" className="min-h-[40px] px-3 rounded-lg bg-card text-xs"><X size={16} /></button>
            </>
          ) : (
            <>
              <span className="text-xs text-mute flex-1">Rest timer</span>
              {[60, 90, 120].map(n => (
                <button key={n} onClick={() => { timer.setLen(n); timer.start(n) }} aria-label={`Start ${n} second rest`}
                  className={cx('min-h-[40px] px-3 rounded-lg text-xs tnum', timer.len === n ? 'bg-volt text-black font-semibold' : 'bg-card')}>{mmss(n)}</button>
              ))}
            </>
          )}
        </div>
      </div>

      <Sheet open={menu != null} onClose={() => setMenu(null)} title={menu ?? ''}>
        <Btn full className="mb-2" onClick={() => { setSubFor(menu); setMenu(null) }}>Substitute exercise</Btn>
        <Btn full variant="danger" onClick={async () => { const g = groups.find(x => x.name === menu); setMenu(null); if (g) await removeExercise(g) }}>Remove from this workout</Btn>
      </Sheet>
      <ExerciseSheet open={adding} title="Add exercise" names={knownNames} onClose={() => setAdding(false)}
        onSave={async v => {
          const position = (groups[groups.length - 1]?.position ?? -1) + 1
          const rows = buildSets(data, session.id, date, { name: v.name, sets: v.sets, rep_low: v.reps, rep_high: null, unit: v.unit, per_side: false }, position)
          return run(() => save('exercise_sets', rows), 'Exercise added')
        }} />
      <SubSheet from={subFor} names={knownNames} canUpdateSchedule={!!tpl} onClose={() => setSubFor(null)}
        onSave={async (to, alsoSchedule) => {
          const g = groups.find(x => x.name === subFor)
          if (!g) return false
          return run(async () => {
            await save('exercise_sets', g.rows.map(r => ({ ...r, exercise_name: to, exercise_id: null })))
            if (alsoSchedule && tpl) {
              const ex = exercisesFor(data, tpl.id).find(e => e.name === subFor)
              if (ex) await save('exercises', { ...ex, name: to, instructions: null })
            }
          }, 'Exercise substituted')
        }} />
    </div>
  )
}

function ExerciseSheet({ open, title, names, onClose, onSave }: {
  open: boolean; title: string; names: string[]; onClose: () => void
  onSave: (v: { name: string; sets: number; reps: number | null; unit: Unit }) => Promise<boolean>
}) {
  const [name, setName] = useState('')
  const [sets, setSets] = useState<number | null>(3)
  const [reps, setReps] = useState<number | null>(10)
  const [unit, setUnit] = useState<Unit>('reps')
  useEffect(() => { if (open) { setName(''); setSets(3); setReps(10); setUnit('reps') } }, [open])
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <Field label="Exercise">
        <input className={inputCls} list="exercise-names" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Pec fly machine" />
        <datalist id="exercise-names">{names.map(n => <option key={n} value={n} />)}</datalist>
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Sets"><Num live value={sets} onCommit={setSets} /></Field>
        <Field label="Target"><Num live value={reps} onCommit={setReps} /></Field>
        <Field label="Unit">
          <select className={inputCls} value={unit} onChange={e => setUnit(e.target.value as Unit)}><option value="reps">reps</option><option value="sec">sec</option><option value="min">min</option></select>
        </Field>
      </div>
      <Btn variant="primary" full disabled={!name.trim() || !sets} onClick={async () => { if (await onSave({ name: name.trim(), sets: Math.min(20, Math.max(1, Math.round(sets ?? 1))), reps, unit })) onClose() }}>Add to workout</Btn>
    </Sheet>
  )
}

function SubSheet({ from, names, canUpdateSchedule, onClose, onSave }: {
  from: string | null; names: string[]; canUpdateSchedule: boolean; onClose: () => void; onSave: (to: string, alsoSchedule: boolean) => Promise<boolean>
}) {
  const [to, setTo] = useState('')
  const [also, setAlso] = useState(false)
  useEffect(() => { setTo(''); setAlso(false) }, [from])
  return (
    <Sheet open={from != null} onClose={onClose} title={`Substitute ${from ?? ''}`}>
      <Field label="Replace with">
        <input className={inputCls} list="sub-names" value={to} onChange={e => setTo(e.target.value)} placeholder="New exercise name" />
        <datalist id="sub-names">{names.map(n => <option key={n} value={n} />)}</datalist>
      </Field>
      {canUpdateSchedule && (
        <label className="flex items-center gap-2 text-sm mb-3 min-h-[44px]">
          <input type="checkbox" checked={also} onChange={e => setAlso(e.target.checked)} className="h-5 w-5 accent-[#b9f04a]" /> Also change my schedule going forward
        </label>
      )}
      <p className="text-xs text-mute mb-3">Earlier workouts keep the exercise you actually did.</p>
      <Btn variant="primary" full disabled={!to.trim() || to.trim() === from} onClick={async () => { if (await onSave(to.trim(), also)) onClose() }}>Substitute</Btn>
    </Sheet>
  )
}
