// 자동 배정 단위 테스트: npm test
// 9월(8/31~10/4) · 10월(10/5~11/1) 실제 달력으로 여러 시드를 돌려 규칙 위반 0건을 확인해요.
import assert from 'node:assert/strict'
import { assign, computeCarry, type AssignInput } from '../src/lib/assign'
import { validate } from '../src/lib/validate'
import { dateRange, dow } from '../src/lib/dates'
import type { Code, RStaff } from '../src/lib/rules'

const T = (id: string, weekendTeam: boolean, canSolo = true, canWeekend = true, hire: string | null = null, leave: string | null = null): RStaff => ({
  id, name: id, weekendTeam, canSolo, canWeekend, hire, leave,
})
const STAFF: RStaff[] = [
  T('승주', true), T('지민', true), T('수영', true), T('채은', true, false, false),
  T('새봄', false), T('예슬', false), T('도연', false), T('수현', false),
]
const HOL = [
  { date: '2026-09-24', work_open: false }, { date: '2026-09-25', work_open: false }, { date: '2026-09-26', work_open: false },
  { date: '2026-09-27', work_open: false }, // 회사 지정
  { date: '2026-10-03', work_open: false }, { date: '2026-10-05', work_open: false }, { date: '2026-10-09', work_open: false },
]
const SEP_EVENTS = [
  { date: '2026-09-07', kind: 'open' as const, weekend_need: 2 },
  { date: '2026-09-12', kind: 'close' as const, weekend_need: 2 },
  { date: '2026-09-19', kind: 'open' as const, weekend_need: 2 },
]
const OCT_EVENTS = [
  { date: '2026-10-12', kind: 'open' as const, weekend_need: 2 },
  { date: '2026-11-01', kind: 'close' as const, weekend_need: 2 },
  { date: '2026-11-01', kind: 'close' as const, weekend_need: 2 },
]
let rid = 0
const R = (staff_id: string, kind: AssignInput['requests'][number]['kind'], s: string, e = s) => ({ id: `r${++rid}`, staff_id, kind, start_date: s, end_date: e, status: 'approved' })
const SEP_REQ = [
  R('지민', 'leave', '2026-09-15'), R('수영', 'want_off', '2026-09-18'), R('승주', 'want_work', '2026-09-05'),
  R('채은', 'dayoff', '2026-09-09'), R('예슬', 'shoot', '2026-09-10'), R('도연', 'want_off', '2026-09-11'),
  R('승주', 'leave', '2026-09-28', '2026-09-30'), R('수현', 'want_work', '2026-09-12'),
]
const OCT_REQ = [R('수영', 'leave', '2026-10-13', '2026-10-14'), R('지민', 'want_off', '2026-10-16'), R('채은', 'want_off', '2026-10-12')]

function base(start: string, end: string, extra: Partial<AssignInput> = {}): AssignInput {
  return { start, end, weekendMin: 1, offMax: 1, staff: STAFF, holidays: HOL, events: [], requests: [], prev: {}, locked: [], carry: {}, ...extra }
}
function toMap(cells: { staff_id: string; date: string; code: Code }[]) {
  return new Map(cells.map((c) => [`${c.staff_id}|${c.date}`, c.code]))
}
function weekendCounts(cells: { staff_id: string; date: string; code: Code }[]) {
  const n: Record<string, number> = {}
  cells.forEach((c) => {
    const w = dow(c.date)
    if (c.code === 'work' && (w === 0 || w === 6)) n[c.staff_id] = (n[c.staff_id] ?? 0) + 1
  })
  return n
}

