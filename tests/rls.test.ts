/**
 * Runs the real migration against an in-process Postgres (PGlite) and checks
 * the access rules as two different signed-in users and as an anonymous visitor.
 *
 * Supabase's `auth` and `storage` schemas don't exist in plain Postgres, so
 * minimal stand-ins are created first (auth.uid() reads the same JWT claim
 * setting Supabase uses). The table and storage *policies* under test are the
 * ones in supabase/migrations, unmodified.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { TABLES } from '../src/lib/types'

const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'
const dir = join(__dirname, '..', 'supabase', 'migrations')
let db: PGlite

const STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text not null, unique (bucket_id, name));
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  grant usage on schema public, auth, storage to anon, authenticated;
  grant select, insert, update, delete on storage.objects to anon, authenticated;
`

/** Run statements as a signed-in user (or anonymous when uid is null). */
async function as<T>(uid: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set request.jwt.claim.sub = '${uid ?? ''}'; set role ${uid ? 'authenticated' : 'anon'};`)
  try { return await fn() } finally { await db.exec('reset role;') }
}
const rows = async (sql: string) => (await db.query(sql)).rows as Record<string, unknown>[]

beforeAll(async () => {
  db = new PGlite()
  await db.exec(STUBS)
  for (const f of readdirSync(dir).sort()) await db.exec(readFileSync(join(dir, f), 'utf8'))
  await db.exec(`insert into auth.users (id) values ('${A}'), ('${B}');`)
  for (const u of [A, B]) {
    await as(u, async () => {
      await db.exec(`
        insert into public.profiles default values;
        insert into public.programs (name, start_date) values ('p', '2026-11-16');
        insert into public.workout_templates (weekday, name) values (1, 'Upper A');
        insert into public.exercises (template_id, name) select id, 'Chest press' from public.workout_templates;
        insert into public.workout_sessions (date, template_id, name) select '2026-11-16', id, name from public.workout_templates;
        insert into public.exercise_sets (session_id, exercise_id, exercise_name, weight_lb, reps, completed)
          select s.id, e.id, e.name, 100, 10, true from public.workout_sessions s, public.exercises e;
        insert into public.saved_foods (name, calories) values ('Yogurt', 120);
        insert into public.food_entries (date, meal, name, calories) values ('2026-11-16', 'lunch', 'Yogurt', 120);
        insert into public.weight_entries (date, weight_lb) values ('2026-11-16', 175);
        insert into public.body_measurements (date, waist_in) values ('2026-11-16', 34);
        insert into public.progress_photos (date, pose, storage_path) values ('2026-11-16', 'front', '${u}/2026-11-16/front.jpg');
        insert into public.daily_notes (date, note) values ('2026-11-16', 'n');
        insert into public.reminder_preferences (kind) values ('weigh_in');
        insert into public.weekly_checkins (date, week_number) values ('2026-11-22', 1);
        insert into storage.objects (bucket_id, name) values ('progress-photos', '${u}/2026-11-16/front.jpg');
      `)
    })
  }
})

describe('row-level security', () => {
  it('has RLS enabled and forced on every table', async () => {
    const r = await rows(`select relname, relrowsecurity, relforcerowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'`)
    expect(r.map(x => x.relname).sort()).toEqual([...TABLES].sort())
    expect(r.every(x => x.relrowsecurity && x.relforcerowsecurity)).toBe(true)
  })

  it.each(TABLES)('%s: a user sees only their own rows', async t => {
    const mine = await as(A, () => rows(`select user_id from public.${t}`))
    expect(mine.length).toBeGreaterThan(0)
    expect(mine.every(r => r.user_id === A)).toBe(true)
  })

  it.each(TABLES)("%s: a user cannot change or delete another user's rows", async t => {
    await as(A, async () => {
      expect((await db.query(`update public.${t} set created_at = now() where user_id = '${B}'`)).affectedRows).toBe(0)
      expect((await db.query(`delete from public.${t} where user_id = '${B}'`)).affectedRows).toBe(0)
    })
    expect((await rows(`select 1 from public.${t} where user_id = '${B}'`)).length).toBeGreaterThan(0)
  })

  it('rejects rows written under someone else\'s user id', async () => {
    await expect(as(A, () => db.query(`insert into public.weight_entries (user_id, date, weight_lb) values ('${B}', '2026-11-17', 150)`))).rejects.toThrow(/row-level security/)
    await expect(as(A, () => db.query(`update public.weight_entries set user_id = '${B}'`))).rejects.toThrow(/row-level security/)
  })

  it.each(TABLES)('%s: anonymous visitors have no access', async t => {
    await expect(as(null, () => db.query(`select * from public.${t}`))).rejects.toThrow(/permission denied/)
  })
})

describe('history survives schedule edits', () => {
  it('keeps logged sets when an exercise or workout template is deleted', async () => {
    await as(B, async () => {
      await db.exec('delete from public.exercises; delete from public.workout_templates;')
      const sets = await rows('select exercise_name, weight_lb, reps, exercise_id from public.exercise_sets')
      expect(sets).toHaveLength(1)
      expect(sets[0]).toMatchObject({ exercise_name: 'Chest press', exercise_id: null })
      expect(Number(sets[0].weight_lb)).toBe(100)
      const sessions = await rows('select name, template_id from public.workout_sessions')
      expect(sessions[0]).toMatchObject({ name: 'Upper A', template_id: null })
    })
  })
})

describe('private photo storage', () => {
  it('keeps the bucket private', async () => {
    expect(await rows(`select public from storage.buckets where id = 'progress-photos'`)).toEqual([{ public: false }])
  })
  it('lets a user see only objects in their own folder', async () => {
    expect((await as(A, () => rows('select name from storage.objects'))).map(r => r.name)).toEqual([`${A}/2026-11-16/front.jpg`])
    expect(await as(null, () => rows('select name from storage.objects'))).toEqual([])
  })
  it("blocks uploading into, replacing or deleting another user's folder", async () => {
    await expect(as(A, () => db.query(`insert into storage.objects (bucket_id, name) values ('progress-photos', '${B}/x.jpg')`))).rejects.toThrow(/row-level security/)
    await expect(as(null, () => db.query(`insert into storage.objects (bucket_id, name) values ('progress-photos', '${A}/x.jpg')`))).rejects.toThrow(/row-level security/)
    await as(A, async () => {
      expect((await db.query(`delete from storage.objects where name like '${B}/%'`)).affectedRows).toBe(0)
      expect((await db.query(`update storage.objects set name = '${A}/stolen.jpg' where name like '${B}/%'`)).affectedRows).toBe(0)
    })
  })
})

describe('account deletion', () => {
  it('is not callable anonymously', async () => {
    await expect(as(null, () => db.query('select public.delete_my_account()'))).rejects.toThrow(/permission denied/)
  })
  it("removes only the caller's account and data", async () => {
    await as(A, () => db.query('select public.delete_my_account()'))
    expect(await rows(`select id from auth.users`)).toEqual([{ id: B }])
    for (const t of TABLES) expect(await rows(`select 1 from public.${t} where user_id = '${A}'`)).toEqual([])
    expect((await rows(`select 1 from public.weight_entries where user_id = '${B}'`)).length).toBe(1)
  })
})
