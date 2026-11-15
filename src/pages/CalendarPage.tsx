import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MonthGrid } from '../components/calendar'
import { Card, Header } from '../components/ui'
import { today } from '../lib/dates'
import { useStore } from '../lib/store'

const Dot = ({ c, label }: { c: string; label: string }) => <span className={`h-1.5 w-1.5 rounded-full ${c}`} aria-label={label} />

export default function CalendarPage() {
  const { data } = useStore()
  const nav = useNavigate()
  const [month, setMonth] = useState(today())
  const sets = useMemo(() => ({
    workout: new Set(data.workout_sessions.filter(s => s.completed_at).map(s => s.date)),
    weight: new Set(data.weight_entries.map(w => w.date)),
    food: new Set(data.food_entries.map(f => f.date)),
    waist: new Set(data.body_measurements.filter(m => m.waist_in != null).map(m => m.date)),
  }), [data])
  return (
    <div>
      <Header title="Calendar" back />
      <Card className="mb-3">
        <MonthGrid month={month} onMonth={setMonth} onSelect={d => nav(`/day/${d}`)} marks={d => (
          <>
            {sets.workout.has(d) && <Dot c="bg-volt" label="Workout completed" />}
            {sets.weight.has(d) && <Dot c="bg-sky" label="Weight logged" />}
            {sets.food.has(d) && <Dot c="bg-warn" label="Food logged" />}
            {sets.waist.has(d) && <span className="h-1.5 w-1.5 rounded-full border border-ink" aria-label="Waist measured" />}
          </>
        )} />
      </Card>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-mute">
        <span className="inline-flex items-center gap-1.5"><Dot c="bg-volt" label="" /> Workout</span>
        <span className="inline-flex items-center gap-1.5"><Dot c="bg-sky" label="" /> Weight</span>
        <span className="inline-flex items-center gap-1.5"><Dot c="bg-warn" label="" /> Food</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full border border-ink" /> Waist</span>
      </div>
      <p className="text-xs text-mute mt-3">Tap any day to see or edit everything recorded for it.</p>
    </div>
  )
}
