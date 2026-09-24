// 4단계 자동 배정 (순수 함수: Supabase를 쓰지 않아요)
//
// 순서
//  1. 고정 칸: 재직 밖=빈칸, 쉬는 공휴일=빈칸, 연차·촬영·휴무 지정, 손으로 고정한 칸(locked)
//  2. 주말 근무자 뽑기 (같은 주 토·일 다른 사람 → 지난주 일요일 근무자가 이번 주 토요일 → 주말 횟수 + 이월 적은 순 → 희망 → 무작위)
//     - "일요일 → 다음 주 토요일" 순번이면 다음 주에도 평일 휴무가 생겨서 6일 연속(일~금)을 피할 수 있어요
//  3. 근무 주(월~일)마다 같은 주 평일에 휴무 넣기 (주 5일은 무조건)
//     - 개강일·평일 종강일 피하기, 휴무자 적은 날, 휴무 희망 날 우선, 근무 희망 날 피하기, 6일 연속 안 생기게
//     - 집체팀(주말 근무 팀)은 하루 최대 N명
//  4. 나머지 평일 = 근무
//  5. 규칙 검사(validate) → 배정 불가 목록
//  6. 되도록 요청(근무 희망·휴무 희망) 반영 결과
import { addDays, dateRange, dow, fmtMD } from './dates'
import {
  makeCtx,
  key,
  weekStat,
  windowStart,
  dutyRuns,
  codeAt,
  MAX_RUN,
  rng,
  type Cells,
  type Code,
  type Ctx,
  type RInput,
  type RStaff,
} from './rules'
import { validate, type Problem } from './validate'

export type AssignInput = RInput & {
  /** 손으로 고정한 칸 (다시 배정해도 유지) */
  locked: { staff_id: string; date: string; code: Code }[]
  /** 지난 일정표 주말 횟수 이월 보정 (음수 = 적게 했음 → 우선) */
  carry: Record<string, number>
}
export type RequestResult = { id: string; result: 'applied' | 'unmet'; note: string }
export type AssignOutput = {
  cells: { staff_id: string; date: string; code: Code }[]
  problems: Problem[]
  requestResults: RequestResult[]
  weekendCount: Record<string, number>
}

const MUST_CODE = { leave: 'leave', shoot: 'shoot', dayoff: 'off' } as const

