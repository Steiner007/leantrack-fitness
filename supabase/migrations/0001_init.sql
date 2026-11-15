-- LeanTrack schema. Every table is owned per-user and protected by row-level security.
-- Dates are stored as plain `date` values taken from the user's local calendar,
-- so an entry never shifts to the previous/next day because of timezones.

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique default auth.uid() references auth.users(id) on delete cascade,
  sex text,
  age_range text,
  height_in numeric,
  start_weight_lb numeric,
  goal_weight_lb numeric,
  later_goal_low_lb numeric,
  later_goal_high_lb numeric,
  activity_level text,
  experience text,
  gym text,
  workout_duration text,
  training_schedule text,
  main_goal text,
  weight_unit text not null default 'lb' check (weight_unit in ('lb', 'kg')),
  calorie_target integer not null default 2150,
  protein_target_g integer not null default 160,
  fat_target_g integer not null default 65,
  carb_target_g integer not null default 231,
  water_target_oz integer not null default 96,
  step_target integer not null default 8000,
  add_exercise_calories boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  start_date date not null,
  weeks integer not null default 12 check (weeks between 1 and 104),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  program_id uuid references public.programs(id) on delete set null,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = Sunday
  name text not null,
  kind text not null default 'lifting' check (kind in ('lifting', 'cardio', 'recovery')),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  template_id uuid not null references public.workout_templates(id) on delete cascade,
  name text not null,
  sets integer not null default 3 check (sets between 1 and 20),
  rep_low numeric,
  rep_high numeric,
  unit text not null default 'reps' check (unit in ('reps', 'sec', 'min')),
  per_side boolean not null default false,
  optional boolean not null default false,
  instructions text,
  position integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- Sessions and sets keep their own name snapshots and only loosely reference
-- templates (ON DELETE SET NULL), so editing or deleting the schedule never
-- changes or removes workout history.
create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  template_id uuid references public.workout_templates(id) on delete set null,
  name text not null,
  kind text not null default 'lifting',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  notes text,
  exercise_notes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.exercise_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  exercise_id uuid references public.exercises(id) on delete set null,
  exercise_name text not null,
  position integer not null default 0,
  set_number integer not null default 1,
  target text,
  unit text not null default 'reps' check (unit in ('reps', 'sec', 'min')),
  weight_lb numeric check (weight_lb is null or weight_lb >= 0),
  reps numeric check (reps is null or reps >= 0),
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.saved_foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null default 'food' check (kind in ('food', 'meal')),
  name text not null,
  serving_label text,
  calories numeric not null default 0,
  protein_g numeric not null default 0,
  carbs_g numeric not null default 0,
  fat_g numeric not null default 0,
  is_favorite boolean not null default false,
  items jsonb not null default '[]'::jsonb, -- for kind = 'meal'
  source text not null default 'manual',
  created_at timestamptz not null default now()
);

create table public.food_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  meal text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  name text not null,
  calories numeric not null default 0,   -- per serving
  protein_g numeric not null default 0,
  carbs_g numeric not null default 0,
  fat_g numeric not null default 0,
  servings numeric not null default 1 check (servings > 0),
  saved_food_id uuid references public.saved_foods(id) on delete set null,
  source text not null default 'manual',
  created_at timestamptz not null default now()
);

create table public.weight_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  weight_lb numeric not null check (weight_lb > 0),
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create table public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  waist_in numeric,
  chest_in numeric,
  arms_in numeric,
  hips_in numeric,
  thighs_in numeric,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create table public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  pose text not null check (pose in ('front', 'side', 'back', 'extra')),
  storage_path text not null unique,
  width integer,
  height integer,
  created_at timestamptz not null default now()
);

create table public.daily_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  note text,
  photo_note text,
  water_oz numeric not null default 0,
  steps integer,
  exercise_calories integer, -- manual entry; only used if the user enables adding exercise calories back
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create table public.reminder_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('weigh_in', 'workout', 'food', 'photos', 'waist', 'review')),
  enabled boolean not null default false,
  time_of_day text not null default '08:00',
  weekday smallint check (weekday is null or weekday between 0 and 6),
  created_at timestamptz not null default now(),
  unique (user_id, kind)
);

create table public.weekly_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  week_number integer not null,
  avg_weight_lb numeric,
  weekly_change_lb numeric,
  calorie_target_before integer,
  calorie_target_after integer,
  notes text,
  created_at timestamptz not null default now()
);

create index on public.workout_templates (user_id, weekday);
create index on public.exercises (template_id);
create index on public.workout_sessions (user_id, date);
create index on public.exercise_sets (session_id);
create index on public.exercise_sets (user_id, exercise_name);
create index on public.food_entries (user_id, date);
create index on public.progress_photos (user_id, date);

-- Row-level security: a signed-in user can only see and change their own rows.
do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'programs', 'workout_templates', 'exercises', 'workout_sessions',
    'exercise_sets', 'saved_foods', 'food_entries', 'weight_entries',
    'body_measurements', 'progress_photos', 'daily_notes', 'reminder_preferences',
    'weekly_checkins'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))',
      t || '_owner', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Private photo bucket. Objects live under "<user id>/<date>/<file>" and can only
-- be read or written by that user. The app shows them through short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progress-photos', 'progress-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false;

create policy "progress_photos_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "progress_photos_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "progress_photos_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "progress_photos_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Account deletion without exposing a service-role key: the function runs with
-- definer rights but can only ever delete the caller's own auth user. All app
-- rows cascade from auth.users. (The app removes the user's photos through the
-- Storage API first.)
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public;
revoke all on function public.delete_my_account() from anon;
grant execute on function public.delete_my_account() to authenticated;
