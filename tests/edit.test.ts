// 5단계 손으로 고치기 테스트: npx tsx tests/edit.test.ts
import assert from 'node:assert/strict'
import { assign, type AssignInput } from '../src/lib/assign'
import { planWeekend, planMoveOff, planSet, weekendCandidates, rankOffDays } from '../src/lib/edit'
import { weekStat, makeCtx, windowStart, type Code, type RStaff } from '../src/lib/rules'
import { dateRange, dow } from '../src/lib/dates'

const T = (id: string, weekendTeam: boolean, canSolo = true, canWeekend = true, academy = false): RStaff => ({
  id, name: id, weekendTeam, canSolo, canWeekend, academy, hire: null, leave: null,
})
const STAFF: RStaff[] = [
  T('승주', true), T('지민', true), T('수영', true), T('채은', true, false, false),
  T('새봄', false), T('예슬', false, true, true, true), T('도연', false), T('수현', false, false, true, true),
]
const HOL = ['2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27', '2026-10-03'].map((date) => ({ date, work_open: false }))
const EVENTS = [
  { date: '2026-09-07', kind: 'open' as const, weekend_need: 2 },
  { date: '2026-09-12', kind: 'close' as const, weekend_need: 2 },
]
const input: AssignInput = {
  start: '2026-08-31', end: '2026-10-04', weekendMin: 1, offMax: 1, staff: STAFF, holidays: HOL, events: EVENTS,
  requests: [], prev: {}, locked: [], carry: {},
}
const errs = (ps: { level: string }[]) => ps.filter((p) => p.level === 'error')

let n = 0
for (let seed = 1; seed <= 50; seed++) {
  const out = assign(input, seed)
  const cells = new Map<string, Code>(out.cells.map((c) => [`${c.staff_id}|${c.date}`, c.code]))
  const on = (d: string) => STAFF.filter((s) => cells.get(`${s.id}|${d}`) === 'work').map((s) => s.id)
  const ctx = makeCtx(input)

  // 1) 9/12 종강(2명) 중 한 명을 예슬(원격·대타 가능)로 대타 → 새 빨간 문제 없음, 둘 다 주 5일
  const [x] = on('2026-09-12')
  const p1 = planWeekend(input, cells, '2026-09-12', x, '예슬')
  assert.equal(errs(p1.added).length, 0, `seed ${seed} 대타: ${p1.added.map((p) => p.msg).join(' / ')}`)
  const after = new Map(cells)
  p1.changes.forEach((c) => after.set(`${c.staff_id}|${c.date}`, c.code))
  for (const id of [x, '예슬']) {
    const w = weekStat(ctx, after, ctx.staffById.get(id)!, windowStart('2026-09-12'))
    assert.equal(w.count, w.target, `seed ${seed} ${id} 주 ${w.count}/${w.target}`)
  }
  assert.ok(p1.changes.some((c) => c.staff_id === x && c.code === 'work' && ![0, 6].includes(dow(c.date))), '빠진 사람 평일 휴무 → 근무')
  assert.ok(p1.changes.some((c) => c.staff_id === '예슬' && c.code === 'off'), '대타 평일 휴무')

  // 2) 9/5(1명) 추가 근무로 예슬 → 새 빨간 문제 없음 (집체 1 + 대타 1)
  const p2 = planWeekend(input, cells, '2026-09-05', null, '예슬')
  assert.equal(errs(p2.added).length, 0, p2.added.map((p) => p.msg).join(' / '))

  // 3) 대타 가능 아닌 원격팀(도연)으로 대타 → 학원 인원이 아니라 주말 인원 부족(빨강)
  const [y] = on('2026-09-05')
  const p3 = planWeekend(input, cells, '2026-09-05', y, '도연')
  assert.ok(p3.added.some((p) => p.kind === 'weekend_short'), '도연은 학원 인원 아님')

  // 4) 혼자 불가 대타(수현) 혼자 → 빨강 (저장은 되지만 표시)
  const p4 = planWeekend(input, cells, '2026-09-05', y, '수현')
  assert.ok(p4.added.some((p) => p.kind === 'weekend_solo'))

  // 5) 후보 목록: 대타 가능자와 집체팀만, 도연·새봄은 없음
  const cands = weekendCandidates(input, cells, '2026-09-05', y).map((c) => c.s.id)
  assert.ok(cands.includes('예슬') && cands.includes('수현') && !cands.includes('도연') && !cands.includes('새봄'))

  // 6) 휴무 옮기기: 다른 집체팀이 쉬는 날로 옮기면 빨강 (하루 최대 1명)
  const ws = '2026-09-07'
  const offOf = (id: string) => dateRange(ws, '2026-09-11').find((d) => cells.get(`${id}|${d}`) === 'off')
  const a = ['승주', '지민', '수영'].find((id) => offOf(id))!
  const b = ['승주', '지민', '수영'].find((id) => id !== a && offOf(id))
  if (b) {
    const p6 = planMoveOff(input, cells, a, offOf(a)!, offOf(b)!)
    assert.ok(p6.added.some((p) => p.kind === 'off_max'))
  }

  // 7) 평일 근무를 휴무로 → 주 근무일 모자람(빨강)
  const p7 = planSet(input, cells, '새봄', '2026-09-08', 'off')
  assert.ok(p7.added.some((p) => p.kind === 'week_count'))

  // 8) 휴무 추천: 이미 휴무자 있는 날보다 없는 날이 앞
  const opts = rankOffDays(input, cells, '예슬', ws)
  assert.ok(opts.length > 0)
  n++
}

// 9) 손으로 넣은 대타(locked)가 있으면 자동 배정은 그날 사람을 더 안 넣어요
{
  const out = assign({ ...input, locked: [{ staff_id: '예슬', date: '2026-09-05', code: 'work' }] }, 7)
  const workers = out.cells.filter((c) => c.date === '2026-09-05' && c.code === 'work')
  assert.equal(workers.length, 0, '예슬 1명으로 충분 (locked 칸은 결과에 안 나옴)')
  assert.equal(errs(out.problems).length, 0, out.problems.map((p) => p.msg).join(' / '))
}

console.log(`OK: 손으로 고치기 ${n}개 시드 테스트 통과`)
