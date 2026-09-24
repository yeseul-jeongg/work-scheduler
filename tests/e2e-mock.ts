// 화면 확인용 (배포 파일에는 안 들어가요): 가짜 Supabase로 9월 일정표를 띄우고 엑셀 다운로드를 눌러봐요.
// 실행: VITE_SUPABASE_URL=https://mock.supabase.co VITE_SUPABASE_ANON_KEY=sb_publishable_x npm run build && npx vite preview --port 4173 & npx tsx tests/e2e-mock.ts
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { assign, type AssignInput } from '../src/lib/assign'
import type { Staff, Team, Holiday, EventRow } from '../src/lib/db'

const require = createRequire(process.env.PW_ROOT ?? import.meta.url)
const { chromium } = require('playwright')

const teams: Team[] = [
  { id: 't1', name: '집체팀', weekend_duty: true, sort_order: 0 },
  { id: 't2', name: '원격팀', weekend_duty: false, sort_order: 1 },
]
let so = 0
const S = (name: string, rank: string, team: string, o: Partial<Staff> = {}): Staff => ({
  id: name, name, rank, team_id: team, can_solo: true, can_weekend: true, can_academy: false, hire_date: null, leave_date: null, sort_order: so++, memo: '', ...o,
})
const staff = [
  S('김승주', '과장', 't1'), S('이지민', '대리', 't1'), S('박수영', '주임', 't1'), S('최채은', '사원', 't1', { can_solo: false, can_weekend: false }),
  S('정새봄', '과장', 't2'), S('정예슬', '대리', 't2', { can_academy: true }), S('한도연', '주임', 't2'),
]
const hols: Holiday[] = [
  ['2026-09-24', '추석 연휴'], ['2026-09-25', '추석'], ['2026-09-26', '추석 연휴'], ['2026-09-27', '회사 휴무'], ['2026-10-03', '개천절'],
].map(([date, name], i) => ({ id: `h${i}`, date, name, source: 'auto', work_open: false }))
const events: EventRow[] = [
  { id: 'e1', date: '2026-09-07', kind: 'open', course_id: null, label: '법인12', cohort: '12', weekend_need: 2 },
  { id: 'e2', date: '2026-09-12', kind: 'close', course_id: null, label: '법주8', cohort: '8', weekend_need: 2 },
]
const requests = [{ id: 'r1', staff_id: '이지민', kind: 'leave', start_date: '2026-09-15', end_date: '2026-09-15', memo: null, status: 'approved' }]
const period = { id: 'p9', year: 2026, month: 9, start_date: '2026-08-31', end_date: '2026-10-04', status: 'draft' }
const input: AssignInput = {
  start: period.start_date, end: period.end_date, weekendMin: 1, offMax: 1,
  staff: staff.map((s) => ({ id: s.id, name: s.name, weekendTeam: s.team_id === 't1', academy: s.can_academy, canSolo: s.can_solo, canWeekend: s.can_weekend, hire: null, leave: null })),
  holidays: hols, events, requests: requests as AssignInput['requests'], prev: {}, locked: [], carry: {},
}
const asg = assign(input, 3).cells.map((c) => ({ ...c, period_id: 'p9', locked: false, auto_code: c.code }))
const withRed = process.env.RED === '1'
if (withRed) {
  // 9/13 원래 근무자를 휴무로 → 주말 인원 부족 (빨강)
  asg.find((a) => a.date === '2026-09-13' && a.code === 'work')!.code = 'off'
} else {
  // 9/13 정예슬 대타 (원래 근무자 휴무)
  asg.find((a) => a.date === '2026-09-13' && a.code === 'work')!.code = 'off'
  asg.push({ staff_id: '정예슬', date: '2026-09-13', period_id: 'p9', code: 'work', locked: true, auto_code: null as never })
}
const tables: Record<string, unknown[]> = {
  sched_settings: [{ id: 1, branch_name: '강남', weekend_min: 1, event_weekend_min: 2, weekday_off_max: 1 }],
  sched_staff: staff, sched_teams: teams, sched_holidays: hols, sched_events: events, sched_requests: requests,
  sched_periods: [period], sched_assignments: asg, sched_memos: [{ date: '2026-09-19', text: '권리소 검정일', highlight: true }], sched_courses: [],
}

function filter(rows: Record<string, unknown>[], params: URLSearchParams) {
  let out = rows
  params.forEach((v, k) => {
    const m = /^(eq|gte|lte|gt|lt)\.(.*)$/.exec(v)
    if (!m || ['select', 'order'].includes(k)) return
    const [, op, val] = m
    out = out.filter((r) => {
      const x = String(r[k])
      return op === 'eq' ? x === val : op === 'gte' ? x >= val : op === 'lte' ? x <= val : op === 'gt' ? x > val : x < val
    })
  })
  return out
}

const dir = 'tests/out'
mkdirSync(dir, { recursive: true })
const browser = await chromium.launch(process.env.FULL ? { executablePath: '/opt/pw-browsers/chromium' } : {})
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1500, height: 1000 } })
await ctx.addInitScript(() => {
  const exp = Math.floor(Date.now() / 1000) + 3600 * 24
  localStorage.setItem('sched-auth', JSON.stringify({ access_token: 'x', refresh_token: 'y', token_type: 'bearer', expires_in: 86400, expires_at: exp, user: { id: 'u1', email: 'a@b.c', aud: 'authenticated', role: 'authenticated' } }))
  localStorage.setItem('sched-period', 'p9')
})
await ctx.route('https://mock.supabase.co/**', async (route: { request(): { url(): string; headers(): Record<string, string> }; fulfill(o: unknown): Promise<void> }) => {
  const u = new URL(route.request().url())
  const json = (b: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) })
  if (u.pathname.startsWith('/auth/')) return json({ id: 'u1', email: 'a@b.c', aud: 'authenticated', role: 'authenticated' })
  if (u.pathname === '/rest/v1/rpc/sched_is_admin') return json(true)
  const t = u.pathname.replace('/rest/v1/', '')
  const rows = filter((tables[t] ?? []) as Record<string, unknown>[], u.searchParams)
  const single = (route.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
  return json(single ? rows[0] : rows)
})
const page = await ctx.newPage()
const errors: string[] = []
page.on('pageerror', (e: Error) => errors.push(e.message))
await page.goto('http://localhost:4173/')
await page.getByRole('button', { name: '엑셀 다운로드' }).waitFor({ timeout: 15000 })
await page.screenshot({ path: `${dir}/screen${withRed ? '-red' : ''}.png` })
const btn = page.getByRole('button', { name: '엑셀 다운로드' })
if (withRed) {
  await btn.click()
  const txt = await page.locator('button.danger').innerText()
  console.log('확인 문구:', txt)
  await page.screenshot({ path: `${dir}/screen-red-confirm.png`, clip: { x: 0, y: 0, width: 1500, height: 300 } })
}
const [dl] = await Promise.all([page.waitForEvent('download'), withRed ? page.locator('button.danger').click() : btn.click()])
const path = `${dir}/${dl.suggestedFilename()}`
await dl.saveAs(path)
await page.waitForTimeout(300)
console.log('받은 파일:', path)
console.log('알림:', await page.locator('.toast').innerText().catch(() => '(없음)'))
console.log('페이지 오류:', errors.length ? errors : '없음')
await browser.close()
