import { describe, expect, it } from 'vitest'
import {
  isPR, kgToLb, lbToKg, nutritionStats, personalBests, phaseFor, programPos, rollingAvg, sumMacros,
  targetText, weekCompletion, weightSeries, weightTrend, workoutStreak,
} from '../src/lib/calc'
import { addDays, diffDays, parse, range, toStr, weekStart, weekday } from '../src/lib/dates'
import { STARTING_WEIGHTS, buildSeed } from '../src/lib/seed'
import { buildSets } from '../src/lib/select'
import type { FoodEntry, WeightEntry } from '../src/lib/types'

const w = (date: string, weight_lb: number): WeightEntry => ({ id: date, date, weight_lb })
const food = (date: string, calories: number, protein_g: number, servings = 1): FoodEntry =>
  ({ id: date + calories, date, meal: 'lunch', name: 'x', calories, protein_g, carbs_g: 0, fat_g: 0, servings, saved_food_id: null, source: 'manual' })

describe('dates', () => {
  it('formats and parses local dates without shifting days', () => {
    expect(toStr(parse('2026-03-08'))).toBe('2026-03-08') // US DST start
    expect(toStr(parse('2026-11-01'))).toBe('2026-11-01') // US DST end
    expect(toStr(new Date(2026, 0, 1, 23, 59))).toBe('2026-01-01')
    expect(toStr(new Date(2026, 0, 1, 0, 1))).toBe('2026-01-01')
  })
  it('adds days across DST and month ends', () => {
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08')
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09')
    expect(addDays('2026-10-31', 2)).toBe('2026-11-02')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(diffDays('2026-11-08', '2026-10-25')).toBe(14)
  })
  it('finds weekdays and Monday week starts', () => {
    expect(weekday('2026-11-15')).toBe(0) // Sunday
    expect(weekStart('2026-11-15')).toBe('2026-11-09')
    expect(weekStart('2026-11-09')).toBe('2026-11-09')
    expect(range('2026-11-09', '2026-11-11')).toEqual(['2026-11-09', '2026-11-10', '2026-11-11'])
  })
})

describe('weight', () => {
  it('converts units', () => {
    expect(kgToLb(lbToKg(175))).toBeCloseTo(175, 8)
    expect(lbToKg(175)).toBeCloseTo(79.38, 2)
  })
  it('averages only the days that have entries (missing is never zero)', () => {
    const e = [w('2026-01-01', 175), w('2026-01-03', 174), w('2026-01-07', 173)]
    expect(rollingAvg(e, '2026-01-07')).toBeCloseTo(174, 8)
    expect(rollingAvg(e, '2026-01-08')).toBeCloseTo(173.5, 8) // Jan 1 has dropped out of the window
    expect(rollingAvg(e, '2025-12-31')).toBeNull()
    expect(rollingAvg([], '2026-01-07')).toBeNull()
  })
  it('builds a daily series with gaps as null', () => {
    const s = weightSeries([w('2026-01-01', 175), w('2026-01-03', 174)], '2026-01-01', '2026-01-03')
    expect(s.map(p => p.weight)).toEqual([175, null, 174])
    expect(s[1].avg).toBe(175)
  })
  it('computes weekly change and projection from 7-day averages', () => {
    const e = [...range('2026-01-01', '2026-01-07').map(d => w(d, 175)), ...range('2026-01-08', '2026-01-14').map(d => w(d, 174))]
    const t = weightTrend(e, '2026-01-14', 165)
    expect(t.current).toBeCloseTo(174, 8)
    expect(t.weeklyChange).toBeCloseTo(-1, 8)
    expect(t.weeksToGoal).toBeCloseTo(9, 8)
    expect(t.projectedDate).toBe(addDays('2026-01-14', 63))
  })
  it('gives no projection when not losing or without enough data', () => {
    const flat = range('2026-01-01', '2026-01-14').map(d => w(d, 175))
    expect(weightTrend(flat, '2026-01-14', 165).projectedDate).toBeNull()
    const one = weightTrend([w('2026-01-14', 175)], '2026-01-14', 165)
    expect(one.weeklyChange).toBeNull()
    expect(one.projectedDate).toBeNull()
    // One noisy low day barely moves the average-based trend.
    const noisy = [...flat.slice(0, 13), w('2026-01-14', 171)]
    expect(Math.abs(weightTrend(noisy, '2026-01-14', 165).weeklyChange!)).toBeLessThan(0.6)
  })
})

