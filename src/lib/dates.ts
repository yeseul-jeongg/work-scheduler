// 날짜는 모두 'YYYY-MM-DD' 문자열로 다뤄요 (시간대 때문에 하루 밀리는 일이 없게)

export const DOW = ['일', '월', '화', '수', '목', '금', '토'] as const

function toUTC(d: string): Date {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day))
}
function fromUTC(dt: Date): string {
  return dt.toISOString().slice(0, 10)
}

export function addDays(d: string, n: number): string {
  const dt = toUTC(d)
  dt.setUTCDate(dt.getUTCDate() + n)
  return fromUTC(dt)
}
/** 0=일 … 6=토 */
export function dow(d: string): number {
  return toUTC(d).getUTCDay()
}
export function isWeekend(d: string): boolean {
  const w = dow(d)
  return w === 0 || w === 6
}
export function diffDays(a: string, b: string): number {
  return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / 86400000)
}
export function dateRange(start: string, end: string): string[] {
  const out: string[] = []
  if (!start || !end || end < start) return out
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d)
  return out
}
export function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
export function lastDayOfMonth(y: number, m: number): string {
  return fromUTC(new Date(Date.UTC(y, m, 0)))
}
/** 그 날짜 또는 그 전의 월요일 */
export function mondayOnOrBefore(d: string): string {
  const w = dow(d)
  return addDays(d, -((w + 6) % 7))
}
/** 그 날짜 또는 그 뒤의 일요일 */
export function sundayOnOrAfter(d: string): string {
  const w = dow(d)
  return addDays(d, (7 - w) % 7)
}
export function today(): string {
  const n = new Date()
  return ymd(n.getFullYear(), n.getMonth() + 1, n.getDate())
}
/** 9/24 (목) */
export function fmtMD(d: string, withDow = true): string {
  const [, m, day] = d.split('-').map(Number)
  return withDow ? `${m}/${day} (${DOW[dow(d)]})` : `${m}/${day}`
}
/** 9/24 ~ 9/26  또는 하루면 9/24 (목) */
export function fmtRange(a: string, b: string): string {
  return a === b ? fmtMD(a) : `${fmtMD(a, false)} ~ ${fmtMD(b, false)}`
}
export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd
}
export function isValidDate(d: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && fromUTC(toUTC(d)) === d
}
