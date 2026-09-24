import { useMemo, useState } from 'react'
import {
  getSettings,
  listStaff,
  listHolidays,
  listEvents,
  listRequests,
  listAssignments,
  listMemos,
  listTeams,
  saveMemo,
  saveAssignment,
  clearAssignment,
  editCells,
  revertCells,
  addPeriod,
  updatePeriod,
  deletePeriod,
  errText,
  reqKind,
  type Period,
  type Request,
  type Holiday,
  type Assignment,
} from '../lib/db'
import { assign, computeCarry } from '../lib/assign'
import { validate, type Problem } from '../lib/validate'
import type { AssignInput } from '../lib/assign'
import { windowStart, type Code } from '../lib/rules'
import { addDays, dateRange, dow, DOW, fmtMD, isWeekend, lastDayOfMonth, mondayOnOrBefore, sundayOnOrAfter, ymd, diffDays } from '../lib/dates'
import { usePeriods, periodTitle } from '../lib/periods'
import { useLoad, useToast, ConfirmButton, ErrorBox } from '../components/ui'
import PeriodPicker from '../components/PeriodPicker'
import CellEditor from '../components/CellEditor'
import { diffProblems, type Change } from '../lib/edit'
import { buildSheet, shortHol, weekendWord } from '../lib/sheet'

export default function SchedulePage() {
  const { periods, current, loaded, error, reload } = usePeriods()
  const [toast, show] = useToast()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(false)

  if (!loaded) return <section className="card"><p className="sub">불러오는 중…</p></section>

  return (
    <div className="col gap16">
      <ErrorBox msg={error} onRetry={reload} />
      <div className="toolbar">
        <PeriodPicker label="월 일정표" />
        {current && (
          <span className={`pill ${current.status === 'confirmed' ? 'ok' : 'draft'}`}>{current.status === 'confirmed' ? '확정' : '작성 중'}</span>
        )}
        <button type="button" className="btn sm" onClick={() => { setCreating((v) => !v); setEditing(false) }} aria-expanded={creating}>
          + 새 일정표
        </button>
        {current && (
          <button type="button" className="btn sm" onClick={() => { setEditing((v) => !v); setCreating(false) }} aria-expanded={editing}>
            기간 수정
          </button>
        )}
      </div>

      {(creating || periods.length === 0) && (
        <CreatePeriod
          periods={periods}
          onCancel={periods.length ? () => setCreating(false) : undefined}
          onCreated={() => {
            setCreating(false)
            show('새 일정표를 만들었어요.')
          }}
          onError={(m) => show(m, 'err')}
        />
      )}
      {editing && current && (
        <EditPeriod
          key={current.id}
          period={current}
          onDone={(m) => {
            setEditing(false)
            if (m) show(m)
          }}
          onError={(m) => show(m, 'err')}
        />
      )}
      {current && <Grid period={current} periods={periods} show={show} />}
      {toast}
    </div>
  )
}

/** 이번 달 기본 기간: 앞 일정표 끝 다음날(없으면 1일이 든 주의 월요일) ~ 말일이 든 주의 일요일 */
function suggest(periods: Period[], y: number, m: number): { start: string; end: string } {
  const first = ymd(y, m, 1)
  const prevY = m === 1 ? y - 1 : y
  const prevM = m === 1 ? 12 : m - 1
  const prev = periods.find((p) => p.year === prevY && p.month === prevM)
  const start = prev ? addDays(prev.end_date, 1) : mondayOnOrBefore(first)
  const end = sundayOnOrAfter(lastDayOfMonth(y, m))
  return { start, end }
}

