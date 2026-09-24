// 엑셀 다운로드 테스트: npm test
// 9월(8/31~10/4) 예시로 자동 배정 → 대타 한 칸 → 표 모양 확인 → 실제 xlsx 파일을 써서 다시 읽어봐요.
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import ExcelJS from 'exceljs'
import { assign, type AssignInput } from '../src/lib/assign'
import { buildSheet, weekendWord, shortHol, type SheetInput } from '../src/lib/sheet'
import { writeWorkbook } from '../src/lib/excel'
import type { Assignment, EventRow, Holiday, Staff, Team } from '../src/lib/db'

const TEAMS: Team[] = [
  { id: 't1', name: '집체팀', weekend_duty: true, sort_order: 0 },
  { id: 't2', name: '원격팀', weekend_duty: false, sort_order: 1 },
]
let so = 0
const S = (name: string, rank: string, team: string, o: Partial<Staff> = {}): Staff => ({
  id: name, name, rank, team_id: team, can_solo: true, can_weekend: true, can_academy: false,
  hire_date: null, leave_date: null, sort_order: so++, memo: '', ...o,
})
const STAFF: Staff[] = [
  S('김승주', '과장', 't1'), S('이지민', '대리', 't1'), S('박수영', '주임', 't1'), S('최채은', '사원', 't1', { can_solo: false, can_weekend: false }),
  S('정새봄', '과장', 't2'), S('정예슬', '대리', 't2', { can_academy: true }), S('한도연', '주임', 't2'), S('오수현', '사원', 't2', { hire_date: '2026-09-14' }),
]
let hid = 0
const H = (date: string, name: string, work_open = false): Holiday => ({ id: `h${++hid}`, date, name, source: 'auto', work_open })
const HOLS: Holiday[] = [
  H('2026-09-24', '추석 연휴'), H('2026-09-25', '추석'), H('2026-09-26', '추석 연휴'), H('2026-09-27', '회사 휴무'),
  H('2026-10-03', '개천절'),
]
let eid = 0
const E = (date: string, kind: 'open' | 'close', label: string): EventRow => ({ id: `e${++eid}`, date, kind, course_id: null, label, cohort: '', weekend_need: 2 })
const EVENTS: EventRow[] = [E('2026-09-07', 'open', '법인12'), E('2026-09-07', 'open', '인주3'), E('2026-09-12', 'close', '법주8'), E('2026-09-19', 'open', '인평5')]
const PERIOD = { id: 'p9', year: 2026, month: 9, start_date: '2026-08-31', end_date: '2026-10-04', status: 'draft' as const }

const duty = new Set(['t1'])
const input: AssignInput = {
  start: PERIOD.start_date, end: PERIOD.end_date, weekendMin: 1, offMax: 1,
  staff: STAFF.map((s) => ({ id: s.id, name: s.name, weekendTeam: duty.has(s.team_id!), academy: s.can_academy && !duty.has(s.team_id!), canSolo: s.can_solo, canWeekend: s.can_weekend, hire: s.hire_date, leave: s.leave_date })),
  holidays: HOLS, events: EVENTS,
  requests: [
    { id: 'r1', staff_id: '이지민', kind: 'leave', start_date: '2026-09-15', end_date: '2026-09-15', status: 'approved' },
    { id: 'r2', staff_id: '한도연', kind: 'shoot', start_date: '2026-09-10', end_date: '2026-09-10', status: 'approved' },
  ],
  prev: {}, locked: [], carry: {},
}
const out = assign(input, 3)
const asg: Assignment[] = out.cells.map((c) => ({ ...c, period_id: 'p9', locked: false, auto_code: c.code }))
// 9/13(일) 정예슬 대타: 원래 근무자 대신
const sun = asg.filter((a) => a.date === '2026-09-13' && a.code === 'work')
assert.ok(sun.length >= 1)
sun[0].code = 'off'
asg.push({ staff_id: '정예슬', date: '2026-09-13', period_id: 'p9', code: 'work', locked: true })

const inp: SheetInput = {
  period: PERIOD, branch: '강남', staff: STAFF, teams: TEAMS, hols: HOLS, events: EVENTS, asg,
  memos: [{ date: '2026-09-19', text: '권리소 검정일', highlight: true }],
}
const m = buildSheet(inp)
const at = (r: number, c: number) => m.cells.find((x) => x.r === r && x.c === c)
const col = (d: string) => 3 + (Number(d.slice(8)) + (d.slice(5, 7) === '08' ? -31 : d.slice(5, 7) === '10' ? 30 : 0))
const row = (name: string) => 6 + STAFF.findIndex((s) => s.name === name)

