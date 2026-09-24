// 자동 배정(assign.ts)과 규칙 검사(validate.ts)가 함께 쓰는 기준
// Supabase를 쓰지 않는 순수 코드라서 노드에서 바로 테스트할 수 있어요.
import { addDays, dateRange, dow } from './dates'

export type Code = 'work' | 'leave' | 'off' | 'shoot'
export type MustKind = 'leave' | 'shoot' | 'dayoff'
export type WantKind = 'want_work' | 'want_off'

export type RStaff = {
  id: string
  name: string
  /** 주말 근무 팀(집체팀) 소속 */
  weekendTeam: boolean
  canSolo: boolean
  canWeekend: boolean
  hire: string | null
  leave: string | null
}
export type RInput = {
  start: string
  end: string
  weekendMin: number
  offMax: number
  staff: RStaff[]
  holidays: { date: string; work_open: boolean }[]
  events: { date: string; kind: 'open' | 'close'; weekend_need: number }[]
  requests: { id: string; staff_id: string; kind: MustKind | WantKind; start_date: string; end_date: string; status?: string }[]
  /** 이 기간 시작 전 배정 결과 (최소 7일). 키: staffId|date */
  prev: Record<string, Code>
}

/** 날짜 종류: 쉬는 공휴일 / 주말 근무일 / 평일 */
export type DayKind = 'offhol' | 'weekend' | 'weekday'

export const key = (sid: string, d: string) => `${sid}|${d}`

/** 근무 주 = 월~일. 주말 근무의 평일 휴무는 무조건 같은 주(월~금) 안에 넣어요. */
export function windowStart(d: string): string {
  return addDays(d, -((dow(d) + 6) % 7))
}

export type Ctx = ReturnType<typeof makeCtx>

export function makeCtx(input: RInput) {
  const days = dateRange(input.start, input.end)
  const offHol = new Set<string>()
  const openHolWeekend = new Set<string>()
  input.holidays.forEach((h) => {
    if (!h.work_open) offHol.add(h.date)
  })
  // 같은 날 쉬는 공휴일과 근무 운영 공휴일이 같이 있으면 쉬는 쪽 우선
  input.holidays.forEach((h) => {
    if (h.work_open && !offHol.has(h.date)) openHolWeekend.add(h.date)
  })
  const kind = (d: string): DayKind => {
    if (offHol.has(d)) return 'offhol'
    const w = dow(d)
    return w === 0 || w === 6 ? 'weekend' : 'weekday'
  }
  const eventsAt = new Map<string, RInput['events']>()
  input.events.forEach((e) => eventsAt.set(e.date, [...(eventsAt.get(e.date) ?? []), e]))
  const weekendNeed = (d: string): number => {
    const ev = eventsAt.get(d) ?? []
    return ev.length ? Math.max(...ev.map((e) => e.weekend_need)) : input.weekendMin
  }
  /** 개강일·평일 종강일: 집체팀 되도록 전원 출근 */
  const isEventWeekday = (d: string) => kind(d) === 'weekday' && (eventsAt.get(d) ?? []).length > 0
  const eventLabel = (d: string) => ((eventsAt.get(d) ?? []).some((e) => e.kind === 'open') ? '개강일' : '종강일')

  const employed = (s: RStaff, d: string) => (!s.hire || s.hire <= d) && (!s.leave || s.leave >= d)

  const mustAt = new Map<string, MustKind>()
  const mustReqAt = new Map<string, string>() // key → request id
  const wantAt = new Map<string, WantKind>()
  const order: Record<MustKind, number> = { leave: 3, shoot: 2, dayoff: 1 }
  input.requests
    .filter((r) => !r.status || r.status === 'approved')
    .forEach((r) => {
      dateRange(r.start_date, r.end_date).forEach((d) => {
        const k = key(r.staff_id, d)
        if (r.kind === 'want_work' || r.kind === 'want_off') {
          wantAt.set(k, r.kind)
        } else {
          const cur = mustAt.get(k)
          if (!cur || order[r.kind] > order[cur]) {
            mustAt.set(k, r.kind)
            mustReqAt.set(k, r.id)
          }
        }
      })
    })

  const staffById = new Map(input.staff.map((s) => [s.id, s]))
  return { input, days, kind, weekendNeed, isEventWeekday, eventLabel, employed, mustAt, mustReqAt, wantAt, staffById, openHolWeekend }
}

