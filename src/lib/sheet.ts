// 엑셀 다운로드(6단계)용 표 모양 만들기
// 화면 일정표(A안)와 같은 기준으로 칸 글자·색·병합을 정해요. Supabase·엑셀 라이브러리를 쓰지 않는 순수 코드라서
// 노드 테스트에서 바로 확인할 수 있어요. 실제 파일 쓰기는 excel.ts가 해요.
import { dateRange, dow, DOW } from './dates'
import type { Assignment, EventRow, Holiday, Memo, Period, Staff, Team } from './db'

/** 색은 화면(index.css)과 같은 값 */
export const COLORS = {
  weekendFill: 'FBF1C4', // 주말 열 연노랑
  holFill: 'CFE2F3', // 공휴일 하늘색
  holText: '1D3F66',
  leaveFill: 'F7C28C', // 연차 주황
  weekendText: '1A56C4', // 주말·대타 파란 글씨 / 토요일
  sunText: 'C62828', // 일요일·공휴일 빨강
  shootText: '7B2FB5', // 촬영 보라
  openFill: 'FFF1A6', // 개강 노랑
  closeFill: 'F6D3EF', // 종강 분홍
  memoHl: 'FFF23D', // 특이사항 노란 강조
  naFill: 'EDEDED', // 입사 전·퇴사 후
  headFill: 'F2F2F2', // 왼쪽 머리칸
  line: 'BFBFBF',
  weekLine: '6B6B6B', // 월요일 왼쪽 굵은 선
} as const

export type XStyle = {
  fill?: string
  color?: string
  bold?: boolean
  size?: number
  wrap?: boolean
  /** 글자를 세로로 (좁은 공휴일 칸) */
  vertical?: boolean
  align?: 'left' | 'center'
}
/** 행·열은 엑셀처럼 1부터 */
export type XCell = { r: number; c: number; v: string | number; s: XStyle }
export type SheetModel = {
  title: string
  sheetName: string
  fileName: string
  rows: number
  cols: number
  cells: XCell[]
  /** [시작행, 시작열, 끝행, 끝열] */
  merges: [number, number, number, number][]
  rowHeights: Record<number, number>
  colWidths: number[]
  /** 월요일 열 번호 (왼쪽 굵은 선) */
  weekCols: number[]
  /** 표 테두리를 그릴 첫 행 (제목 아래) */
  tableTop: number
  /** 틀 고정: 이 행·열까지 */
  freezeRow: number
  freezeCol: number
}

export type SheetInput = {
  period: Period
  branch: string
  staff: Staff[]
  teams: Team[]
  hols: Holiday[]
  events: EventRow[]
  asg: Assignment[]
  memos: Memo[]
}

export function shortHol(name: string): string {
  const base = name.replace(/\s*\(.*\)\s*/g, '')
  if (base.startsWith('대체공휴일')) return '대체'
  return base.replace(/\s*연휴$/, '')
}

export function periodTitle(p: Pick<Period, 'year' | 'month' | 'start_date' | 'end_date'>): string {
  const s = p.start_date.split('-').map(Number)
  const e = p.end_date.split('-').map(Number)
  return `${String(p.year).slice(2)}년 ${p.month}월 일정표 (${s[1]}/${s[2]} ~ ${e[1]}/${e[2]})`
}

/** 주말 근무 칸 글자: 집체팀(주말 근무 팀)은 "주말", 학원 대타 가능자(원격팀)는 "대타" */
export function weekendWord(s: Pick<Staff, 'team_id' | 'can_academy'>, dutyTeams: Set<string>): '주말' | '대타' {
  const duty = !!s.team_id && dutyTeams.has(s.team_id)
  return !duty && s.can_academy ? '대타' : '주말'
}

// 줄 수에 맞춘 행 높이 (pt)
const lineH = (n: number, per = 11.5) => Math.max(18, Math.ceil(n * per + 5))

