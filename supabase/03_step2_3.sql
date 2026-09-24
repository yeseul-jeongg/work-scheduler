-- =========================================================
-- 근무 스케줄러 2·3단계: 추가 설정
-- Supabase > SQL Editor 에 전체 붙여넣고 Run 한 번만 실행
-- (01, 02를 먼저 실행한 상태에서 실행. 여러 번 실행해도 괜찮아요)
-- 연차계산기 테이블은 건드리지 않아요.
-- =========================================================

-- 직원 비고 칸
alter table public.sched_staff add column if not exists memo text not null default '';

-- 과정 숨기기 (지난 개강·종강 기록이 있어서 지우지 않고 숨겨요)
alter table public.sched_courses add column if not exists active boolean not null default true;

-- 개강·종강 기수 번호 (표시는 label, 예: 법인12)
alter table public.sched_events add column if not exists cohort text not null default '';

-- 직원 표시 순서를 한 번에 저장
create or replace function public.sched_reorder_staff(ids uuid[])
returns void
language sql
security invoker
set search_path = public
as $$
  update public.sched_staff s
  set sort_order = x.ord
  from unnest(ids) with ordinality as x(id, ord)
  where s.id = x.id;
$$;

-- 팀 표시 순서를 한 번에 저장
create or replace function public.sched_reorder_teams(ids uuid[])
returns void
language sql
security invoker
set search_path = public
as $$
  update public.sched_teams t
  set sort_order = x.ord
  from unnest(ids) with ordinality as x(id, ord)
  where t.id = x.id;
$$;

revoke all on function public.sched_reorder_staff(uuid[]) from public, anon;
revoke all on function public.sched_reorder_teams(uuid[]) from public, anon;
grant execute on function public.sched_reorder_staff(uuid[]) to authenticated;
grant execute on function public.sched_reorder_teams(uuid[]) to authenticated;

-- 확인: 한 줄이 나오면 성공
select 'ok' as result,
  (select count(*) from information_schema.columns where table_name = 'sched_staff' and column_name = 'memo') as staff_memo,
  (select count(*) from information_schema.columns where table_name = 'sched_courses' and column_name = 'active') as course_active;
