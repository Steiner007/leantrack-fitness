import { templateFor } from './select'
import { weekStart, weekday } from './dates'
import type { Data, ReminderKind } from './types'

export const REMINDER_COPY: Record<ReminderKind, { text: string; to: string }> = {
  weigh_in: { text: "Log today's weight", to: 'weight' },
  workout: { text: "Today's workout is waiting", to: 'workout' },
  food: { text: "Log today's food", to: '/food' },
  waist: { text: 'Measure your waist this week', to: 'measure' },
  review: { text: 'Do your weekly check-in', to: '/checkin' },
}

/** In-app reminders that are enabled, due (time has passed today) and not yet done. */
export function dueReminders(d: Data, date: string, nowHHMM: string): ReminderKind[] {
  const wk = weekStart(date)
  const done: Record<ReminderKind, boolean> = {
    weigh_in: d.weight_entries.some(w => w.date === date),
    workout: (templateFor(d, date)?.kind ?? 'recovery') === 'recovery' || d.workout_sessions.some(s => s.date === date && s.completed_at),
    food: d.food_entries.some(f => f.date === date),
    waist: d.body_measurements.some(m => m.date >= wk && m.waist_in != null),
    review: d.weekly_checkins.some(c => c.date >= wk),
  }
  return d.reminder_preferences
    .filter(r => r.enabled && (r.weekday == null || r.weekday === weekday(date)) && nowHHMM >= r.time_of_day && !done[r.kind])
    .map(r => r.kind)
}
