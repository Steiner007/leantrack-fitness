export type Unit = 'reps' | 'sec' | 'min'
export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack'
export type Kind = 'lifting' | 'cardio' | 'recovery'

interface Base { id: string; user_id?: string; created_at?: string }

export interface Profile extends Base {
  sex: string; age_range: string; height_in: number
  start_weight_lb: number; goal_weight_lb: number
  later_goal_low_lb: number | null; later_goal_high_lb: number | null
  activity_level: string; experience: string; gym: string
  workout_duration: string; training_schedule: string; main_goal: string
  weight_unit: 'lb' | 'kg'
  calorie_target: number; protein_target_g: number; fat_target_g: number; carb_target_g: number
  water_target_oz: number; step_target: number; add_exercise_calories: boolean
}
export interface Program extends Base { name: string; start_date: string; weeks: number; is_active: boolean }
export interface Template extends Base { program_id: string | null; weekday: number; name: string; kind: Kind; archived: boolean }
export interface Exercise extends Base {
  template_id: string; name: string; sets: number; rep_low: number | null; rep_high: number | null
  unit: Unit; per_side: boolean; optional: boolean; instructions: string | null; position: number; archived: boolean
}
export interface Session extends Base {
  date: string; template_id: string | null; name: string; kind: Kind
  started_at: string; completed_at: string | null; notes: string | null
  exercise_notes: Record<string, string>
}
export interface SetRow extends Base {
  session_id: string; exercise_id: string | null; exercise_name: string; position: number
  set_number: number; target: string | null; unit: Unit
  weight_lb: number | null; reps: number | null; completed: boolean
}
export interface Macros { calories: number; protein_g: number; carbs_g: number; fat_g: number }
export interface MealItem extends Macros { name: string; servings: number }
export interface SavedFood extends Base, Macros {
  kind: 'food' | 'meal'; name: string; serving_label: string | null
  is_favorite: boolean; items: MealItem[]; source: string
}
export interface FoodEntry extends Base, Macros {
  date: string; meal: Meal; name: string; servings: number; saved_food_id: string | null; source: string
}
export interface WeightEntry extends Base { date: string; weight_lb: number }
export interface Measurement extends Base {
  date: string; waist_in: number | null; chest_in: number | null; arms_in: number | null
  hips_in: number | null; thighs_in: number | null
}
export interface DailyNote extends Base { date: string; note: string | null; water_oz: number; steps: number | null; exercise_calories: number | null }
export type ReminderKind = 'weigh_in' | 'workout' | 'food' | 'waist' | 'review'
export interface Reminder extends Base { kind: ReminderKind; enabled: boolean; time_of_day: string; weekday: number | null }
export interface Checkin extends Base {
  date: string; week_number: number; avg_weight_lb: number | null; weekly_change_lb: number | null
  calorie_target_before: number | null; calorie_target_after: number | null; notes: string | null
}

export interface Tables {
  profiles: Profile; programs: Program; workout_templates: Template; exercises: Exercise
  workout_sessions: Session; exercise_sets: SetRow; saved_foods: SavedFood; food_entries: FoodEntry
  weight_entries: WeightEntry; body_measurements: Measurement
  daily_notes: DailyNote; reminder_preferences: Reminder; weekly_checkins: Checkin
}
export type TableName = keyof Tables
// Order matters: parents before children (used for inserts; reversed for deletes).
export const TABLES: TableName[] = [
  'profiles', 'programs', 'workout_templates', 'exercises', 'workout_sessions', 'exercise_sets',
  'saved_foods', 'food_entries', 'weight_entries', 'body_measurements',
  'daily_notes', 'reminder_preferences', 'weekly_checkins',
]
export type Data = { [K in TableName]: Tables[K][] }
export const emptyData = (): Data => Object.fromEntries(TABLES.map(t => [t, []])) as unknown as Data
