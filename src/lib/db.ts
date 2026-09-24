// Supabase 테이블 읽기/쓰기를 한 곳에 모아둔 파일
import { supabase } from './supabase'

export const RANKS = ['과장', '대리', '주임', '사원'] as const

export type Settings = {
  id: number
  branch_name: string
  weekend_min: number
  event_weekend_min: number
  weekday_off_max: number
}
export type Team = { id: string; name: string; weekend_duty: boolean; sort_order: number }
export type Staff = {
  id: string
  name: string
  rank: string
  team_id: string | null
  can_solo: boolean
  can_weekend: boolean
  /** 집체팀이 아니어도 학원 근무 대타 가능 (06_step5.sql) */
  can_academy: boolean
  hire_date: string | null
  leave_date: string | null
  sort_order: number
  memo: string
}
export type Course = { id: string; name: string; sort_order: number; active: boolean }
export type Holiday = { id: string; date: string; name: string; source: 'auto' | 'manual'; work_open: boolean }
export type EventRow = {
  id: string
  date: string
  kind: 'open' | 'close'
  course_id: string | null
  label: string
  cohort: string
  weekend_need: number
}
export type Period = {
  id: string
  year: number
  month: number
  start_date: string
  end_date: string
  status: 'draft' | 'confirmed'
}
export type ReqKind = 'leave' | 'dayoff' | 'shoot' | 'want_work' | 'want_off'
export type Request = {
  id: string
  staff_id: string
  kind: ReqKind
  start_date: string
  end_date: string
  memo: string | null
  status: 'approved' | 'pending' | 'rejected'
  /** 자동 배정 반영 결과 (05_step4.sql) */
  result?: 'applied' | 'unmet' | null
  result_note?: string | null
}
export type Assignment = {
  staff_id: string
  date: string
  period_id: string | null
  code: 'work' | 'leave' | 'off' | 'shoot'
  /** 손으로 고친 칸 (다시 자동 배정해도 유지) */
  locked: boolean
  /** 자동 배정이 처음 넣은 값 (되돌리기용, 06_step5.sql) */
  auto_code?: 'work' | 'leave' | 'off' | 'shoot' | null
}
export type Memo = { date: string; text: string; highlight: boolean }

export const REQ_KINDS: { id: ReqKind; label: string; must: boolean; cls: string }[] = [
  { id: 'leave', label: '연차', must: true, cls: 'lv' },
  { id: 'dayoff', label: '휴무 지정', must: true, cls: 'off' },
  { id: 'shoot', label: '촬영', must: true, cls: 'ph' },
  { id: 'want_work', label: '근무 희망', must: false, cls: 'ww' },
  { id: 'want_off', label: '휴무 희망', must: false, cls: 'wo' },
]
export const reqKind = (k: ReqKind) => REQ_KINDS.find((x) => x.id === k)!

function db() {
  if (!supabase) throw new Error('Supabase 설정이 없어요.')
  return supabase
}

/** Supabase 오류를 읽기 쉬운 한국어로 */
export function errText(e: unknown): string {
  const err = e as { message?: string; code?: string; details?: string }
  const msg = err?.message || String(e)
  if (err?.code === '23505') return '이미 같은 항목이 있어요.'
  if (err?.code === '23514') return '입력값이 규칙에 맞지 않아요. (날짜 순서나 숫자를 확인해주세요)'
  if (err?.code === '42703' || err?.code === 'PGRST204' || err?.code === '42883' || err?.code === 'PGRST202') {
    return '데이터베이스 준비가 안 됐어요. Supabase SQL Editor에서 아직 안 한 SQL(03_step2_3.sql, 05_step4.sql, 06_step5.sql, 07_clear_all.sql)을 실행해주세요.'
  }
  if (err?.code === '42501') return '권한이 없어요. 관리자 계정으로 로그인했는지 확인해주세요.'
  if (/failed to fetch|network/i.test(msg)) return '인터넷 연결을 확인해주세요.'
  return msg
}

async function run<T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await p
  if (error) throw error
  return data as T
}

// ---------- 설정 ----------
export const getSettings = () => run<Settings>(db().from('sched_settings').select('*').eq('id', 1).single())
export const saveSettings = (s: Partial<Settings>) =>
  run(db().from('sched_settings').update({ ...s, updated_at: new Date().toISOString() }).eq('id', 1))

// ---------- 팀 ----------
export const listTeams = () => run<Team[]>(db().from('sched_teams').select('*').order('sort_order').order('created_at'))
export const addTeam = (name: string, sort_order: number) =>
  run(db().from('sched_teams').insert({ name, sort_order, weekend_duty: false }))
export const updateTeam = (id: string, patch: Partial<Team>) => run(db().from('sched_teams').update(patch).eq('id', id))
export const deleteTeam = (id: string) => run(db().from('sched_teams').delete().eq('id', id))
export const reorderTeams = (ids: string[]) => run(db().rpc('sched_reorder_teams', { ids }))

// ---------- 직원 ----------
export const listStaff = () => run<Staff[]>(db().from('sched_staff').select('*').order('sort_order').order('created_at'))
export const addStaff = (s: Omit<Staff, 'id'>) => run<Staff>(db().from('sched_staff').insert(s).select().single())
export const updateStaff = (id: string, patch: Partial<Staff>) => run(db().from('sched_staff').update(patch).eq('id', id))
export const deleteStaff = (id: string) => run(db().from('sched_staff').delete().eq('id', id))
export const reorderStaff = (ids: string[]) => run(db().rpc('sched_reorder_staff', { ids }))