describe('program', () => {
  it('places dates in weeks, days and phases', () => {
    expect(programPos('2026-11-16', '2026-11-16')).toMatchObject({ status: 'active', week: 1, day: 1 })
    expect(programPos('2026-11-16', '2026-11-22')).toMatchObject({ week: 1, day: 7 })
    expect(programPos('2026-11-16', '2026-11-23')).toMatchObject({ week: 2, day: 1 })
    expect(programPos('2026-11-16', '2026-11-15')).toMatchObject({ status: 'before', daysUntilStart: 1 })
    expect(programPos('2026-11-16', addDays('2026-11-16', 83))).toMatchObject({ status: 'active', week: 12, day: 7 })
    expect(programPos('2026-11-16', addDays('2026-11-16', 84)).status).toBe('done')
  })
  it('splits 12 weeks into 4/4/4 phases', () => {
    expect([1, 4, 5, 8, 9, 12].map(wk => phaseFor(wk).n)).toEqual([1, 1, 2, 2, 3, 3])
  })
})

describe('nutrition', () => {
  it('multiplies by servings when totalling', () => {
    expect(sumMacros([food('d', 200, 20, 1.5), food('d', 100, 5)])).toMatchObject({ calories: 400, protein_g: 35 })
    expect(sumMacros([])).toMatchObject({ calories: 0, protein_g: 0 })
  })
  it('averages over logged days only and counts days on target', () => {
    const e = [food('2026-01-01', 2150, 160), food('2026-01-02', 1500, 100), food('2026-01-04', 2300, 150)]
    const s = nutritionStats(e, '2026-01-01', '2026-01-07', 2150, 160)
    expect(s.daysLogged).toBe(3)
    expect(s.avgCalories).toBeCloseTo((2150 + 1500 + 2300) / 3, 6)
    expect(s.calorieDaysMet).toBe(2) // 2150 and 2300 are within 10%
    expect(s.proteinDaysMet).toBe(2) // 160 and 150 are >= 144
    expect(nutritionStats([], '2026-01-01', '2026-01-07', 2150, 160).avgCalories).toBeNull()
  })
})

