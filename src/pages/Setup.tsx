import { useEffect, useRef, useState } from 'react'
import {
  getSettings,
  saveSettings,
  listCourses,
  addCourse,
  updateCourse,
  listHolidays,
  upsertAutoHolidays,
  addHolidays,
  setHolidayOpen,
  deleteHolidays,
  listEvents,
  addEvent,
  deleteEvent,
  errText,
  type Settings,
  type Course,
} from '../lib/db'
import { AUTO_HOLIDAYS } from '../lib/holidays'
import { dateRange, fmtMD, isWeekend, isValidDate, today, dow } from '../lib/dates'
import { usePeriods } from '../lib/periods'
import { useLoad, useToast, ConfirmButton, ErrorBox, Badge } from '../components/ui'
import PeriodPicker from '../components/PeriodPicker'

export default function SetupPage() {
  const [toast, show] = useToast()
  const [settings, setErr, reloadSettings] = useLoad(getSettings, [])
  const [courses, courseErr, reloadCourses] = useLoad(listCourses, [])
  return (
    <div className="grid3">
      <EventsCard courses={courses ?? []} settings={settings} show={show} />
      <HolidaysCard show={show} />
      <div className="col gap16">
        <CoursesCard courses={courses} err={courseErr} reload={reloadCourses} show={show} />
        <RulesCard settings={settings} err={setErr} reload={reloadSettings} show={show} />
      </div>
      {toast}
    </div>
  )
}

type Show = (m: string, k?: 'ok' | 'err') => void

