# 근무 스케줄러

바른법률HR학원 근무 스케줄표를 자동으로 짜고 엑셀로 내려받는 도구.

- 화면: React + Vite (`src/`)
- 데이터: Supabase (연차계산기 프로젝트 안의 `sched_` 테이블, `supabase/`)
- 배포: Vercel (GitHub 연결), 하루 한 번 `/api/ping`으로 Supabase 깨우기

## 진행 단계
- [x] 1단계 기본 세팅: 로그인, 관리자 확인, 탭 화면, DB 테이블, 자동 깨우기
- [x] 2단계 직원 관리 · 과정 · 공휴일 (supabase/03_step2_3.sql)
- [x] 3단계 일정표 화면 · 개강종강 · 요청사항 · 특이사항 메모
- [x] 4단계 자동 배정 (supabase/05_step4.sql, src/lib/assign.ts · validate.ts · rules.ts, `npm test`)
- [x] 5단계 수동 수정 · 규칙 검사 · 학원 대타 (supabase/06_step5.sql, src/lib/edit.ts, src/components/CellEditor.tsx)
- [ ] 6단계 엑셀 다운로드

## SQL 실행 순서 (Supabase > SQL Editor)
1. `supabase/01_tables.sql` (1단계)
2. `supabase/02_add_admin.sql` (관리자 등록)
3. `supabase/03_step2_3.sql` (2·3단계)
4. `supabase/04_grants.sql` (테이블 권한. "권한이 없어요"가 뜨면)
5. `supabase/05_step4.sql` (4단계 자동 배정: 요청 결과 칸, 저장 함수)
6. `supabase/06_step5.sql` (5단계: 학원 대타 칸, 되돌리기)

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

## 자동 배정 규칙 요약 (4단계)
- 근무 주는 월~일, 주 5일은 무조건. 주말 근무자의 평일 휴무는 같은 주 안에
- 주말: 집체팀(주말 근무 팀) 중 주말 가능자. 같은 주 토·일 되도록 다른 사람 → 지난주 일요일 근무자가 이번 주 토요일(순번) → 주말 횟수 + 지난 3개 일정표 이월 적은 순 → 근무/휴무 희망 → 무작위
- 6일 연속 근무는 되도록 피하고, 못 피하면 노란 경고 (담당자가 연차 등으로 조정)
- 필요 인원 1명이면 혼자 가능자만, 2명 이상이면 최소 1명은 혼자 가능자
- 평일 휴무: 개강일·평일 종강일 피하기, 휴무자 적은 날, 휴무 희망 우선, 근무 희망 피하기, 집체팀은 하루 최대 N명(설정)
- 연차는 주 근무일로 세지만 연속 근무는 끊어요. 촬영은 둘 다 근무로 셈
- 손으로 고정한 칸(locked)은 다시 배정해도 유지 (5단계·2차 기능 대비)

## 손으로 고치기 (5단계)
- 자동 배정 후 칸을 누르면 수정 창: 평일 근무/휴무/연차/촬영, 휴무 다른 날로 옮기기 / 주말 대타 넣기, 휴무로 바꾸기, 추가 근무
- 규칙에 안 맞아도 저장됨. 저장 전에 새로 생기는 빨강·노랑을 미리 보여줌
- 고친 칸은 초록 점(locked) → 다시 자동 배정해도 유지. "되돌리기"는 그 주 + 대타 짝 칸까지 한 번에
- 학원 대타: 직원 관리 "학원 대타" 체크한 원격팀은 자동 배정엔 안 들어가고, 손으로 넣으면 주말 학원 인원으로 셈. 공평 배분·이월은 집체팀만
