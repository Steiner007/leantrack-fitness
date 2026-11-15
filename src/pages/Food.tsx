import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BookmarkPlus, Copy, Plus, Repeat, Search, Star, Trash2 } from 'lucide-react'
import { Bar, Btn, Card, DateNav, Field, Header, Num, Sheet, Tabs, cx, inputCls, useRun } from '../components/ui'
import { nutritionStats, round, sumMacros } from '../lib/calc'
import { addDays, fmt, today } from '../lib/dates'
import { uid } from '../lib/seed'
import { foodOn, noteFor } from '../lib/select'
import { useStore } from '../lib/store'
import type { FoodEntry, Macros, Meal, MealItem, SavedFood } from '../lib/types'

const MEALS: { key: Meal; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' }, { key: 'lunch', label: 'Lunch' }, { key: 'dinner', label: 'Dinner' }, { key: 'snack', label: 'Snacks' },
]
const kcal = (n: number) => Math.round(n).toLocaleString()
const macroLine = (m: Macros, mult = 1) => `${kcal(m.calories * mult)} kcal · P ${round(m.protein_g * mult)} · C ${round(m.carbs_g * mult)} · F ${round(m.fat_g * mult)}`

export default function Food() {
  const { data, profile, save } = useStore()
  const run = useRun()
  const [params, setParams] = useSearchParams()
  const date = params.get('date') ?? today()
  const setDate = (d: string) => setParams({ date: d }, { replace: true })
  const [addTo, setAddTo] = useState<Meal | null>(null)
  const [editing, setEditing] = useState<FoodEntry | null>(null)
  const [repeat, setRepeat] = useState<Meal | 'all' | null>(null)

  const entries = foodOn(data, date)
  const totals = sumMacros(entries)
  const note = noteFor(data, date)
  const budget = profile.calorie_target + (profile.add_exercise_calories ? note.exercise_calories ?? 0 : 0)
  const wk = nutritionStats(data.food_entries, addDays(date, -6), date, profile.calorie_target, profile.protein_target_g)
  const yesterday = foodOn(data, addDays(date, -1))

  const copyEntries = (src: FoodEntry[], toDate: string, meal?: Meal) =>
    src.map(e => ({ ...e, id: uid(), date: toDate, meal: meal ?? e.meal, created_at: undefined }))
  const copyYesterday = () => run(() => save('food_entries', copyEntries(yesterday, date)), `Copied ${yesterday.length} item${yesterday.length === 1 ? '' : 's'} from yesterday`)
  const saveMeal = (meal: Meal, label: string) => {
    const items = entries.filter(e => e.meal === meal)
    const name = window.prompt('Name this saved meal', `${label} — ${fmt(date)}`)
    if (!name?.trim()) return
    const t = sumMacros(items)
    const mealItems: MealItem[] = items.map(({ name, calories, protein_g, carbs_g, fat_g, servings }) => ({ name, calories, protein_g, carbs_g, fat_g, servings }))
    return run(() => save('saved_foods', { id: uid(), kind: 'meal', name: name.trim(), serving_label: null, ...t, is_favorite: false, items: mealItems, source: 'manual' }), 'Meal saved')
  }

  return (
    <div>
      <Header title="Food" sub="Manual nutrition entry" />
      <DateNav date={date} onChange={setDate} max={addDays(today(), 14)} />

      <Card className="mb-3">
        <div className="flex items-baseline justify-between">
          <span className="text-3xl font-bold tnum">{kcal(totals.calories)}</span>
          <span className={cx('text-sm tnum', budget - totals.calories < 0 ? 'text-warn' : 'text-mute')}>
            {budget - totals.calories >= 0 ? `${kcal(budget - totals.calories)} left of ${kcal(budget)}` : `${kcal(totals.calories - budget)} over ${kcal(budget)}`}
          </span>
        </div>
        <div className="mt-2 mb-3"><Bar value={totals.calories} max={budget} /></div>
        <div className="grid grid-cols-3 gap-3 text-xs">
          {([['Protein', totals.protein_g, profile.protein_target_g, 'bg-sky'], ['Carbs', totals.carbs_g, profile.carb_target_g, 'bg-volt'], ['Fat', totals.fat_g, profile.fat_target_g, 'bg-warn']] as const).map(([l, v, t, c]) => (
            <div key={l}>
              <div className="flex justify-between mb-1"><span className="text-mute">{l}</span><span className="tnum">{Math.round(v)}/{t} g</span></div>
              <Bar value={v} max={t} color={c} />
            </div>
          ))}
        </div>
        {profile.add_exercise_calories && (
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-line/60 text-xs text-mute">
            <span>Exercise calories added back (your own number)</span>
            <Num label="Exercise calories" value={note.exercise_calories} placeholder="0" className="w-20 min-h-[36px] rounded-lg bg-bg border border-line px-2 text-right text-ink"
              onCommit={n => run(() => save('daily_notes', { ...note, exercise_calories: n == null ? null : Math.round(n) }))} />
          </div>
        )}
        <p className="text-xs text-mute mt-3 pt-3 border-t border-line/60 tnum">
          7-day average: {wk.avgCalories == null ? 'no days logged' : `${kcal(wk.avgCalories)} kcal · ${Math.round(wk.avgProtein!)} g protein (${wk.daysLogged} day${wk.daysLogged === 1 ? '' : 's'} logged)`}
        </p>
      </Card>

      <div className="flex gap-2 mb-3">
        <Btn className="flex-1" disabled={!yesterday.length} onClick={copyYesterday}><Copy size={16} /> Copy yesterday</Btn>
        <Btn className="flex-1" disabled={!entries.length} onClick={() => setRepeat('all')}><Repeat size={16} /> Repeat day</Btn>
      </div>

      {MEALS.map(m => {
        const list = entries.filter(e => e.meal === m.key)
        const t = sumMacros(list)
        return (
          <Card key={m.key} className="mb-3 !p-0 overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <div><span className="font-semibold">{m.label}</span>{list.length > 0 && <span className="text-xs text-mute ml-2 tnum">{kcal(t.calories)} kcal · {Math.round(t.protein_g)} g P</span>}</div>
              {list.length > 0 && (
                <div className="flex">
                  <button aria-label={`Save ${m.label} as a meal`} onClick={() => saveMeal(m.key, m.label)} className="h-10 w-10 grid place-items-center text-mute"><BookmarkPlus size={17} /></button>
                  <button aria-label={`Repeat ${m.label} on other days`} onClick={() => setRepeat(m.key)} className="h-10 w-10 grid place-items-center text-mute"><Repeat size={17} /></button>
                </div>
              )}
            </div>
            {list.map(e => (
              <button key={e.id} onClick={() => setEditing(e)} className="w-full flex items-center justify-between gap-3 px-4 min-h-[52px] border-t border-line/60 text-left active:bg-raised">
                <div className="min-w-0"><div className="text-sm truncate">{e.name}</div><div className="text-xs text-mute tnum">{e.servings !== 1 ? `${e.servings} × · ` : ''}P {round(e.protein_g * e.servings)} · C {round(e.carbs_g * e.servings)} · F {round(e.fat_g * e.servings)}</div></div>
                <span className="text-sm tnum shrink-0">{kcal(e.calories * e.servings)}</span>
              </button>
            ))}
            <button onClick={() => setAddTo(m.key)} className="w-full min-h-[48px] border-t border-line/60 text-sm text-volt inline-flex items-center justify-center gap-1.5"><Plus size={16} /> Add to {m.label.toLowerCase()}</button>
          </Card>
        )
      })}
      <p className="text-[11px] text-mute">All nutrition values are entered by you (for example from a package label). LeanTrack does not look up, estimate or invent nutrition data.{!profile.add_exercise_calories && ' Exercise calories are not added back to your budget.'}</p>

      <AddSheet meal={addTo} date={date} onClose={() => setAddTo(null)} />
      <EditSheet entry={editing} onClose={() => setEditing(null)} />
      <RepeatSheet open={repeat != null} date={date} label={repeat === 'all' ? 'this day' : MEALS.find(m => m.key === repeat)?.label.toLowerCase() ?? ''}
        onClose={() => setRepeat(null)}
        onSave={dates => {
          const src = repeat === 'all' ? entries : entries.filter(e => e.meal === repeat)
          return run(() => save('food_entries', dates.flatMap(d => copyEntries(src, d))), `Repeated on ${dates.length} day${dates.length === 1 ? '' : 's'}`)
        }} />
    </div>
  )
}

