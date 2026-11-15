# LeanTrack

A mobile-first tracker for a 12-week fat-loss and body-recomposition program: workouts, daily weight, waist and body measurements, and calories/macros. No account and no photos. Everything is saved on your phone.

**Live app:** https://steiner007.github.io/leantrack-fitness/

Built with React, TypeScript, Vite, Tailwind CSS and Recharts. Installable as a home-screen app (PWA).

## What it does

| Area | Details |
| --- | --- |
| Dashboard | Program week/day and phase, today's workout, calories and protein eaten/remaining, latest weight, change from start, 7-day average, waist, water, steps, streak, progress summary |
| Workouts | Preloaded Mon–Sun routine; per-set weight/reps and checkboxes; rest timer; last performance; personal-best flag; instructions; add/substitute exercises; notes; editable schedule that never alters logged history |
| Weight | One-tap daily entry, lb or kg, edit any past date, 7-day rolling average, weekly/monthly trend, projection toward goal |
| Food | Breakfast/lunch/dinner/snacks, manual nutrition entry, saved foods, favorites, saved meals, copy yesterday, repeat on other days, portion adjustment, search of past foods, daily and 7-day averages |
| Progress | Weight, body, training and nutrition views over 7 days, 30 days, 12 weeks, all time |
| Program | Three phases (weeks 1–4, 5–8, 9–12), weekly check-in where calorie targets change only if you change them |
| Calendar | Workout, weight, food and waist markers; tap a day to view and edit everything |
| Data | JSON backup, delete all data |

Deliberate limits:

- **Data lives on this phone only** (browser IndexedDB). It doesn't sync to other devices. Deleting the home-screen app or clearing Safari website data erases it, so use Profile → Back up data now and then.
- **Nutrition is manual entry only**, so the app never shows numbers you didn't type.
- **No body-fat estimates.**
- **Reminders are in-app only** (shown on Home when due); no push notifications.

## Install on your iPhone

Open the live link in **Chrome** → tap the **Share** icon in the address bar → **Add to Home Screen** (Safari works too: Share → Add to Home Screen; needs iOS 16.4+ for Chrome). It gets the LeanTrack icon and opens full screen. Adding it to the home screen also keeps Safari from clearing its saved data.

## Run it locally

Requires Node 20+.

```bash
npm install
npm run dev
```

## Deployment (GitHub Pages)

`.github/workflows/pages.yml` runs the tests, builds the app for `/leantrack-fitness/`, and publishes it on every push to `main` (live about 2 minutes later).

One-time setup: repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.

`npm run build:artifact` produces a separate build that runs as a Claude artifact.

## Tests

```bash
npm test                                # calculations
npm run build && npm run test:smoke     # end-to-end in a real browser (needs Chrome)
```

- `tests/calc.test.ts`: timezone-safe dates, 7-day average, trend and projection, program week/phase, nutrition totals, streaks, personal bests, and the seeded routine.
- `scripts/smoke.mjs`: drives the built app at phone size through navigation, weight, workouts, schedule edits vs history, food math, measurements, calendar, charts, profile, check-in, reminders, backup, PWA files, layout and data deletion. `SMOKE_TARGET=artifact` runs it against the Claude-artifact build.

## Maintenance

- **Change the default routine or targets:** `src/lib/seed.ts` (new installs only; existing data is edited in the app).
- **Update dependencies:** `npm update`, then the tests.

This app is a tracking tool, not medical advice. Calorie and macro targets are editable starting estimates.
