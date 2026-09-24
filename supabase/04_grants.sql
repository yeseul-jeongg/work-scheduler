-- =========================================================
-- 근무 스케줄러: 테이블 사용 권한 열기
-- "권한이 없어요" 오류가 날 때 SQL Editor에서 한 번 실행
-- (최근 Supabase 프로젝트는 새 테이블에 자동으로 권한을 주지 않아서 필요해요)
-- 로그인한 계정에만 열고, 실제로 읽고 쓰는 건 여전히 관리자 명단(RLS)으로 막아요.
-- 연차계산기 테이블은 건드리지 않아요. 여러 번 실행해도 괜찮아요.
-- =========================================================
grant usage on schema public to authenticated;

grant select on public.sched_admins to authenticated;
grant select, insert, update, delete on
  public.sched_settings,
  public.sched_teams,
  public.sched_staff,
  public.sched_courses,
  public.sched_holidays,
  public.sched_events,
  public.sched_periods,
  public.sched_requests,
  public.sched_assignments,
  public.sched_memos
to authenticated;

-- 로그인 안 한 사람(anon)은 표를 아예 못 봐요
revoke all on
  public.sched_admins, public.sched_settings, public.sched_teams, public.sched_staff,
  public.sched_courses, public.sched_holidays, public.sched_events, public.sched_periods,
  public.sched_requests, public.sched_assignments, public.sched_memos
from anon;

grant execute on function public.sched_is_admin() to authenticated;
grant execute on function public.sched_ping() to anon, authenticated;
grant execute on function public.sched_reorder_staff(uuid[]) to authenticated;
grant execute on function public.sched_reorder_teams(uuid[]) to authenticated;

-- 확인: 11줄 모두 authenticated 권한이 보이면 성공
select table_name, string_agg(privilege_type, ', ' order by privilege_type) as 권한
from information_schema.role_table_grants
where grantee = 'authenticated' and table_name like 'sched\_%'
group by table_name
order by table_name;