function CreatePeriod({
  periods,
  onCancel,
  onCreated,
  onError,
}: {
  periods: Period[]
  onCancel?: () => void
  onCreated: () => void
  onError: (m: string) => void
}) {
  const { reload, setCurrentId } = usePeriods()
  const latest = periods[0]
  const now = new Date()
  const initY = latest ? (latest.month === 12 ? latest.year + 1 : latest.year) : now.getFullYear()
  const initM = latest ? (latest.month === 12 ? 1 : latest.month + 1) : now.getMonth() + 1
  const [y, setY] = useState(initY)
  const [m, setM] = useState(initM)
  const s0 = suggest(periods, initY, initM)
  const [start, setStart] = useState(s0.start)
  const [end, setEnd] = useState(s0.end)
  const [busy, setBusy] = useState(false)
  const exists = periods.some((p) => p.year === y && p.month === m)
  const clash = periods.find((p) => p.start_date <= end && start <= p.end_date)

  function pick(ny: number, nm: number) {
    setY(ny)
    setM(nm)
    const s = suggest(periods, ny, nm)
    setStart(s.start)
    setEnd(s.end)
  }

  return (
    <section className="card" aria-labelledby="np-ttl">
      <div className="card-head">
        <h2 className="ttl" id="np-ttl">{periods.length ? '새 월 일정표 만들기' : '첫 월 일정표 만들기'}</h2>
        <span className="sub">예: 9월 = 8/31 ~ 10/4, 10월 = 10/5 ~ 11/1 (앞 일정표 다음날부터 자동으로 채워져요)</span>
      </div>
      <form
        className="row gap12 wrap end-y"
        onSubmit={async (e) => {
          e.preventDefault()
          if (end < start) return onError('종료일이 시작일보다 빨라요.')
          if (diffDays(start, end) > 45) return onError('기간이 너무 길어요. (최대 46일)')
          setBusy(true)
          try {
            const p = await addPeriod({ year: y, month: m, start_date: start, end_date: end })
            await reload()
            setCurrentId(p.id)
            onCreated()
          } catch (x) {
            onError(errText(x))
          } finally {
            setBusy(false)
          }
        }}
      >
        <label className="fld">
          연도
          <select className="inp" value={y} onChange={(e) => pick(Number(e.target.value), m)}>
            {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1, now.getFullYear() + 2].map((v) => <option key={v} value={v}>{v}년</option>)}
          </select>
        </label>
        <label className="fld">
          월
          <select className="inp" value={m} onChange={(e) => pick(y, Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((v) => <option key={v} value={v}>{v}월</option>)}
          </select>
        </label>
        <label className="fld">시작일<input className="inp" type="date" value={start} onChange={(e) => setStart(e.target.value)} required /></label>
        <label className="fld">종료일<input className="inp" type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} required /></label>
        <div className="col gap4">
          <span className="sub">{start && end && end >= start ? `${dateRange(start, end).length}일 · ${DOW[dow(start)]}요일 시작` : ''}</span>
          <div className="row gap8">
            <button type="submit" className="btn pri" disabled={busy || exists}>{exists ? `${m}월은 이미 있어요` : '만들기'}</button>
            {onCancel && <button type="button" className="btn" onClick={onCancel}>취소</button>}
          </div>
        </div>
      </form>
      {clash && !exists && <p className="warn-text">{periodTitle(clash)}과 기간이 겹쳐요. 날짜를 확인해주세요.</p>}
    </section>
  )
}

function EditPeriod({ period, onDone, onError }: { period: Period; onDone: (m?: string) => void; onError: (m: string) => void }) {
  const { reload } = usePeriods()
  const [start, setStart] = useState(period.start_date)
  const [end, setEnd] = useState(period.end_date)
  return (
    <section className="card" aria-labelledby="ep-ttl">
      <div className="card-head">
        <h2 className="ttl" id="ep-ttl">{period.month}월 일정표 기간 수정</h2>
        <div className="grow" />
        <button type="button" className="linkbtn" onClick={() => onDone()}>닫기</button>
      </div>
      <form
        className="row gap12 wrap end-y"
        onSubmit={async (e) => {
          e.preventDefault()
          if (end < start) return onError('종료일이 시작일보다 빨라요.')
          try {
            await updatePeriod(period.id, { start_date: start, end_date: end })
            await reload()
            onDone('기간을 바꿨어요.')
          } catch (x) {
            onError(errText(x))
          }
        }}
      >
        <label className="fld">시작일<input className="inp" type="date" value={start} onChange={(e) => setStart(e.target.value)} required /></label>
        <label className="fld">종료일<input className="inp" type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} required /></label>
        <button type="submit" className="btn pri">저장</button>
        <div className="grow" />
        <ConfirmButton
          className="btn"
          confirmText="배정 결과까지 지워요. 삭제?"
          onConfirm={async () => {
            try {
              await deletePeriod(period.id)
              await reload()
              onDone(`${period.month}월 일정표를 삭제했어요.`)
            } catch (x) {
              onError(errText(x))
            }
          }}
        >
          이 일정표 삭제
        </ConfirmButton>
      </form>
      <p className="sub">요청사항·개강종강·공휴일은 날짜 기준이라 일정표를 지워도 남아요.</p>
    </section>
  )
}

