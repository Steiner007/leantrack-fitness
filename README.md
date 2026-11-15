# LeanTrack

A mobile-first, installable (PWA) tracker for a 12-week fat-loss and body-recomposition program: workouts, daily weight, waist and body measurements, calories and macros, and daily progress photos with before/after comparison.

Built with React, TypeScript, Vite, Tailwind CSS, Recharts and Supabase (auth, Postgres, private photo storage).

## What it does

| Area | Details |
| --- | --- |
| Dashboard | Program week/day and phase, today's workout, calories and protein eaten/remaining, latest weight, change from start, 7-day average, photo status, water, steps, streak, progress summary |
| Workouts | Preloaded Mon–Sun routine; per-set weight/reps and checkboxes; rest timer; last performance; personal-best flag; instructions; add/substitute exercises; notes; editable schedule that never alters logged history |
| Weight | One-tap daily entry, lb or kg, edit any past date, 7-day rolling average, weekly/monthly trend, projection toward goal |
| Photos | Front/side/back plus extras per day, phone camera or gallery, replace/delete, calendar with camera markers, side-by-side and slider comparison, full screen |
| Food | Breakfast/lunch/dinner/snacks, manual nutrition entry, saved foods, favorites, saved meals, copy yesterday, repeat on other days, portion adjustment, search of past foods, daily and 7-day averages |
| Progress | Weight, body, training, nutrition and photo views over 7 days, 30 days, 12 weeks, all time |
| Program | Three phases (weeks 1–4, 5–8, 9–12), weekly check-in where calorie targets change only if you change them |
| Calendar | Workout, weight, photo, food and waist markers; tap a day to view and edit everything |
| Account | Email/password sign-in, password reset, JSON export, JSON + photos export (zip), delete account and all data |

Deliberate limits:

- **Nutrition is manual entry only.** No food database or barcode scanner is integrated, so the app never shows nutrition numbers you didn't type.
- **No body-fat estimates**, from photos or anything else.
- **Reminders are in-app only** (shown on the Home screen when due). There are no push notifications, so nothing arrives while the app is closed.
- **Online-first.** The app shell loads offline, but with Supabase configured, saving needs a connection; a failed save shows an error and is never reported as saved.

## Run it locally

Requires Node 20+.

```bash
npm install
npm run dev
```

Without Supabase keys the app runs in **local mode**: no login, data stored only in that browser (IndexedDB). This is useful for trying it out; it is clearly labelled in the app. For real use, configure Supabase.

## Configure Supabase

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).
2. Run the database migration, either way:
   - **Dashboard:** SQL Editor → paste the contents of `supabase/migrations/0001_init.sql` → Run.
   - **CLI:** `npx supabase login`, `npx supabase link --project-ref YOUR-REF`, `npx supabase db push`.

   The migration creates all tables with row-level security, the private `progress-photos` bucket with per-user storage policies, and the `delete_my_account()` function.
3. Project Settings → API: copy the **Project URL** and the **anon / publishable key**.
4. Create `.env.local` (git-ignored) from `.env.example`:

   ```
   VITE_SUPABASE_URL=https://YOUR-REF.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR-ANON-KEY
   ```
5. Authentication → URL Configuration: set **Site URL** to your deployed URL and add it (and `http://localhost:5173` for development) under **Redirect URLs**. Password-reset and confirmation emails link back to these.
6. Restart `npm run dev`, create your account, and sign in. Your profile, 12-week program and routine are created on first sign-in.

Never put the **service-role key** in `.env.local`, in Vercel variables for this app, or anywhere in this repo. The app doesn't need it: account deletion runs through a database function that can only delete the caller's own account.

### Later schema changes

Add a new numbered file in `supabase/migrations/` (for example `0002_add_something.sql`) and run it the same way. Don't edit a migration that has already been applied.

## Deploy (Vercel)

1. Push this repo to GitHub, then on [vercel.com](https://vercel.com): Add New → Project → import `leantrack-fitness`. The Vite preset is detected (build `npm run build`, output `dist`).
2. Add environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Production and Preview), then deploy.
3. Put the Vercel URL into Supabase's Site URL / Redirect URLs (step 5 above).

`vercel.json` rewrites deep links to `index.html`. Any static host works if it does the same and serves over HTTPS (required for PWA install and camera access).

## Install on your phone

- **iPhone:** open the site in **Safari** → Share → **Add to Home Screen**.
- **Android:** open in Chrome → menu → **Install app**.

## Tests

```bash
npm test            # unit tests + database access rules
npm run build && npm run test:smoke   # end-to-end in a real browser (needs Chrome)
```

- `tests/calc.test.ts` — dates/timezone safety, 7-day average, trend and projection, program week/phase, nutrition totals, streaks, personal bests, photo resizing, and the seeded routine.
- `tests/rls.test.ts` — applies the real migration to an in-process Postgres (PGlite) and checks, for every table, that a user reads/changes only their own rows, anonymous visitors get nothing, logged history survives schedule deletion, storage policies confine each user to their own photo folder, and account deletion removes only the caller. Supabase's `auth`/`storage` schemas are replaced by minimal stand-ins in this test; the policies themselves are the real ones.
- `scripts/smoke.mjs` — drives the built app at phone size in **local mode**: navigation, weight, workouts, schedule edits vs history, food maths, photo upload/replace/delete/compare, measurements, calendar, charts, profile, check-in, reminders, export, PWA files, layout, and data deletion. It does not exercise a live Supabase project.

After connecting your own Supabase project, do one manual check: sign up, upload a photo, then open the photo's storage path in a private window without signing in — it must be refused.

## Project layout

```
src/lib/        types, date helpers, calculations, data store, backends (Supabase + local), seed routine
src/pages/      one file per screen
src/components/ shared UI, weight/measurement sheets, photo + calendar pieces
supabase/migrations/  database schema, RLS, storage policies
tests/, scripts/      automated tests
```

## Maintenance

- **Change the default routine or targets:** `src/lib/seed.ts` (affects new accounts only; existing accounts edit theirs in the app).
- **Update dependencies:** `npm update`, then `npm test` and the smoke test.
- **Back up:** Profile → Your data → "Data + photos".
- **Photos** are resized to at most 1600 px on the long edge (JPEG quality 0.85), original proportions kept, no filters. Change `MAX_EDGE` / `JPEG_QUALITY` in `src/lib/photos.ts`.
- Free Supabase projects pause after a period of inactivity; daily use keeps it active.

This app is a tracking tool, not medical advice. Calorie and macro targets are editable starting estimates.
