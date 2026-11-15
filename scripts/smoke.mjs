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
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { chromium } from 'playwright-core'

// SMOKE_TARGET=artifact tests the Claude-hosted build (dist-artifact) against a stand-in for Claude's storage.
const ART = process.env.SMOKE_TARGET === 'artifact'
const PORT = 4179
const BASE = `http://localhost:${PORT}`
const exe = process.env.CHROME_PATH || ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(existsSync)
if (!exe) { console.error('No Chrome found. Set CHROME_PATH.'); process.exit(2) }

// --- tiny PNG writer so the test has real images to upload ---
function png(w, h, [r, g, b]) {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc = buf => { let c = 0xffffffff; for (const x of buf) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())])
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(Array(h).fill(row)))), chunk('IEND', Buffer.alloc(0))])
}
mkdirSync('test-results', { recursive: true })
writeFileSync('test-results/a.png', png(1800, 2400, [200, 60, 60]))  // larger than the 1600px cap
writeFileSync('test-results/b.png', png(600, 800, [60, 60, 200]))

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
      assets: {
        upload: blob => new Promise(res => { const r = new FileReader(); r.onload = () => { const id = Math.random().toString(16).slice(2).padEnd(32, '0'); const a = load('mockassets'); a[id] = r.result; store('mockassets', a); res({ id, url: '/_blob/' + id }) }; r.readAsDataURL(blob) }),
        delete: async id => { const a = load('mockassets'); const had = id in a; delete a[id]; store('mockassets', a); return { deleted: had } },
      },
      downloads: { save: async ({ filename, data }) => { (window.__saved ??= []).push({ filename, text: typeof data === 'string' ? data : await data.text() }); return { status: 'saved' } } },
    }
    window.claude = { use: name => new Promise(r => setTimeout(() => r(caps[name] ?? null), 30)) }
  })
  await page.route('**/_blob/*', async route => {
    const id = route.request().url().split('/').pop()
    const d = await page.evaluate(i => JSON.parse(localStorage.getItem('mockassets') || '{}')[i], id)
    if (!d) return route.fulfill({ status: 404 })
    route.fulfill({ contentType: 'image/jpeg', body: Buffer.from(d.split(',')[1], 'base64') })
  })
}

console.log(`LeanTrack smoke test (${exe})`)

await step('dashboard loads with program week, targets and action buttons', async () => {
  await go('/')
  await text('Week 1')
  await text('Phase 1: Consistency')
  for (const b of ['Start Workout', 'Log Food', 'Log Weight', 'Add Progress Photo', 'View Progress']) await page.getByRole('button', { name: b }).waitFor()
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
  await go('/'); await page.getByRole('button', { name: 'Add Progress Photo' }).click(); await page.getByRole('heading', { name: 'Progress photos' }).waitFor()
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

async function addPhoto(date, label, file) {
  await go(`/photos?date=${date}`)
  await page.getByLabel(`Add ${label} gallery`).setInputFiles(file)
  await toast('Photo saved')
}
const loaded = sel => page.waitForFunction(a => { const i = document.querySelector(`img[alt="${a}"]`); return i && i.complete && i.naturalWidth > 0 ? [i.naturalWidth, i.naturalHeight] : false }, sel, { timeout: 8000 }).then(h => h.jsonValue())

await step('photos: upload, view again after reload, proportions preserved and large files resized', async () => {
  await addPhoto(back(3), 'Front', 'test-results/a.png')
  const [w, h] = await loaded('Front photo')
  assert(w === 1200 && h === 1600, `expected 1200x1600 after resize, got ${w}x${h}`)
  await addPhoto(TODAY, 'Front', 'test-results/b.png')
  await addPhoto(TODAY, 'Side', 'test-results/b.png')
  await reload()
  const [w2, h2] = await loaded('Front photo')
  assert(w2 === 600 && h2 === 800, `small photo should be untouched, got ${w2}x${h2}`)
  await page.getByLabel('Has photos').first().waitFor() // calendar camera indicator
  await text('174.6 lb')                                // weight shown for the selected date
  await page.getByRole('button', { name: 'View Front photo' }).click()
  await page.getByRole('dialog', { name: 'Photo full screen' }).waitFor()
  await page.getByRole('button', { name: 'Close' }).click()
})

await step('photos: replace and delete', async () => {
  await page.getByLabel('Replace Side gallery').setInputFiles('test-results/a.png')
  await toast('Photo replaced')
  const [w] = await loaded('Side photo'); assert(w === 1200, 'replacement not shown')
  assert((await page.locator('img[alt="Side photo"]').count()) === 1, 'old photo still present after replace')
  await page.getByRole('button', { name: 'Delete' }).nth(1).click()
  await confirmDlg('Delete')
  await toast('Photo deleted')
  await reload()
  assert((await page.locator('img[alt="Side photo"]').count()) === 0, 'deleted photo came back')
  await go('/'); await text('1 added')
})

await step('photos: before/after comparison side by side, slider and full screen', async () => {
  await go('/compare')
  await loaded('Before front photo'); await loaded('After front photo')
  await text('175.4 lb'); await text('174.6 lb') // weight under each photo
  await page.getByRole('tab', { name: 'Slider' }).click()
  await loaded('Before photo'); await loaded('After photo')
  await page.getByLabel('Before and after slider position').waitFor({ state: 'attached' })
  await page.getByRole('button', { name: 'Full screen' }).click()
  await page.getByRole('dialog', { name: 'Full screen comparison' }).waitFor()
  await page.getByRole('button', { name: 'Exit full screen' }).click()
  await page.getByRole('tab', { name: 'Side', exact: true }).click()
  await text('No side photo')
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
  await page.getByLabel('Photos').first().waitFor()
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
  await page.getByRole('tab', { name: 'photos' }).click()
  await page.locator('img[alt]').first().waitFor()
  await text('does not estimate body-fat')
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
  let json, zipName
  if (ART) {
    await page.getByRole('button', { name: 'Data (JSON)' }).click()
    await page.waitForFunction(() => window.__saved?.length === 1)
    await page.getByRole('button', { name: 'Data + photos' }).click()
    await page.waitForFunction(() => window.__saved?.length === 2)
    const saved = await page.evaluate(() => window.__saved)
    json = saved[0].text; zipName = saved[1].filename
  } else {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Data (JSON)' }).click()])
    json = ''
    for await (const c of await dl.createReadStream()) json += c
    const [zip] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Data + photos' }).click()])
    zipName = zip.suggestedFilename()
  }
  const j = JSON.parse(json)
  assert(j.weight_entries.length === 2 && j.exercise_sets.length > 10 && j.progress_photos.length === 2 && j.food_entries.length >= 4, 'export is missing data')
  assert(zipName.endsWith('.zip'), 'photo export should be a zip')
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
  for (const p of ['/', '/workouts', '/food', '/progress', '/profile', '/photos', '/calendar', `/session/${MON}`, '/workouts/edit', '/compare']) {
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
    const left = await page.evaluate(() => [Object.keys(JSON.parse(localStorage.mockassets || '{}')).length, Object.keys(JSON.parse(localStorage.mockdb)).length])
    assert(left[0] === 0, 'photos were not deleted from storage')
    assert(left[1] === 47, `expected a fresh 47-row seed after wipe, found ${left[1]} rows`)
  }
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