describe('training', () => {
  const seed = buildSeed()
  const tpls = seed.workout_templates
  const done = (date: string) => ({ date, completed_at: 'x' })
  it('seeds the exact weekly routine', () => {
    const names = (wd: number) => seed.exercises.filter(e => e.template_id === tpls.find(t => t.weekday === wd)!.id).sort((a, b) => a.position - b.position).map(e => `${e.name} ${targetText(e)}`)
    expect(tpls.map(t => t.kind).sort()).toEqual(['cardio', 'cardio', 'lifting', 'lifting', 'lifting', 'lifting', 'recovery'])
    expect(names(1)).toEqual(['Chest press machine 3 × 8–12', 'Lat pulldown 3 × 8–12', 'Seated cable row 3 × 10–12', 'Shoulder press 2 × 10–12', 'Cable crunch 3 × 12–15', 'Finish: incline walking 5 min'])
    expect(names(3)).toContain('Cable woodchops 2 × 12 / side')
    expect(names(3)).toContain('Plank 3 × 45 sec')
    expect(names(6)).toContain('Side plank 2 × 40 sec / side')
    expect(seed.profiles[0]).toMatchObject({ calorie_target: 2150, protein_target_g: 160, fat_target_g: 65, carb_target_g: 231, start_weight_lb: 175, goal_weight_lb: 165, add_exercise_calories: false })
  })
  it('does not break streaks on recovery days', () => {
    // Fri, Sat done; Sunday is recovery; checking on Monday (not yet done).
    expect(workoutStreak(tpls, [done('2026-11-13'), done('2026-11-14')], '2026-11-16')).toBe(2)
    // Missing Saturday breaks it.
    expect(workoutStreak(tpls, [done('2026-11-12'), done('2026-11-13')], '2026-11-16')).toBe(0)
    expect(workoutStreak(tpls, [], '2026-11-16')).toBe(0)
  })
  it('excludes recovery days from weekly completion', () => {
    const c = weekCompletion(tpls, [done('2026-11-09'), done('2026-11-10'), done('2026-11-11')], '2026-11-15')
    expect(c).toEqual({ scheduled: 6, completed: 3, pct: 50 })
  })
  it('finds personal bests and flags new ones', () => {
    const set = (exercise_name: string, weight_lb: number, reps: number, date: string, completed = true) => ({ exercise_name, weight_lb, reps, date, completed })
    const bests = personalBests([set('Leg press', 200, 10, '2026-01-01'), set('Leg press', 220, 8, '2026-01-08'), set('Leg press', 300, 1, '2026-01-09', false), set('Assisted pull-ups', 80, 8, '2026-01-01'), set('Assisted pull-ups', 60, 8, '2026-01-08')])
    expect(bests.get('Leg press')).toMatchObject({ weight_lb: 220, reps: 8 })
    expect(bests.get('Assisted pull-ups')).toMatchObject({ weight_lb: 60 }) // less assistance is better
    const best = bests.get('Leg press')
    expect(isPR({ exercise_name: 'Leg press', weight_lb: 225, reps: 6, completed: true }, best)).toBe(true)
    expect(isPR({ exercise_name: 'Leg press', weight_lb: 220, reps: 9, completed: true }, best)).toBe(true)
    expect(isPR({ exercise_name: 'Leg press', weight_lb: 220, reps: 8, completed: true }, best)).toBe(false)
    expect(isPR({ exercise_name: 'Leg press', weight_lb: 230, reps: 8, completed: false }, best)).toBe(false)
    expect(isPR({ exercise_name: 'Leg press', weight_lb: 230, reps: 8, completed: true }, undefined)).toBe(false)
  })
})

describe('starting weights', () => {
  const seed = buildSeed()
  const ex = (name: string) => seed.exercises.find(e => e.name === name)!
  it('gives every weighted exercise in the routine a starting weight, and none to timed ones', () => {
    for (const e of seed.exercises) {
      if (e.unit !== 'reps') expect(e.start_weight_lb).toBeNull()
    }
    expect(ex('Chest press machine').start_weight_lb).toBe(100)
    expect(ex('Incline dumbbell press').start_weight_lb).toBe(40)
    expect(ex("Captain's chair knee raises").start_weight_lb).toBeNull()
  })
  it('uses the starting weight only when there is no history', () => {
    const fresh = buildSets(seed, 's1', '2026-11-16', ex('Lat pulldown'), 0)
    expect(fresh.map(r => r.weight_lb)).toEqual([110, 110, 110])
    const withHistory = { ...seed,
      workout_sessions: [{ id: 'old', date: '2026-11-09', template_id: null, name: 'x', kind: 'lifting' as const, started_at: '', completed_at: 'x', notes: null, exercise_notes: {} }],
      exercise_sets: [{ id: 'a', session_id: 'old', exercise_id: null, exercise_name: 'Lat pulldown', position: 0, set_number: 1, target: '', unit: 'reps' as const, weight_lb: 125, reps: 10, completed: true }] }
    expect(buildSets(withHistory, 's2', '2026-11-16', ex('Lat pulldown'), 0).map(r => r.weight_lb)).toEqual([125, 125, 125])
    // An exercise added by name later still gets the suggestion.
    expect(buildSets(seed, 's3', '2026-11-16', { name: 'Leg press', sets: 1, rep_low: 10, rep_high: 12, unit: 'reps', per_side: false }, 0)[0].weight_lb).toBe(STARTING_WEIGHTS['Leg press'])
  })
})