export function assign(input: AssignInput, seed = Date.now()): AssignOutput {
  const ctx = makeCtx(input)
  const rand = rng(seed)
  const cells: Cells = new Map()
  const fixed = new Set<string>()
  const { staff, start, end } = input
  const lockedAt = new Map(input.locked.map((l) => [key(l.staff_id, l.date), l.code]))
  // 사람·날짜마다 무작위 순서값 (시드가 같으면 결과도 같음)
  const noise = new Map<string, number>()
  const nz = (k: string) => {
    let v = noise.get(k)
    if (v === undefined) noise.set(k, (v = rand()))
    return v
  }

  // ---------- 1. 고정 칸 ----------
  for (const s of staff) {
    for (const d of ctx.days) {
      if (!ctx.employed(s, d)) continue
      const k = key(s.id, d)
      const lk = lockedAt.get(k)
      if (lk) {
        cells.set(k, lk)
        fixed.add(k)
        continue
      }
      const kind = ctx.kind(d)
      if (kind === 'offhol') continue
      const must = ctx.mustAt.get(k)
      if (must) {
        cells.set(k, MUST_CODE[must])
        fixed.add(k)
        continue
      }
      cells.set(k, kind === 'weekday' ? 'work' : 'off')
    }
  }

  // 근무 주별 필요한 평일 휴무 수 (현재 칸 기준)
  const freeDays = (s: RStaff, ws: string) =>
    dateRange(ws, addDays(ws, 6)).filter((d) => d >= start && d <= end && ctx.kind(d) === 'weekday' && ctx.employed(s, d) && !fixed.has(key(s.id, d)))
  const futureWeekdays = (s: RStaff, ws: string) =>
    dateRange(ws, addDays(ws, 6)).filter((d) => d > end && ctx.kind(d) === 'weekday' && ctx.employed(s, d)).length
  const offsPlaced = (s: RStaff, ws: string) => freeDays(s, ws).filter((d) => cells.get(key(s.id, d)) === 'off').length
  /** 이 주에 더 넣어야 하는 휴무 수 */
  const offsNeeded = (s: RStaff, ws: string) => {
    const w = weekStat(ctx, cells, s, ws)
    return w.count - w.target
  }

  // ---------- 2. 주말 근무자 ----------
  const weekendCount: Record<string, number> = {}
  staff.forEach((s) => (weekendCount[s.id] = 0))
  for (const d of ctx.days) {
    if (ctx.kind(d) !== 'weekend') continue
    // 손으로 넣은 주말 근무도 횟수에 넣어요
    staff.forEach((s) => {
      if (s.weekendTeam && fixed.has(key(s.id, d)) && cells.get(key(s.id, d)) === 'work') weekendCount[s.id]++
    })
  }
  for (const d of ctx.days) {
    if (ctx.kind(d) !== 'weekend') continue
    const need = ctx.weekendNeed(d)
    const already = staff.filter((s) => s.weekendTeam && ctx.employed(s, d) && cells.get(key(s.id, d)) === 'work')
    let remaining = need - already.length
    if (remaining <= 0) continue
    const ws = windowStart(d)
    // 같은 월~일 주의 반대쪽 주말 (토 → 다음날 일, 일 → 전날 토)
    const pair = dow(d) === 6 ? addDays(d, 1) : addDays(d, -1)
    // 토요일: 지난주 일요일에 근무한 사람을 우선 (그래야 이번 주 앞쪽에 쉬어서 6일 연속이 안 생겨요)
    const lastSun = dow(d) === 6 ? addDays(d, -6) : null
    const cands = staff.filter(
      (s) => s.weekendTeam && s.canWeekend && ctx.employed(s, d) && !fixed.has(key(s.id, d)) && cells.get(key(s.id, d)) !== 'work',
    )
    const roomy = (s: RStaff) => {
      // 이 주에 휴무를 하나 더 넣을 평일이 있는지 (기간 뒤 평일도 다음 일정표에서 넣을 수 있어요)
      const free = freeDays(s, ws).length - offsPlaced(s, ws) + futureWeekdays(s, ws)
      return free >= offsNeeded(s, ws) + 1
    }
    const score = (s: RStaff) => {
      const k = key(s.id, d)
      const w = ctx.wantAt.get(k)
      const pairWork = cells.get(key(s.id, pair)) === 'work' ? 1 : 0
      const chain = lastSun && codeAt(ctx, cells, s.id, lastSun) === 'work' ? 0 : 1
      return [
        roomy(s) ? 0 : 1,
        pairWork,
        chain,
        weekendCount[s.id] + Math.round(input.carry[s.id] ?? 0),
        w === 'want_work' ? -1 : w === 'want_off' ? 1 : 0,
        nz(k),
      ]
    }
    const sorted = cands
      .map((s) => ({ s, sc: score(s) }))
      .sort((a, b) => {
        for (let i = 0; i < a.sc.length; i++) if (a.sc[i] !== b.sc[i]) return a.sc[i] - b.sc[i]
        return 0
      })
      .map((x) => x.s)
    const pool = need === 1 && already.length === 0 ? sorted.filter((s) => s.canSolo) : sorted
    let hasSolo = already.some((s) => s.canSolo)
    const picked: RStaff[] = []
    for (const s of pool) {
      if (remaining === 0) break
      if (need >= 2 && !hasSolo && remaining === 1 && !s.canSolo) continue
      picked.push(s)
      remaining--
      if (s.canSolo) hasSolo = true
    }
    picked.forEach((s) => {
      cells.set(key(s.id, d), 'work')
      weekendCount[s.id]++
    })
  }

  // ---------- 3. 평일 휴무 ----------
  const offMax = input.offMax
  const teamOffs = (d: string, weekendTeam: boolean) =>
    staff.filter((s) => s.weekendTeam === weekendTeam && ctx.employed(s, d) && cells.get(key(s.id, d)) === 'off').length
  const needAtWindow = new Map<string, number>() // staff|ws → 휴무 필요 수 (결과 이유 설명용)

  const windows = [...new Set(ctx.days.map(windowStart))]
  for (const ws of windows) {
    const todo = staff
      .map((s) => {
        const free = freeDays(s, ws)
        const n = offsNeeded(s, ws)
        needAtWindow.set(key(s.id, ws), Math.max(0, n))
        return { s, free, n }
      })
      .filter((x) => x.n > 0 && x.free.length > 0)
      // 고를 날이 적은 사람부터
      .sort((a, b) => a.free.length - a.n - (b.free.length - b.n) || nz(key(a.s.id, ws)) - nz(key(b.s.id, ws)))

    for (const { s, free, n } of todo) {
      const k = Math.min(n, free.length)
      let best: string[] | null = null
      let bestCost = Infinity
      for (const combo of combos(free, k)) {
        const c = offCost(ctx, cells, s, combo, ws, offMax, teamOffs, nz)
        if (c < bestCost) {
          bestCost = c
          best = combo
        }
      }
      best?.forEach((d) => cells.set(key(s.id, d), 'off'))
    }
  }

  // ---------- 5. 검사 ----------
  const problems = validate(input, cells, ctx)

  // ---------- 6. 요청 결과 ----------
  const requestResults = requestResultsOf(ctx, cells, needAtWindow, offMax)

  const out: AssignOutput['cells'] = []
  cells.forEach((code, k) => {
    const [staff_id, date] = k.split('|')
    if (!lockedAt.has(k)) out.push({ staff_id, date, code })
  })
  return { cells: out, problems, requestResults, weekendCount }
}