// ---------- 과정 ----------
export const listCourses = () => run<Course[]>(db().from('sched_courses').select('*').order('sort_order').order('created_at'))
export const addCourse = (name: string, sort_order: number) => run(db().from('sched_courses').insert({ name, sort_order }))
export const updateCourse = (id: string, patch: Partial<Course>) => run(db().from('sched_courses').update(patch).eq('id', id))

// ---------- 공휴일 ----------
export const listHolidays = (from: string, to: string) =>
  run<Holiday[]>(db().from('sched_holidays').select('*').gte('date', from).lte('date', to).order('date').order('name'))
export const upsertAutoHolidays = (rows: { date: string; name: string }[]) =>
  run(
    db()
      .from('sched_holidays')
      .upsert(rows.map((r) => ({ ...r, source: 'auto' })), { onConflict: 'date,name', ignoreDuplicates: true }),
  )
export const addHolidays = (rows: { date: string; name: string }[]) =>
  run(db().from('sched_holidays').insert(rows.map((r) => ({ ...r, source: 'manual' }))))
export const setHolidayOpen = (ids: string[], work_open: boolean) =>
  run(db().from('sched_holidays').update({ work_open }).in('id', ids))
export const deleteHolidays = (ids: string[]) => run(db().from('sched_holidays').delete().in('id', ids))

// ---------- 개강·종강 ----------
export const listEvents = (from: string, to: string) =>
  run<EventRow[]>(db().from('sched_events').select('*').gte('date', from).lte('date', to).order('date').order('kind', { ascending: false }).order('label'))
export const addEvent = (e: Omit<EventRow, 'id'>) => run(db().from('sched_events').insert(e))
export const deleteEvent = (id: string) => run(db().from('sched_events').delete().eq('id', id))

// ---------- 월 일정표 ----------
export const listPeriods = () =>
  run<Period[]>(db().from('sched_periods').select('*').order('year', { ascending: false }).order('month', { ascending: false }))
export const addPeriod = (p: Omit<Period, 'id' | 'status'>) => run<Period>(db().from('sched_periods').insert(p).select().single())
export const updatePeriod = (id: string, patch: Partial<Period>) => run(db().from('sched_periods').update(patch).eq('id', id))
export const deletePeriod = (id: string) => run(db().from('sched_periods').delete().eq('id', id))

// ---------- 요청사항 ----------
export const listRequests = (from: string, to: string) =>
  run<Request[]>(
    db().from('sched_requests').select('*').lte('start_date', to).gte('end_date', from).order('start_date').order('created_at'),
  )
export const addRequest = (r: Omit<Request, 'id' | 'status'>) => run(db().from('sched_requests').insert({ ...r, status: 'approved' }))
export const deleteRequest = (id: string) => run(db().from('sched_requests').delete().eq('id', id))

// ---------- 배정 결과 · 특이사항 ----------
export const listAssignments = (from: string, to: string) =>
  run<Assignment[]>(db().from('sched_assignments').select('*').gte('date', from).lte('date', to))
/** 자동 배정 저장: 이 기간의 고정 안 한 칸을 새 결과로 바꾸고 요청 반영 결과까지 한 번에 */
export const saveAssignment = (
  periodId: string,
  from: string,
  to: string,
  cells: { staff_id: string; date: string; code: Assignment['code'] }[],
  results: { id: string; result: 'applied' | 'unmet'; note: string }[],
) =>
  run<number>(db().rpc('sched_save_assignment', { p_period: periodId, p_from: from, p_to: to, p_cells: cells, p_results: results }))
/** 배정 지우기: 이 기간 배정 칸 전부 삭제 (손으로 고친 칸 포함, 07_clear_all.sql). 지운 칸 수를 돌려줘요 */
export const clearAssignment = (from: string, to: string) => run<number>(db().rpc('sched_clear_assignment', { p_from: from, p_to: to }))
/** 손으로 고치기: 여러 칸을 한 번에 저장 (모두 locked=true, 자동 배정 값 auto_code는 그대로) */
export const editCells = (periodId: string, cells: { staff_id: string; date: string; code: Assignment['code'] }[]) =>
  run(
    db()
      .from('sched_assignments')
      .upsert(
        cells.map((c) => ({ ...c, period_id: periodId, locked: true, updated_at: new Date().toISOString() })),
        { onConflict: 'staff_id,date' },
      ),
  )
/** 손으로 고친 칸을 자동 배정 값으로 되돌리기 */
export const revertCells = (cells: { staff_id: string; date: string }[]) =>
  run<number>(db().rpc('sched_revert_cells', { p_cells: cells }))
export const listMemos = (from: string, to: string) =>
  run<Memo[]>(db().from('sched_memos').select('*').gte('date', from).lte('date', to))
export const saveMemo = (m: Memo) =>
  m.text.trim() === '' && !m.highlight
    ? run(db().from('sched_memos').delete().eq('date', m.date))
    : run(db().from('sched_memos').upsert(m, { onConflict: 'date' }))
