import { useMemo, useState } from 'react'
import { listStaff, listRequests, addRequest, deleteRequest, errText, REQ_KINDS, reqKind, type ReqKind } from '../lib/db'
import { fmtRange, isValidDate, dateRange, overlaps } from '../lib/dates'
import { usePeriods } from '../lib/periods'
import { useLoad, useToast, ConfirmButton, ErrorBox, Badge } from '../components/ui'
import PeriodPicker from '../components/PeriodPicker'

type Filter = 'all' | 'must' | 'want'

export default function RequestsPage() {
  const { current } = usePeriods()
  const [toast, show] = useToast()
  const [staff, staffErr] = useLoad(listStaff, [])
  const from = current?.start_date ?? ''
  const to = current?.end_date ?? ''
  const [reqs, reqErr, reload] = useLoad(() => (from ? listRequests(from, to) : Promise.resolve([])), [from, to])
  const [filter, setFilter] = useState<Filter>('all')

  // 이 기간에 재직 중인 직원만
  const people = useMemo(
    () => (staff ?? []).filter((s) => !current || ((!s.hire_date || s.hire_date <= to) && (!s.leave_date || s.leave_date >= from))),
    [staff, current, from, to],
  )
  const nameOf = (id: string) => staff?.find((s) => s.id === id)?.name ?? '(삭제된 직원)'
  const orderOf = (id: string) => staff?.findIndex((s) => s.id === id) ?? 0

  const list = (reqs ?? [])
    .filter((r) => filter === 'all' || (filter === 'must') === reqKind(r.kind).must)
    .sort((a, b) => a.start_date.localeCompare(b.start_date) || orderOf(a.staff_id) - orderOf(b.staff_id))
  const nMust = (reqs ?? []).filter((r) => reqKind(r.kind).must).length
  const nWant = (reqs ?? []).length - nMust

  return (
    <div className="split">
      <RequestForm
        people={people}
        periodFrom={from}
        periodTo={to}
        onAdded={async (m) => {
          await reload()
          show(m)
        }}
        onError={(m) => show(m, 'err')}
        staffErr={staffErr}
      />
      <section className="card grow-card" aria-labelledby="rq-ttl">
        <div className="card-head wrap">
          <h2 className="ttl" id="rq-ttl">요청 목록</h2>
          <PeriodPicker />
          <div className="grow" />
          <div className="seg" role="group" aria-label="보기">
            <button type="button" className={filter === 'all' ? 'on' : ''} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>전체 {reqs?.length ?? 0}</button>
            <button type="button" className={filter === 'must' ? 'on' : ''} aria-pressed={filter === 'must'} onClick={() => setFilter('must')}>무조건 반영 {nMust}</button>
            <button type="button" className={filter === 'want' ? 'on' : ''} aria-pressed={filter === 'want'} onClick={() => setFilter('want')}>되도록 반영 {nWant}</button>
          </div>
        </div>
        <ErrorBox msg={reqErr} onRetry={reload} />
        {!current ? (
          <div className="empty">월 일정표를 먼저 만들면 그 기간의 요청을 여기서 볼 수 있어요.</div>
        ) : (
          <div className="tbl" role="table" aria-label="요청 목록">
            <div className="th" role="row">
              <div className="cell w90" role="columnheader">직원</div>
              <div className="cell w100" role="columnheader">종류</div>
              <div className="cell w150" role="columnheader">날짜</div>
              <div className="cell w100" role="columnheader">반영</div>
              <div className="cell flex" role="columnheader">결과 · 메모</div>
              <div className="cell w90" role="columnheader"><span className="sr">삭제</span></div>
            </div>
            {reqs && list.length === 0 && <div className="empty">이 기간에 요청이 없어요.</div>}
            {list.map((r) => {
              const k = reqKind(r.kind)
              const days = dateRange(r.start_date, r.end_date).length
              return (
                <div key={r.id} className="tr" role="row">
                  <div className="cell w90 b" role="cell">{nameOf(r.staff_id)}</div>
                  <div className="cell w100" role="cell"><Badge cls={k.cls}>{k.label}</Badge></div>
                  <div className="cell w150" role="cell">{fmtRange(r.start_date, r.end_date)}{days > 1 && <span className="muted small"> · {days}일</span>}</div>
                  <div className="cell w100 small muted" role="cell">{k.must ? '무조건 반영' : '되도록 반영'}</div>
                  <div className="cell flex row gap8 center-y" role="cell">
                    {r.result === 'applied' ? (
                      <Badge cls="done">반영됨</Badge>
                    ) : r.result === 'unmet' ? (
                      <Badge cls="miss">미반영</Badge>
                    ) : (
                      <Badge cls="wait">배정 전</Badge>
                    )}
                    <span className="small">
                      {r.result_note && <span className={r.result === 'unmet' ? 'miss-note' : 'muted'}>{r.result_note}</span>}
                      {r.result_note && r.memo && <span className="muted"> · </span>}
                      <span className="muted">{r.memo}</span>
                    </span>
                  </div>
                  <div className="cell w90" role="cell">
                    <ConfirmButton label={`${nameOf(r.staff_id)} ${k.label} 삭제`} onConfirm={async () => {
                      try {
                        await deleteRequest(r.id)
                        await reload()
                        show('요청을 삭제했어요.')
                      } catch (e) {
                        show(errText(e), 'err')
                      }
                    }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <p className="sub">반영 결과는 일정표에서 자동 배정을 누르면 바뀌어요. 요청을 새로 넣었으면 다시 배정해주세요.</p>
      </section>
      {toast}
    </div>
  )
}

function RequestForm({
  people,
  periodFrom,
  periodTo,
  onAdded,
  onError,
  staffErr,
}: {
  people: { id: string; name: string; rank: string }[]
  periodFrom: string
  periodTo: string
  onAdded: (m: string) => void
  onError: (m: string) => void
  staffErr: string
}) {
  const [staffId, setStaffId] = useState('')
  const [kind, setKind] = useState<ReqKind>('leave')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [memo, setMemo] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const sid = staffId && people.some((p) => p.id === staffId) ? staffId : people[0]?.id ?? ''
  const e2 = end || start
  const outside = periodFrom && start && isValidDate(start) && !overlaps(start, e2, periodFrom, periodTo)

  async function submit() {
    if (!sid) return setMsg('직원을 골라주세요. (직원 관리에서 먼저 추가)')
    if (!isValidDate(start)) return setMsg('시작일을 골라주세요.')
    if (e2 < start) return setMsg('종료일이 시작일보다 빨라요.')
    setMsg('')
    setBusy(true)
    try {
      await addRequest({ staff_id: sid, kind, start_date: start, end_date: e2, memo: memo.trim() || null })
      const who = people.find((p) => p.id === sid)?.name
      onAdded(`${who} ${reqKind(kind).label} (${fmtRange(start, e2)}) 추가했어요.`)
      setStart('')
      setEnd('')
      setMemo('')
    } catch (e) {
      onError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  const radio = (k: (typeof REQ_KINDS)[number]) => (
    <label key={k.id} className={`opt-card${kind === k.id ? ' on' : ''}`}>
      <input type="radio" name="kind" value={k.id} checked={kind === k.id} onChange={() => setKind(k.id)} />
      {k.label}
    </label>
  )

  return (
    <section className="card side-l" aria-labelledby="rf-ttl">
      <h1 className="ttl" id="rf-ttl">요청사항 입력</h1>
      <ErrorBox msg={staffErr} />
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <label className="fld">
          직원
          <select className="inp" value={sid} onChange={(e) => setStaffId(e.target.value)}>
            {people.length === 0 && <option value="">직원 없음</option>}
            {people.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.rank})</option>)}
          </select>
        </label>
        <fieldset className="fs">
          <legend className="fld-ttl">종류</legend>
          <div className="grp-lbl ok">무조건 반영</div>
          <div className="grid3c">{REQ_KINDS.filter((k) => k.must).map(radio)}</div>
          <div className="grp-lbl warn">되도록 반영 (규칙과 부딪히면 빠질 수 있음)</div>
          <div className="grid2">{REQ_KINDS.filter((k) => !k.must).map(radio)}</div>
        </fieldset>
        <div className="grid2">
          <label className="fld">시작일<input className="inp" type="date" value={start} min={undefined} onChange={(e) => setStart(e.target.value)} /></label>
          <label className="fld"><span>종료일 <span className="opt">하루면 비우기</span></span><input className="inp" type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} /></label>
        </div>
        <label className="fld">메모 (선택)<input className="inp" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder={kind === 'shoot' ? '예: 오전 촬영' : '예: 오후 외근'} /></label>
        {outside && <p className="warn-text">선택한 날짜가 지금 보고 있는 일정표 기간 밖이에요. 그래도 저장은 돼요.</p>}
        {msg && <p className="err" role="alert">{msg}</p>}
        <button type="submit" className="btn pri" disabled={busy}>{busy ? '추가 중…' : '요청 추가'}</button>
      </form>
      <div className="soft small lh">
        자동 배정 전에 넣으면 배정할 때 반영돼요. 연차·촬영은 일정표 아래 특이사항 칸에 이름이 자동으로 표시돼요.
      </div>
    </section>
  )
}