function* combos<T>(arr: T[], k: number, from = 0, acc: T[] = []): Generator<T[]> {
  if (acc.length === k) {
    yield [...acc]
    return
  }
  for (let i = from; i <= arr.length - (k - acc.length); i++) {
    acc.push(arr[i])
    yield* combos(arr, k, i + 1, acc)
    acc.pop()
  }
}

function offCost(
  ctx: Ctx,
  cells: Cells,
  s: RStaff,
  combo: string[],
  ws: string,
  offMax: number,
  teamOffs: (d: string, weekendTeam: boolean) => number,
  nz: (k: string) => number,
): number {
  let cost = 0
  for (const d of combo) {
    const load = teamOffs(d, s.weekendTeam)
    if (s.weekendTeam && load + 1 > offMax) cost += 1000
    cost += load * 10
    if (s.weekendTeam && ctx.isEventWeekday(d)) cost += 200
    const w = ctx.wantAt.get(key(s.id, d))
    if (w === 'want_off') cost -= 30
    if (w === 'want_work') cost += 30
    cost += nz(key(s.id, d))
  }
  // 6일 연속 검사: 지난주 끝 5일 ~ 이번 주 일요일 (되도록 피하기, 못 피하면 경고)
  const trial = new Map(cells)
  combo.forEach((d) => trial.set(key(s.id, d), 'off'))
  const from = addDays(ws, -MAX_RUN)
  const to = addDays(ws, 6)
  for (const [, b, n] of dutyRuns(ctx, trial, s.id, from, to)) {
    if (n > MAX_RUN && b >= ws) cost += 10000 * (n - MAX_RUN)
  }
  return cost
}

