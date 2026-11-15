import { sumMacros, targetText } from './calc'
import { weekday } from './dates'
import { uid } from './seed'
import type { Data, DailyNote, Exercise, Session, SetRow, Template } from './types'

export const templateFor = (d: Data, date: string): Template | undefined =>
  d.workout_templates.find(t => !t.archived && t.weekday === weekday(date))
export const exercisesFor = (d: Data, templateId: string | undefined): Exercise[] =>
  d.exercises.filter(e => e.template_id === templateId && !e.archived).sort((a, b) => a.position - b.position)
export const sessionFor = (d: Data, date: string): Session | undefined => d.workout_sessions.find(s => s.date === date)
export const setsFor = (d: Data, sessionId: string): SetRow[] =>
  d.exercise_sets.filter(s => s.session_id === sessionId).sort((a, b) => a.position - b.position || a.set_number - b.set_number)
export const foodOn = (d: Data, date: string) => d.food_entries.filter(f => f.date === date)
export const dayTotals = (d: Data, date: string) => sumMacros(foodOn(d, date))
export const weightOn = (d: Data, date: string) => d.weight_entries.find(w => w.date === date)
export const latestWeight = (d: Data) => [...d.weight_entries].sort((a, b) => b.date.localeCompare(a.date))[0]
export const measureOn = (d: Data, date: string) => d.body_measurements.find(m => m.date === date)
/** The saved note row for a date, or a blank (unsaved) one with a fresh id. */
const pendingNoteIds = new Map<string, string>() // keeps one id per date until the first save lands
export const noteFor = (d: Data, date: string): DailyNote =>
  d.daily_notes.find(n => n.date === date) ?? { id: pendingNoteIds.get(date) ?? (pendingNoteIds.set(date, uid()), pendingNoteIds.get(date)!), date, note: null, water_oz: 0, steps: null, exercise_calories: null }

export const datedSets = (d: Data) => {
  const dateOf = new Map(d.workout_sessions.map(s => [s.id, s.date]))
  return d.exercise_sets.map(s => ({ ...s, date: dateOf.get(s.session_id) ?? '' })).filter(s => s.date)
}
/** Completed sets from the most recent earlier session that included this exercise. */
export function lastPerformance(d: Data, name: string, beforeDate: string) {
  const sets = datedSets(d).filter(s => s.exercise_name === name && s.date < beforeDate && s.completed)
  if (!sets.length) return null
  const date = sets.reduce((m, s) => (s.date > m ? s.date : m), '')
  return { date, sets: sets.filter(s => s.date === date).sort((a, b) => a.set_number - b.set_number) }
}

/** Builds (but does not save) a session and its set rows from the day's template. */
export function buildSession(d: Data, date: string): { session: Session; sets: SetRow[] } {
  const t = templateFor(d, date)
  const session: Session = {
    id: uid(), date, template_id: t?.id ?? null, name: t?.name ?? 'Extra workout', kind: t?.kind ?? 'lifting',
    started_at: new Date().toISOString(), completed_at: null, notes: null, exercise_notes: {},
  }
  const sets: SetRow[] = []
  exercisesFor(d, t?.id).forEach((e, position) => sets.push(...buildSets(d, session.id, date, e, position)))
  return { session, sets }
}
export function buildSets(d: Data, sessionId: string, date: string,
  e: Pick<Exercise, 'name' | 'sets' | 'rep_low' | 'rep_high' | 'unit' | 'per_side'> & { id?: string }, position: number): SetRow[] {
  const last = lastPerformance(d, e.name, date)
  return Array.from({ length: e.sets }, (_, i) => {
    const prev = last?.sets[i] ?? last?.sets[last.sets.length - 1]
    return {
      id: uid(), session_id: sessionId, exercise_id: e.id ?? null, exercise_name: e.name, position, set_number: i + 1,
      target: targetText(e), unit: e.unit,
      // Pre-fill from last time so logging is one tap when nothing changed.
      weight_lb: prev?.weight_lb ?? null, reps: prev?.reps ?? (e.unit === 'reps' ? null : e.rep_low), completed: false,
    }
  })
}