const blank = { name: '', serving_label: '', calories: null as number | null, protein_g: null as number | null, carbs_g: null as number | null, fat_g: null as number | null }

function AddSheet({ meal, date, onClose }: { meal: Meal | null; date: string; onClose: () => void }) {
  const { data, save, remove } = useStore()
  const run = useRun()
  const [tab, setTab] = useState<'search' | 'fav' | 'meals' | 'new'>('search')
  const [q, setQ] = useState('')
  const [f, setF] = useState(blank)
  const [servings, setServings] = useState<number | null>(1)
  const [keep, setKeep] = useState(true)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (meal) { setQ(''); setF(blank); setServings(1); setKeep(true); setTab(data.saved_foods.length || data.food_entries.length ? 'search' : 'new') } }, [meal])

  // Saved foods plus anything logged before (most recent version of each name).
  const library = useMemo(() => {
    const saved = data.saved_foods.filter(s => s.kind === 'food')
    const names = new Set(saved.map(s => s.name.toLowerCase()))
    const past: SavedFood[] = []
    for (const e of [...data.food_entries].sort((a, b) => b.date.localeCompare(a.date))) {
      if (names.has(e.name.toLowerCase())) continue
      names.add(e.name.toLowerCase())
      past.push({ id: 'past-' + e.id, kind: 'food', name: e.name, serving_label: null, calories: e.calories, protein_g: e.protein_g, carbs_g: e.carbs_g, fat_g: e.fat_g, is_favorite: false, items: [], source: 'manual' })
    }
    return [...saved.sort((a, b) => a.name.localeCompare(b.name)), ...past]
  }, [data.saved_foods, data.food_entries])
  const meals = data.saved_foods.filter(s => s.kind === 'meal')
  const shown = (tab === 'fav' ? library.filter(s => s.is_favorite) : library).filter(s => s.name.toLowerCase().includes(q.trim().toLowerCase()))
  if (!meal) return null

  const entryFrom = (s: Macros & { name: string }, n = 1, savedId: string | null = null): FoodEntry =>
    ({ id: uid(), date, meal: meal!, name: s.name, calories: s.calories, protein_g: s.protein_g, carbs_g: s.carbs_g, fat_g: s.fat_g, servings: n, saved_food_id: savedId, source: 'manual' })
  const addSaved = async (s: SavedFood) => { if (await run(() => save('food_entries', entryFrom(s, 1, s.id.startsWith('past-') ? null : s.id)), `${s.name} added`)) onClose() }
  const addMeal = async (s: SavedFood) => { if (await run(() => save('food_entries', s.items.map(i => entryFrom(i, i.servings))), `${s.name} added`)) onClose() }
  const valid = f.name.trim() && f.calories != null && servings != null && servings > 0
  async function addNew() {
    setBusy(true)
    const macros = { calories: f.calories ?? 0, protein_g: f.protein_g ?? 0, carbs_g: f.carbs_g ?? 0, fat_g: f.fat_g ?? 0 }
    const ok = await run(async () => {
      let savedId: string | null = null
      if (keep) {
        savedId = uid()
        await save('saved_foods', { id: savedId, kind: 'food', name: f.name.trim(), serving_label: f.serving_label.trim() || null, ...macros, is_favorite: false, items: [], source: 'manual' })
      }
      await save('food_entries', entryFrom({ name: f.name.trim(), ...macros }, servings!, savedId))
    }, 'Food added')
    setBusy(false)
    if (ok) onClose()
  }

  return (
    <Sheet open onClose={onClose} title={`Add to ${MEALS.find(m => m.key === meal)!.label.toLowerCase()}`}>
      <Tabs value={tab} onChange={setTab} options={[{ value: 'search', label: 'My foods' }, { value: 'fav', label: 'Favorites' }, { value: 'meals', label: 'Meals' }, { value: 'new', label: 'New' }]} />
      <div className="mt-3 min-h-[45vh]">
        {(tab === 'search' || tab === 'fav') && (
          <>
            <div className="relative mb-2">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
              <input className={inputCls + ' pl-9'} placeholder="Search foods you've entered" value={q} onChange={e => setQ(e.target.value)} aria-label="Search foods" />
            </div>
            {shown.length === 0 && <p className="text-sm text-mute text-center py-6">{tab === 'fav' ? 'No favorites yet. Tap the star on a saved food.' : library.length ? 'No matches.' : "Nothing saved yet. Use the New tab to enter a food's nutrition."}</p>}
            {shown.map(s => {
              const real = !s.id.startsWith('past-')
              return (
                <div key={s.id} className="flex items-center border-b border-line/60">
                  <button onClick={() => addSaved(s)} className="flex-1 min-w-0 text-left py-2.5 min-h-[52px]">
                    <div className="text-sm truncate">{s.name}{s.serving_label ? <span className="text-mute"> · {s.serving_label}</span> : null}</div>
                    <div className="text-xs text-mute tnum">{macroLine(s)}{!real && ' · logged before'}</div>
                  </button>
                  <button aria-label={s.is_favorite ? `Unfavorite ${s.name}` : `Favorite ${s.name}`} className="h-11 w-10 grid place-items-center"
                    onClick={() => run(() => save('saved_foods', real ? { ...s, is_favorite: !s.is_favorite } : { ...s, id: uid(), is_favorite: true }))}>
                    <Star size={18} className={s.is_favorite ? 'text-warn fill-warn' : 'text-mute'} />
                  </button>
                  {real && <button aria-label={`Delete saved food ${s.name}`} className="h-11 w-9 grid place-items-center text-mute" onClick={() => window.confirm(`Remove ${s.name} from your saved foods? Logged entries are kept.`) && run(() => remove('saved_foods', s.id))}><Trash2 size={16} /></button>}
                </div>
              )
            })}
          </>
        )}
        {tab === 'meals' && (meals.length === 0 ? <p className="text-sm text-mute text-center py-6">No saved meals yet. Log a meal, then tap the bookmark icon beside it.</p> : meals.map(s => (
          <div key={s.id} className="flex items-center border-b border-line/60">
            <button onClick={() => addMeal(s)} className="flex-1 min-w-0 text-left py-2.5 min-h-[52px]">
              <div className="text-sm truncate">{s.name}</div>
              <div className="text-xs text-mute tnum">{s.items.length} item{s.items.length === 1 ? '' : 's'} · {macroLine(s)}</div>
            </button>
            <button aria-label={`Delete saved meal ${s.name}`} className="h-11 w-9 grid place-items-center text-mute" onClick={() => window.confirm(`Delete saved meal ${s.name}?`) && run(() => remove('saved_foods', s.id))}><Trash2 size={16} /></button>
          </div>
        )))}
        {tab === 'new' && (
          <>
            <p className="text-xs text-warn bg-warn/10 border border-warn/30 rounded-lg px-3 py-2 mb-3">Manual entry — type the values from the package label or another source you trust. Nothing is looked up or estimated.</p>
            <Field label="Food name"><input className={inputCls} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="e.g. Greek yogurt, plain" /></Field>
            <Field label="Serving size (optional)"><input className={inputCls} value={f.serving_label} onChange={e => setF({ ...f, serving_label: e.target.value })} placeholder="e.g. 1 cup (227 g)" /></Field>
            <div className="grid grid-cols-2 gap-x-3">
              <Field label="Calories per serving"><Num live label="Calories" value={f.calories} onCommit={n => setF(v => ({ ...v, calories: n }))} /></Field>
              <Field label="Protein (g)"><Num live label="Protein" value={f.protein_g} onCommit={n => setF(v => ({ ...v, protein_g: n }))} /></Field>
              <Field label="Carbs (g)"><Num live label="Carbs" value={f.carbs_g} onCommit={n => setF(v => ({ ...v, carbs_g: n }))} /></Field>
              <Field label="Fat (g)"><Num live label="Fat" value={f.fat_g} onCommit={n => setF(v => ({ ...v, fat_g: n }))} /></Field>
              <Field label="Servings eaten"><Num live label="Servings" value={servings} onCommit={setServings} /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm mb-3 min-h-[44px]"><input type="checkbox" checked={keep} onChange={e => setKeep(e.target.checked)} className="h-5 w-5 accent-[#b9f04a]" /> Save to my foods for next time</label>
            <Btn variant="primary" full busy={busy} disabled={!valid} onClick={addNew}>Add food</Btn>
          </>
        )}
      </div>
    </Sheet>
  )
}

