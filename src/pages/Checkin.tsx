import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Btn, Card, Field, Header, Num, Stat, inputCls, useRun } from '../components/ui'
import { nutritionStats, programPos, round, showWeight, weekCompletion, weightTrend } from '../lib/calc'
import { addDays, fmt, today } from '../lib/dates'
import { uid } from '../lib/seed'
import { useStore } from '../lib/store'

export default function Checkin() {
  const { data, profile, program, save } = useStore()
  const run = useRun()
  const nav = useNavigate()
  const date = today()
  const unit = profile.weight_unit
  const pos = programPos(program.start_date, date, program.weeks)
  const trend = weightTrend(data.weight_entries, date, profile.goal_weight_lb)
  const week = weekCompletion(data.workout_templates, data.workout_sessions, date)
  const nut = nutritionStats(data.food_entries, addDays(date, -6), date, profile.calorie_target, profile.protein_target_g)
  const waists = [...data.body_measurements].filter(m => m.waist_in != null).sort((a, b) => a.date.localeCompare(b.date))
  const waistNow = waists[waists.length - 1], waistPrev = waists[waists.length - 2]
  const [cal, setCal] = useState<number | null>(profile.calorie_target)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const rate = trend.weeklyChange == null ? null : -trend.weeklyChange

  const guidance = rate == null
    ? 'There are not enough weigh-ins across the last two weeks to judge your trend yet. Keep your current targets and log your weight daily.'
    : rate >= 0.75 && rate <= 1 ? `You're losing about ${round(rate, 2)} lb/week, inside the 0.75–1 lb target. No change is needed.`
    : rate > 1 ? `You're losing about ${round(rate, 2)} lb/week, faster than the 0.75–1 lb target. One week can be water weight; if it continues, raising calories by roughly 100 a day helps protect strength.`
    : `Your 7-day average ${rate > 0 ? `is down about ${round(rate, 2)}` : `is up about ${round(-rate, 2)}`} lb this week, slower than the 0.75–1 lb target. If that holds for two weeks or more and your food logging is accurate, lowering calories by roughly 100 a day is a reasonable step. Avoid large cuts.`
  const changed = cal != null && cal !== profile.calorie_target
  const low = cal != null && cal < 1600

  async function submit() {
    setBusy(true)
    const ok = await run(async () => {
      // The calorie target only changes here, when you typed a different number yourself.
      if (changed) await save('profiles', { ...profile, calorie_target: Math.round(cal!) })
      await save('weekly_checkins', {
        id: uid(), date, week_number: pos.week, avg_weight_lb: trend.current == null ? null : round(trend.current, 2),
        weekly_change_lb: trend.weeklyChange == null ? null : round(trend.weeklyChange, 2),
        calorie_target_before: profile.calorie_target, calorie_target_after: changed ? Math.round(cal!) : profile.calorie_target, notes: notes.trim() || null,
      })
    }, changed ? 'Check-in saved and calorie target updated' : 'Check-in saved')
    setBusy(false)
    if (ok) nav('/')
  }
  const past = [...data.weekly_checkins].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div>
      <Header title="Weekly check-in" back sub={pos.status === 'active' ? `Week ${pos.week} of ${program.weeks}${pos.phase ? ` · ${pos.phase.name}` : ''}` : undefined} />
      <div className="grid grid-cols-2 gap-2 mb-3">
        <Stat label="7-day average" value={showWeight(trend.current, unit)} sub={`start ${showWeight(profile.start_weight_lb, unit, 0)} · goal ${showWeight(profile.goal_weight_lb, unit, 0)}`} />
        <Stat label="Change this week" value={trend.weeklyChange == null ? '—' : `${trend.weeklyChange > 0 ? '+' : ''}${round(trend.weeklyChange, 2)} lb`} sub="target −0.75 to −1 lb" />
        <Stat label="Workouts" value={`${week.completed}/${week.scheduled}`} sub={`${week.pct}% of scheduled days`} />
        <Stat label="Waist" value={waistNow ? `${waistNow.waist_in} in` : '—'} sub={waistNow && waistPrev ? `${round(waistNow.waist_in! - waistPrev.waist_in!, 2)} in since ${fmt(waistPrev.date)}` : 'Measure weekly'} />
        <Stat label="Avg calories" value={nut.avgCalories == null ? '—' : Math.round(nut.avgCalories).toLocaleString()} sub={`${nut.daysLogged}/7 days logged`} />
        <Stat label="Avg protein" value={nut.avgProtein == null ? '—' : `${Math.round(nut.avgProtein)} g`} sub={`target ${profile.protein_target_g} g`} />
      </div>
      <Card className="mb-3">
        <div className="text-[11px] uppercase tracking-wide text-mute mb-1">Review</div>
        <p className="text-sm leading-relaxed">{guidance}</p>
        {nut.daysLogged < 5 && <p className="text-xs text-mute mt-2">Food was logged on {nut.daysLogged} of the last 7 days, so the calorie average is incomplete. It's worth fixing logging before changing targets.</p>}
      </Card>
      <Card className="mb-3">
        <Field label="Daily calorie target" hint="Nothing changes unless you edit this number and save.">
          <Num live label="Daily calorie target" value={cal} onCommit={setCal} />
        </Field>
        {low && <p className="text-xs text-warn mb-3">That is a large restriction for your size and activity. This program is built around a moderate deficit; avoid extreme calorie restriction.</p>}
        <Field label="Notes (optional)"><textarea className={inputCls + ' py-2'} rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Energy, hunger, sleep, what to change next week" /></Field>
        <Btn variant="primary" full busy={busy} disabled={cal == null || cal < 800} onClick={submit}>{changed ? `Save and set target to ${Math.round(cal!).toLocaleString()}` : 'Save check-in (keep targets)'}</Btn>
      </Card>
      {past.length > 0 && (
        <>
          <h2 className="text-sm font-semibold mb-2">Past check-ins</h2>
          <Card className="!p-0 divide-y divide-line/60">
            {past.map(c => (
              <div key={c.id} className="px-4 py-2.5">
                <div className="flex justify-between text-sm"><span>Week {c.week_number} · {fmt(c.date)}</span><span className="tnum">{showWeight(c.avg_weight_lb, unit)}</span></div>
                <div className="text-xs text-mute tnum">{c.weekly_change_lb != null ? `${c.weekly_change_lb > 0 ? '+' : ''}${c.weekly_change_lb} lb · ` : ''}{c.calorie_target_before !== c.calorie_target_after ? `calories ${c.calorie_target_before} → ${c.calorie_target_after}` : `calories ${c.calorie_target_after}`}</div>
                {c.notes && <p className="text-xs text-mute mt-1">{c.notes}</p>}
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  )
}