function requestResultsOf(ctx: Ctx, cells: Cells, needAtWindow: Map<string, number>, offMax: number): RequestResult[] {
  const { start, end } = ctx.input
  const res: RequestResult[] = []
  const reqName = { leave: '연차', shoot: '촬영', dayoff: '휴무 지정' } as const
  for (const r of ctx.input.requests) {
    if (r.status && r.status !== 'approved') continue
    const s = ctx.staffById.get(r.staff_id)
    if (!s) continue
    const days = dateRange(r.start_date, r.end_date).filter((d) => d >= start && d <= end && ctx.employed(s, d))
    if (days.length === 0) continue
    if (r.kind === 'leave' || r.kind === 'shoot' || r.kind === 'dayoff') {
      const hol = days.filter((d) => ctx.kind(d) === 'offhol').length
      res.push({ id: r.id, result: 'applied', note: hol ? `공휴일 ${hol}일은 원래 휴무` : '' })
      continue
    }
    const reasons: string[] = []
    let ok = 0
    for (const d of days) {
      const c = cells.get(key(s.id, d))
      const kind = ctx.kind(d)
      const must = ctx.mustAt.get(key(s.id, d))
      if (r.kind === 'want_off') {
        if (kind === 'offhol' || c === 'off' || c === 'leave') {
          ok++
          continue
        }
        if (must) reasons.push(`${fmtMD(d, false)} ${reqName[must]} 요청이 있어서`)
        else if (kind === 'weekend') reasons.push(`${fmtMD(d, false)} 주말 인원이 필요해서`)
        else if ((needAtWindow.get(key(s.id, windowStart(d))) ?? 0) === 0)
          reasons.push(`${fmtMD(d, false)} 그 주는 주 5일을 채우려면 평일에 모두 근무해야 해서`)
        else if (s.weekendTeam && ctx.isEventWeekday(d)) reasons.push(`${fmtMD(d, false)} ${ctx.eventLabel(d)}이라 되도록 전원 출근`)
        else if (s.weekendTeam && countOff(ctx, cells, d) >= offMax)
          reasons.push(`${fmtMD(d, false)} 이미 휴무자가 있어서 (하루 최대 ${offMax}명)`)
        else reasons.push(`${fmtMD(d, false)} 6일 연속 근무를 막으려고 다른 날 휴무`)
      } else {
        if (c === 'work' || c === 'shoot') {
          ok++
          continue
        }
        if (kind === 'offhol') reasons.push(`${fmtMD(d, false)} 공휴일이라 전원 휴무`)
        else if (must) reasons.push(`${fmtMD(d, false)} ${reqName[must]} 요청이 있어서`)
        else if (kind === 'weekend') {
          if (!s.weekendTeam) reasons.push(`${fmtMD(d, false)} 주말 근무 팀이 아니에요`)
          else if (!s.canWeekend) reasons.push(`${fmtMD(d, false)} 주말 근무 불가로 설정돼 있어요`)
          else reasons.push(`${fmtMD(d, false)} 주말 횟수 공평 배분 순서에서 밀렸어요`)
        } else reasons.push(`${fmtMD(d, false)} 주말 근무 때문에 평일 휴무가 필요해서`)
      }
    }
    if (ok === days.length) res.push({ id: r.id, result: 'applied', note: '' })
    else
      res.push({
        id: r.id,
        result: 'unmet',
        note: (ok > 0 ? `${days.length}일 중 ${ok}일 반영 · ` : '') + reasons.slice(0, 3).join(', ') + (reasons.length > 3 ? ` 외 ${reasons.length - 3}일` : ''),
      })
  }
  return res
}

function countOff(ctx: Ctx, cells: Cells, d: string) {
  return ctx.input.staff.filter((x) => x.weekendTeam && cells.get(key(x.id, d)) === 'off').length
}

/**
 * 주말 횟수 자투리 이월: 지난 일정표(최근 3개)에서 평균보다 적게 한 만큼 음수, 많이 한 만큼 양수.
 * 그 달에 주말을 한 번도 안 한 사람(휴직·신입 등)은 그 달 계산에서 빠져요.
 */
export function computeCarry(
  past: { start_date: string; end_date: string }[],
  asg: { staff_id: string; date: string; code: string }[],
  holidays: { date: string; work_open: boolean }[] = [],
): Record<string, number> {
  const offHol = new Set(holidays.filter((h) => !h.work_open).map((h) => h.date))
  const carry: Record<string, number> = {}
  const recent = [...past].sort((a, b) => b.start_date.localeCompare(a.start_date)).slice(0, 3)
  for (const p of recent) {
    const cnt: Record<string, number> = {}
    asg.forEach((a) => {
      if (a.date < p.start_date || a.date > p.end_date || a.code !== 'work' || offHol.has(a.date)) return
      const w = dow(a.date)
      if (w === 0 || w === 6) cnt[a.staff_id] = (cnt[a.staff_id] ?? 0) + 1
    })
    const ids = Object.keys(cnt)
    if (ids.length < 2) continue
    const mean = ids.reduce((n, id) => n + cnt[id], 0) / ids.length
    ids.forEach((id) => (carry[id] = (carry[id] ?? 0) + cnt[id] - mean))
  }
  Object.keys(carry).forEach((id) => (carry[id] = Math.max(-3, Math.min(3, carry[id]))))
  return carry
}
