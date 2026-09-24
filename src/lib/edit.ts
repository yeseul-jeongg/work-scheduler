// 5단계 손으로 고치기: 바꾸기 전에 "무엇이 같이 바뀌는지"와 "새로 생기는 문제"를 미리 계산해요.
// Supabase를 쓰지 않는 순수 함수라서 노드에서 테스트할 수 있어요.
import { addDays, dateRange, fmtMD } from './dates'
import { makeCtx, key, weekStat, windowStart, dutyRuns, countsAtAcademy, MAX_RUN, type Cells, type Code, type RInput, type RStaff } from './rules'
import { validate, type Problem } from './validate'

export type Change = { staff_id: string; date: string; code: Code }
export type OffOption = { date: string; note: string; cost: number }
export type Plan = {
  changes: Change[]
  /** 대타·추가 근무 들어가는 사람의 평일 휴무 후보 (좋은 순) */
  offOptions: OffOption[]
  /** 새로 생기는 문제 (지금 없던 것만) */
  added: Problem[]
  /** 없어지는 문제 */
  removed: Problem[]
}

const CODE_NAME: Record<Code, string> = { work: '근무', off: '휴무', leave: '연차', shoot: '촬영' }
export function codeName(code: Code | undefined, weekendDay: boolean): string {
  if (!code) return '빈칸'
  if (code === 'work' && weekendDay) return '주말 근무'
  return CODE_NAME[code]
}

function probKey(p: Problem) {
  return `${p.kind}|${p.msg}`
}

/** 바뀐 뒤 규칙 검사를 다시 해서, 새로 생긴 문제와 없어진 문제를 알려줘요 */
export function diffProblems(input: RInput, cells: Cells, changes: Change[]): { added: Problem[]; removed: Problem[] } {
  const before = validate(input, cells)
  const next = new Map(cells)
  changes.forEach((c) => next.set(key(c.staff_id, c.date), c.code))
  const after = validate(input, next)
  const b = new Set(before.map(probKey))
  const a = new Set(after.map(probKey))
  return { added: after.filter((p) => !b.has(probKey(p))), removed: before.filter((p) => !a.has(probKey(p))) }
}

/** 이 사람이 이 주(월~일)에 쉴 평일 후보를 좋은 순으로 (자동 배정과 같은 기준) */
export function rankOffDays(input: RInput, cells: Cells, sid: string, ws: string, extra: Change[] = []): OffOption[] {
  const ctx = makeCtx(input)
  const s = ctx.staffById.get(sid)
  if (!s) return []
  const cur = new Map(cells)
  extra.forEach((c) => cur.set(key(c.staff_id, c.date), c.code))
  const sameTeam = (x: RStaff) => x.weekendTeam === s.weekendTeam
  const out: OffOption[] = []
  for (const d of dateRange(ws, addDays(ws, 4))) {
    if (d < input.start || d > input.end || ctx.kind(d) !== 'weekday' || !ctx.employed(s, d)) continue
    if (cur.get(key(sid, d)) !== 'work' || ctx.mustAt.get(key(sid, d))) continue
    const load = input.staff.filter((x) => x.id !== sid && sameTeam(x) && cur.get(key(x.id, d)) === 'off').length
    let cost = load * 10
    const notes: string[] = []
    if (s.weekendTeam && load + 1 > input.offMax) {
      cost += 1000
      notes.push(`휴무 ${load + 1}명이 돼요`)
    } else notes.push(load ? `휴무자 ${load}명` : '휴무자 없음')
    if (s.weekendTeam && ctx.isEventWeekday(d)) {
      cost += 200
      notes.push(ctx.eventLabel(d))
    }
    const w = ctx.wantAt.get(key(sid, d))
    if (w === 'want_off') {
      cost -= 30
      notes.push('휴무 희망')
    }
    if (w === 'want_work') {
      cost += 30
      notes.push('근무 희망')
    }
    const trial = new Map(cur)
    trial.set(key(sid, d), 'off')
    const long = dutyRuns(ctx, trial, sid, addDays(ws, -MAX_RUN), addDays(ws, 6)).some(([, b, n]) => n > MAX_RUN && b >= ws)
    if (long) {
      cost += 10000
      notes.push('6일 연속 생김')
    }
    out.push({ date: d, note: notes.join(' · '), cost })
  }
  return out.sort((a, b) => a.cost - b.cost || a.date.localeCompare(b.date))
}

