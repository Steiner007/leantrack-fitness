import { addDays, diffDays, range, weekStart, weekday } from './dates'
import type { FoodEntry, Kind, Macros, Session, SetRow, Template, WeightEntry } from './types'

export const LB_PER_KG = 2.2046226218
export const lbToKg = (lb: number) => lb / LB_PER_KG
export const kgToLb = (kg: number) => kg * LB_PER_KG
export const round = (n: number, dp = 1) => Math.round(n * 10 ** dp) / 10 ** dp
export const showWeight = (lb: number | null | undefined, unit: 'lb' | 'kg', dp = 1) =>
  lb == null ? '—' : `${round(unit === 'kg' ? lbToKg(lb) : lb, dp)} ${unit}`

/**
 * Average of the entries recorded in the 7 calendar days ending on `date`.
 * Missing days are skipped (never counted as zero). Returns null with no data.
 */
export function rollingAvg(entries: WeightEntry[], date: string, window = 7): number | null {
  const from = addDays(date, -(window - 1))
  const vals = entries.filter(e => e.date >= from && e.date <= date).map(e => e.weight_lb)
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
}

export interface WeightPoint { date: string; weight: number | null; avg: number | null }
/** One point per calendar day between from..to; days without an entry have weight = null. */
export function weightSeries(entries: WeightEntry[], from: string, to: string): WeightPoint[] {
  const byDate = new Map(entries.map(e => [e.date, e.weight_lb]))
  return range(from, to).map(date => ({ date, weight: byDate.get(date) ?? null, avg: rollingAvg(entries, date) }))
}

export interface Trend {
  current: number | null      // latest 7-day average
  weeklyChange: number | null // change in 7-day average vs 7 days earlier (negative = losing)
  monthlyChange: number | null
  projectedDate: string | null
  weeksToGoal: number | null
}
/** Trend from 7-day averages, so single-day swings don't drive conclusions. */
export function weightTrend(entries: WeightEntry[], date: string, goalLb: number): Trend {
  const current = rollingAvg(entries, date)
  const prev = rollingAvg(entries, addDays(date, -7))
  const prevMonth = rollingAvg(entries, addDays(date, -28))
  const weeklyChange = current != null && prev != null ? current - prev : null
  const monthlyChange = current != null && prevMonth != null ? current - prevMonth : null
  let weeksToGoal: number | null = null
  let projectedDate: string | null = null
  if (current != null && weeklyChange != null) {
    const remaining = current - goalLb
    if (remaining <= 0) { weeksToGoal = 0; projectedDate = date }
    else if (weeklyChange < -0.05) {
      weeksToGoal = remaining / -weeklyChange
      projectedDate = addDays(date, Math.round(weeksToGoal * 7))
    }
  }
  return { current, weeklyChange, monthlyChange, projectedDate, weeksToGoal }
}

export interface ProgramPos {
  status: 'before' | 'active' | 'done'
  week: number; day: number; dayIndex: number; totalDays: number; daysUntilStart: number
  phase: Phase | null
}
export interface Phase { n: 1 | 2 | 3; name: string; weeks: string; focus: string[] }
export const PHASES: Phase[] = [
  { n: 1, name: 'Consistency', weeks: 'Weeks 1–4', focus: ['Establish nutrition tracking', 'Learn baseline working weights', 'Build training consistency', 'Target about 7,000–9,000 daily steps'] },
  { n: 2, name: 'Progression', weeks: 'Weeks 5–8', focus: ['Progressively add weight or reps', 'Monitor weekly average weight', 'Adjust calorie targets only when appropriate'] },
  { n: 3, name: 'Maintain strength & reassess', weeks: 'Weeks 9–12', focus: ['Keep protein high', 'Continue progressive resistance training', 'Compare waist measurements', 'Avoid extreme calorie restriction'] },
]
/** Splits any program length into three equal phases (4/4/4 for 12 weeks). */
export function phaseFor(week: number, weeks = 12): Phase {
  const size = Math.max(1, Math.ceil(weeks / 3))
  return PHASES[Math.min(2, Math.floor((week - 1) / size))]
}
export function programPos(startDate: string, date: string, weeks = 12): ProgramPos {
  const dayIndex = diffDays(date, startDate)
  const totalDays = weeks * 7
  const week = Math.floor(dayIndex / 7) + 1
  const day = (((dayIndex % 7) + 7) % 7) + 1
  if (dayIndex < 0) return { status: 'before', week: 0, day: 0, dayIndex, totalDays, daysUntilStart: -dayIndex, phase: null }
  if (dayIndex >= totalDays) return { status: 'done', week, day, dayIndex, totalDays, daysUntilStart: 0, phase: null }
  return { status: 'active', week, day, dayIndex, totalDays, daysUntilStart: 0, phase: phaseFor(week, weeks) }
}

