import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bar as RBar, BarChart, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CalendarDays, ClipboardCheck, Columns2, Plus } from 'lucide-react'
import { PhotoImg } from '../components/photo'
import { MeasureSheet, WeightSheet } from '../components/sheets'
import { Btn, Card, Empty, Header, Stat, Tabs, Toggle, inputCls } from '../components/ui'
import { lbToKg, lowerIsBetter, nutritionStats, personalBests, round, showWeight, sumMacros, weightSeries, weightTrend } from '../lib/calc'
import { addDays, diffDays, fmt, range, today, weekStart } from '../lib/dates'
import { datedSets } from '../lib/select'
import { useStore } from '../lib/store'

type Range = '7' | '30' | '84' | 'all'
type Section = 'weight' | 'body' | 'training' | 'nutrition' | 'photos'
// One series hue plus a neutral; targets are labelled reference lines, so nothing relies on colour alone.
const C = { series: '#4db8f0', raw: '#8a97a8', grid: '#273140', ref: '#eef2f6' }
const axis = { stroke: C.grid, tick: { fill: '#8a97a8', fontSize: 11 }, tickLine: false }
const tip = { contentStyle: { background: '#1c242e', border: '1px solid #273140', borderRadius: 12, fontSize: 12 }, labelStyle: { color: '#8a97a8' }, itemStyle: { color: '#eef2f6' } }
const tickDate = (d: string) => fmt(d)

export default function Progress() {
  const { data, profile } = useStore()
  const [rng, setRng] = useState<Range>('30')
  const [section, setSection] = useState<Section>('weight')
  const to = today()
  const earliest = useMemo(() => {
    const all = [...data.weight_entries, ...data.food_entries, ...data.workout_sessions, ...data.body_measurements, ...data.progress_photos].map(x => x.date)
    return all.length ? all.reduce((m, d) => (d < m ? d : m)) : to
  }, [data, to])
  const from = rng === 'all' ? earliest : addDays(to, -(Number(rng) - 1))

  return (
    <div>
      <Header title="Progress" right={
        <div className="flex gap-2">
          <Link to="/checkin" aria-label="Weekly check-in" className="h-11 w-11 grid place-items-center rounded-xl bg-card border border-line/60 text-mute"><ClipboardCheck size={20} /></Link>
          <Link to="/calendar" aria-label="Calendar" className="h-11 w-11 grid place-items-center rounded-xl bg-card border border-line/60 text-mute"><CalendarDays size={20} /></Link>
        </div>} />
      <Tabs value={rng} onChange={setRng} options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '84', label: '12 weeks' }, { value: 'all', label: 'All time' }]} />
      <div className="flex gap-1.5 overflow-x-auto my-3 -mx-4 px-4" role="tablist">
        {(['weight', 'body', 'training', 'nutrition', 'photos'] as Section[]).map(s => (
          <button key={s} role="tab" aria-selected={section === s} onClick={() => setSection(s)}
            className={`shrink-0 min-h-[40px] px-4 rounded-full text-sm capitalize border ${section === s ? 'bg-ink text-bg border-ink font-semibold' : 'border-line text-mute'}`}>{s}</button>
        ))}
      </div>
      {section === 'weight' && <WeightSection from={from} to={to} />}
      {section === 'body' && <BodySection from={from} to={to} />}
      {section === 'training' && <TrainingSection from={from} to={to} />}
      {section === 'nutrition' && <NutritionSection from={from} to={to} />}
      {section === 'photos' && <PhotosSection from={from} to={to} />}
      <p className="text-[11px] text-mute mt-4">LeanTrack does not estimate body-fat percentage — not from photos, weight or measurements. {profile.main_goal ? 'Use the photo comparisons and waist trend to judge visible change.' : ''}</p>
    </div>
  )
}