function EditSheet({ entry, onClose }: { entry: FoodEntry | null; onClose: () => void }) {
  const { save, remove } = useStore()
  const run = useRun()
  const [e, setE] = useState<FoodEntry | null>(entry)
  useEffect(() => setE(entry), [entry])
  if (!entry || !e) return null
  const step = (d: number) => setE({ ...e, servings: Math.max(0.25, round(e.servings + d, 2)) })
  return (
    <Sheet open onClose={onClose} title="Edit food">
      <Field label="Name"><input className={inputCls} value={e.name} onChange={ev => setE({ ...e, name: ev.target.value })} /></Field>
      <div className="mb-3">
        <span className="block text-xs text-mute mb-1">Portion (servings)</span>
        <div className="flex gap-2 items-center">
          <Btn onClick={() => step(-0.25)} aria-label="Less">−¼</Btn>
          <Num live label="Servings" value={e.servings} onCommit={n => n && n > 0 && setE({ ...e, servings: n })} className={inputCls + ' text-center flex-1'} />
          <Btn onClick={() => step(0.25)} aria-label="More">+¼</Btn>
        </div>
        <p className="text-xs text-mute mt-1 tnum">Total: {macroLine(e, e.servings)}</p>
      </div>
      <div className="grid grid-cols-2 gap-x-3">
        <Field label="Calories per serving"><Num live value={e.calories} onCommit={n => setE(v => v && { ...v, calories: n ?? 0 })} /></Field>
        <Field label="Protein (g)"><Num live value={e.protein_g} onCommit={n => setE(v => v && { ...v, protein_g: n ?? 0 })} /></Field>
        <Field label="Carbs (g)"><Num live value={e.carbs_g} onCommit={n => setE(v => v && { ...v, carbs_g: n ?? 0 })} /></Field>
        <Field label="Fat (g)"><Num live value={e.fat_g} onCommit={n => setE(v => v && { ...v, fat_g: n ?? 0 })} /></Field>
      </div>
      <Field label="Meal">
        <select className={inputCls} value={e.meal} onChange={ev => setE({ ...e, meal: ev.target.value as Meal })}>{MEALS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}</select>
      </Field>
      <Btn variant="primary" full disabled={!e.name.trim()} onClick={async () => { if (await run(() => save('food_entries', e), 'Food updated')) onClose() }}>Save changes</Btn>
      <Btn variant="ghost" full className="mt-2" onClick={async () => { if (await run(() => remove('food_entries', entry.id), 'Food deleted')) onClose() }}>Delete</Btn>
    </Sheet>
  )
}

