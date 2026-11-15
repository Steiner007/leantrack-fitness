// All calendar logic uses local "YYYY-MM-DD" strings. We never round-trip a
// calendar date through UTC, so entries cannot drift to a neighbouring day.
const pad = (n: number) => String(n).padStart(2, '0')

export const toStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const today = () => toStr(new Date())
/** Parse at local noon so DST shifts can never push the date across midnight. */
export const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d, 12)
}
export const addDays = (s: string, n: number) => {
  const d = parse(s)
  d.setDate(d.getDate() + n)
  return toStr(d)
}
export const diffDays = (a: string, b: string) => Math.round((parse(a).getTime() - parse(b).getTime()) / 86400000)
export const weekday = (s: string) => parse(s).getDay()
/** Monday of the week containing s. */
export const weekStart = (s: string) => addDays(s, -((weekday(s) + 6) % 7))
export const range = (from: string, to: string) => {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const fmt = (s: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) =>
  parse(s).toLocaleDateString(undefined, opts)
export const fmtLong = (s: string) => fmt(s, { weekday: 'long', month: 'long', day: 'numeric' })
export const relLabel = (s: string) => {
  const d = diffDays(s, today())
  return d === 0 ? 'Today' : d === -1 ? 'Yesterday' : d === 1 ? 'Tomorrow' : fmt(s, { weekday: 'short', month: 'short', day: 'numeric' })
}