function WeightSection({ from, to }: { from: string; to: string }) {
  const { data, profile } = useStore()
  const unit = profile.weight_unit
  const cv = (lb: number | null) => (lb == null ? null : round(unit === 'kg' ? lbToKg(lb) : lb, 1))
  const [sheet, setSheet] = useState<string | null>(null)
  const [proj, setProj] = useState(false)
  const trend = weightTrend(data.weight_entries, to, profile.goal_weight_lb)
  const entries = [...data.weight_entries].sort((a, b) => b.date.localeCompare(a.date))
  const inRange = entries.filter(e => e.date >= from && e.date <= to)

  const chart = useMemo(() => {
    const pts: { date: string; weight: number | null; avg: number | null; proj?: number | null }[] =
      weightSeries(data.weight_entries, from, to).map(p => ({ date: p.date, weight: cv(p.weight), avg: cv(p.avg) }))
    if (proj && trend.current != null && trend.weeklyChange != null && trend.weeklyChange < -0.05) {
      const days = Math.min(112, Math.max(7, diffDays(trend.projectedDate ?? to, to)))
      pts[pts.length - 1].proj = cv(trend.current)
      for (let i = 1; i <= days; i++) pts.push({ date: addDays(to, i), weight: null, avg: null, proj: cv(Math.max(profile.goal_weight_lb, trend.current + (trend.weeklyChange / 7) * i)) })
    }
    return pts
  }, [data.weight_entries, from, to, proj, unit, trend.current, trend.weeklyChange])

  const current = trend.current ?? entries[0]?.weight_lb ?? null
  const lost = current == null ? null : profile.start_weight_lb - current
  const remaining = current == null ? null : current - profile.goal_weight_lb
  const signed = (lb: number | null) => (lb == null ? '—' : `${lb > 0 ? '+' : ''}${showWeight(lb, unit, 2)}`)

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <Stat label="Total lost" value={lost == null ? '—' : showWeight(lost, unit)} sub={`from ${showWeight(profile.start_weight_lb, unit, 0)} start, by 7-day avg`} tone={lost != null && lost > 0 ? 'text-volt' : undefined} />
        <Stat label="To goal" value={remaining == null ? '—' : remaining <= 0 ? 'Reached' : showWeight(remaining, unit)} sub={`goal ${showWeight(profile.goal_weight_lb, unit, 0)}`} />
        <Stat label="Weekly trend" value={signed(trend.weeklyChange)} sub="7-day avg vs a week ago" />
        <Stat label="Monthly trend" value={signed(trend.monthlyChange)} sub="7-day avg vs 4 weeks ago" />
      </div>
      <Card className="mb-3 !p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold">Weight ({unit})</div>
          <label className="flex items-center gap-2 text-xs text-mute">Trend projection <Toggle on={proj} onChange={setProj} label="Show trend projection" /></label>
        </div>
        {inRange.length === 0 && !proj ? <Empty>No weight entries in this range yet.</Empty> : (
          <>
            <div className="h-60" role="img" aria-label="Weight chart with daily entries and seven-day average">
              <ResponsiveContainer>
                <ComposedChart data={chart} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke={C.grid} strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={tickDate} minTickGap={36} {...axis} />
                  <YAxis domain={['dataMin - 1', 'dataMax + 1']} tickFormatter={v => String(Math.round(v))} allowDecimals={false} {...axis} axisLine={false} />
                  <Tooltip {...tip} labelFormatter={d => fmt(String(d), { weekday: 'short', month: 'short', day: 'numeric' })} />
                  <ReferenceLine y={cv(profile.start_weight_lb)!} stroke={C.ref} strokeOpacity={0.35} strokeDasharray="4 4" ifOverflow="extendDomain" label={{ value: 'Start', fill: '#8a97a8', fontSize: 10, position: 'insideTopRight' }} />
                  <ReferenceLine y={cv(profile.goal_weight_lb)!} stroke={C.ref} strokeOpacity={0.6} strokeDasharray="4 4" ifOverflow="extendDomain" label={{ value: 'Goal', fill: '#eef2f6', fontSize: 10, position: 'insideBottomRight' }} />
                  <Line name="Daily weight" dataKey="weight" stroke="none" dot={{ r: 3, fill: C.raw, strokeWidth: 0 }} activeDot={{ r: 5 }} isAnimationActive={false} />
                  <Line name="7-day average" dataKey="avg" stroke={C.series} strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
                  {proj && <Line name="Projection" dataKey="proj" stroke={C.series} strokeWidth={2} strokeDasharray="5 5" dot={false} isAnimationActive={false} />}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-mute mt-2">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: C.raw }} /> Daily weight</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: C.series }} /> 7-day average</span>
              {proj && <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed" style={{ borderColor: C.series }} /> Projection</span>}
            </div>
          </>
        )}
        {proj && (
          <p className="text-xs text-mute mt-2">
            {trend.projectedDate && trend.weeksToGoal! > 0 ? `At ${round(-trend.weeklyChange!, 2)} lb/week you'd reach goal around ${fmt(trend.projectedDate, { month: 'short', day: 'numeric', year: 'numeric' })}. An estimate from the last week's trend only.`
              : trend.weeksToGoal === 0 ? 'Your 7-day average is at or below goal.'
              : 'A projection needs a downward 7-day trend, which takes entries in both this week and last week.'}
          </p>
        )}
      </Card>
      <Btn variant="primary" full className="mb-3" onClick={() => setSheet(to)}><Plus size={18} /> Log weight</Btn>
      <h2 className="text-sm font-semibold mb-2">Entries</h2>
      {inRange.length === 0 ? <Empty>Nothing logged in this range.</Empty> : (
        <Card className="!p-0 divide-y divide-line/60">
          {inRange.map(e => (
            <button key={e.id} onClick={() => setSheet(e.date)} className="w-full flex justify-between items-center px-4 min-h-[48px] text-sm text-left active:bg-raised">
              <span>{fmt(e.date, { weekday: 'short', month: 'short', day: 'numeric' })}</span><span className="tnum font-medium">{showWeight(e.weight_lb, unit)}</span>
            </button>
          ))}
        </Card>
      )}
      <WeightSheet open={sheet != null} date={sheet ?? undefined} onClose={() => setSheet(null)} />
    </div>
  )
}