function RepeatSheet({ open, date, label, onClose, onSave }: { open: boolean; date: string; label: string; onClose: () => void; onSave: (dates: string[]) => Promise<boolean> }) {
  const [picked, setPicked] = useState<string[]>([])
  useEffect(() => { if (open) setPicked([]) }, [open])
  const options = Array.from({ length: 14 }, (_, i) => addDays(date, i + 1))
  return (
    <Sheet open={open} onClose={onClose} title={`Repeat ${label}`}>
      <p className="text-xs text-mute mb-3">Copy these entries onto other days. You can edit each day afterwards.</p>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {options.map(d => {
          const on = picked.includes(d)
          return <button key={d} aria-pressed={on} onClick={() => setPicked(on ? picked.filter(x => x !== d) : [...picked, d])}
            className={cx('min-h-[44px] rounded-xl border text-sm', on ? 'bg-volt text-black border-volt font-semibold' : 'bg-raised border-line')}>{fmt(d, { weekday: 'short', month: 'short', day: 'numeric' })}</button>
        })}
      </div>
      <Btn variant="primary" full disabled={!picked.length} onClick={async () => { if (await onSave(picked)) onClose() }}>Repeat on {picked.length || ''} day{picked.length === 1 ? '' : 's'}</Btn>
    </Sheet>
  )
}