// 기본 모양
assert.equal(m.title, '26년 9월 일정표 (8/31 ~ 10/4)')
assert.equal(m.fileName, '강남_26년 9월 일정표.xlsx')
assert.equal(m.cols, 2 + 35 + 1)
assert.equal(m.rows, 5 + STAFF.length + 1)
assert.equal(col('2026-08-31'), 3)
assert.equal(col('2026-09-01'), 4)
assert.equal(at(4, col('2026-09-05'))!.v, 5)
assert.equal(at(5, col('2026-09-05'))!.v, '토')
assert.equal(at(5, col('2026-09-05'))!.s.color, '1A56C4')
assert.equal(at(5, col('2026-09-06'))!.s.color, 'C62828')
assert.equal(at(2, col('2026-09-07'))!.v, '법인12\n인주3')
assert.equal(at(3, col('2026-09-12'))!.v, '법주8')
// 셀 값
assert.equal(at(row('정예슬'), col('2026-09-13'))!.v, '대타')
assert.equal(at(row('정예슬'), col('2026-09-13'))!.s.color, '1A56C4')
assert.equal(at(row('이지민'), col('2026-09-15'))!.v, '연차')
assert.equal(at(row('이지민'), col('2026-09-15'))!.s.fill, 'F7C28C')
assert.equal(at(row('한도연'), col('2026-09-10'))!.v, '촬영')
const satWorker = asg.find((a) => a.date === '2026-09-05' && a.code === 'work')!
assert.equal(at(row(satWorker.staff_id), col('2026-09-05'))!.v, '주말')
assert.equal(at(row('정새봄'), col('2026-09-05'))!.s.fill, 'FBF1C4', '주말 열 연노랑')
assert.equal(at(row('오수현'), col('2026-09-01'))!.s.fill, 'EDEDED', '입사 전')
// 공휴일: 추석 3일은 한 덩어리, 회사 휴무·개천절은 따로
const merge = (c: number) => m.merges.find(([r1, c1]) => r1 === 6 && c1 === c)
assert.deepEqual(merge(col('2026-09-24')), [6, col('2026-09-24'), 6 + STAFF.length - 1, col('2026-09-26')])
assert.equal(at(6, col('2026-09-24'))!.v, '추석')
assert.deepEqual(merge(col('2026-09-27')), [6, col('2026-09-27'), 6 + STAFF.length - 1, col('2026-09-27')])
assert.equal(at(6, col('2026-10-03'))!.v, '개천절')
assert.ok(at(6, col('2026-10-03'))!.s.vertical)
// 특이사항
assert.equal(at(m.rows, col('2026-09-15'))!.v, '지민(연차)')
assert.equal(at(m.rows, col('2026-09-19'))!.v, '권리소 검정일')
assert.equal(at(m.rows, col('2026-09-19'))!.s.fill, 'FFF23D')
// 주말 횟수: 대타도 셈
const cnt = (name: string) => at(row(name), m.cols)!.v
assert.equal(cnt('정예슬'), 1)
assert.equal(cnt('최채은'), '')
// 월요일 굵은 선
assert.ok(m.weekCols.includes(col('2026-08-31')) && m.weekCols.includes(col('2026-09-07')))
// 기타
assert.equal(shortHol('대체공휴일(추석)'), '대체')
assert.equal(weekendWord({ team_id: 't1', can_academy: true }, duty), '주말')
assert.equal(weekendWord({ team_id: 't2', can_academy: false }, duty), '주말')

// 실제 파일로 써서 다시 읽기
mkdirSync('tests/out', { recursive: true })
const wb = writeWorkbook(ExcelJS, m)
const path = 'tests/out/sample-9월.xlsx'
await wb.xlsx.writeFile(path)
const back = new ExcelJS.Workbook()
await back.xlsx.readFile(path)
const ws = back.getWorksheet('9월')!
assert.equal(ws.getCell(1, 1).value, m.title)
assert.equal(ws.getCell(row('정예슬'), col('2026-09-13')).value, '대타')
assert.equal((ws.getCell(row('이지민'), col('2026-09-15')).fill as { fgColor: { argb: string } }).fgColor.argb, 'FFF7C28C')
assert.ok(ws.getCell(7, col('2026-09-25')).isMerged)
assert.equal(ws.getCell(1, 1).font.name, '맑은 고딕')

console.log(`OK: 엑셀 표 모양·파일 쓰기 테스트 통과 (${path})`)
