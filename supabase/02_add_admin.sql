-- =========================================================
-- 관리자 등록: Authentication > Users 에서 계정을 먼저 만든 다음 실행
-- 이메일을 바꾸려면 아래 주소만 바꿔서 다시 실행하면 돼요
-- =========================================================
insert into public.sched_admins (user_id)
select id from auth.users where email = 'jys6242000@naver.com'
on conflict (user_id) do nothing;

-- 확인: 한 줄이 나오면 성공
select u.email, a.created_at
from public.sched_admins a join auth.users u on u.id = a.user_id;
