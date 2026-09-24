-- =========================================================
-- 근무 스케줄러 4단계: 자동 배정
-- Supabase > SQL Editor 에 전체 붙여넣고 Run 한 번만 실행
-- (01~04를 먼저 실행한 상태에서. 여러 번 실행해도 괜찮아요)
-- 연차계산기 테이블은 건드리지 않아요.
-- =========================================================

-- 요청사항 반영 결과: applied(반영됨) / unmet(미반영) / null(배정 전)
alter table public.sched_requests add column if not exists result text;
alter table public.sched_requests add column if not exists result_note text;
alter table public.sched_requests drop constraint if exists sched_requests_result_check;
alter table public.sched_requests add constraint sched_requests_result_check check (result is null or result in ('applied', 'unmet'));

-- 자동 배정 결과를 한 번에 저장 (중간에 실패하면 전부 취소돼요)
--  1) 이 기간의 손으로 고정하지 않은(locked=false) 칸을 지우고
--  2) 새 배정을 넣고 (고정 칸은 그대로 둠)
--  3) 요청사항 반영 결과를 적어요
-- security invoker: 관리자 권한(RLS) 그대로 적용
create or replace function public.sched_save_assignment(
  p_period uuid, p_from date, p_to date, p_cells jsonb, p_results jsonb
)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare n int;
begin
  delete from public.sched_assignments
  where date between p_from and p_to and locked = false;

  insert into public.sched_assignments (staff_id, date, period_id, code, locked, updated_at)
  select (c->>'staff_id')::uuid, (c->>'date')::date, p_period, c->>'code', false, now()
  from jsonb_array_elements(p_cells) c
  where (c->>'date')::date between p_from and p_to
  on conflict (staff_id, date) do nothing;
  get diagnostics n = row_count;

  update public.sched_requests r
  set result = x->>'result', result_note = nullif(x->>'note', '')
  from jsonb_array_elements(p_results) x
  where r.id = (x->>'id')::uuid;

  return n;
end $$;

-- 배정 지우기 (손으로 고정한 칸은 남기고, 요청 결과는 "배정 전"으로)
create or replace function public.sched_clear_assignment(p_from date, p_to date)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare n int;
begin
  delete from public.sched_assignments where date between p_from and p_to and locked = false;
  get diagnostics n = row_count;
  update public.sched_requests set result = null, result_note = null
  where start_date <= p_to and end_date >= p_from;
  return n;
end $$;

revoke all on function public.sched_save_assignment(uuid, date, date, jsonb, jsonb) from public, anon;
revoke all on function public.sched_clear_assignment(date, date) from public, anon;
grant execute on function public.sched_save_assignment(uuid, date, date, jsonb, jsonb) to authenticated;
grant execute on function public.sched_clear_assignment(date, date) to authenticated;

-- 테이블 권한 (04와 같은 내용. 새 칸에도 권한이 필요해서 다시 확인)
grant select, insert, update, delete on public.sched_requests, public.sched_assignments to authenticated;

-- 확인: ok | 2 | 2 가 나오면 성공
select 'ok' as result,
  (select count(*) from information_schema.columns where table_name = 'sched_requests' and column_name in ('result', 'result_note')) as request_cols,
  (select count(*) from pg_proc where proname in ('sched_save_assignment', 'sched_clear_assignment')) as functions;