export const ZERO: Macros = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
export function sumMacros(entries: Pick<FoodEntry, keyof Macros | 'servings'>[]): Macros {
  return entries.reduce((t, e) => ({
    calories: t.calories + e.calories * e.servings,
    protein_g: t.protein_g + e.protein_g * e.servings,
    carbs_g: t.carbs_g + e.carbs_g * e.servings,
    fat_g: t.fat_g + e.fat_g * e.servings,
  }), { ...ZERO })
}
export interface NutritionStats { daysLogged: number; avgCalories: number | null; avgProtein: number | null; calorieDaysMet: number; proteinDaysMet: number }
/**
 * Averages only over days that have at least one entry: an untracked day is
 * unknown, not a zero-calorie day. "Met" = calories within ±10% of target,
 * protein at or above 90% of target.
 */
export function nutritionStats(entries: FoodEntry[], from: string, to: string, calTarget: number, proteinTarget: number): NutritionStats {
  const byDate = new Map<string, FoodEntry[]>()
  for (const e of entries) if (e.date >= from && e.date <= to) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e])
  const days = [...byDate.values()].map(sumMacros)
  const n = days.length
  return {
    daysLogged: n,
    avgCalories: n ? days.reduce((a, d) => a + d.calories, 0) / n : null,
    avgProtein: n ? days.reduce((a, d) => a + d.protein_g, 0) / n : null,
    calorieDaysMet: days.filter(d => Math.abs(d.calories - calTarget) <= calTarget * 0.1).length,
    proteinDaysMet: days.filter(d => d.protein_g >= proteinTarget * 0.9).length,
  }
}

type Sched = Pick<Template, 'weekday' | 'kind' | 'archived'>[]
const kindOn = (templates: Sched, date: string): Kind =>
  templates.find(t => !t.archived && t.weekday === weekday(date))?.kind ?? 'recovery'
const doneOn = (sessions: Pick<Session, 'date' | 'completed_at'>[]) =>
  new Set(sessions.filter(s => s.completed_at).map(s => s.date))

/**
 * Consecutive scheduled training days completed, counting back from `date`.
 * Recovery days never break (or extend) the streak, and today doesn't break it
 * until the day is over.
 */
export function workoutStreak(templates: Sched, sessions: Pick<Session, 'date' | 'completed_at'>[], date: string, earliest?: string): number {
  const done = doneOn(sessions)
  const first = earliest ?? [...done].sort()[0]
  if (!first) return 0
  let streak = 0
  for (let d = date; d >= first; d = addDays(d, -1)) {
    if (done.has(d)) streak++
    else if (kindOn(templates, d) === 'recovery') continue
    else if (d === date) continue
    else break
  }
  return streak
}
/** Completed vs scheduled training days for the Monday–Sunday week containing `date`. Recovery days are excluded. */
export function weekCompletion(templates: Sched, sessions: Pick<Session, 'date' | 'completed_at'>[], date: string) {
  const start = weekStart(date)
  const days = range(start, addDays(start, 6))
  const done = doneOn(sessions)
  const scheduled = days.filter(d => kindOn(templates, d) !== 'recovery')
  const completed = scheduled.filter(d => done.has(d)).length
  return { scheduled: scheduled.length, completed, pct: scheduled.length ? Math.round((completed / scheduled.length) * 100) : 0 }
}

export interface Best { weight_lb: number; reps: number; date: string }
type DatedSet = Pick<SetRow, 'exercise_name' | 'weight_lb' | 'reps' | 'completed'> & { date: string }
/** On assisted movements the logged weight is the assistance, so less is better. */
export const lowerIsBetter = (name: string) => /assist/i.test(name)
const better = (a: { weight_lb: number; reps: number }, b: { weight_lb: number; reps: number }, inv = false) =>
  (inv ? a.weight_lb < b.weight_lb : a.weight_lb > b.weight_lb) || (a.weight_lb === b.weight_lb && a.reps > b.reps)
/** Best completed set per exercise: heaviest weight (lightest assistance on assisted moves), ties broken by reps. */
export function personalBests(sets: DatedSet[], beforeDate?: string): Map<string, Best> {
  const out = new Map<string, Best>()
  for (const s of sets) {
    if (!s.completed || s.weight_lb == null || s.reps == null) continue
    if (beforeDate && s.date >= beforeDate) continue
    const cand = { weight_lb: s.weight_lb, reps: s.reps, date: s.date }
    const cur = out.get(s.exercise_name)
    if (!cur || better(cand, cur, lowerIsBetter(s.exercise_name))) out.set(s.exercise_name, cand)
  }
  return out
}
export const isPR = (set: { exercise_name: string; weight_lb: number | null; reps: number | null; completed: boolean }, prior: Best | undefined) =>
  set.completed && set.weight_lb != null && set.weight_lb > 0 && set.reps != null && !!prior &&
  better({ weight_lb: set.weight_lb, reps: set.reps }, prior, lowerIsBetter(set.exercise_name))

export const targetText = (e: { sets: number; rep_low: number | null; rep_high: number | null; unit: string; per_side: boolean }) => {
  const r = e.rep_low == null ? '' : e.rep_high && e.rep_high !== e.rep_low ? `${e.rep_low}–${e.rep_high}` : `${e.rep_low}`
  const u = e.unit === 'reps' ? (e.sets > 1 ? '' : ' reps') : e.unit === 'sec' ? ' sec' : ' min'
  return `${e.sets > 1 ? `${e.sets} × ` : ''}${r}${u}${e.per_side ? ' / side' : ''}`.trim()
}
