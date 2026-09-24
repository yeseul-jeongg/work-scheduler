-- 근무 스케줄러: "배정 지우기" = 전부 초기화 (2026-09-24)
-- 전에는 손으로 고친 칸(locked)은 남겼는데, 이제 이 기간의 배정 칸을 모두 지워요.
-- (손으로 고친 칸을 살리고 새로 짜고 싶으면 "다시 자동 배정"을 쓰면 돼요)
-- 연차계산기 테이블은 건드리지 않아요. 여러 번 실행해도 괜찮아요.

create or replace function public.sched_clear_assignment(p_from date, p_to date)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare n int;
begin
  delete from public.sched_assignments where date between p_from and p_to;
  get diagnostics n = row_count;
  update public.sched_requests set result = null, result_note = null
  where start_date <= p_to and end_date >= p_from;
  return n;
end $$;

revoke all on function public.sched_clear_assignment(date, date) from public, anon;
grant execute on function public.sched_clear_assignment(date, date) to authenticated;

-- 확인: ok | 1 이 나오면 성공
select 'ok' as result,
  (select count(*) from pg_proc where proname = 'sched_clear_assignment'
     and pg_get_functiondef(oid) not like '%locked = false%') as clear_all;
