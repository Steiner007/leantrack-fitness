import { today } from './dates'
import type { Data, Exercise, Kind, Profile, Program, Reminder, ReminderKind, Template, Unit } from './types'
import { emptyData } from './types'

export const uid = () => crypto.randomUUID()

export const DEFAULT_PROFILE: Omit<Profile, 'id'> = {
  sex: 'Male', age_range: '25–34', height_in: 69,
  start_weight_lb: 175, goal_weight_lb: 165, later_goal_low_lb: 160, later_goal_high_lb: 165,
  activity_level: 'Moderately active', experience: 'Intermediate',
  gym: 'Planet Fitness, Hastings, Michigan', workout_duration: '30–45 minutes',
  training_schedule: 'Four lifting days, two cardio/core days, one recovery day',
  main_goal: 'Lose belly fat and love handles while maintaining muscle and developing visible abs',
  weight_unit: 'lb', calorie_target: 2150, protein_target_g: 160, fat_target_g: 65, carb_target_g: 231,
  water_target_oz: 96, step_target: 8000, add_exercise_calories: false,
}

// [name, sets, repLow, repHigh, unit, perSide, optional, instructions]
type Ex = [string, number, number | null, number | null, Unit, boolean, boolean, string]
const x = (name: string, sets: number, lo: number | null, hi: number | null, how: string, unit: Unit = 'reps', perSide = false, optional = false): Ex =>
  [name, sets, lo, hi, unit, perSide, optional, how]

const ROUTINE: { weekday: number; name: string; kind: Kind; ex: Ex[] }[] = [
  { weekday: 1, name: 'Upper Body A', kind: 'lifting', ex: [
    x('Chest press machine', 3, 8, 12, 'Set the seat so the handles line up with mid-chest. Keep shoulder blades back against the pad, press until arms are nearly straight, then lower under control.'),
    x('Lat pulldown', 3, 8, 12, 'Grip just outside shoulder width. Lean back slightly, pull the bar to your upper chest by driving elbows down, and return slowly to a full stretch.'),
    x('Seated cable row', 3, 10, 12, 'Sit tall with a slight knee bend. Pull the handle to your lower ribs, squeeze shoulder blades together, and extend without rounding your back.'),
    x('Shoulder press', 2, 10, 12, 'Start with hands at about ear height. Press overhead without arching your lower back, then lower to the start under control.'),
    x('Cable crunch', 3, 12, 15, 'Kneel facing the stack with the rope beside your head. Curl your ribs toward your hips by flexing your abs; keep hips still and avoid pulling with your arms.'),
    x('Finish: incline walking', 1, 5, null, 'Brisk walk on an incline you can sustain while still breathing through your nose.', 'min'),
  ] },
  { weekday: 2, name: 'Lower Body A', kind: 'lifting', ex: [
    x('Leg press', 3, 10, 12, 'Feet about shoulder width on the platform. Lower until knees reach roughly 90° while keeping your lower back on the pad, then press without locking your knees.'),
    x('Dumbbell Romanian deadlift', 3, 10, null, 'Soft knees, flat back. Push your hips back and slide the dumbbells down your thighs to mid-shin, then drive hips forward to stand.'),
    x('Seated leg curl', 3, 12, null, 'Line the pad up just above your heels. Curl fully, pause briefly, and return slowly without letting the stack slam.'),
    x('Calf raise', 2, 15, null, 'Rise onto the balls of your feet as high as you can, pause, then lower to a full stretch.'),
    x('Finish: incline treadmill', 1, 10, null, 'Steady incline walk at a pace you can hold for the full time.', 'min'),
  ] },
  { weekday: 3, name: 'Cardio and Abs', kind: 'cardio', ex: [
    x('Incline treadmill', 1, 20, 25, 'Steady incline walk. Aim for an effort where you can talk in short sentences.', 'min'),
    x("Captain's chair knee raises", 3, 12, null, 'Back against the pad, forearms on the rests. Raise your knees toward your chest by curling your pelvis up; lower slowly without swinging.'),
    x('Cable woodchops', 2, 12, null, 'Stand side-on to the cable. Rotate through your torso to pull the handle diagonally across your body with arms nearly straight; control the return.', 'reps', true),
    x('Plank', 3, 45, null, 'Elbows under shoulders, body in a straight line from head to heels. Brace your abs and squeeze your glutes; stop the set if your hips sag.', 'sec'),
  ] },
  { weekday: 4, name: 'Upper Body B', kind: 'lifting', ex: [
    x('Incline dumbbell press', 3, 10, null, 'Bench at roughly 30°. Lower the dumbbells to the sides of your upper chest with elbows about 45° from your body, then press up and slightly together.'),
    x('Assisted pull-ups', 3, 8, 10, 'Pick an assistance weight that lets you hit the rep range. Pull your chest toward the bar, then lower to a full hang under control. Log the assistance weight used.'),
    x('Cable row', 2, 12, null, 'Sit tall, pull the handle to your lower ribs, squeeze shoulder blades, and extend without rounding your back.'),
    x('Dumbbell lateral raise', 2, 15, null, 'Slight bend in the elbows. Raise the dumbbells out to the sides to shoulder height, leading with your elbows, and lower slowly.'),
    x('Ab crunch machine', 3, 12, 15, 'Curl your ribs toward your hips using your abs, pause, and return slowly. Avoid pulling with your arms.'),
    x('Finish: incline walking', 1, 5, null, 'Brisk walk on an incline you can sustain.', 'min'),
  ] },
  { weekday: 5, name: 'Lower Body B', kind: 'lifting', ex: [
    x('Smith machine squat', 3, 8, 10, 'Bar across your upper back, feet slightly in front of the bar. Sit down until thighs are about parallel, keeping your chest up, then drive through mid-foot.'),
    x('Leg curl', 3, 12, null, 'Curl fully, pause briefly, and return slowly without letting the stack slam.'),
    x('Leg extension', 2, 12, null, 'Line your knees up with the machine pivot. Extend until legs are straight, squeeze, and lower under control.'),
    x('Calf raise', 2, 15, null, 'Rise onto the balls of your feet as high as you can, pause, then lower to a full stretch.'),
    x('Finish: bike or treadmill', 1, 10, null, 'Steady, moderate effort.', 'min'),
  ] },
  { weekday: 6, name: 'Cardio and Abs', kind: 'cardio', ex: [
    x('Elliptical, bike, or treadmill', 1, 20, 25, 'Steady effort where you can talk in short sentences.', 'min'),
    x('Reverse crunch', 3, 15, null, 'Lie on your back, knees bent. Curl your hips off the floor toward your ribs, then lower slowly without letting your feet drop.'),
    x('Cable crunch', 3, 12, null, 'Kneel facing the stack with the rope beside your head. Curl your ribs toward your hips; keep hips still.'),
    x('Side plank', 2, 40, null, 'Elbow under shoulder, body in a straight line. Keep hips lifted for the full time, then switch sides.', 'sec', true),
  ] },
  { weekday: 0, name: 'Recovery', kind: 'recovery', ex: [
    x('Walk', 1, 20, 30, 'Easy, relaxed pace.', 'min', false, true),
    x('Gentle stretching or mobility', 1, null, null, 'Easy stretches for hips, hamstrings, chest and shoulders. Nothing should be painful.', 'min', false, true),
  ] },
]