function BodySection({ from, to }: { from: string; to: string }) {
  const { data } = useStore()
  const [sheet, setSheet] = useState<string | null>(null)
  const all = [...data.body_measurements].sort((a, b) => a.date.localeCompare(b.date))
  const list = all.filter(m => m.date >= from && m.date <= to)
  const waist = list.filter(m => m.waist_in != null)
  const firstWaist = all.find(m => m.waist_in != null)
  const lastWaist = [...all].reverse().find(m => m.waist_in != null)
  const change = firstWaist && lastWaist && firstWaist.id !== lastWaist.id ? lastWaist.waist_in! - firstWaist.waist_in! : null
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <Stat label="Waist" value={lastWaist ? `${lastWaist.waist_in} in` : '—'} sub={lastWaist ? fmt(lastWaist.date) : 'Not measured yet'} />
        <Stat label="Waist change" value={change == null ? '—' : `${change > 0 ? '+' : ''}${round(change, 2)} in`} sub={firstWaist ? `since ${fmt(firstWaist.date)}` : undefined} tone={change != null && change < 0 ? 'text-volt' : undefined} />
      </div>
      <Card className="mb-3 !p-3">
        <div className="text-sm font-semibold mb-2">Waist (in)</div>
        {waist.length < 2 ? <Empty>{waist.length ? 'One measurement so far. A second one draws the trend.' : 'No waist measurements in this range.'}</Empty> : (
          <div className="h-48" role="img" aria-label="Waist measurement chart">
            <ResponsiveContainer>
              <LineChart data={waist} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={C.grid} strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="date" tickFormatter={tickDate} minTickGap={36} {...axis} />
                <YAxis domain={['dataMin - 0.5', 'dataMax + 0.5']} tickFormatter={v => String(round(v, 1))} {...axis} axisLine={false} />
                <Tooltip {...tip} labelFormatter={d => fmt(String(d))} />
                <Line name="Waist" dataKey="waist_in" stroke={C.series} strokeWidth={2.5} dot={{ r: 4, fill: C.series, stroke: '#141a22', strokeWidth: 2 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
      <Btn variant="primary" full className="mb-3" onClick={() => setSheet(to)}><Plus size={18} /> Add measurements</Btn>
      <h2 className="text-sm font-semibold mb-2">History</h2>
      {list.length === 0 ? <Empty>Nothing measured in this range.</Empty> : (
        <Card className="!p-0 divide-y divide-line/60">
          {[...list].reverse().map(m => (
            <button key={m.id} onClick={() => setSheet(m.date)} className="w-full px-4 py-2.5 text-left active:bg-raised">
              <div className="flex justify-between text-sm"><span>{fmt(m.date, { weekday: 'short', month: 'short', day: 'numeric' })}</span><span className="tnum font-medium">{m.waist_in != null ? `${m.waist_in} in waist` : ''}</span></div>
              <div className="text-xs text-mute tnum">{([['Chest', m.chest_in], ['Arms', m.arms_in], ['Hips', m.hips_in], ['Thighs', m.thighs_in]] as const).filter(([, v]) => v != null).map(([l, v]) => `${l} ${v}`).join(' · ')}</div>
            </button>
          ))}
        </Card>
      )}
      <MeasureSheet open={sheet != null} date={sheet ?? undefined} onClose={() => setSheet(null)} />
    </div>
  )
}

function TrainingSection({ from, to }: { from: string; to: string }) {
  const { data } = useStore()
  const sets = useMemo(() => datedSets(data).filter(s => s.completed), [data.exercise_sets, data.workout_sessions])
  const completed = data.workout_sessions.filter(s => s.completed_at)
  const inRange = completed.filter(s => s.date >= from && s.date <= to)
  const bests = useMemo(() => [...personalBests(sets)].sort((a, b) => a[0].localeCompare(b[0])), [sets])
  const names = bests.map(b => b[0])
  const [pick, setPick] = useState('')
  const name = pick || names[0] || ''
  const strength = useMemo(() => {
    const byDate = new Map<string, { date: string; weight: number; reps: number }>()
    const inv = lowerIsBetter(name)
    for (const s of sets) {
      if (s.exercise_name !== name || s.weight_lb == null || s.reps == null || s.date < from || s.date > to) continue
      const cur = byDate.get(s.date)
      if (!cur || (inv ? s.weight_lb < cur.weight : s.weight_lb > cur.weight) || (s.weight_lb === cur.weight && s.reps > cur.reps)) byDate.set(s.date, { date: s.date, weight: s.weight_lb, reps: s.reps })
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
  }, [sets, name, from, to])
  const weekly = useMemo(() => {
    const start = weekStart(from)
    const weeks = new Map<string, number>()
    for (const d of range(start, to)) if (d === weekStart(d)) weeks.set(d, 0)
    for (const s of inRange) weeks.set(weekStart(s.date), (weeks.get(weekStart(s.date)) ?? 0) + 1)
    return [...weeks].map(([week, count]) => ({ week, count }))
  }, [inRange, from, to])

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <Stat label="Workouts completed" value={inRange.length} sub="in this range" />
        <Stat label="Total sessions" value={completed.length} sub="all time" />
      </div>
      <Card className="mb-3 !p-3">
        <div className="text-sm font-semibold mb-2">Workouts completed per week</div>
        {inRange.length === 0 ? <Empty>No completed workouts in this range.</Empty> : (
          <div className="h-40" role="img" aria-label="Workouts completed per week">
            <ResponsiveContainer>
              <BarChart data={weekly} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid stroke={C.grid} strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="week" tickFormatter={tickDate} minTickGap={24} {...axis} />
                <YAxis allowDecimals={false} {...axis} axisLine={false} />
                <Tooltip {...tip} cursor={{ fill: '#ffffff10' }} labelFormatter={d => `Week of ${fmt(String(d))}`} />
                <RBar name="Workouts" dataKey="count" fill={C.series} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
      <Card className="mb-3 !p-3">
        <div className="text-sm font-semibold mb-2">Strength progression</div>
        {names.length === 0 ? <Empty>Log weighted sets to see strength progression.</Empty> : (
          <>
            <select aria-label="Exercise" className={inputCls + ' mb-2'} value={name} onChange={e => setPick(e.target.value)}>{names.map(n => <option key={n}>{n}</option>)}</select>
            {strength.length < 2 ? <Empty>{strength.length ? 'One session so far in this range.' : 'No sessions for this exercise in this range.'}</Empty> : (
              <div className="h-48" role="img" aria-label={`Top set weight for ${name}`}>
                <ResponsiveContainer>
                  <LineChart data={strength} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke={C.grid} strokeDasharray="2 4" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={tickDate} minTickGap={36} {...axis} />
                    <YAxis domain={['dataMin - 5', 'dataMax + 5']} {...axis} axisLine={false} />
                    <Tooltip {...tip} labelFormatter={d => fmt(String(d))} formatter={(v, _n, p) => [`${v} lb × ${(p.payload as { reps: number }).reps}`, 'Top set']} />
                    <Line name="Top set" dataKey="weight" stroke={C.series} strokeWidth={2.5} dot={{ r: 4, fill: C.series, stroke: '#141a22', strokeWidth: 2 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <p className="text-[11px] text-mute mt-1">Top set weight (lb) per session{lowerIsBetter(name) ? ' — assistance weight, so lower is better' : ''}.</p>
          </>
        )}
      </Card>
      <h2 className="text-sm font-semibold mb-2">Personal records</h2>
      {bests.length === 0 ? <Empty>No records yet.</Empty> : (
        <Card className="!p-0 divide-y divide-line/60">
          {bests.map(([n, b]) => (
            <div key={n} className="flex justify-between items-center px-4 min-h-[48px] text-sm gap-3">
              <span className="truncate">{n}</span><span className="tnum shrink-0"><b>{b.weight_lb} lb × {b.reps}</b> <span className="text-xs text-mute">{fmt(b.date)}</span></span>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}

function NutritionSection({ from, to }: { from: string; to: string }) {
  const { data, profile } = useStore()
  const st = nutritionStats(data.food_entries, from, to, profile.calorie_target, profile.protein_target_g)
  const daily = useMemo(() => range(from, to).map(d => {
    const e = data.food_entries.filter(f => f.date === d)
    return { date: d, calories: e.length ? Math.round(sumMacros(e).calories) : null }
  }), [data.food_entries, from, to])
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <Stat label="Avg calories" value={st.avgCalories == null ? '—' : Math.round(st.avgCalories).toLocaleString()} sub={`target ${profile.calorie_target.toLocaleString()}`} />
        <Stat label="Avg protein" value={st.avgProtein == null ? '—' : `${Math.round(st.avgProtein)} g`} sub={`target ${profile.protein_target_g} g`} />
        <Stat label="Calorie target met" value={`${st.calorieDaysMet} of ${st.daysLogged}`} sub="logged days within ±10%" />
        <Stat label="Protein target met" value={`${st.proteinDaysMet} of ${st.daysLogged}`} sub="logged days at 90%+" />
      </div>
      <Card className="!p-3">
        <div className="text-sm font-semibold mb-2">Daily calories</div>
        {st.daysLogged === 0 ? <Empty>No food logged in this range.</Empty> : (
          <div className="h-52" role="img" aria-label="Daily calories against target">
            <ResponsiveContainer>
              <BarChart data={daily} margin={{ top: 12, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid stroke={C.grid} strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="date" tickFormatter={tickDate} minTickGap={36} {...axis} />
                <YAxis {...axis} axisLine={false} />
                <Tooltip {...tip} cursor={{ fill: '#ffffff10' }} labelFormatter={d => fmt(String(d), { weekday: 'short', month: 'short', day: 'numeric' })} />
                <ReferenceLine y={profile.calorie_target} stroke={C.ref} strokeOpacity={0.6} strokeDasharray="4 4" ifOverflow="extendDomain" label={{ value: 'Target', fill: '#eef2f6', fontSize: 10, position: 'insideTopRight' }} />
                <RBar name="Calories" dataKey="calories" fill={C.series} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="text-[11px] text-mute mt-2">Averages count only days with food logged; an untracked day is treated as unknown, not zero.</p>
      </Card>
    </div>
  )
}

function PhotosSection({ from, to }: { from: string; to: string }) {
  const { data, profile } = useStore()
  const nav = useNavigate()
  const dates = [...new Set(data.progress_photos.filter(p => p.date >= from && p.date <= to).map(p => p.date))].sort().reverse()
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <Btn onClick={() => nav('/photos')}><CalendarDays size={16} /> Photo calendar</Btn>
        <Btn onClick={() => nav('/compare')}><Columns2 size={16} /> Before / after</Btn>
      </div>
      <h2 className="text-sm font-semibold mb-2">Timeline</h2>
      {dates.length === 0 ? <Empty>No photos in this range. Add today's from the Home screen.</Empty> : dates.map(d => {
        const ps = data.progress_photos.filter(p => p.date === d).sort((a, b) => ['front', 'side', 'back', 'extra'].indexOf(a.pose) - ['front', 'side', 'back', 'extra'].indexOf(b.pose))
        const w = data.weight_entries.find(x => x.date === d)
        return (
          <button key={d} onClick={() => nav(`/photos?date=${d}`)} className="w-full text-left mb-3">
            <div className="flex justify-between text-xs mb-1"><span className="font-medium">{fmt(d, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span><span className="text-mute tnum">{showWeight(w?.weight_lb, profile.weight_unit)}</span></div>
            <div className="grid grid-cols-4 gap-1.5">
              {ps.slice(0, 4).map(p => <div key={p.id} className="aspect-[3/4] rounded-lg overflow-hidden"><PhotoImg path={p.storage_path} alt={`${p.pose} photo ${fmt(d)}`} className="h-full w-full" /></div>)}
            </div>
          </button>
        )
      })}
    </div>
  )
}