/** 연속 근무로 세는 칸 (연차는 쉬는 날이라 끊겨요) */
export const isOnDuty = (c: Code | undefined) => c === 'work' || c === 'shoot'

/** 주 근무일로 세는 칸: 평일은 근무·연차·촬영, 주말은 근무·촬영 */
export function countsForWeek(kind: DayKind, c: Code | undefined): boolean {
  if (!c) return false
  if (kind === 'weekday') return c === 'work' || c === 'leave' || c === 'shoot'
  if (kind === 'weekend') return c === 'work' || c === 'shoot'
  return false
}

export type Cells = Map<string, Code>

/** 이 기간 밖 날짜까지 포함해서 칸 값 읽기. 기간 전은 직전 일정표, 기간 뒤는 모름(undefined) */
export function codeAt(ctx: Ctx, cells: Cells, sid: string, d: string): Code | undefined | 'unknown' {
  const { start, end, prev } = ctx.input
  if (d >= start && d <= end) return cells.get(key(sid, d))
  if (d < start) {
    const p = prev[key(sid, d)]
    if (p) return p
    // 직전 기록이 없으면: 평일(재직·쉬는 공휴일 아님)은 근무했다고, 주말은 쉬었다고 봐요
    const s = ctx.staffById.get(sid)
    if (s && ctx.employed(s, d) && ctx.kind(d) === 'weekday') return 'work'
    return undefined
  }
  return 'unknown'
}

export type WeekStat = {
  ws: string
  we: string
  /** 기준 근무일 = 재직 중인 평일 중 쉬는 공휴일이 아닌 날 수 */
  target: number
  count: number
  /** 휴무 지정으로 쉰 평일 수 */
  dayoffs: number
  /** 기간 뒤 날짜가 섞여 있어 아직 다 모르는 주 */
  open: boolean
}

export function weekStat(ctx: Ctx, cells: Cells, s: RStaff, ws: string): WeekStat {
  const we = addDays(ws, 6)
  let target = 0
  let count = 0
  let dayoffs = 0
  let open = false
  for (const d of dateRange(ws, we)) {
    const k = ctx.kind(d)
    const emp = ctx.employed(s, d)
    if (k === 'weekday' && emp) target++
    const c = codeAt(ctx, cells, s.id, d)
    if (c === 'unknown') {
      open = true
      // 모르는 평일은 근무로 가정 (기준과 상쇄)
      if (k === 'weekday' && emp) count++
      continue
    }
    if (countsForWeek(k, c)) count++
    if (k === 'weekday' && emp && c === 'off' && ctx.mustAt.get(key(s.id, d)) === 'dayoff') dayoffs++
  }
  return { ws, we, target, count, dayoffs, open }
}

/** 연속 근무 구간들 [시작, 끝, 일수] */
export function dutyRuns(ctx: Ctx, cells: Cells, sid: string, from: string, to: string): [string, string, number][] {
  const out: [string, string, number][] = []
  let runStart: string | null = null
  let n = 0
  let last = ''
  for (const d of dateRange(from, to)) {
    const c = codeAt(ctx, cells, sid, d)
    if (c !== 'unknown' && isOnDuty(c)) {
      if (!runStart) runStart = d
      n++
      last = d
    } else {
      if (runStart) out.push([runStart, last, n])
      runStart = null
      n = 0
    }
  }
  if (runStart) out.push([runStart, last, n])
  return out
}

export const MAX_RUN = 5

/** 시드가 있는 난수 (같은 시드면 같은 결과) */
export function rng(seed: number) {
  let a = seed >>> 0 || 1
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