export function buildSheet(inp: SheetInput): SheetModel {
  const { period } = inp
  const from = period.start_date
  const to = period.end_date
  const days = dateRange(from, to)
  const duty = new Set(inp.teams.filter((t) => t.weekend_duty).map((t) => t.id))
  const people = inp.staff.filter((s) => (!s.hire_date || s.hire_date <= to) && (!s.leave_date || s.leave_date >= from))
  const asgAt = new Map(inp.asg.map((a) => [`${a.staff_id}|${a.date}`, a]))
  const holBy = new Map<string, Holiday[]>()
  inp.hols.forEach((h) => holBy.set(h.date, [...(holBy.get(h.date) ?? []), h]))
  const offHol = (d: string) => (holBy.get(d) ?? []).find((h) => !h.work_open)

  // 열: A 직급, B 성명, C… 날짜, 마지막 주말 횟수
  const C0 = 3
  const colOf = (i: number) => C0 + i
  const cntCol = C0 + days.length
  const cols = cntCol
  // 행: 1 제목, 2 개강, 3 종강, 4 날짜, 5 요일, 6… 직원, 마지막 특이사항
  const R_TITLE = 1
  const R_OPEN = 2
  const R_CLOSE = 3
  const R_DATE = 4
  const R_DOW = 5
  const R_STAFF = 6
  const R_MEMO = R_STAFF + people.length
  const rows = R_MEMO

  const cells: XCell[] = []
  const merges: SheetModel['merges'] = []
  const rowHeights: Record<number, number> = {}
  const put = (r: number, c: number, v: string | number, s: XStyle = {}) => cells.push({ r, c, v, s })
  const head: XStyle = { fill: COLORS.headFill, bold: true }

  // 제목
  const title = periodTitle(period)
  put(R_TITLE, 1, title, { bold: true, size: 14, align: 'left' })
  merges.push([R_TITLE, 1, R_TITLE, cols])
  rowHeights[R_TITLE] = 26

  // 지점 / 개강 / 종강
  put(R_OPEN, 1, inp.branch, head)
  merges.push([R_OPEN, 1, R_CLOSE, 1])
  put(R_OPEN, 2, '개강', { ...head, fill: COLORS.openFill })
  put(R_CLOSE, 2, '종강', { ...head, fill: COLORS.closeFill })
  let openLines = 1
  let closeLines = 1
  days.forEach((d, i) => {
    const opens = inp.events.filter((e) => e.date === d && e.kind === 'open').map((e) => e.label)
    const closes = inp.events.filter((e) => e.date === d && e.kind === 'close').map((e) => e.label)
    openLines = Math.max(openLines, opens.length)
    closeLines = Math.max(closeLines, closes.length)
    put(R_OPEN, colOf(i), opens.join('\n'), opens.length ? { fill: COLORS.openFill, bold: true, size: 8, wrap: true } : {})
    put(R_CLOSE, colOf(i), closes.join('\n'), closes.length ? { fill: COLORS.closeFill, bold: true, size: 8, wrap: true } : {})
  })
  put(R_OPEN, cntCol, '')
  put(R_CLOSE, cntCol, '')
  rowHeights[R_OPEN] = lineH(openLines, 10.5)
  rowHeights[R_CLOSE] = lineH(closeLines, 10.5)

  // 날짜 · 요일
  put(R_DATE, 1, '일', head)
  merges.push([R_DATE, 1, R_DATE, 2])
  put(R_DOW, 1, '직급', head)
  put(R_DOW, 2, '성명', head)
  days.forEach((d, i) => {
    const w = dow(d)
    const off = offHol(d)
    const s: XStyle = { bold: true, color: off || w === 0 ? COLORS.sunText : w === 6 ? COLORS.weekendText : undefined, fill: off ? COLORS.holFill : undefined }
    put(R_DATE, colOf(i), Number(d.slice(8)), s)
    put(R_DOW, colOf(i), DOW[w], s)
  })
  put(R_DATE, cntCol, '주말', head)
  put(R_DOW, cntCol, '횟수', head)

  // 직원 칸
  type Kind = 'hol' | 'na' | 'cell'
  const kindAt: Kind[][] = people.map(() => [])
  people.forEach((s, ri) => {
    const r = R_STAFF + ri
    put(r, 1, s.rank, { fill: COLORS.headFill })
    put(r, 2, s.name, { fill: COLORS.headFill, bold: true })
    let weekendCount = 0
    days.forEach((d, i) => {
      const c = colOf(i)
      const w = dow(d)
      const we = w === 0 || w === 6
      const base: XStyle = we ? { fill: COLORS.weekendFill } : {}
      if ((s.hire_date && d < s.hire_date) || (s.leave_date && d > s.leave_date)) {
        kindAt[ri][i] = 'na'
        return put(r, c, '', { fill: COLORS.naFill })
      }
      const a = asgAt.get(`${s.id}|${d}`)
      if (offHol(d) && !a) {
        kindAt[ri][i] = 'hol'
        return put(r, c, '', { fill: COLORS.holFill })
      }
      kindAt[ri][i] = 'cell'
      if (!a || a.code === 'off') return put(r, c, '', base)
      if (a.code === 'leave') return put(r, c, '연차', { fill: COLORS.leaveFill })
      if (a.code === 'shoot') return put(r, c, '촬영', { ...base, color: COLORS.shootText, bold: true })
      if (we) {
        weekendCount++
        return put(r, c, weekendWord(s, duty), { ...base, color: COLORS.weekendText, bold: true })
      }
      put(r, c, '근무', base)
    })
    put(r, cntCol, weekendCount || '', { bold: true })
  })

  // 공휴일: 전 직원이 쉬는 날은 세로로 병합 + 이름. 같은 이름이 이어지면 가로로도 묶어요 (예: 추석 연휴 3일)
  if (people.length) {
    const fullHol = days.map((_, i) => people.every((_, ri) => kindAt[ri][i] === 'hol' || kindAt[ri][i] === 'na') && people.some((_, ri) => kindAt[ri][i] === 'hol'))
    let i = 0
    while (i < days.length) {
      if (!fullHol[i]) {
        // 일부만 쉬는 날: 칸만 하늘색, 가운데 사람 칸에 이름
        const hs = people.map((_, ri) => ri).filter((ri) => kindAt[ri][i] === 'hol')
        if (hs.length) {
          const mid = hs[Math.floor((hs.length - 1) / 2)]
          const cell = cells.find((x) => x.r === R_STAFF + mid && x.c === colOf(i))!
          cell.v = shortHol(offHol(days[i])!.name)
          cell.s = { ...cell.s, color: COLORS.holText, bold: true, size: 8 }
        }
        i++
        continue
      }
      const name = shortHol(offHol(days[i])!.name)
      let j = i
      while (j + 1 < days.length && fullHol[j + 1] && shortHol(offHol(days[j + 1])!.name) === name) j++
      // 입사 전·퇴사 후 칸이 끼어 있으면 병합하지 않고 칸마다 색만
      const clean = people.every((_, ri) => {
        for (let k = i; k <= j; k++) if (kindAt[ri][k] !== 'hol') return false
        return true
      })
      const cell = cells.find((x) => x.r === R_STAFF && x.c === colOf(i))!
      const wide = j > i
      cell.v = wide ? name : name.replace(/\s+/g, '')
      cell.s = { fill: COLORS.holFill, color: COLORS.holText, bold: true, size: wide ? 10 : 9, vertical: !wide, wrap: true }
      if (clean && (people.length > 1 || wide)) merges.push([R_STAFF, colOf(i), R_STAFF + people.length - 1, colOf(j)])
      i = j + 1
    }
  }

  // 특이사항: 연차·촬영 자동 + 담당자 메모 (노란 강조)
  put(R_MEMO, 1, '특이사항', head)
  merges.push([R_MEMO, 1, R_MEMO, 2])
  let memoLines = 1
  days.forEach((d, i) => {
    const auto: string[] = []
    people.forEach((s) => {
      const a = asgAt.get(`${s.id}|${d}`)
      if (a?.code === 'leave') auto.push(`${s.name.slice(-2)}(연차)`)
      if (a?.code === 'shoot') auto.push(`${s.name.slice(-2)}(촬영)`)
    })
    const memo = inp.memos.find((m) => m.date === d)
    const lines = [...auto, ...(memo?.text ? [memo.text] : [])]
    memoLines = Math.max(memoLines, lines.reduce((n, t) => n + Math.max(1, Math.ceil(t.length / 4)), 0))
    put(R_MEMO, colOf(i), lines.join('\n'), { size: 8, wrap: true, fill: memo?.highlight ? COLORS.memoHl : undefined, bold: !!memo?.highlight })
  })
  put(R_MEMO, cntCol, '')
  rowHeights[R_MEMO] = lineH(memoLines, 10.5)

  const branch = inp.branch ? `${inp.branch}_` : ''
  return {
    title,
    sheetName: `${period.month}월`,
    fileName: `${branch}${String(period.year).slice(2)}년 ${period.month}월 일정표.xlsx`,
    rows,
    cols,
    cells,
    merges,
    rowHeights,
    colWidths: [6, 8, ...days.map(() => 7), 6],
    weekCols: days.map((d, i) => (dow(d) === 1 ? colOf(i) : 0)).filter(Boolean),
    tableTop: R_OPEN,
    freezeRow: R_DOW,
    freezeCol: 2,
  }
}