export const REMINDER_DEFAULTS: { kind: ReminderKind; label: string; time: string; weekday: number | null }[] = [
  { kind: 'weigh_in', label: 'Daily weigh-in', time: '07:00', weekday: null },
  { kind: 'workout', label: 'Workout', time: '17:00', weekday: null },
  { kind: 'food', label: 'Food tracking', time: '20:00', weekday: null },
  { kind: 'waist', label: 'Weekly waist measurement', time: '07:30', weekday: 0 },
  { kind: 'review', label: 'Weekly review', time: '18:00', weekday: 0 },
]

/** Starting data for a brand-new account: profile, 12-week program and the preloaded routine. */
export function buildSeed(): Data {
  const d = emptyData()
  const profile: Profile = { id: uid(), ...DEFAULT_PROFILE }
  const program: Program = { id: uid(), name: 'LeanTrack 12-Week Recomposition', start_date: today(), weeks: 12, is_active: true }
  d.profiles.push(profile)
  d.programs.push(program)
  for (const day of ROUTINE) {
    const t: Template = { id: uid(), program_id: program.id, weekday: day.weekday, name: day.name, kind: day.kind, archived: false }
    d.workout_templates.push(t)
    day.ex.forEach(([name, sets, rep_low, rep_high, unit, per_side, optional, instructions], position) => {
      const e: Exercise = { id: uid(), template_id: t.id, name, sets, rep_low, rep_high, unit, per_side, optional, instructions, position, archived: false }
      d.exercises.push(e)
    })
  }
  for (const r of REMINDER_DEFAULTS) {
    const rem: Reminder = { id: uid(), kind: r.kind, enabled: false, time_of_day: r.time, weekday: r.weekday }
    d.reminder_preferences.push(rem)
  }
  return d
}
