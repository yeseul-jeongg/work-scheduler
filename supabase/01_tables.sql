-- =========================================================
-- 근무 스케줄러 1단계: 테이블 만들기
-- Supabase > SQL Editor 에 전체 붙여넣고 Run 한 번만 실행
-- (연차계산기 테이블은 건드리지 않아요. 모두 sched_ 로 시작)
-- =========================================================

-- 1) 관리자 명단 -------------------------------------------
create table if not exists public.sched_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 지금 로그인한 사람이 스케줄러 관리자인지 확인
create or replace function public.sched_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.sched_admins where user_id = auth.uid());
$$;

-- 2) 기본 설정 (한 줄만 존재) -------------------------------
create table if not exists public.sched_settings (
  id                int primary key default 1 check (id = 1),
  branch_name       text not null default '강남',
  weekend_min       int  not null default 1 check (weekend_min >= 1),
  event_weekend_min int  not null default 2 check (event_weekend_min >= 1),
  weekday_off_max   int  not null default 1 check (weekday_off_max >= 0),
  updated_at        timestamptz not null default now()
);
insert into public.sched_settings (id) values (1) on conflict (id) do nothing;

-- 3) 팀 ----------------------------------------------------
create table if not exists public.sched_teams (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,
  weekend_duty boolean not null default false,   -- 주말 근무 팀
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

-- 4) 직원 --------------------------------------------------
create table if not exists public.sched_staff (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  rank        text not null default '사원',
  team_id     uuid references public.sched_teams(id) on delete set null,
  can_solo    boolean not null default true,     -- 혼자 근무 가능
  can_weekend boolean not null default true,     -- 주말 근무 가능
  hire_date   date,                              -- 월 중간 입사일 때만
  leave_date  date,                              -- 퇴사일
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  check (leave_date is null or hire_date is null or leave_date >= hire_date)
);

-- 5) 과정 --------------------------------------------------
create table if not exists public.sched_courses (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
insert into public.sched_courses (name, sort_order) values
  ('법인', 1), ('법주', 2), ('인주', 3), ('인평', 4)
on conflict (name) do nothing;

-- 6) 공휴일 (하루에 한 줄) ----------------------------------
create table if not exists public.sched_holidays (
  id         uuid primary key default gen_random_uuid(),
  date       date not null,
  name       text not null,
  source     text not null default 'manual' check (source in ('auto', 'manual')),
  work_open  boolean not null default false,     -- 근무 운영
  created_at timestamptz not null default now(),
  unique (date, name)
);

-- 7) 개강 · 종강 ------------------------------------------
create table if not exists public.sched_events (
  id           uuid primary key default gen_random_uuid(),
  date         date not null,
  kind         text not null check (kind in ('open', 'close')),
  course_id    uuid references public.sched_courses(id) on delete set null,
  label        text not null,                    -- 화면 표시용 예: 법인8
  weekend_need int not null default 2 check (weekend_need >= 1),
  created_at   timestamptz not null default now()
);

-- 8) 월 일정표 --------------------------------------------
create table if not exists public.sched_periods (
  id         uuid primary key default gen_random_uuid(),
  year       int not null,
  month      int not null check (month between 1 and 12),
  start_date date not null,
  end_date   date not null,
  status     text not null default 'draft' check (status in ('draft', 'confirmed')),
  created_at timestamptz not null default now(),
  unique (year, month),
  check (end_date >= start_date)
);

-- 9) 요청사항 ---------------------------------------------
--   leave=연차, dayoff=휴무 지정, shoot=촬영 (무조건 반영)
--   want_work=근무 희망, want_off=휴무 희망 (되도록 반영)
create table if not exists public.sched_requests (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references public.sched_staff(id) on delete cascade,
  kind       text not null check (kind in ('leave', 'dayoff', 'shoot', 'want_work', 'want_off')),
  start_date date not null,
  end_date   date not null,
  memo       text,
  status     text not null default 'approved' check (status in ('approved', 'pending', 'rejected')),
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

-- 10) 배정 결과 (사람 x 날짜) -------------------------------
--   work=근무, leave=연차, off=휴무, shoot=촬영
--   주말 근무는 날짜가 토·일인 work 로 구분
create table if not exists public.sched_assignments (
  staff_id   uuid not null references public.sched_staff(id) on delete cascade,
  date       date not null,
  period_id  uuid references public.sched_periods(id) on delete cascade,
  code       text not null check (code in ('work', 'leave', 'off', 'shoot')),
  locked     boolean not null default false,     -- 손으로 고친 칸 (2차)
  updated_at timestamptz not null default now(),
  primary key (staff_id, date)
);
create index if not exists sched_assignments_period_idx on public.sched_assignments (period_id);
create index if not exists sched_assignments_date_idx on public.sched_assignments (date);

-- 11) 특이사항 메모 (날짜별) ---------------------------------
create table if not exists public.sched_memos (
  date      date primary key,
  text      text not null default '',
  highlight boolean not null default false
);

-- =========================================================
-- 보안: 관리자 명단에 있는 계정만 읽고 쓸 수 있음
-- =========================================================
do $$
declare t text;
begin
  foreach t in array array[
    'sched_admins','sched_settings','sched_teams','sched_staff','sched_courses',
    'sched_holidays','sched_events','sched_periods','sched_requests',
    'sched_assignments','sched_memos'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists sched_admin_all on public.%I', t);
    if t = 'sched_admins' then
      -- 관리자는 명단을 볼 수만 있음 (추가·삭제는 SQL Editor에서)
      execute format('create policy sched_admin_all on public.%I for select to authenticated using (public.sched_is_admin())', t);
    else
      execute format('create policy sched_admin_all on public.%I for all to authenticated using (public.sched_is_admin()) with check (public.sched_is_admin())', t);
    end if;
  end loop;
end $$;

-- =========================================================
-- 자동 깨우기용: 하루 한 번 호출해서 프로젝트가 멈추지 않게
-- (데이터는 하나도 돌려주지 않아요)
-- =========================================================
create or replace function public.sched_ping()
returns text
language sql
stable
security definer
set search_path = public
as $$ select 'ok'::text $$;

revoke all on function public.sched_ping() from public;
grant execute on function public.sched_ping() to anon, authenticated;
grant execute on function public.sched_is_admin() to authenticated;
