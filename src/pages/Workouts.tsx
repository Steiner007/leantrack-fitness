import { Link, useNavigate } from 'react-router-dom'
import { Check, ChevronRight, Pencil } from 'lucide-react'
import { Card, Empty, Header, cx } from '../components/ui'
import { programPos, weekCompletion, workoutStreak } from '../lib/calc'
import { DAY_NAMES, addDays, fmt, range, today, weekStart, weekday } from '../lib/dates'
import { exercisesFor, sessionFor, setsFor, templateFor } from '../lib/select'
import { useStore } from '../lib/store'

export default function Workouts() {
  const { data, program } = useStore()
  const nav = useNavigate()
  const date = today()
  const start = weekStart(date)
  const days = range(start, addDays(start, 6))
  const week = weekCompletion(data.workout_templates, data.workout_sessions, date)
  const streak = workoutStreak(data.workout_templates, data.workout_sessions, date)
  const pos = programPos(program.start_date, date, program.weeks)
  const history = [...data.workout_sessions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12)

  return (
    <div>
      <Header title="Workouts" sub={`This week ${week.completed}/${week.scheduled} done · ${week.pct}% · streak ${streak}`}
        right={<Link to="/workouts/edit" className="h-11 px-3 rounded-xl bg-card border border-line/60 text-sm text-mute inline-flex items-center gap-1.5"><Pencil size={15} /> Edit</Link>} />

      {pos.phase && (
        <Card className="mb-3">
          <div className="text-[11px] uppercase tracking-wide text-volt">Phase {pos.phase.n} · {pos.phase.weeks}</div>
          <div className="font-semibold">{pos.phase.name}</div>
          <ul className="mt-1 text-xs text-mute list-disc pl-4 space-y-0.5">{pos.phase.focus.map(f => <li key={f}>{f}</li>)}</ul>
        </Card>
      )}

      <div className="space-y-2 mb-5">
        {days.map(d => {
          const t = templateFor(data, d)
          const s = sessionFor(data, d)
          const done = !!s?.completed_at
          const recovery = (t?.kind ?? 'recovery') === 'recovery'
          const status = done ? 'Completed' : s ? 'In progress' : d === date ? 'Today' : d < date ? (recovery ? 'Recovery' : 'Not logged') : 'Upcoming'
          return (
            <button key={d} onClick={() => nav(`/session/${d}`)}
              className={cx('w-full flex items-center gap-3 rounded-2xl bg-card border p-3 text-left active:bg-raised', d === date ? 'border-volt/60' : 'border-line/60')}>
              <div className={cx('h-11 w-11 shrink-0 rounded-xl grid place-items-center text-xs font-semibold', done ? 'bg-volt text-black' : 'bg-raised text-mute')}>
                {done ? <Check size={20} /> : DAY_NAMES[weekday(d)].slice(0, 3)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{s?.name ?? t?.name ?? 'Rest'}</div>
                <div className="text-xs text-mute truncate">{DAY_NAMES[weekday(d)]} {fmt(d)} · {exercisesFor(data, t?.id).length} exercises</div>
              </div>
              <span className={cx('text-xs', done ? 'text-volt' : s ? 'text-warn' : 'text-mute')}>{status}</span>
              <ChevronRight size={18} className="text-mute" />
            </button>
          )
        })}
      </div>

      <h2 className="text-sm font-semibold mb-2">Recent sessions</h2>
      {history.length === 0 ? <Empty>No workouts logged yet. Start today's workout from the list above.</Empty> : (
        <div className="space-y-2">
          {history.map(s => {
            const sets = setsFor(data, s.id)
            return (
              <button key={s.id} onClick={() => nav(`/session/${s.date}`)} className="w-full flex items-center justify-between rounded-xl bg-card border border-line/60 px-3 min-h-[52px] text-left">
                <div><div className="text-sm font-medium">{s.name}</div><div className="text-xs text-mute">{fmt(s.date, { weekday: 'short', month: 'short', day: 'numeric' })}</div></div>
                <div className="text-xs text-mute tnum">{sets.filter(x => x.completed).length}/{sets.length} sets {s.completed_at ? '✓' : ''}</div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