let checked = 0
let runWarn = 0
const runSamples: string[] = []
for (let seed = 1; seed <= 200; seed++) {
  // ---- 9월 ----
  const sepIn = base('2026-08-31', '2026-10-04', { events: SEP_EVENTS, requests: SEP_REQ })
  const sep = assign(sepIn, seed)
  const errs = sep.problems.filter((p) => p.level === 'error')
  assert.equal(errs.length, 0, `9월 seed ${seed}: ${errs.map((p) => p.msg).join(' / ')}`)
  const sepMap = toMap(sep.cells)
  // 공휴일엔 칸이 없어요
  assert.ok(!sepMap.has('승주|2026-09-25'))
  // 무조건 요청 반영
  assert.equal(sepMap.get('지민|2026-09-15'), 'leave')
  assert.equal(sepMap.get('채은|2026-09-09'), 'off')
  assert.equal(sepMap.get('예슬|2026-09-10'), 'shoot')
  // 원격팀은 주말 근무 없음, 평일 휴무 없음 (요청 제외)
  for (const s of ['새봄', '예슬', '도연', '수현']) {
    for (const d of dateRange('2026-08-31', '2026-10-04')) {
      const c = sepMap.get(`${s}|${d}`)
      const w = dow(d)
      if (w === 0 || w === 6) assert.notEqual(c, 'work', `${s} ${d} 주말`)
      else if (c) assert.ok(c === 'work' || c === 'shoot', `${s} ${d} ${c}`)
    }
  }
  // 채은은 주말 근무 없음
  assert.ok(![...sepMap].some(([k, c]) => k.startsWith('채은|') && c === 'work' && [0, 6].includes(dow(k.slice(3)))))
  // 주말 공평: 가능한 3명 차이 최대 1
  const wc = weekendCounts(sep.cells)
  const vals = ['승주', '지민', '수영'].map((s) => wc[s] ?? 0)
  assert.ok(Math.max(...vals) - Math.min(...vals) <= 1, `9월 seed ${seed} 주말 ${vals}`)
  // 되도록 요청 결과가 모두 있음
  assert.equal(sep.requestResults.length, SEP_REQ.length)
  const r = sep.requestResults.find((x) => x.id === SEP_REQ[7].id)!
  assert.equal(r.result, 'unmet')
  assert.match(r.note, /주말 근무 팀이 아니에요/)

  // ---- 10월 (9월 결과를 이어서) ----
  const prev: Record<string, Code> = {}
  sep.cells.forEach((c) => {
    if (c.date >= '2026-09-26') prev[`${c.staff_id}|${c.date}`] = c.code
  })
  const carry = computeCarry([{ start_date: '2026-08-31', end_date: '2026-10-04' }], sep.cells, HOL)
  const octIn = base('2026-10-05', '2026-11-01', { events: OCT_EVENTS, requests: OCT_REQ, prev, carry })
  const oct = assign(octIn, seed * 7)
  const e2 = oct.problems.filter((p) => p.level === 'error')
  assert.equal(e2.length, 0, `10월 seed ${seed}: ${e2.map((p) => p.msg).join(' / ')}`)
  for (const p of [...sep.problems, ...oct.problems]) if (p.kind === 'run') { runWarn++; if (runSamples.length < 5) runSamples.push(p.msg) }
  // 11/1 일요일 종강 2명, 그중 한 명은 혼자 가능
  const nov1 = oct.cells.filter((c) => c.date === '2026-11-01' && c.code === 'work')
  assert.equal(nov1.length, 2)
  // 9월+10월 합계 공평 (차이 최대 1)
  const wc2 = weekendCounts([...sep.cells, ...oct.cells])
  const v2 = ['승주', '지민', '수영'].map((s) => wc2[s] ?? 0)
  assert.ok(Math.max(...v2) - Math.min(...v2) <= 1, `9+10월 seed ${seed} 주말 ${v2}`)
  // 검사 함수를 따로 돌려도 같은 결과
  assert.equal(validate(octIn, toMap(oct.cells)).filter((p) => p.level === 'error').length, 0)
  checked++
}