/**
 * 주말 칸 바꾸기 (대타 / 추가 근무 / 주말 근무 넣기 / 주말 휴무로 바꾸기)
 * - outId: 빠지는 사람 → 그날 휴무, 그 주에 주말 때문에 쉬던 평일은 다시 근무 (주 5일 유지)
 * - inId: 들어가는 사람 → 그날 근무, 같은 주 평일 하루 휴무 (inOff로 고르거나, 없으면 추천 1순위. null이면 안 넣음)
 */
export function planWeekend(
  input: RInput,
  cells: Cells,
  d: string,
  outId: string | null,
  inId: string | null,
  inOff?: string | null,
): Plan {
  const ctx = makeCtx(input)
  const ws = windowStart(d)
  const changes: Change[] = []
  const cur = new Map(cells)
  const push = (c: Change) => {
    changes.push(c)
    cur.set(key(c.staff_id, c.date), c.code)
  }

  if (outId) {
    const s = ctx.staffById.get(outId)!
    push({ staff_id: outId, date: d, code: 'off' })
    // 주 근무일이 모자라게 되면, 그 주 휴무(휴무 지정 요청 제외)를 근무로 되돌려요
    let short = weekStat(ctx, cur, s, ws).target - weekStat(ctx, cur, s, ws).count
    const offs = dateRange(ws, addDays(ws, 4)).filter(
      (x) => x >= input.start && x <= input.end && ctx.kind(x) === 'weekday' && cur.get(key(outId, x)) === 'off' && ctx.mustAt.get(key(outId, x)) !== 'dayoff',
    )
    // 휴무 희망 날은 마지막에 되돌려요
    offs.sort((a, b) => Number(ctx.wantAt.get(key(outId, a)) === 'want_off') - Number(ctx.wantAt.get(key(outId, b)) === 'want_off'))
    for (const x of offs) {
      if (short <= 0) break
      push({ staff_id: outId, date: x, code: 'work' })
      short--
    }
  }

  let offOptions: OffOption[] = []
  if (inId) {
    const s = ctx.staffById.get(inId)!
    push({ staff_id: inId, date: d, code: 'work' })
    offOptions = rankOffDays(input, cur, inId, ws)
    const need = weekStat(ctx, cur, s, ws).count - weekStat(ctx, cur, s, ws).target
    if (need > 0 && inOff !== null) {
      const picks = inOff ? [inOff] : []
      for (const o of offOptions) {
        if (picks.length >= need) break
        if (!picks.includes(o.date)) picks.push(o.date)
      }
      picks.slice(0, need).forEach((x) => push({ staff_id: inId, date: x, code: 'off' }))
    }
  }
  return { changes, offOptions, ...diffProblems(input, cells, changes) }
}

/** 휴무를 같은 주 다른 평일로 옮기기 */
export function planMoveOff(input: RInput, cells: Cells, sid: string, from: string, to: string): Plan {
  const changes: Change[] = [
    { staff_id: sid, date: from, code: 'work' },
    { staff_id: sid, date: to, code: 'off' },
  ]
  return { changes, offOptions: [], ...diffProblems(input, cells, changes) }
}

/** 한 칸만 바꾸기 */
export function planSet(input: RInput, cells: Cells, sid: string, d: string, code: Code): Plan {
  const changes = [{ staff_id: sid, date: d, code }]
  return { changes, offOptions: [], ...diffProblems(input, cells, changes) }
}

/** 대타·추가 근무 후보: 그날 학원 근무를 할 수 있는 사람 (집체팀 + 대타 가능자) */
export function weekendCandidates(input: RInput, cells: Cells, d: string, exclude: string | null) {
  const ctx = makeCtx(input)
  return input.staff
    .filter((s) => s.id !== exclude && countsAtAcademy(s) && ctx.employed(s, d) && cells.get(key(s.id, d)) !== 'work')
    .map((s) => {
      const code = cells.get(key(s.id, d))
      const blocked = code === 'leave' ? '연차' : code === 'shoot' ? '촬영' : ctx.mustAt.get(key(s.id, d)) === 'dayoff' ? '휴무 지정' : ''
      return { s, blocked }
    })
}

/** 바뀌는 내용을 사람이 읽기 쉬운 문장으로 */
export function describeChanges(input: RInput, cells: Cells, changes: Change[]): string[] {
  const ctx = makeCtx(input)
  return changes.map((c) => {
    const s = ctx.staffById.get(c.staff_id)
    const we = ctx.kind(c.date) === 'weekend'
    return `${s?.name ?? ''} ${fmtMD(c.date)}: ${codeName(cells.get(key(c.staff_id, c.date)), we)} → ${codeName(c.code, we)}`
  })
}
