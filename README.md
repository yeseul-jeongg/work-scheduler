# 근무 스케줄러

바른법률HR학원 근무 스케줄표를 자동으로 짜고 엑셀로 내려받는 도구.

- 화면: React + Vite (`src/`)
- 데이터: Supabase (연차계산기 프로젝트 안의 `sched_` 테이블, `supabase/`)
- 배포: Vercel (GitHub 연결), 하루 한 번 `/api/ping`으로 Supabase 깨우기

## 진행 단계
- [x] 1단계 기본 세팅: 로그인, 관리자 확인, 탭 화면, DB 테이블, 자동 깨우기
- [x] 2단계 직원 관리 · 과정 · 공휴일 (supabase/03_step2_3.sql)
- [x] 3단계 일정표 화면 · 개강종강 · 요청사항 · 특이사항 메모
- [ ] 4단계 자동 배정
- [ ] 5단계 수동 수정 · 규칙 검사
- [ ] 6단계 엑셀 다운로드

## SQL 실행 순서 (Supabase > SQL Editor)
1. `supabase/01_tables.sql` (1단계)
2. `supabase/02_add_admin.sql` (관리자 등록)
3. `supabase/03_step2_3.sql` (2·3단계)
4. `supabase/04_grants.sql` (테이블 권한. "권한이 없어요"가 뜨면)

## 공휴일
- `src/lib/holidays.ts`에 연도별 달력 공휴일이 있어요 (현재 2026, 2027). 새 연도는 여기에 추가.

## 환경변수 (Vercel)
- `VITE_SUPABASE_URL` (https://xxxx.supabase.co, 끝에 /rest/v1 이 붙어도 자동으로 떼요)
- `VITE_SUPABASE_ANON_KEY` (publishable key. secret / service_role 키는 절대 넣지 않기)

## 로컬 실행 (선택)
```
npm install
cp .env.example .env.local   # 값 채우기
npm run dev
```
