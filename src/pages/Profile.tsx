import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CalendarDays, ChevronRight, ClipboardCheck, Download, ListChecks, LogOut, Trash2 } from 'lucide-react'
import JSZip from 'jszip'
import { Btn, Card, Field, Header, Num, Sheet, Tabs, Toggle, inputCls, useRun, useToast } from '../components/ui'
import { PHASES, programPos } from '../lib/calc'
import { DAY_NAMES, addDays, fmt, today } from '../lib/dates'
import { REMINDER_DEFAULTS } from '../lib/seed'
import { useStore } from '../lib/store'
import { ARTIFACT, saveFile } from '../lib/claudeBackend'
import { TABLES, type Profile as P, type Reminder } from '../lib/types'

type TextKey = 'sex' | 'age_range' | 'activity_level' | 'experience' | 'gym' | 'workout_duration' | 'training_schedule' | 'main_goal'
const TEXT_FIELDS: { key: TextKey; label: string }[] = [
  { key: 'sex', label: 'Sex' }, { key: 'age_range', label: 'Age range' },
  { key: 'activity_level', label: 'Activity level' }, { key: 'experience', label: 'Fitness experience' },
  { key: 'gym', label: 'Primary gym' }, { key: 'workout_duration', label: 'Workout duration' },
  { key: 'training_schedule', label: 'Training schedule' }, { key: 'main_goal', label: 'Main goal' },
]
type NumKey = 'calorie_target' | 'protein_target_g' | 'fat_target_g' | 'carb_target_g' | 'water_target_oz' | 'step_target'
const TARGET_FIELDS: { key: NumKey; label: string }[] = [
  { key: 'calorie_target', label: 'Calories / day' }, { key: 'protein_target_g', label: 'Protein (g)' },
  { key: 'fat_target_g', label: 'Fat (g)' }, { key: 'carb_target_g', label: 'Carbs (g)' },
  { key: 'water_target_oz', label: 'Water (oz)' }, { key: 'step_target', label: 'Steps' },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <Card className="mb-3"><h2 className="text-[11px] uppercase tracking-wide text-mute mb-3">{title}</h2>{children}</Card>
}
const LinkRow = ({ to, icon: Icon, label }: { to: string; icon: typeof CalendarDays; label: string }) => (
  <Link to={to} className="flex items-center gap-3 min-h-[48px] border-b border-line/50 last:border-0 text-sm">
    <Icon size={18} className="text-mute" /> <span className="flex-1">{label}</span> <ChevronRight size={18} className="text-mute" />
  </Link>
)