// ---------------- 개강 · 종강 ----------------
function EventsCard({ courses, settings, show }: { courses: Course[]; settings: Settings | undefined; show: Show }) {
  const { current } = usePeriods()
  const year = new Date().getFullYear()
  const from = current?.start_date ?? `${year}-01-01`
  const to = current?.end_date ?? `${year + 1}-12-31`
  const [events, err, reload] = useLoad(() => listEvents(from, to), [from, to])
  const active = courses.filter((c) => c.active)
  const [date, setDate] = useState('')
  const [kind, setKind] = useState<'open' | 'close'>('open')
  const [courseId, setCourseId] = useState('')
  const [cohort, setCohort] = useState('')
  const [need, setNeed] = useState<number | ''>('')
  const [msg, setMsg] = useState('')
  const needDefault = settings?.event_weekend_min ?? 2
  const cid = courseId || active[0]?.id || ''
  const courseName = (id: string | null) => courses.find((c) => c.id === id)?.name ?? ''

  async function submit() {
    if (!isValidDate(date)) return setMsg('날짜를 골라주세요.')
    if (!cid) return setMsg('과정을 골라주세요. (과정 목록에서 먼저 추가)')
    const c = cohort.trim().replace(/기$/, '')
    setMsg('')
    try {
      await addEvent({
        date,
        kind,
        course_id: cid,
        cohort: c,
        label: `${courseName(cid)}${c}`,
        weekend_need: Number(need || needDefault),
      })
      await reload()
      show(`${fmtMD(date)} ${kind === 'open' ? '개강' : '종강'} ${courseName(cid)}${c} 추가했어요.`)
      setCohort('')
    } catch (e) {
      show(errText(e), 'err')
    }
  }

  return (
    <section className="card" aria-labelledby="ev-ttl">
      <div className="col gap4">
        <h1 className="ttl" id="ev-ttl">개강 · 종강</h1>
        <PeriodPicker />
      </div>
      <form
        className="soft grid2"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <label className="fld">
          날짜
          <input className="inp" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className="fld">
          구분
          <select className="inp" value={kind} onChange={(e) => setKind(e.target.value as 'open' | 'close')}>
            <option value="open">개강</option>
            <option value="close">종강</option>
          </select>
        </label>
        <label className="fld">
          과정
          <select className="inp" value={cid} onChange={(e) => setCourseId(e.target.value)}>
            {active.length === 0 && <option value="">과정 없음</option>}
            {active.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="fld">
          기수
          <input className="inp" inputMode="numeric" value={cohort} onChange={(e) => setCohort(e.target.value)} placeholder="예: 12" />
        </label>
        <label className="fld span2">
          주말이면 필요 인원
          <span className="row gap8 center-y">
            <input className="inp num" type="number" min={1} max={20} value={need} placeholder={String(needDefault)} onChange={(e) => setNeed(e.target.value === '' ? '' : Math.max(1, Number(e.target.value)))} />
            <span className="sub normal">명 (비우면 기본 {needDefault}명, 평일이면 집체팀 되도록 전원)</span>
          </span>
        </label>
        {date && (
          <p className="sub span2">
            미리보기: <b>{fmtMD(date)}</b> {kind === 'open' ? '개강' : '종강'} <b>{courseName(cid)}{cohort.trim().replace(/기$/, '')}</b>
            {isWeekend(date) ? ` · 주말 ${need || needDefault}명` : ' · 평일'}
          </p>
        )}
        {msg && <p className="err span2" role="alert">{msg}</p>}
        <button type="submit" className="btn pri span2">추가</button>
      </form>
      <ErrorBox msg={err} onRetry={reload} />
      {events && events.length === 0 && <div className="empty">이 기간에 등록된 개강·종강이 없어요.</div>}
      {events && events.length > 0 && (
        <ul className="list">
          {events.map((e) => (
            <li key={e.id} className="li">
              <span className="w90 muted">{fmtMD(e.date)}</span>
              <Badge cls={e.kind === 'open' ? 'op' : 'cl'}>{e.kind === 'open' ? '개강' : '종강'}</Badge>
              <b className="flex">{e.label}</b>
              <span className="sub">{isWeekend(e.date) ? `주말 ${e.weekend_need}명` : '집체 전원'}</span>
              <ConfirmButton label={`${e.label} 삭제`} onConfirm={async () => {
                try {
                  await deleteEvent(e.id)
                  await reload()
                } catch (x) {
                  show(errText(x), 'err')
                }
              }} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// ---------------- 공휴일 ----------------
function HolidaysCard({ show }: { show: Show }) {
  const thisYear = new Date().getFullYear()
  const years = Array.from(new Set([thisYear, thisYear + 1, ...Object.keys(AUTO_HOLIDAYS).map(Number)])).sort()
  const [year, setYear] = useState(thisYear)
  const [hols, err, reload] = useLoad(() => listHolidays(`${year}-01-01`, `${year}-12-31`), [year])
  const [name, setName] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [msg, setMsg] = useState('')
  const autoTried = useRef<Set<number>>(new Set())
  const [openOv, setOpenOv] = useState<Record<string, boolean>>({}) // 누르자마자 체크 표시
  const hasAutoData = !!AUTO_HOLIDAYS[year]

  // 처음 보는 연도는 달력 공휴일을 자동으로 넣어요
  useEffect(() => {
    if (!hols || !hasAutoData || autoTried.current.has(year)) return
    autoTried.current.add(year)
    if (hols.some((h) => h.source === 'auto')) return
    importAuto(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hols, year])

  async function importAuto(silent = false) {
    const rows = (AUTO_HOLIDAYS[year] ?? []).map(([date, name]) => ({ date, name }))
    if (!rows.length) return show(`${year}년 달력 공휴일 자료가 아직 없어요. 직접 추가해주세요.`, 'err')
    try {
      await upsertAutoHolidays(rows)
      await reload()
      show(silent ? `${year}년 달력 공휴일 ${rows.length}일을 자동으로 넣었어요.` : `${year}년 달력 공휴일을 다시 불러왔어요. (지운 날만 다시 들어와요)`)
    } catch (e) {
      show(errText(e), 'err')
    }
  }

  async function addManual() {
    const n = name.trim()
    const e = end || start
    if (!n) return setMsg('이름을 넣어주세요.')
    if (!isValidDate(start)) return setMsg('시작일을 골라주세요.')
    if (e < start) return setMsg('종료일이 시작일보다 빨라요.')
    const days = dateRange(start, e)
    if (days.length > 31) return setMsg('한 번에 31일까지만 넣을 수 있어요.')
    setMsg('')
    try {
      await addHolidays(days.map((date) => ({ date, name: n })))
      if (start.slice(0, 4) !== String(year)) setYear(Number(start.slice(0, 4)))
      else await reload()
      show(`${n} ${days.length}일을 추가했어요.`)
      setName('')
      setStart('')
      setEnd('')
    } catch (x) {
      show(errText(x), 'err')
    }
  }

  const t0 = today()
  return (
    <section className="card" aria-labelledby="hol-ttl">
      <div className="card-head">
        <h2 className="ttl flex" id="hol-ttl">공휴일</h2>
        <select className="inp sm" aria-label="연도" value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {years.map((y) => <option key={y} value={y}>{y}년</option>)}
        </select>
      </div>
      <p className="sub">
        달력 공휴일은 자동으로 들어와요. 기본은 전원 휴무이고, 그날 학원을 운영하면 <b>근무 운영</b>을 켜세요. 켠 날은 평일처럼(토·일이면 주말 인원으로) 배정해요.
      </p>
      <ErrorBox msg={err} onRetry={reload} />
      {hols && hols.length === 0 && <div className="empty">{year}년 공휴일이 없어요.{!hasAutoData && ' 이 연도는 달력 자료가 없어서 직접 추가해야 해요.'}</div>}
      {hols && hols.length > 0 && (
        <ul className="list scroll">
          {hols.map((h) => (
            <li key={h.id} className={`li${h.date < t0 ? ' past' : ''}`}>
              <span className={`w90 ${dow(h.date) === 0 ? 'sun' : dow(h.date) === 6 ? 'sat' : 'muted'}`}>{fmtMD(h.date)}</span>
              <b className="flex">{h.name}</b>
              <Badge cls={h.source === 'auto' ? 'auto' : 'man'}>{h.source === 'auto' ? '자동' : '직접'}</Badge>
              <label className="chk small w90">
                <input
                  type="checkbox"
                  checked={openOv[h.id] ?? h.work_open}
                  onChange={async (e) => {
                    const v = e.target.checked
                    setOpenOv((o) => ({ ...o, [h.id]: v }))
                    try {
                      await setHolidayOpen([h.id], v)
                      await reload()
                      show(v ? `${fmtMD(h.date)} ${h.name}: 근무 운영으로 바꿨어요.` : `${fmtMD(h.date)} ${h.name}: 휴무로 바꿨어요.`)
                    } catch (x) {
                      show(errText(x), 'err')
                    } finally {
                      setOpenOv((o) => {
                        const n = { ...o }
                        delete n[h.id]
                        return n
                      })
                    }
                  }}
                />
                근무 운영
              </label>
              <ConfirmButton label={`${h.name} 삭제`} onConfirm={async () => {
                try {
                  await deleteHolidays([h.id])
                  await reload()
                } catch (x) {
                  show(errText(x), 'err')
                }
              }} />
            </li>
          ))}
        </ul>
      )}
      <form
        className="soft col"
        onSubmit={(e) => {
          e.preventDefault()
          addManual()
        }}
      >
        <span className="fld-ttl">직접 추가 (회사 지정 휴무 · 임시공휴일 · 연휴)</span>
        <input className="inp" value={name} onChange={(e) => setName(e.target.value)} placeholder="이름 (예: 추석 연휴(회사))" aria-label="휴일 이름" />
        <div className="grid2">
          <label className="fld">시작일<input className="inp" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
          <label className="fld"><span>종료일 <span className="opt">하루면 비우기</span></span><input className="inp" type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} /></label>
        </div>
        {msg && <p className="err" role="alert">{msg}</p>}
        <div className="row gap8">
          <button type="submit" className="btn flex">추가</button>
          {hasAutoData && <button type="button" className="btn" onClick={() => importAuto(false)}>달력 공휴일 다시 불러오기</button>}
        </div>
      </form>
    </section>
  )
}

// ---------------- 과정 목록 ----------------
function CoursesCard({ courses, err, reload, show }: { courses: Course[] | undefined; err: string; reload: () => Promise<void>; show: Show }) {
  const [name, setName] = useState('')
  const active = (courses ?? []).filter((c) => c.active)
  const hidden = (courses ?? []).filter((c) => !c.active)
  async function act(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn()
      await reload()
      show(ok)
    } catch (e) {
      show(errText(e), 'err')
    }
  }
  return (
    <section className="card" aria-labelledby="co-ttl">
      <h2 className="ttl" id="co-ttl">과정 목록</h2>
      <ErrorBox msg={err} onRetry={reload} />
      <div className="chips">
        {active.map((c) => (
          <span key={c.id} className="chip">
            {c.name}
            <button type="button" className="chip-x" aria-label={`${c.name} 숨기기`} title="숨기기" onClick={() => act(() => updateCourse(c.id, { active: false }), `${c.name}을(를) 숨겼어요.`)}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </span>
        ))}
        {courses && active.length === 0 && <span className="sub">과정이 없어요.</span>}
      </div>
      <form
        className="row gap8"
        onSubmit={(e) => {
          e.preventDefault()
          const n = name.trim()
          if (!n) return
          const again = hidden.find((c) => c.name === n)
          if (again) act(() => updateCourse(again.id, { active: true }), `${n}을(를) 다시 보이게 했어요.`).then(() => setName(''))
          else act(() => addCourse(n, (courses?.length ?? 0) + 1), `${n}을(를) 추가했어요.`).then(() => setName(''))
        }}
      >
        <input className="inp flex" value={name} onChange={(e) => setName(e.target.value)} placeholder="새 과정 이름" aria-label="새 과정 이름" />
        <button type="submit" className="btn">추가</button>
      </form>
      {hidden.length > 0 && (
        <div className="sub">
          숨긴 과정:{' '}
          {hidden.map((c) => (
            <button key={c.id} type="button" className="linkbtn" onClick={() => act(() => updateCourse(c.id, { active: true }), `${c.name}을(를) 다시 보이게 했어요.`)}>
              {c.name} 되돌리기
            </button>
          ))}
        </div>
      )}
      <p className="sub">숨긴 과정은 개강·종강 입력 목록에서만 빠지고, 지난 기록은 그대로 남아요.</p>
    </section>
  )
}

// ---------------- 배정 규칙 ----------------
function RulesCard({ settings, err, reload, show }: { settings: Settings | undefined; err: string; reload: () => Promise<void>; show: Show }) {
  const [v, setV] = useState<Settings | null>(null)
  const cur = v ?? settings ?? null
  const dirty = !!v && !!settings && JSON.stringify(v) !== JSON.stringify(settings)
  const num = (k: 'weekend_min' | 'event_weekend_min' | 'weekday_off_max', min: number) => (
    <input
      className="inp num"
      type="number"
      min={min}
      max={20}
      value={cur?.[k] ?? ''}
      onChange={(e) => cur && setV({ ...cur, [k]: Math.max(min, Number(e.target.value) || min) })}
    />
  )
  return (
    <section className="card" aria-labelledby="ru-ttl">
      <h2 className="ttl" id="ru-ttl">배정 규칙</h2>
      <ErrorBox msg={err} onRetry={reload} />
      {cur && (
        <form
          className="col gap10"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!v) return
            try {
              await saveSettings({
                branch_name: v.branch_name.trim() || '강남',
                weekend_min: v.weekend_min,
                event_weekend_min: v.event_weekend_min,
                weekday_off_max: v.weekday_off_max,
              })
              await reload()
              setV(null)
              show('배정 규칙을 저장했어요.')
            } catch (x) {
              show(errText(x), 'err')
            }
          }}
        >
          <label className="rule"><span className="flex">지점 이름 (일정표 왼쪽 위)</span><input className="inp w100" value={cur.branch_name} onChange={(e) => setV({ ...cur, branch_name: e.target.value })} /></label>
          <label className="rule"><span className="flex">주말 기본 인원</span>{num('weekend_min', 1)}<span>명</span></label>
          <label className="rule"><span className="flex">개강 · 종강 주말 기본 인원</span>{num('event_weekend_min', 1)}<span>명</span></label>
          <label className="rule"><span className="flex">평일 집체팀 휴무 최대 (연차 제외)</span>{num('weekday_off_max', 0)}<span>명</span></label>
          <div className="row gap8">
            <button type="submit" className="btn pri flex" disabled={!dirty}>저장</button>
            {dirty && <button type="button" className="btn" onClick={() => setV(null)}>되돌리기</button>}
          </div>
        </form>
      )}
      <div className="soft col small lh">
        <b>고정 규칙</b>
        <span>· 주 5일 근무 (월~일 기준, 연차 포함, 공휴일만큼 줄어듦)</span>
        <span>· 연속 근무 최대 5일 (주·월이 바뀌어도 이어서 계산)</span>
        <span>· 주말 근무하면 같은 주 평일 하루 휴무</span>
        <span>· 개강일 · 평일 종강일은 집체팀 되도록 전원 출근</span>
      </div>
    </section>
  )
}