// ---- 주 5일(월~일) 직접 확인 + 주말 근무자 휴무는 같은 주 안 ----
{
  const out = assign(base('2026-08-31', '2026-10-04', { events: SEP_EVENTS }), 3)
  const m = toMap(out.cells)
  const offHol = new Set(HOL.filter((h) => !h.work_open).map((h) => h.date))
  for (const s of STAFF) {
    for (let ws = '2026-08-31'; ws <= '2026-09-28'; ws = dateRange(ws, '2026-12-31')[7]) {
      const week = dateRange(ws, dateRange(ws, '2026-12-31')[6])
      const target = week.filter((d) => ![0, 6].includes(dow(d)) && !offHol.has(d)).length
      const worked = week.filter((d) => {
        const c = m.get(`${s.id}|${d}`)
        return c === 'work' || c === 'shoot' || (c === 'leave' && ![0, 6].includes(dow(d)))
      }).length
      assert.equal(worked, target, `${s.id} ${ws} 주 ${worked}일 (기준 ${target})`)
    }
  }
}

// ---- 사람이 모자라면 배정 불가로 알려줘요 ----
{
  const few = [T('A', true), T('B', true, false, true), T('C', false)]
  const out = assign({ ...base('2026-10-05', '2026-11-01'), staff: few, events: OCT_EVENTS }, 1)
  // 11/1 종강 2명 필요 → A, B 가능 (A 혼자 가능) → 충족, 평일 휴무 하루 1명이면 A·B 둘 다 쉬어야 하는 주가 생길 수 있어요
  assert.ok(Array.isArray(out.problems))
  const one = assign({ ...base('2026-10-05', '2026-11-01'), staff: [T('A', true, false), T('C', false)] }, 1)
  assert.ok(one.problems.some((p) => p.kind === 'weekend_short'), '혼자 근무 불가자만 있으면 주말 부족')
}

// ---- 월 중간 입사 · 퇴사 ----
{
  const staff = [...STAFF, T('신입', true, false, false, '2026-10-14'), T('퇴사', true, true, true, null, '2026-10-20')]
  const out = assign({ ...base('2026-10-05', '2026-11-01'), staff }, 5)
  const m = toMap(out.cells)
  assert.ok(!m.has('신입|2026-10-13') && m.get('신입|2026-10-14') === 'work')
  assert.ok(!m.has('퇴사|2026-10-21'))
  assert.equal(out.problems.filter((p) => p.level === 'error').length, 0, out.problems.map((p) => p.msg).join(' / '))
}

// ---- 손으로 고정한 칸은 결과에 안 나와요 (DB에 그대로) + 원격팀 주말 수동 → 평일 휴무 ----
{
  const locked = [{ staff_id: '예슬', date: '2026-10-10', code: 'work' as Code }]
  const out = assign({ ...base('2026-10-05', '2026-11-01'), locked }, 9)
  assert.ok(!out.cells.some((c) => c.staff_id === '예슬' && c.date === '2026-10-10'))
  const offs = out.cells.filter((c) => c.staff_id === '예슬' && c.code === 'off' && c.date >= '2026-10-05' && c.date <= '2026-10-09' && ![0, 6].includes(dow(c.date)))
  assert.equal(offs.length, 1, '원격팀 토요일 수동 근무 → 같은 주 평일 휴무 1일')
}

// ---- 원격팀 일요일 촬영 → 다음 주 6일 연속은 막지 않고 노란 경고 ----
{
  const reqs = [R('예슬', 'shoot', '2026-10-11')]
  const out = assign({ ...base('2026-10-05', '2026-11-01'), requests: reqs }, 2)
  const run = out.problems.filter((p) => p.kind === 'run')
  assert.equal(run.length, 1, out.problems.map((p) => p.msg).join(' / '))
  assert.equal(run[0].level, 'warn')
  assert.equal(out.problems.filter((p) => p.level === 'error').length, 0)
  console.log('경고 예시:', run[0].msg)
}

// ---- 되도록 요청 이유 ----
{
  const reqs = [R('예슬', 'want_off', '2026-10-07')]
  const out = assign({ ...base('2026-10-05', '2026-11-01'), requests: reqs }, 1)
  assert.match(out.requestResults[0].note, /주 5일/)
}

console.log(`6일 연속 경고: ${checked}번 중 ${runWarn}건`, runSamples)
console.log(`OK: ${checked}개 시드 × 9월·10월 규칙 위반 0건 + 특수 상황 테스트 통과`)
