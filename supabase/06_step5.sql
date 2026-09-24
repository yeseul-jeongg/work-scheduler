-- =========================================================
-- 근무 스케줄러 5단계: 손으로 고치기 · 학원 대타
-- Supabase > SQL Editor 에 전체 붙여넣고 Run 한 번만 실행
-- (01~05를 먼저 실행한 상태에서. 여러 번 실행해도 괜찮아요)
-- 연차계산기 테이블은 건드리지 않아요.
-- =========================================================

-- 집체팀이 아니어도 학원 근무를 대신할 수 있는 사람
alter table public.sched_staff add column if not exists can_academy boolean not null default false;

-- 자동 배정이 처음 넣은 값 (손으로 고친 뒤 "되돌리기"에 써요)
alter table public.sched_assignments add column if not exists auto_code text;
alter table public.sched_assignments drop constraint if exists sched_assignments_auto_code_check;
alter table public.sched_assignments add constraint sched_assignments_auto_code_check
  check (auto_code is null or auto_code in ('work', 'leave', 'off', 'shoot'));
-- 이미 자동 배정된 칸은 지금 값을 자동 값으로
update public.sched_assignments set auto_code = code where auto_code is null and locked = false;

-- 자동 배정 저장 (05의 함수를 바꿔요: auto_code도 같이 적어요)
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

  insert into public.sched_assignments (staff_id, date, period_id, code, auto_code, locked, updated_at)
  select (c->>'staff_id')::uuid, (c->>'date')::date, p_period, c->>'code', c->>'code', false, now()
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

-- 손으로 고친 칸 되돌리기: 자동 값이 있으면 그 값으로, 없으면 칸을 지워요 (다음 자동 배정 때 채워짐)
create or replace function public.sched_revert_cells(p_cells jsonb)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare n int;
begin
  update public.sched_assignments a
  set code = a.auto_code, locked = false, updated_at = now()
  from jsonb_array_elements(p_cells) x
  where a.staff_id = (x->>'staff_id')::uuid and a.date = (x->>'date')::date and a.auto_code is not null;
  get diagnostics n = row_count;

  delete from public.sched_assignments a
  using jsonb_array_elements(p_cells) x
  where a.staff_id = (x->>'staff_id')::uuid and a.date = (x->>'date')::date and a.auto_code is null;

  return n;
end $$;

revoke all on function public.sched_save_assignment(uuid, date, date, jsonb, jsonb) from public, anon;
revoke all on function public.sched_revert_cells(jsonb) from public, anon;
grant execute on function public.sched_save_assignment(uuid, date, date, jsonb, jsonb) to authenticated;
grant execute on function public.sched_revert_cells(jsonb) to authenticated;

-- 테이블 권한 (새 칸에도 권한이 필요해서 다시 확인)
grant select, insert, update, delete on public.sched_staff, public.sched_assignments to authenticated;

-- 확인: ok | 1 | 1 | 1 이 나오면 성공
select 'ok' as result,
  (select count(*) from information_schema.columns where table_name = 'sched_staff' and column_name = 'can_academy') as staff_academy,
  (select count(*) from information_schema.columns where table_name = 'sched_assignments' and column_name = 'auto_code') as auto_code,
  (select count(*) from pg_proc where proname = 'sched_revert_cells') as revert_fn;