export default function Profile() {
  const { data, profile, program, backend, email, save, signOut, reload } = useStore()
  const nav = useNavigate()
  const run = useRun()
  const toast = useToast()
  const [p, setP] = useState<P>(profile)
  const [start, setStart] = useState(program.start_date)
  const [weeks, setWeeks] = useState<number | null>(program.weeks)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [typed, setTyped] = useState('')
  useEffect(() => setP(profile), [profile])
  useEffect(() => { setStart(program.start_date); setWeeks(program.weeks) }, [program])

  const dirty = JSON.stringify(p) !== JSON.stringify(profile) || start !== program.start_date || weeks !== program.weeks
  const numsOk = p.height_in > 0 && p.start_weight_lb > 0 && p.goal_weight_lb > 0 && TARGET_FIELDS.every(f => p[f.key] >= 0) && !!weeks && weeks >= 1 && weeks <= 104
  const macroCals = p.protein_target_g * 4 + p.carb_target_g * 4 + p.fat_target_g * 9
  const pos = programPos(start, today(), weeks ?? 12)
  const setNum = (key: keyof P, int = false) => (n: number | null) => setP(v => ({ ...v, [key]: n == null ? 0 : int ? Math.round(n) : n }))
  const setNullable = (key: 'later_goal_low_lb' | 'later_goal_high_lb') => (n: number | null) => setP(v => ({ ...v, [key]: n }))

  async function saveAll() {
    setBusy('save')
    await run(async () => {
      await save('profiles', p)
      if (start !== program.start_date || weeks !== program.weeks) await save('programs', { ...program, start_date: start, weeks: Math.round(weeks!) })
    }, 'Profile saved')
    setBusy(null)
  }

  const reminder = (kind: Reminder['kind']) => data.reminder_preferences.find(r => r.kind === kind)
  const saveReminder = (r: Reminder, patch: Partial<Reminder>) => run(() => save('reminder_preferences', { ...r, ...patch }))

  const download = saveFile
  const exportJson = () => JSON.stringify({ app: 'LeanTrack', exported_at: new Date().toISOString(), ...Object.fromEntries(TABLES.map(t => [t, data[t]])) }, null, 2)
  async function exportData(withPhotos: boolean) {
    setBusy(withPhotos ? 'zip' : 'json')
    try {
      if (!withPhotos) await download(new Blob([exportJson()], { type: 'application/json' }), `leantrack-${today()}.json`)
      else {
        const zip = new JSZip()
        zip.file('leantrack-data.json', exportJson())
        let missed = 0
        for (const ph of data.progress_photos) {
          try { zip.file(`photos/${ph.date}_${ph.pose}_${ph.id.slice(0, 8)}.jpg`, await backend.photoBlob(ph.storage_path)) } catch { missed++ }
        }
        await download(await zip.generateAsync({ type: 'blob' }), `leantrack-${today()}.zip`)
        if (missed) toast(`${missed} photo${missed === 1 ? '' : 's'} could not be downloaded and ${missed === 1 ? 'is' : 'are'} missing from the export.`, 'err')
      }
    } catch (e) {
      toast(`Export failed. ${e instanceof Error ? e.message : ''}`, 'err')
    }
    setBusy(null)
  }
  async function deleteAll() {
    setBusy('delete')
    const ok = await run(() => backend.deleteEverything(data.progress_photos.map(ph => ph.storage_path)))
    setBusy(null)
    if (ok) { setConfirmDelete(false); nav('/'); reload() }
  }

  return (
    <div>
      <Header title="Profile" sub={backend.mode === 'supabase' ? email ?? undefined : backend.mode === 'claude' ? 'Saved to your Claude account' : 'Local mode — data stays on this device'} />

      <Card className="mb-3 !py-1">
        <LinkRow to="/checkin" icon={ClipboardCheck} label="Weekly check-in" />
        <LinkRow to="/calendar" icon={CalendarDays} label="Calendar and daily history" />
        <LinkRow to="/workouts/edit" icon={ListChecks} label="Edit workout schedule" />
      </Card>

      <Section title="Program">
        <div className="grid grid-cols-2 gap-x-3">
          <Field label="Start date"><input type="date" className={inputCls} value={start} onChange={e => e.target.value && setStart(e.target.value)} /></Field>
          <Field label="Length (weeks)"><Num live value={weeks} onCommit={n => setWeeks(n == null ? null : Math.round(n))} label="Program length in weeks" /></Field>
        </div>
        <p className="text-xs text-mute mb-3">
          {pos.status === 'active' ? `Week ${pos.week}, day ${pos.day}` : pos.status === 'before' ? `Starts in ${pos.daysUntilStart} days` : 'Complete'}
          {weeks ? ` · ends ${fmt(addDays(start, weeks * 7 - 1), { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
        </p>
        <ol className="space-y-2">
          {PHASES.map(ph => (
            <li key={ph.n} className={`rounded-xl border px-3 py-2 ${pos.phase?.n === ph.n ? 'border-volt/60 bg-volt/5' : 'border-line/60'}`}>
              <div className="text-sm font-medium">{ph.name} <span className="text-xs text-mute font-normal">· {ph.weeks}</span></div>
              <div className="text-xs text-mute">{ph.focus.join(' · ')}</div>
            </li>
          ))}
        </ol>
        <p className="text-xs text-mute mt-3">Target pace is about 0.75–1 lb per week. Visible abs depend on body-fat level and genetics, so the app tracks your trend rather than promising a date.</p>
      </Section>

      <Section title="Goals">
        <div className="grid grid-cols-2 gap-x-3">
          <Field label="Starting weight (lb)"><Num live value={p.start_weight_lb} onCommit={setNum('start_weight_lb')} /></Field>
          <Field label="Goal weight (lb)"><Num live value={p.goal_weight_lb} onCommit={setNum('goal_weight_lb')} /></Field>
          <Field label="Later goal, low (lb)"><Num live value={p.later_goal_low_lb} onCommit={setNullable('later_goal_low_lb')} placeholder="Optional" /></Field>
          <Field label="Later goal, high (lb)"><Num live value={p.later_goal_high_lb} onCommit={setNullable('later_goal_high_lb')} placeholder="Optional" /></Field>
          <Field label="Height (in)"><Num live value={p.height_in} onCommit={setNum('height_in')} /></Field>
          <div className="mb-3">
            <span className="block text-xs text-mute mb-1">Display weight in</span>
            <Tabs value={p.weight_unit} onChange={u => setP(v => ({ ...v, weight_unit: u }))} options={[{ value: 'lb', label: 'lb' }, { value: 'kg', label: 'kg' }]} />
          </div>
        </div>
        <p className="text-xs text-mute">The later goal is a possibility to reassess at the end of the program, not a commitment.</p>
      </Section>

      <Section title="Daily targets">
        <div className="grid grid-cols-2 gap-x-3">
          {TARGET_FIELDS.map(f => <Field key={f.key} label={f.label}><Num live value={p[f.key]} onCommit={setNum(f.key, true)} /></Field>)}
        </div>
        <p className="text-xs text-mute mb-3">
          These are editable starting estimates, not a measured maintenance calculation. Your macros add up to {macroCals.toLocaleString()} kcal
          {Math.abs(macroCals - p.calorie_target) > 50 ? `, which is ${Math.abs(macroCals - p.calorie_target)} ${macroCals > p.calorie_target ? 'above' : 'below'} your calorie target.` : '.'}
        </p>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="text-sm">Add exercise calories to food budget</div>
            <div className="text-xs text-mute">Off by default. When on, calories you enter manually for a day are added to that day's target.</div>
          </div>
          <Toggle on={p.add_exercise_calories} onChange={v => setP(x => ({ ...x, add_exercise_calories: v }))} label="Add exercise calories to food budget" />
        </div>
      </Section>

      <Section title="About you">
        {TEXT_FIELDS.map(f => (
          <Field key={f.key} label={f.label}>
            <input className={inputCls} value={p[f.key] ?? ''} onChange={e => setP(v => ({ ...v, [f.key]: e.target.value }))} />
          </Field>
        ))}
      </Section>

      <Section title="Reminders">
        {REMINDER_DEFAULTS.map(def => {
          const r = reminder(def.kind)
          if (!r) return null
          return (
            <div key={def.kind} className="py-2 border-b border-line/50 last:border-0">
              <div className="flex items-center gap-3">
                <span className="flex-1 text-sm">{def.label}</span>
                <Toggle on={r.enabled} onChange={v => saveReminder(r, { enabled: v })} label={def.label} />
              </div>
              {r.enabled && (
                <div className="flex gap-2 mt-2">
                  <input type="time" aria-label={`${def.label} time`} className={inputCls} value={r.time_of_day} onChange={e => e.target.value && saveReminder(r, { time_of_day: e.target.value })} />
                  {def.weekday != null && (
                    <select aria-label={`${def.label} day`} className={inputCls} value={r.weekday ?? 0} onChange={e => saveReminder(r, { weekday: Number(e.target.value) })}>
                      {DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}
                    </select>
                  )}
                </div>
              )}
            </div>
          )
        })}
        <p className="text-xs text-mute mt-3">Reminders appear on the Home screen once their time has passed and the item isn't done. They are in-app only: this app doesn't send push notifications, so nothing arrives while it's closed.</p>
      </Section>

      <Section title="Your data">
        <div className="grid grid-cols-2 gap-2">
          <Btn busy={busy === 'json'} onClick={() => exportData(false)}><Download size={16} /> Data (JSON)</Btn>
          <Btn busy={busy === 'zip'} onClick={() => exportData(true)}><Download size={16} /> Data + photos</Btn>
        </div>
        <p className="text-xs text-mute my-3">
          {backend.mode === 'supabase'
            ? 'Photos are kept in a private bucket and shown through links that expire after an hour.'
            : backend.mode === 'claude' ? 'Your entries are saved to your private space in this Claude artifact. Photos are stored with the artifact itself, so keep it unshared.'
            : 'Local mode: everything is stored in this browser only. Export regularly; clearing site data erases it.'}
        </p>
        {backend.mode === 'supabase' && <Btn full className="mb-2" onClick={() => signOut()}><LogOut size={16} /> Sign out</Btn>}
        <Btn full variant="danger" onClick={() => { setTyped(''); setConfirmDelete(true) }}><Trash2 size={16} /> Delete {backend.mode === 'supabase' ? 'account and all data' : 'all data'}</Btn>
      </Section>

      {backend.mode === 'local' && (
        <Section title="Where your data lives">
          <p className="text-sm leading-relaxed">This version saves everything, photos included, on this phone only. Nothing goes to a server, so it won't appear on other devices and deleting the app or clearing Safari's website data erases it. Use "Data + photos" above now and then as a backup.</p>
        </Section>
      )}

      <Section title="Install on your phone">
        <p className="text-sm leading-relaxed">{ARTIFACT && 'This hosted version runs inside Claude and cannot be installed; the deployed version can. '}iPhone: open this site in Safari, tap Share, then "Add to Home Screen". Android: open it in Chrome, tap the menu, then "Install app".</p>
      </Section>

      {dirty && (
        <div className="fixed bottom-[76px] inset-x-0 z-20 px-4 safe-b pointer-events-none">
          <div className="mx-auto max-w-lg flex gap-2 pointer-events-auto rounded-2xl bg-raised border border-line p-2 shadow-xl">
            <Btn className="flex-1" onClick={() => { setP(profile); setStart(program.start_date); setWeeks(program.weeks) }}>Discard</Btn>
            <Btn className="flex-1" variant="primary" busy={busy === 'save'} disabled={!numsOk} onClick={saveAll}>Save changes</Btn>
          </div>
        </div>
      )}

      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete everything?">
        <p className="text-sm leading-relaxed mb-3">
          This permanently deletes your workouts, food log, weights, measurements, notes and all progress photos{backend.mode === 'supabase' ? ', and your login' : ''}. It cannot be undone. Export first if you want a copy.
        </p>
        <Field label='Type DELETE to confirm'><input className={inputCls} value={typed} autoCapitalize="characters" onChange={e => setTyped(e.target.value)} /></Field>
        <Btn full variant="danger" busy={busy === 'delete'} disabled={typed.trim() !== 'DELETE'} onClick={deleteAll}>Permanently delete</Btn>
      </Sheet>
    </div>
  )
}
