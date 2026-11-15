import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bell, Camera, CalendarDays, Check, Droplet, Dumbbell, Flame, Footprints, LineChart, Scale, Utensils } from 'lucide-react'
import { Bar, Btn, Card, Num, cx, useRun } from '../components/ui'
import { MeasureSheet, WeightSheet } from '../components/sheets'
import { programPos, round, rollingAvg, showWeight, weekCompletion, weightTrend, workoutStreak } from '../lib/calc'
import { fmt, fmtLong, relLabel, today } from '../lib/dates'
import { REMINDER_COPY, dueReminders } from '../lib/reminders'
import { dayTotals, exercisesFor, latestWeight, noteFor, photosOn, sessionFor, setsFor, templateFor } from '../lib/select'
import { useStore } from '../lib/store'
import { ARTIFACT } from '../lib/claudeBackend'

function useNow() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const tick = () => setNow(new Date())
    const id = setInterval(tick, 60000)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick) }
  }, [])
  return now
}

export default function Home() {
  const { data, profile, program, backend, save } = useStore()
  const nav = useNavigate()
  const run = useRun()
  useNow() // re-render when the day rolls over or the app is reopened
  const date = today()
  const [sheet, setSheet] = useState<'weight' | 'measure' | null>(null)
  const unit = profile.weight_unit

  const pos = programPos(program.start_date, date, program.weeks)
  const tpl = templateFor(data, date)
  const session = sessionFor(data, date)
  const sets = session ? setsFor(data, session.id) : []
  const doneSets = sets.filter(s => s.completed).length
  const totals = dayTotals(data, date)
  const note = noteFor(data, date)
  const budget = profile.calorie_target + (profile.add_exercise_calories ? note.exercise_calories ?? 0 : 0)
  const latest = latestWeight(data)
  const avg = rollingAvg(data.weight_entries, date)
  const trend = weightTrend(data.weight_entries, date, profile.goal_weight_lb)
  const photos = photosOn(data, date)
  const streak = workoutStreak(data.workout_templates, data.workout_sessions, date)
  const week = weekCompletion(data.workout_templates, data.workout_sessions, date)
  const hhmm = new Date().toTimeString().slice(0, 5)
  const due = dueReminders(data, date, hhmm)
  const isRecovery = (tpl?.kind ?? 'recovery') === 'recovery'

  const startWorkout = () => nav(`/session/${date}`, { state: { start: !session } })
  const saveNote = (patch: Partial<typeof note>, msg?: string) => run(() => save('daily_notes', { ...note, ...patch }), msg)

  const summary = (() => {
    if (trend.current == null) return 'Log your weight each morning. Your 7-day average and trend appear as entries build up.'
    const fromStart = trend.current - profile.start_weight_lb
    const parts = [`7-day average is ${showWeight(trend.current, unit)}, ${fromStart <= 0 ? 'down' : 'up'} ${showWeight(Math.abs(fromStart), unit)} from your start.`]
    if (trend.weeklyChange != null) {
      const r = -trend.weeklyChange
      parts.push(r >= 0.75 && r <= 1.0 ? `Losing ${round(r, 2)} lb/week — inside your 0.75–1 lb target.`
        : r > 1.0 ? `Losing ${round(r, 2)} lb/week — faster than your 0.75–1 lb target.`
        : r > 0 ? `Losing ${round(r, 2)} lb/week — slower than your 0.75–1 lb target.`
        : `Average is up ${round(-r, 2)} lb over the last week.`)
    } else parts.push('A weekly trend needs entries from last week too.')
    return parts.join(' ')
  })()

  return (
    <div>
      <header className="pt-5 pb-3 flex items-start justify-between">
        <div>
          <p className="text-xs text-mute">{fmtLong(date)}</p>
          <h1 className="text-2xl font-bold tracking-tight">
            {pos.status === 'active' ? <>Week {pos.week} <span className="text-mute font-medium">· Day {pos.day}</span></>
              : pos.status === 'before' ? `Starts in ${pos.daysUntilStart} day${pos.daysUntilStart === 1 ? '' : 's'}`
              : 'Program complete'}
          </h1>
          <p className="text-xs text-volt mt-0.5">
            {pos.phase ? `Phase ${pos.phase.n}: ${pos.phase.name}` : pos.status === 'done' ? `${program.weeks} weeks finished — review and reassess in Profile` : `Begins ${fmt(program.start_date)}`}
          </p>
        </div>
        <Link to="/calendar" aria-label="Calendar" className="h-11 w-11 grid place-items-center rounded-xl bg-card border border-line/60 text-mute"><CalendarDays size={20} /></Link>
      </header>

      {backend.mode === 'local' && (
        <p className="mb-3 rounded-xl border border-warn/40 bg-warn/10 text-warn text-xs px-3 py-2">
          {ARTIFACT ? "Saved data isn't available in this view, so entries are kept only in this browser and may not last. Open the app from your own Claude account to save properly." : "Local mode: Supabase isn't configured, so data is stored only in this browser on this device."}
        </p>
      )}

      {due.length > 0 && (
        <div className="mb-3 space-y-2">
          {due.map(k => {
            const c = REMINDER_COPY[k]
            const go = () => (c.to === 'weight' ? setSheet('weight') : c.to === 'measure' ? setSheet('measure') : c.to === 'workout' ? startWorkout() : nav(c.to))
            return (
              <button key={k} onClick={go} className="w-full flex items-center gap-2 rounded-xl bg-sky/10 border border-sky/30 text-sky text-sm px-3 min-h-[44px] text-left">
                <Bell size={16} /> {c.text}
              </button>
            )
          })}
        </div>
      )}

      <Card className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] uppercase tracking-wide text-mute">Today's workout</span>
          {session?.completed_at ? <span className="text-xs text-volt flex items-center gap-1"><Check size={14} /> Completed</span>
            : session ? <span className="text-xs text-warn">{doneSets}/{sets.length} sets</span>
            : <span className="text-xs text-mute">{isRecovery ? 'Optional' : 'Not started'}</span>}
        </div>
        <div className="text-lg font-semibold">{tpl?.name ?? 'Rest day'}</div>
        <p className="text-xs text-mute mb-3 line-clamp-2">{exercisesFor(data, tpl?.id).map(e => e.name).join(' · ') || 'Nothing scheduled.'}</p>
        <Btn variant="primary" full onClick={startWorkout}>
          <Dumbbell size={18} /> {session?.completed_at ? 'View Workout' : session ? 'Continue Workout' : 'Start Workout'}
        </Btn>
      </Card>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <Btn onClick={() => nav('/food')}><Utensils size={18} /> Log Food</Btn>
        <Btn onClick={() => setSheet('weight')}><Scale size={18} /> Log Weight</Btn>
        <Btn onClick={() => nav('/photos')}><Camera size={18} /> Add Progress Photo</Btn>
        <Btn onClick={() => nav('/progress')}><LineChart size={18} /> View Progress</Btn>
      </div>

      <Card className="mb-3" onClick={() => nav('/food')}>
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] uppercase tracking-wide text-mute">Calories</span>
          <span className="text-xs text-mute tnum">target {budget.toLocaleString()}</span>
        </div>
        <div className="flex items-baseline gap-2 mt-1 mb-2">
          <span className="text-3xl font-bold tnum">{Math.round(totals.calories).toLocaleString()}</span>
          <span className={cx('text-sm tnum', budget - totals.calories < 0 ? 'text-warn' : 'text-mute')}>
            {budget - totals.calories >= 0 ? `${Math.round(budget - totals.calories).toLocaleString()} remaining` : `${Math.round(totals.calories - budget).toLocaleString()} over`}
          </span>
        </div>
        <Bar value={totals.calories} max={budget} />
        <div className="flex items-baseline justify-between mt-4">
          <span className="text-[11px] uppercase tracking-wide text-mute">Protein</span>
          <span className="text-xs text-mute tnum">target {profile.protein_target_g} g</span>
        </div>
        <div className="flex items-baseline gap-2 mt-1 mb-2">
          <span className="text-xl font-semibold tnum">{Math.round(totals.protein_g)} g</span>
          <span className="text-sm text-mute tnum">{Math.max(0, Math.round(profile.protein_target_g - totals.protein_g))} g remaining</span>
        </div>
        <Bar value={totals.protein_g} max={profile.protein_target_g} color="bg-sky" />
        <div className="flex gap-4 mt-3 text-xs text-mute tnum">
          <span>Carbs {Math.round(totals.carbs_g)}/{profile.carb_target_g} g</span>
          <span>Fat {Math.round(totals.fat_g)}/{profile.fat_target_g} g</span>
        </div>
      </Card>

      <Card className="mb-3" onClick={() => setSheet('weight')}>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-mute">Latest</div>
            <div className="text-xl font-semibold tnum">{showWeight(latest?.weight_lb, unit)}</div>
            <div className="text-xs text-mute">{latest ? relLabel(latest.date) : 'No entries yet'}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-mute">From start</div>
            <div className={cx('text-xl font-semibold tnum', latest && latest.weight_lb < profile.start_weight_lb && 'text-volt')}>
              {latest ? `${latest.weight_lb - profile.start_weight_lb > 0 ? '+' : ''}${showWeight(latest.weight_lb - profile.start_weight_lb, unit)}` : '—'}
            </div>
            <div className="text-xs text-mute">start {showWeight(profile.start_weight_lb, unit, 0)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-mute">7-day avg</div>
            <div className="text-xl font-semibold tnum text-sky">{showWeight(avg, unit)}</div>
            <div className="text-xs text-mute">goal {showWeight(profile.goal_weight_lb, unit, 0)}</div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <Card onClick={() => nav('/photos')} className="!p-3">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-mute"><Camera size={14} /> Photos today</div>
          <div className={cx('text-base font-semibold mt-1', photos.length ? 'text-volt' : '')}>{photos.length ? `${photos.length} added` : 'Not yet'}</div>
          <div className="text-xs text-mute">{(['front', 'side', 'back'] as const).map(p => `${photos.some(x => x.pose === p) ? '✓' : '○'} ${p}`).join('  ')}</div>
        </Card>
        <Card className="!p-3">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-mute"><Flame size={14} /> Training</div>
          <div className="text-base font-semibold mt-1 tnum">{streak} workout streak</div>
          <div className="text-xs text-mute tnum">This week {week.completed}/{week.scheduled} · {week.pct}%</div>
        </Card>
        <Card className="!p-3">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-mute"><Droplet size={14} /> Water</div>
          <div className="text-base font-semibold mt-1 tnum">{note.water_oz} <span className="text-xs text-mute font-normal">/ {profile.water_target_oz} oz</span></div>
          <div className="flex gap-1.5 mt-2">
            {[8, 16].map(n => <button key={n} aria-label={`Add ${n} ounces of water`} onClick={() => saveNote({ water_oz: note.water_oz + n })} className="flex-1 min-h-[36px] rounded-lg bg-raised border border-line text-xs">+{n}</button>)}
            <button aria-label="Remove 8 ounces of water" disabled={note.water_oz <= 0} onClick={() => saveNote({ water_oz: Math.max(0, note.water_oz - 8) })} className="flex-1 min-h-[36px] rounded-lg bg-raised border border-line text-xs disabled:opacity-40">−8</button>
          </div>
        </Card>
        <Card className="!p-3">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-mute"><Footprints size={14} /> Steps</div>
          <Num value={note.steps} label="Steps today" placeholder="Enter steps" onCommit={n => saveNote({ steps: n == null ? null : Math.round(n) }, 'Steps saved')}
            className="mt-1 w-full bg-transparent text-base font-semibold tnum placeholder:text-mute/60 placeholder:font-normal focus:outline-none" />
          <div className="text-xs text-mute tnum">target {profile.step_target.toLocaleString()}</div>
        </Card>
      </div>

      <Card className="mb-3">
        <div className="text-[11px] uppercase tracking-wide text-mute mb-1">Progress summary</div>
        <p className="text-sm leading-relaxed">{summary}</p>
        {trend.projectedDate && trend.weeksToGoal! > 0 && (
          <p className="text-xs text-mute mt-2">At the current pace you'd reach {showWeight(profile.goal_weight_lb, unit, 0)} around {fmt(trend.projectedDate, { month: 'short', day: 'numeric', year: 'numeric' })}. This is an estimate from your trend, not a promise.</p>
        )}
      </Card>

      <WeightSheet open={sheet === 'weight'} onClose={() => setSheet(null)} />
      <MeasureSheet open={sheet === 'measure'} onClose={() => setSheet(null)} />
    </div>
  )
}
