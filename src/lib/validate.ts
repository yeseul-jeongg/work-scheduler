// 규칙 검사: 자동 배정 결과와 (5단계) 손으로 고친 결과를 같은 기준으로 봐요.
import { addDays, dateRange, fmtMD } from './dates'
import { makeCtx, key, weekStat, windowStart, dutyRuns, MAX_RUN, type Cells, type Ctx, type RInput } from './rules'

export type Problem = {
  /** error = 배정 불가(규칙 위반), warn = 되도록 지키는 규칙 */
  level: 'error' | 'warn'
  kind: 'weekend_short' | 'weekend_solo' | 'weekend_forbidden' | 'run' | 'off_max' | 'week_count' | 'event_off'
  msg: string
  /** 문제가 있는 날짜 (열 전체 표시) */
  date?: string
  staffId?: string
  /** 사람+날짜 칸 표시 */
  cells?: string[]
}

export function validate(input: RInput, cells: Cells, ctxIn?: Ctx): Problem[] {
  const ctx = ctxIn ?? makeCtx(input)
  const out: Problem[] = []
  const { staff } = input
  const nameOf = (id: string) => ctx.staffById.get(id)?.name ?? ''

  // 1) 주말 인원
  for (const d of ctx.days) {
    if (ctx.kind(d) !== 'weekend') continue
    const need = ctx.weekendNeed(d)
    const on = staff.filter((s) => s.weekendTeam && ctx.employed(s, d) && cells.get(key(s.id, d)) === 'work')
    if (on.length < need) {
      out.push({ level: 'error', kind: 'weekend_short', date: d, msg: `${fmtMD(d)} 주말 인원 부족 (${on.length}/${need}명)` })
    }
    if (on.length === 1 && !on[0].canSolo) {
      out.push({ level: 'error', kind: 'weekend_solo', date: d, staffId: on[0].id, cells: [key(on[0].id, d)], msg: `${fmtMD(d)} ${on[0].name} 혼자 근무 불가인데 혼자예요` })
    } else if (on.length >= 2 && !on.some((s) => s.canSolo)) {
      out.push({ level: 'error', kind: 'weekend_solo', date: d, msg: `${fmtMD(d)} 혼자 근무 가능한 사람이 한 명도 없어요` })
    }
    staff
      .filter((s) => s.weekendTeam && !s.canWeekend && cells.get(key(s.id, d)) === 'work')
      .forEach((s) =>
        out.push({ level: 'error', kind: 'weekend_forbidden', date: d, staffId: s.id, cells: [key(s.id, d)], msg: `${fmtMD(d)} ${s.name} 주말 근무 불가로 설정돼 있어요` }),
      )
  }

  // 2) 집체팀 평일 휴무 하루 최대 N명 (연차 제외)
  for (const d of ctx.days) {
    if (ctx.kind(d) !== 'weekday') continue
    const offs = staff.filter((s) => s.weekendTeam && ctx.employed(s, d) && cells.get(key(s.id, d)) === 'off')
    if (offs.length > input.offMax) {
      out.push({
        level: 'error',
        kind: 'off_max',
        date: d,
        cells: offs.map((s) => key(s.id, d)),
        msg: `${fmtMD(d)} 집체팀 평일 휴무 ${offs.length}명 (최대 ${input.offMax}명): ${offs.map((s) => s.name).join(', ')}`,
      })
    }
    // 개강일·평일 종강일에 집체팀 휴무 (되도록 전원 출근)
    if (ctx.isEventWeekday(d)) {
      offs.forEach((s) =>
        out.push({ level: 'warn', kind: 'event_off', date: d, staffId: s.id, cells: [key(s.id, d)], msg: `${fmtMD(d)} ${ctx.eventLabel(d)}인데 ${s.name} 휴무` }),
      )
    }
  }

  // 3) 연속 근무 최대 5일 (직전 일정표 끝부분부터 이어서)
  const from = addDays(input.start, -MAX_RUN)
  for (const s of staff) {
    for (const [a, b, n] of dutyRuns(ctx, cells, s.id, from, input.end)) {
      if (n > MAX_RUN && b >= input.start) {
        out.push({
          level: 'warn',
          kind: 'run',
          staffId: s.id,
          cells: dateRange(a < input.start ? input.start : a, b).map((d) => key(s.id, d)),
          msg: `${s.name} ${fmtMD(a, false)}~${fmtMD(b, false)} ${n}일 연속 근무 (연차 등으로 조정 필요)`,
        })
      }
    }
  }

  // 4) 주 근무일 (월~일 기준, 주 5일)
  const windows = new Set(ctx.days.map(windowStart))
  for (const ws of windows) {
    for (const s of staff) {
      const w = weekStat(ctx, cells, s, ws)
      if (w.open) continue
      if (w.target === 0 && w.count === 0) continue
      const range = `${fmtMD(w.ws, false)}~${fmtMD(w.we, false)}`
      const inPeriod = dateRange(w.ws, w.we).filter((d) => d >= input.start && d <= input.end && ctx.employed(s, d))
      if (inPeriod.length === 0) continue
      if (w.count > w.target) {
        out.push({ level: 'error', kind: 'week_count', staffId: s.id, cells: inPeriod.map((d) => key(s.id, d)), msg: `${s.name} ${range} 근무 ${w.count}일 (기준 ${w.target}일) · 평일 휴무를 넣을 수 없어요` })
      } else if (w.count + w.dayoffs < w.target) {
        out.push({ level: 'error', kind: 'week_count', staffId: s.id, cells: inPeriod.map((d) => key(s.id, d)), msg: `${s.name} ${range} 근무 ${w.count}일 (기준 ${w.target}일) · 근무일이 모자라요` })
      }
    }
  }

  return out.map((p) => (p.staffId && !p.msg.includes(nameOf(p.staffId)) ? { ...p, msg: `${nameOf(p.staffId)} ${p.msg}` } : p))
}