// ---------------- 엑셀 모양 달력 ----------------
type CellView = { cls: string; txt: string; title?: string; editable?: boolean }

/** 이월·연속 근무 계산에 쓸 지난 일정표 (최근 3개) */
function pastPeriods(periods: Period[], p: Period): Period[] {
  return periods
    .filter((x) => x.end_date < p.start_date)
    .sort((a, b) => b.start_date.localeCompare(a.start_date))
    .slice(0, 3)
}

function Grid({ period, periods, show }: { period: Period; periods: Period[]; show: (m: string, k?: 'ok' | 'err') => void }) {
  const from = period.start_date
  const to = period.end_date
  const past = useMemo(() => pastPeriods(periods, period), [periods, period])
  const histFrom = past.length ? past[past.length - 1].start_date : addDays(from, -7)
  const histTo = addDays(from, -1)
  const [data, err, reload] = useLoad(
    async () => {
      const [settings, staff, teams, hols, events, reqs, asg, memos, histAsg, histHols] = await Promise.all([
        getSettings(),
        listStaff(),
        listTeams(),
        listHolidays(from, to),
        listEvents(from, to),
        listRequests(from, to),
        listAssignments(from, to),
        listMemos(from, to),
        listAssignments(histFrom, histTo),
        listHolidays(histFrom, histTo),
      ])
      return { settings, staff, teams, hols, events, reqs, asg, memos, histAsg, histHols }
    },
    [from, to, histFrom],
  )
  const [memoDay, setMemoDay] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const days = useMemo(() => dateRange(from, to), [from, to])

  // 자동 배정·규칙 검사에 넣을 입력
  const input = useMemo<AssignInput | null>(() => {
    if (!data) return null
    const duty = new Set(data.teams.filter((t) => t.weekend_duty).map((t) => t.id))
    const prev: Record<string, Code> = {}
    data.histAsg.forEach((a) => {
      if (a.date >= addDays(from, -7)) prev[`${a.staff_id}|${a.date}`] = a.code
    })
    return {
      start: from,
      end: to,
      weekendMin: data.settings.weekend_min,
      offMax: data.settings.weekday_off_max,
      staff: data.staff.map((s) => ({
        id: s.id,
        name: s.name,
        weekendTeam: !!s.team_id && duty.has(s.team_id),
        academy: !!s.can_academy && !(s.team_id && duty.has(s.team_id)),
        canSolo: s.can_solo,
        canWeekend: s.can_weekend,
        hire: s.hire_date,
        leave: s.leave_date,
      })),
      holidays: data.hols,
      events: data.events,
      requests: data.reqs,
      prev,
      locked: data.asg.filter((a) => a.locked),
      carry: computeCarry(past, data.histAsg, data.histHols, new Set(data.staff.filter((s) => s.team_id && duty.has(s.team_id)).map((s) => s.id))),
    }
  }, [data, from, to, past])

  const cellMap = useMemo(() => new Map<string, Code>((data?.asg ?? []).map((a: Assignment) => [`${a.staff_id}|${a.date}`, a.code])), [data])
  const problems = useMemo<Problem[]>(() => {
    if (!data || !input || data.asg.length === 0) return []
    return validate(input, cellMap)
  }, [data, input, cellMap])
  const [editCell, setEditCell] = useState<{ sid: string; d: string } | null>(null)

  async function applyEdit(changes: Change[], msg: string) {
    setBusy(true)
    try {
      await editCells(period.id, changes)
      await reload()
      setEditCell(null)
      show(msg)
    } catch (x) {
      show(errText(x), 'err')
    } finally {
      setBusy(false)
    }
  }
  /**
   * 되돌릴 칸 묶음: 이 사람의 그 주(월~일) 고친 칸 전부
   * + 주말 칸이면 그날 함께 고친 사람(대타·원래 근무자)의 그 주 고친 칸도 같이
   */
  function revertScope(sid: string, d: string) {
    if (!data) return []
    const ws = windowStart(d)
    const we = addDays(ws, 6)
    const locked = data.asg.filter((a) => a.locked)
    const people = new Set([sid])
    if (isWeekend(d)) locked.filter((a) => a.date === d).forEach((a) => people.add(a.staff_id))
    return locked.filter((a) => people.has(a.staff_id) && a.date >= ws && a.date <= we).map((a) => ({ staff_id: a.staff_id, date: a.date }))
  }
  async function revertEdit(sid: string, d: string) {
    setBusy(true)
    try {
      const scope = revertScope(sid, d)
      // 되돌린 뒤 새로 생기는 문제 미리 확인 (되돌린 사이에 다시 자동 배정을 했으면 앞뒤가 안 맞을 수 있어요)
      const back = data!.asg.filter((a) => a.auto_code && scope.some((x) => x.staff_id === a.staff_id && x.date === a.date))
      const added = input ? diffProblems(input, cellMap, back.map((a) => ({ staff_id: a.staff_id, date: a.date, code: a.auto_code! }))).added : []
      await revertCells(scope)
      await reload()
      setEditCell(null)
      if (added.length) show(`되돌렸어요 (${scope.length}칸). 새로 생긴 빨강·노랑은 "다시 자동 배정"을 누르면 맞춰져요.`, 'err')
      else show(`자동 배정 값으로 되돌렸어요. (${scope.length}칸)`)
    } catch (x) {
      show(errText(x), 'err')
    } finally {
      setBusy(false)
    }
  }
  const badCells = useMemo(() => new Map(problems.flatMap((p) => (p.cells ?? []).map((k) => [k, p.level] as const))), [problems])
  const badDays = useMemo(() => new Set(problems.filter((p) => p.date && !p.cells).map((p) => p.date!)), [problems])

  async function runAssign() {
    if (!input) return
    setBusy(true)
    try {
      const out = assign(input, Date.now())
      await saveAssignment(period.id, from, to, out.cells, out.requestResults)
      await reload()
      const nErr = out.problems.filter((p) => p.level === 'error').length
      show(nErr ? `자동 배정했어요. 빨강 ${nErr}건을 확인해주세요.` : '자동 배정했어요. 규칙 위반 없어요.', nErr ? 'err' : 'ok')
    } catch (x) {
      show(errText(x), 'err')
    } finally {
      setBusy(false)
    }
  }
  async function runDownload() {
    if (!data) return
    setBusy(true)
    try {
      const model = buildSheet({
        period,
        branch: data.settings.branch_name,
        staff: data.staff,
        teams: data.teams,
        hols: data.hols,
        events: data.events,
        asg: data.asg,
        memos: data.memos,
      })
      const { downloadSheet } = await import('../lib/excel')
      await downloadSheet(model)
      show(`엑셀 파일을 받았어요. (${model.fileName})`)
    } catch (x) {
      show(`엑셀 파일을 만들지 못했어요. ${errText(x)}`, 'err')
    } finally {
      setBusy(false)
    }
  }
  const nRed = problems.filter((p) => p.level === 'error').length

  async function runClear() {
    setBusy(true)
    try {
      await clearAssignment(from, to)
      await reload()
      show('배정을 지웠어요.')
    } catch (x) {
      show(errText(x), 'err')
    } finally {
      setBusy(false)
    }
  }

  const view = useMemo(() => {
    if (!data) return null
    const holBy = new Map<string, Holiday[]>()
    data.hols.forEach((h) => holBy.set(h.date, [...(holBy.get(h.date) ?? []), h]))
    // 근무 운영을 켜지 않은 공휴일만 "쉬는 날"
    const offHol = (d: string) => (holBy.get(d) ?? []).find((h) => !h.work_open)
    const anyHol = (d: string) => (holBy.get(d) ?? [])[0]

    const people = data.staff.filter((s) => (!s.hire_date || s.hire_date <= to) && (!s.leave_date || s.leave_date >= from))
    const reqAt = new Map<string, Request[]>() // staff|date
    data.reqs.forEach((r) =>
      dateRange(r.start_date, r.end_date).forEach((d) => {
        const k = `${r.staff_id}|${d}`
        reqAt.set(k, [...(reqAt.get(k) ?? []), r])
      }),
    )
    const asgAt = new Map(data.asg.map((a) => [`${a.staff_id}|${a.date}`, a]))
    const dutyTeams = new Set(data.teams.filter((t) => t.weekend_duty).map((t) => t.id))
    const midRow = Math.floor((people.length - 1) / 2)

    const rows = people.map((s, ri) => {
      let weekendCount = 0
      const cells: CellView[] = days.map((d) => {
        const v = cellOf(s, ri, d)
        const bad = badCells.get(`${s.id}|${d}`)
        const a = asgAt.get(`${s.id}|${d}`)
        let cls = v.cls + (bad ? (bad === 'error' ? ' bad' : ' warnc') : '') + (a?.locked ? ' lk' : '')
        // 배정 결과가 있으면 칸을 눌러 고칠 수 있어요 (입사 전·퇴사 후·쉬는 공휴일 빼고)
        const editable = data.asg.length > 0 && !v.cls.includes(' na') && (!!a || !offHol(d))
        if (editCell?.sid === s.id && editCell.d === d) cls += ' editing'
        return { ...v, cls, editable, title: a?.locked ? `${v.title ?? ''} (손으로 고친 칸)`.trim() : v.title }
      })
      return { s, cells, weekendCount }

      function cellOf(s: (typeof people)[number], ri: number, d: string): CellView {
        const w = dow(d)
        const we = w === 0 || w === 6
        let cls = 'c' + (w === 1 ? ' wk' : '') + (we ? ' we' : '')
        if ((s.hire_date && d < s.hire_date) || (s.leave_date && d > s.leave_date)) {
          return { cls: cls + ' na', txt: '', title: s.hire_date && d < s.hire_date ? '입사 전' : '퇴사 후' }
        }
        const h = offHol(d)
        const a = asgAt.get(`${s.id}|${d}`)
        const rs = reqAt.get(`${s.id}|${d}`) ?? []
        if (h && !a) {
          return { cls: cls + ' hol' + (ri === people.length - 1 ? ' hol-last' : ''), txt: ri === midRow ? shortHol(h.name) : '', title: h.name }
        }
        if (a) {
          if (a.code === 'work') {
            if (we) {
              weekendCount++
              return { cls: cls + ' sw', txt: weekendWord(s, dutyTeams) }
            }
            return { cls, txt: '근무' }
          }
          if (a.code === 'leave') return { cls: cls + ' lv', txt: '연차' }
          if (a.code === 'shoot') return { cls: cls + ' ph', txt: '촬영' }
          return { cls, txt: '' }
        }
        // 아직 배정 전: 요청사항만 보여줘요
        const must = rs.find((r) => reqKind(r.kind).must)
        if (must) {
          if (must.kind === 'leave') return { cls: cls + ' lv', txt: '연차', title: must.memo ?? '연차' }
          if (must.kind === 'shoot') return { cls: cls + ' ph', txt: '촬영', title: must.memo ?? '촬영' }
          return { cls: cls + ' dayoff', txt: '휴무', title: '휴무 지정' }
        }
        const want = rs[0]
        if (want) {
          return { cls: cls + ' want', txt: want.kind === 'want_work' ? '(근무)' : '(휴무)', title: `${reqKind(want.kind).label}${want.memo ? ' · ' + want.memo : ''}` }
        }
        return { cls, txt: '' }
      }
    })

    const dayInfo = days.map((d) => {
      const w = dow(d)
      const h = anyHol(d)
      const off = offHol(d)
      const opens = data.events.filter((e) => e.date === d && e.kind === 'open').map((e) => e.label)
      const closes = data.events.filter((e) => e.date === d && e.kind === 'close').map((e) => e.label)
      const auto: string[] = []
      people.forEach((s) => {
        const a = asgAt.get(`${s.id}|${d}`)
        const rs = reqAt.get(`${s.id}|${d}`) ?? []
        if (a?.code === 'leave' || (!a && rs.some((r) => r.kind === 'leave'))) auto.push(`${s.name.slice(-2)}(연차)`)
        if (a?.code === 'shoot' || (!a && rs.some((r) => r.kind === 'shoot'))) auto.push(`${s.name.slice(-2)}(촬영)`)
      })
      const memo = data.memos.find((m) => m.date === d)
      const wkCls = w === 1 ? ' wk' : ''
      return {
        d,
        w,
        hdCls: 'c hd' + wkCls + (off ? ' hol sun' : w === 0 ? ' sun' : w === 6 ? ' sat' : '') + (h && !off ? ' holopen' : '') + (badDays.has(d) ? ' bad' : ''),
        holTitle: h ? `${h.name}${h.work_open ? ' (근무 운영)' : ''}` : undefined,
        opens,
        closes,
        auto,
        memo,
        wkCls,
      }
    })
    return { rows, dayInfo }
  }, [data, days, from, to, badCells, badDays, editCell])

  const weekendTotal = view?.rows.reduce((n, r) => n + r.weekendCount, 0) ?? 0

  return (
    <>
      <ErrorBox msg={err} onRetry={reload} />
      {data && (
        <section className="card assign-bar" aria-label="자동 배정">
          <div className="row gap12 wrap center-y">
            {data.asg.length === 0 ? (
              <button type="button" className="btn pri" disabled={busy || period.status === 'confirmed'} onClick={runAssign}>
                {busy ? '배정 중…' : '자동 배정'}
              </button>
            ) : (
              <ConfirmButton className="btn pri" disabled={busy || period.status === 'confirmed'} confirmText="손으로 고친 칸 빼고 바뀌어요. 다시 배정?" onConfirm={runAssign}>
                {busy ? '배정 중…' : '다시 자동 배정'}
              </ConfirmButton>
            )}
            {data.asg.length > 0 && (
              <ConfirmButton className="btn" disabled={busy || period.status === 'confirmed'} confirmText="배정 결과를 지울까요?" onConfirm={runClear}>
                배정 지우기
              </ConfirmButton>
            )}
            <span className="sub">
              {data.asg.length === 0
                ? '공휴일·개강종강·요청사항을 다 넣었으면 눌러주세요. 누를 때마다 주말 순서가 조금씩 달라질 수 있어요.'
                : problems.some((p) => p.level === 'error')
                  ? `빨강 ${problems.filter((p) => p.level === 'error').length}건 · 빨간 칸을 확인해주세요. 칸을 누르면 고칠 수 있어요.`
                  : problems.length
                    ? `규칙 위반 없어요 · 노랑 ${problems.length}건은 확인만 해주세요. 칸을 누르면 고칠 수 있어요.`
                    : '규칙 위반 없어요. 칸을 누르면 고칠 수 있어요.'}
            </span>
            <div className="grow" />
            {data.asg.length === 0 ? (
              <button type="button" className="btn" disabled title="자동 배정 후에 받을 수 있어요">엑셀 다운로드</button>
            ) : nRed > 0 ? (
              <ConfirmButton className="btn" disabled={busy} confirmText={`빨강 ${nRed}건 남았어요. 그래도 받기?`} onConfirm={runDownload}>
                엑셀 다운로드
              </ConfirmButton>
            ) : (
              <button type="button" className="btn" disabled={busy} onClick={runDownload}>엑셀 다운로드</button>
            )}
          </div>
          {problems.length > 0 && (
            <ul className="problems" aria-label="빨강 · 노랑 목록">
              {problems.map((p, i) => (
                <li key={i} className={p.level}>
                  <b>{p.level === 'error' ? '빨강' : '노랑'}</b> {p.msg}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {data && view && (
        <div className="sheet-wrap">
          <div className="sheet-title">{periodTitle(period)}</div>
          <div className="sheet-scroll">
          <div className="sheet" role="table" aria-label={periodTitle(period)}>
            <div className="row">
              <div className="lab b" style={{ width: 50, height: 52 }}>{data.settings.branch_name}</div>
              <div className="col">
                <div className="row">
                  <div className="lab b ev-op" style={{ width: 70 }}>개강</div>
                  {view.dayInfo.map((x) => <div key={x.d} className={`c ev${x.wkCls}${x.opens.length ? ' op' : ''}`} title={x.opens.join(', ')}>{x.opens.join(' ')}</div>)}
                  <div className="cnt" />
                </div>
                <div className="row">
                  <div className="lab b ev-cl" style={{ width: 70 }}>종강</div>
                  {view.dayInfo.map((x) => <div key={x.d} className={`c ev${x.wkCls}${x.closes.length ? ' cl' : ''}`} title={x.closes.join(', ')}>{x.closes.join(' ')}</div>)}
                  <div className="cnt" />
                </div>
              </div>
            </div>
            <div className="row" role="row">
              <div className="lab hdr" style={{ width: 120 }}>일</div>
              {view.dayInfo.map((x) => <div key={x.d} className={x.hdCls} title={x.holTitle} role="columnheader">{Number(x.d.slice(8))}</div>)}
              <div className="cnt hdr">주말</div>
            </div>
            <div className="row">
              <div className="lab hdr" style={{ width: 50 }}>직급</div>
              <div className="lab hdr" style={{ width: 70 }}>성명</div>
              {view.dayInfo.map((x) => <div key={x.d} className={x.hdCls} title={x.holTitle}>{DOW[x.w]}</div>)}
              <div className="cnt hdr">횟수</div>
            </div>
            {view.rows.length === 0 && <div className="empty">이 기간에 재직 중인 직원이 없어요. 직원 관리에서 추가해주세요.</div>}
            {view.rows.map((r) => (
              <div className="row" role="row" key={r.s.id}>
                <div className="lab" style={{ width: 50 }}>{r.s.rank}</div>
                <div className="lab" style={{ width: 70 }} role="rowheader">{r.s.name}</div>
                {r.cells.map((c, i) =>
                  c.editable ? (
                    <button
                      key={days[i]}
                      type="button"
                      className={c.cls + ' ed'}
                      title={c.title ?? '눌러서 고치기'}
                      role="cell"
                      aria-label={`${r.s.name} ${fmtMD(days[i])} ${c.txt || '휴무'} 고치기`}
                      onClick={() => {
                        setMemoDay(null)
                        setEditCell({ sid: r.s.id, d: days[i] })
                      }}
                    >
                      {c.txt}
                    </button>
                  ) : (
                    <div key={days[i]} className={c.cls} title={c.title} role="cell">{c.txt}</div>
                  ),
                )}
                <div className="cnt">{r.weekendCount || ''}</div>
              </div>
            ))}
            <div className="row">
              <div className="lab b memo-lab" style={{ width: 120 }}>특이사항</div>
              {view.dayInfo.map((x) => (
                <button
                  key={x.d}
                  type="button"
                  className={`c memo${x.wkCls}${x.memo?.highlight ? ' hl' : ''}${memoDay === x.d ? ' editing' : ''}`}
                  onClick={() => {
                    setEditCell(null)
                    setMemoDay(x.d)
                  }}
                  aria-label={`${fmtMD(x.d)} 특이사항 편집`}
                  title="눌러서 메모 쓰기"
                >
                  {x.auto.map((t) => <span key={t}>{t}</span>)}
                  {x.memo?.text && <span className="memo-t">{x.memo.text}</span>}
                </button>
              ))}
              <div className="cnt memo-cnt" />
            </div>
          </div>
          </div>
        </div>
      )}
      {data && input && editCell && (
        <CellEditor
          key={`${editCell.sid}|${editCell.d}`}
          input={input}
          cells={cellMap}
          sid={editCell.sid}
          d={editCell.d}
          locked={!!data.asg.find((a) => a.staff_id === editCell.sid && a.date === editCell.d)?.locked}
          autoCode={data.asg.find((a) => a.staff_id === editCell.sid && a.date === editCell.d)?.auto_code}
          weekendCounts={Object.fromEntries((view?.rows ?? []).map((r) => [r.s.id, r.weekendCount]))}
          busy={busy}
          onApply={applyEdit}
          revertCount={revertScope(editCell.sid, editCell.d).length}
          onRevert={() => revertEdit(editCell.sid, editCell.d)}
          onClose={() => setEditCell(null)}
        />
      )}
      {data && memoDay && (
        <MemoEditor
          key={memoDay}
          day={memoDay}
          initial={data.memos.find((m) => m.date === memoDay)}
          onClose={() => setMemoDay(null)}
          onSaved={async () => {
            await reload()
            setMemoDay(null)
            show('특이사항을 저장했어요.')
          }}
          onError={(m) => show(m, 'err')}
        />
      )}
      {data && (
        <div className="row gap16 wrap">
          <section className="card legend-card" aria-label="범례">
            <h2 className="ttl sm">범례</h2>
            <div className="legend">
              <span><i className="sw-box">근무</i>평일 근무</span>
              <span><i className="sw-box we sw">주말</i>주말 근무</span>
              <span><i className="sw-box we sw">대타</i>학원 대타 (원격팀)</span>
              <span><i className="sw-box lv">연차</i>연차</span>
              <span><i className="sw-box ph">촬영</i>촬영</span>
              <span><i className="sw-box dayoff">휴무</i>휴무 지정</span>
              <span><i className="sw-box want">(근무)</i>희망 (되도록)</span>
              <span><i className="sw-box hol" />공휴일 · 연휴</span>
              <span><i className="sw-box na" />입사 전 · 퇴사 후</span>
              <span><i className="sw-box lkbox" />손으로 고친 칸 (칸을 누르면 고쳐요)</span>
            </div>
          </section>
          <section className="card flex" aria-label="이번 달 요약">
            <h2 className="ttl sm">이번 달 요약</h2>
            <p className="sub">
              {days.length}일 · 주말 {days.filter(isWeekend).length}일 · 공휴일 {data.hols.filter((h) => !h.work_open).length}일
              {data.hols.some((h) => h.work_open) && ` (근무 운영 ${data.hols.filter((h) => h.work_open).length}일)`} · 개강·종강 {data.events.length}건 · 요청 {data.reqs.length}건
            </p>
            <p className="sub">
              {data.asg.length
                ? `배정된 칸 ${data.asg.length}개 · 주말 근무 합계 ${weekendTotal}회`
                : '아직 자동 배정 전이에요. 지금은 공휴일·개강종강·요청사항만 표시돼요.'}
            </p>
            <p className="sub">주말 근무자는 같은 주(월~일) 평일에 쉬어요. 일요일 근무자는 되도록 다음 주 토요일도 맡아 6일 연속을 피하고, 못 피하면 노란 경고로 알려줘요.</p>
            <p className="sub">특이사항 칸을 누르면 시험일·검정일 같은 메모를 쓰고 노란색으로 강조할 수 있어요.</p>
          </section>
        </div>
      )}
    </>
  )
}

function MemoEditor({
  day,
  initial,
  onClose,
  onSaved,
  onError,
}: {
  day: string
  initial?: { text: string; highlight: boolean }
  onClose: () => void
  onSaved: () => void
  onError: (m: string) => void
}) {
  const [text, setText] = useState(initial?.text ?? '')
  const [hl, setHl] = useState(initial?.highlight ?? false)
  return (
    <section className="card memo-editor" aria-labelledby="me-ttl">
      <form
        className="row gap12 wrap end-y"
        onSubmit={async (e) => {
          e.preventDefault()
          try {
            await saveMemo({ date: day, text: text.trim(), highlight: hl })
            onSaved()
          } catch (x) {
            onError(errText(x))
          }
        }}
      >
        <label className="fld flex">
          <span id="me-ttl">{fmtMD(day)} 특이사항</span>
          <input className="inp" value={text} onChange={(e) => setText(e.target.value)} placeholder="예: 권리소 검정일" autoFocus />
        </label>
        <label className="chk"><input type="checkbox" checked={hl} onChange={(e) => setHl(e.target.checked)} /> 노란 강조</label>
        <button type="submit" className="btn pri">저장</button>
        <button type="button" className="btn" onClick={onClose}>닫기</button>
      </form>
      <p className="sub">연차·촬영은 자동으로 표시되니 따로 안 써도 돼요. 비우고 저장하면 메모가 지워져요.</p>
    </section>
  )
}
