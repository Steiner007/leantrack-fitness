/**
 * End-to-end smoke test. Drives the built app in a real browser at phone size
 * and checks that the main flows save and survive a page reload.
 *
 *   npm run build && npm run test:smoke
 *
 * It runs against local mode (no Supabase keys in the build), so it verifies
 * the app's own behaviour, not your Supabase project. CHROME_PATH overrides
 * the browser binary.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

// SMOKE_TARGET=artifact tests the Claude-hosted build (dist-artifact) against a stand-in for Claude's storage.
const ART = process.env.SMOKE_TARGET === 'artifact'
const PORT = 4179
const BASE = `http://localhost:${PORT}`
const exe = process.env.CHROME_PATH || ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(existsSync)
if (!exe) { console.error('No Chrome found. Set CHROME_PATH.'); process.exit(2) }

mkdirSync('test-results', { recursive: true })

const pad = n => String(n).padStart(2, '0')
const ds = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const now = new Date()
const back = n => { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - n, 12); return ds(d) }
const TODAY = back(0)
// Most recent Monday (Upper Body A) and the Monday before it.
const sinceMon = (now.getDay() + 6) % 7
const MON = back(sinceMon), PREV_MON = back(sinceMon + 7)

const results = []
let page
async function step(name, fn) {
  try { await fn(); results.push([true, name]); console.log(`  ok   ${name}`) }
  catch (e) {
    results.push([false, name]); console.log(`  FAIL ${name}\n       ${String(e.message).split('\n')[0]}`)
    await page.screenshot({ path: `test-results/fail-${results.length}.png` }).catch(() => {})
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg) }
const toast = text => page.getByRole('status').filter({ hasText: text }).first().waitFor({ timeout: 5000 })
const text = t => page.getByText(t, { exact: false }).first().waitFor({ timeout: 5000 })
const reload = async () => { await page.reload(); await page.getByRole('navigation', { name: 'Main' }).waitFor() }
const go = async path => {
  if (ART) { await page.goto(`${BASE}/#${path}`); await page.reload() } else await page.goto(BASE + path)
  await page.getByRole('navigation', { name: 'Main' }).waitFor()
}
const confirmDlg = name => page.getByRole('alertdialog').getByRole('button', { name }).click()

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', env: { ...process.env, ...(ART ? { VITE_TARGET: 'artifact' } : {}) } })
const stop = () => { try { server.kill() } catch {} }
process.on('exit', stop)
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break } catch {} await new Promise(r => setTimeout(r, 250)) }

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' })
page = await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
page.on('console', m => m.type() === 'error' && errors.push(m.text()))
page.on('dialog', d => { errors.push('native dialog used: ' + d.message()); d.dismiss() })
if (ART) {
  // Stand-in for Claude's artifact runtime: a document store, asset store, viewer id and download prompt, kept in localStorage.
  await page.addInitScript(() => {
    const load = k => JSON.parse(localStorage.getItem(k) || '{}'), store = (k, v) => localStorage.setItem(k, JSON.stringify(v))
    const tick = v => new Promise(r => setTimeout(() => r(v), 2))
    const okPath = (p, even) => { const n = p.split('/'); if ((n.length % 2 === 0) !== even || n.some(x => !/^[\w\-.~:@+]+$/.test(x))) throw new TypeError('bad path ' + p) }
    const query = (path, f = {}) => ({
      path,
      where: (field, op, v) => { if (op !== '>') throw new Error('mock: unsupported op'); return query(path, { ...f, gt: [field, v] }) },
      orderBy: field => query(path, { ...f, order: field }),
      limit: n => { if (n < 1 || n > 1000) throw { code: 'invalid_argument' }; return query(path, { ...f, limit: n }) },
      doc: id => doc(path + '/' + id),
      get: async () => {
        await tick()
        let rows = Object.entries(load('mockdb')).filter(([k]) => k.startsWith(path + '/') && !k.slice(path.length + 1).includes('/')).map(([k, v]) => ({ id: k.split('/').pop(), v }))
        if (f.gt) rows = rows.filter(r => r.v[f.gt[0]] > f.gt[1])
        rows.sort((a, b) => (f.order ? (a.v[f.order] < b.v[f.order] ? -1 : 1) : a.id < b.id ? -1 : 1))
        return { docs: rows.slice(0, f.limit ?? 1000).map(r => ({ id: r.id, exists: true, data: () => Object.freeze(r.v) })) }
      },
    })
    const doc = path => {
      okPath(path, true)
      return {
        path,
        set: async body => { await tick(); if (JSON.stringify(body) !== JSON.stringify(JSON.parse(JSON.stringify(body))) || Object.values(body).some(v => v === undefined)) throw { code: 'invalid_argument', message: 'undefined in body' }; const d = load('mockdb'); d[path] = body; store('mockdb', d) },
        delete: async () => { await tick(); const d = load('mockdb'); delete d[path]; store('mockdb', d) },
        collection: p => { okPath(path + '/' + p, false); return query(path + '/' + p) },
      }
    }
    const caps = {
      db: { doc },
      user: { id: async () => 'u_test' },
      downloads: { save: async ({ filename, data }) => { (window.__saved ??= []).push({ filename, text: typeof data === 'string' ? data : await data.text() }); return { status: 'saved' } } },
    }
    window.claude = { use: name => new Promise(r => setTimeout(() => r(caps[name] ?? null), 30)) }
  })
}

console.log(`LeanTrack smoke test (${exe})`)

await step('dashboard loads with program week, targets and action buttons', async () => {
  await go('/')
  await text('Week 1')
  await text('Phase 1: Consistency')
  for (const b of ['Start Workout', 'Log Food', 'Log Weight', 'Log Waist', 'View Progress']) await page.getByRole('button', { name: b }).waitFor()
  await text('target 2,150')
  await text('target 160 g')
})

await step('bottom navigation reaches every section', async () => {
  for (const [label, heading] of [['Workouts', 'Workouts'], ['Food', 'Food'], ['Progress', 'Progress'], ['Profile', 'Profile'], ['Home', 'Week 1']]) {
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: label }).click()
    await page.getByRole('heading', { level: 1 }).filter({ hasText: heading }).waitFor({ timeout: 5000 })
  }
})

await step('dashboard quick buttons open the right screens', async () => {
  await page.getByRole('button', { name: 'Log Food' }).click(); await page.getByRole('heading', { name: 'Food' }).waitFor()
  await go('/'); await page.getByRole('button', { name: 'Log Waist' }).click(); await page.getByRole('heading', { name: 'Body measurements' }).waitFor()
  await go('/'); await page.getByRole('button', { name: 'View Progress' }).click(); await page.getByRole('heading', { name: 'Progress', exact: true }).waitFor()
  await go('/'); await page.getByRole('link', { name: 'Calendar' }).click(); await page.getByRole('heading', { name: 'Calendar' }).waitFor()
})

await step('weight: log today, persists after reload, shows on dashboard', async () => {
  await go('/')
  await page.getByRole('button', { name: 'Log Weight' }).click()
  await page.getByLabel('Weight', { exact: true }).fill('174.6')
  await page.getByRole('button', { name: 'Save weight' }).click()
  await toast('Weight saved')
  await reload()
  await text('174.6 lb')
  await text('-0.4 lb')
})

await step('weight: back-dated entry lands on its own date and can be edited', async () => {
  await page.getByRole('button', { name: 'Log Weight' }).click()
  await page.getByRole('dialog').locator('input[type=date]').fill(back(3))
  await page.getByLabel('Weight', { exact: true }).fill('176')
  await page.getByRole('button', { name: 'Save weight' }).click()
  await toast('Weight saved')
  await go(`/day/${back(3)}`); await text('176 lb')
  await go(`/day/${back(2)}`); assert(!(await page.getByText('176 lb').count()), 'weight leaked onto a neighbouring day')
  await go('/'); await text('174.6 lb')  // latest is still today
  await text('175.3 lb')                 // 7-day average of 174.6 and 176, not diluted by empty days
  await page.getByRole('button', { name: 'Log Weight' }).click()
  await page.getByRole('dialog').locator('input[type=date]').fill(back(3))
  await page.getByRole('heading', { name: 'Edit weight' }).waitFor()
  await page.getByLabel('Weight', { exact: true }).fill('175.4')
  await page.getByRole('button', { name: 'Save weight' }).click()
  await toast('Weight saved')
  await reload(); await text('175 lb') // (174.6 + 175.4) / 2
})

async function logWorkout(date, weight, reps) {
  await go(`/session/${date}`)
  await page.getByRole('heading', { name: 'Upper Body A' }).waitFor()
  await page.getByRole('button', { name: 'Start Workout' }).click()
  for (const n of [1, 2, 3]) {
    const wIn = page.getByLabel(`Chest press machine set ${n} weight`)
    await wIn.fill(String(weight)); await wIn.blur()
    const rIn = page.getByLabel(`Chest press machine set ${n} reps`)
    await rIn.fill(String(reps)); await rIn.blur()
    await page.getByRole('checkbox', { name: `Chest press machine set ${n} done` }).click()
    await page.getByRole('checkbox', { name: `Chest press machine set ${n} done`, checked: true }).waitFor()
  }
  await page.getByRole('button', { name: 'Complete Workout' }).click()
  await toast('Workout saved')
}

await step('workout: sets, reps and weights are saved and survive reload', async () => {
  await logWorkout(PREV_MON, 100, 10)
  await go(`/session/${PREV_MON}`)
  assert((await page.getByLabel('Chest press machine set 2 weight').inputValue()) === '100', 'weight not persisted')
  assert((await page.getByLabel('Chest press machine set 2 reps').inputValue()) === '10', 'reps not persisted')
  await page.getByRole('checkbox', { name: 'Chest press machine set 3 done', checked: true }).waitFor()
  await text('Completed')
})

await step('workout: rest timer starts when a set is checked off', async () => {
  await go(`/session/${MON}`)
  await page.getByRole('button', { name: 'Start Workout' }).click()
  const rIn = page.getByLabel('Lat pulldown set 1 reps'); await rIn.fill('10'); await rIn.blur()
  await page.getByRole('checkbox', { name: 'Lat pulldown set 1 done' }).click()
  await page.getByRole('timer').waitFor()
  await page.getByRole('button', { name: 'Stop rest timer' }).click()
  await page.getByRole('button', { name: 'Delete this workout' }).click()
  await confirmDlg('Delete')
  await toast('Workout deleted')
})

await step('workout: previous performance pre-fills and a heavier set is flagged as a PR', async () => {
  await go(`/session/${MON}`)
  await page.getByRole('button', { name: 'Start Workout' }).click()
  await text('Last time:')
  await text('100×10')
  await text('Personal best: 100 lb × 10')
  assert((await page.getByLabel('Chest press machine set 1 weight').inputValue()) === '100', 'previous weight not pre-filled')
  const wIn = page.getByLabel('Chest press machine set 1 weight'); await wIn.fill('110'); await wIn.blur()
  await page.getByRole('checkbox', { name: 'Chest press machine set 1 done' }).click()
  await text('NEW PR')
  await page.getByRole('button', { name: 'How to do Chest press machine' }).click()
  await text('Set the seat so the handles')
})

await step('workout: add and substitute exercises, notes save', async () => {
  await page.getByRole('button', { name: 'Add exercise' }).click()
  await page.getByPlaceholder('e.g. Pec fly machine').fill('Pec fly machine')
  await page.getByRole('button', { name: 'Add to workout' }).click()
  await toast('Exercise added')
  await page.getByLabel('Pec fly machine set 1 weight').waitFor()
  await page.getByRole('button', { name: 'Options for Shoulder press' }).click()
  await page.getByRole('button', { name: 'Substitute exercise' }).click()
  await page.getByPlaceholder('New exercise name').fill('Arnold press')
  await page.getByRole('button', { name: 'Substitute', exact: true }).click()
  await toast('Exercise substituted')
  const note = page.getByLabel('Workout notes'); await note.fill('Felt strong'); await note.blur()
  await toast('Notes saved')
  await page.getByRole('button', { name: 'Complete Workout' }).click()
  await toast('Workout saved')
  await go(`/session/${MON}`)
  await page.getByLabel('Arnold press set 1 reps').waitFor()
  assert((await page.getByLabel('Workout notes').inputValue()) === 'Felt strong', 'notes not persisted')
})

await step('schedule edits do not change logged history', async () => {
  await go('/workouts/edit')
  const name = page.getByLabel('Exercise name').first()
  assert((await name.inputValue()) === 'Chest press machine', 'unexpected first exercise')
  await name.fill('Hammer chest press'); await name.blur()
  await page.getByLabel('Remove Lat pulldown').click()
  await page.waitForFunction(() => ![...document.querySelectorAll('input[aria-label="Exercise name"]')].some(i => i.value === 'Lat pulldown'))
  await go(`/session/${PREV_MON}`)
  await page.getByLabel('Chest press machine set 1 weight').waitFor()
  await page.getByLabel('Lat pulldown set 1 reps').waitFor()
  assert(!(await page.getByText('Hammer chest press').count()), 'history was rewritten by a template edit')
  await go('/workouts/edit')
  assert((await page.getByLabel('Exercise name').first().inputValue()) === 'Hammer chest press', 'template edit not saved')
})

await step('food: manual entry totals correctly and persists', async () => {
  await go('/food')
  await text('Manual nutrition entry')
  await page.getByRole('button', { name: 'Add to breakfast' }).click()
  await text('Manual entry')
  await page.getByPlaceholder('e.g. Greek yogurt, plain').fill('Greek yogurt')
  await page.getByLabel('Calories', { exact: true }).fill('150')
  await page.getByLabel('Protein', { exact: true }).fill('20')
  await page.getByLabel('Carbs', { exact: true }).fill('8')
  await page.getByLabel('Fat', { exact: true }).fill('4')
  await page.getByLabel('Servings', { exact: true }).fill('2')
  await page.getByRole('button', { name: 'Add food' }).click()
  await toast('Food added')
  await text('1,850 left of 2,150') // 2150 - 2 × 150
  await text('40/160 g')
  await reload()
  await text('1,850 left of 2,150')
})

await step('food: search saved foods, adjust portion, save meal, repeat', async () => {
  await page.getByRole('button', { name: 'Add to lunch' }).click()
  await page.getByLabel('Search foods').fill('greek')
  await page.getByRole('dialog').getByRole('button', { name: /Greek yogurt/ }).first().click()
  await toast('Greek yogurt added')
  await text('1,700 left of 2,150')
  await page.getByRole('button', { name: /Greek yogurt/ }).last().click()
  await page.getByRole('button', { name: 'More' }).click()
  await text('Total: 188 kcal')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await toast('Food updated')
  await text('1,663 left of 2,150') // 2150 - 300 - 187.5 -> rounds to 1,663
  await page.getByRole('button', { name: 'Save Breakfast as a meal' }).click()
  await page.getByRole('alertdialog').getByRole('textbox').fill('Test meal')
  await confirmDlg('Save')
  await toast('Meal saved')
  await page.getByRole('button', { name: 'Repeat day' }).click()
  await page.getByRole('dialog').getByRole('button').nth(1).click() // first offered day = tomorrow
  await page.getByRole('button', { name: /Repeat on 1 day/ }).click()
  await toast('Repeated on 1 day')
  await page.getByRole('button', { name: 'Next day' }).click()
  await text('1,663 left of 2,150')
  await page.getByRole('button', { name: 'Add to dinner' }).click()
  await page.getByRole('tab', { name: 'Meals' }).click()
  await page.getByRole('dialog').getByRole('button', { name: /Test meal/ }).first().click()
  await toast('Test meal added')
  await text('1,363 left of 2,150')
  await go('/'); await text('488') // today's dashboard calories (487.5)
})

await step('measurements save and appear in day history', async () => {
  await go(`/day/${TODAY}`)
  await page.getByRole('button', { name: /waist|measure/i }).first().click()
  await page.getByRole('dialog').locator('input[inputmode=decimal]').first().fill('34.5')
  await page.getByRole('button', { name: 'Save measurements' }).click()
  await toast('Measurements saved')
  await reload(); await text('34.5 in')
})

await step('calendar shows the day and opens it', async () => {
  await go('/calendar')
  await page.getByLabel('Weight logged').first().waitFor()
  await page.getByRole('button', { name: now.toLocaleDateString(undefined, { month: 'long', day: 'numeric' }), exact: true }).click()
  await text('174.6 lb')
})

await step('progress page draws charts for every range', async () => {
  await go('/progress')
  await page.locator('[aria-label^="Weight chart"] svg').waitFor()
  for (const r of ['7 days', '30 days', '12 weeks', 'All time']) { await page.getByRole('tab', { name: r }).click(); await page.locator('[aria-label^="Weight chart"] svg').waitFor() }
  await page.getByRole('tab', { name: 'training' }).click()
  await page.locator('[aria-label="Workouts completed per week"] svg').waitFor()
  assert((await page.getByLabel('Exercise').inputValue()) === 'Chest press machine', 'strength chart exercise missing')
  await page.locator('[aria-label="Top set weight for Chest press machine"] svg').waitFor()
  await page.getByText(/110/).first().waitFor() // personal record from the second session
  await page.getByRole('tab', { name: 'nutrition' }).click()
  await page.locator('[aria-label="Daily calories against target"] svg').waitFor()
  await page.getByRole('tab', { name: 'body' }).click()
  await text('34.5')
  await text('does not estimate body-fat')
  assert(!(await page.getByRole('tab', { name: 'photos' }).count()), 'photos tab should be gone')
})

await step('profile: edits save, change the dashboard, and survive reload', async () => {
  await go('/profile')
  const cal = page.locator('label', { hasText: 'Calories / day' }).locator('input')
  await cal.fill('2100')
  await page.locator('label', { hasText: 'Start date' }).locator('input').fill(back(8))
  await page.getByRole('button', { name: 'Save changes' }).click()
  await toast('Profile saved')
  await go('/'); await text('Week 2'); await text('Day 2'); await text('target 2,100')
})

await step('weekly check-in never changes targets unless edited', async () => {
  await go('/checkin')
  await page.getByRole('button', { name: /Save check-in/i }).click()
  await toast('Check-in saved')
  await text('target 2,100')
})

await step('reminders are optional and appear in-app when enabled', async () => {
  await go('/')
  assert(!(await page.getByText('Measure your waist this week').count()) && !(await page.getByText('Do your weekly check-in').count()), 'reminders should be off by default')
  await go('/profile')
  await page.getByRole('switch', { name: 'Workout', exact: true }).click()
  await page.getByLabel('Workout time').fill('00:01')
  await page.getByLabel('Workout time').blur()
  await go('/')
  const recovery = now.getDay() === 0
  if (!recovery && TODAY !== MON) await text("Today's workout is waiting")
})

await step('export downloads a JSON file with the saved data', async () => {
  await go('/profile')
  let json
  if (ART) {
    await page.getByRole('button', { name: 'Back up data (JSON)' }).click()
    await page.waitForFunction(() => window.__saved?.length === 1)
    json = (await page.evaluate(() => window.__saved))[0].text
  } else {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Back up data (JSON)' }).click()])
    json = ''
    for await (const c of await dl.createReadStream()) json += c
  }
  const j = JSON.parse(json)
  assert(j.weight_entries.length === 2 && j.exercise_sets.length > 10 && j.food_entries.length >= 4 && !('progress_photos' in j), 'export is missing data')
})

if (!ART) await step('PWA manifest and service worker are served', async () => {
  const m = await (await fetch(`${BASE}/manifest.webmanifest`)).json()
  assert(m.display === 'standalone' && m.icons.length >= 2 && m.name === 'LeanTrack', 'bad manifest')
  assert((await fetch(`${BASE}/sw.js`)).ok, 'service worker missing')
  for (const i of m.icons) assert((await fetch(`${BASE}/${i.src}`)).ok, `icon ${i.src} missing`)
})

await step('offline banner appears when the connection drops', async () => {
  await go('/')
  await ctx.setOffline(true)
  await text("You're offline")
  await ctx.setOffline(false)
})

await step('layout fits a phone screen with no sideways scrolling', async () => {
  for (const p of ['/', '/workouts', '/food', '/progress', '/profile', '/calendar', `/day/${TODAY}`, `/session/${MON}`, '/workouts/edit', '/checkin']) {
    await go(p)
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    assert(over <= 1, `${p} overflows horizontally by ${over}px`)
  }
})

await step('delete all data wipes everything', async () => {
  await go('/profile')
  await page.getByRole('button', { name: /Delete all data/ }).click()
  await page.getByRole('dialog').locator('input').fill('DELETE')
  await page.getByRole('button', { name: 'Permanently delete' }).click()
  await page.getByRole('navigation', { name: 'Main' }).waitFor()
  await text('No entries yet'); await text('target 2,150')
  if (ART) {
    const left = await page.evaluate(() => Object.keys(JSON.parse(localStorage.mockdb)).length)
    assert(left === 46, `expected a fresh 46-row seed after wipe, found ${left} rows`)
  }
})

await step('no login screen and no photo features anywhere', async () => {
  await go('/')
  assert(!(await page.getByText(/sign in|password|photo/i).count()), 'login or photo UI still present')
})

await step('no JavaScript errors were logged', async () => {
  const real = errors.filter(e => !/ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(e))
  assert(real.length === 0, real.slice(0, 3).join(' | '))
})

await page.screenshot({ path: 'test-results/home.png' })
await browser.close()
stop()
const failed = results.filter(r => !r[0]).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
