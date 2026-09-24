// 일정표 칸을 눌렀을 때 뜨는 수정 창 (5단계)
// 규칙에 어긋나도 저장은 돼요. 대신 저장 전에 "새로 생기는 문제"를 빨강·노랑으로 미리 보여줘요.
import { useMemo, useState } from 'react'
import { dow, fmtMD } from '../lib/dates'
import { key, makeCtx, windowStart, countsAtAcademy, type Code, type RInput } from '../lib/rules'
import { planWeekend, planMoveOff, planSet, weekendCandidates, rankOffDays, describeChanges, codeName, type Change, type Plan } from '../lib/edit'

type Action =
  | { type: 'set'; code: Code }
  | { type: 'weekendOut' }
  | { type: 'weekendIn' }
  | { type: 'sub'; inId: string }
  | { type: 'add'; inId: string }
  | { type: 'move'; to: string }

type Mode = 'menu' | 'sub' | 'add' | 'move'

export default function CellEditor({
  input,
  cells,
  sid,
  d,
  locked,
  autoCode,
  weekendCounts,
  busy,
  revertCount,
  onApply,
  onRevert,
  onClose,
}: {
  input: RInput
  cells: Map<string, Code>
  sid: string
  d: string
  locked: boolean
  autoCode: Code | null | undefined
  weekendCounts: Record<string, number>
  busy: boolean
  /** 되돌리면 같이 돌아가는 칸 수 (같은 주 + 대타 짝) */
  revertCount: number
  onApply: (changes: Change[], msg: string) => void
  onRevert: () => void
  onClose: () => void
}) {
  const ctx = useMemo(() => makeCtx(input), [input])
  const s = ctx.staffById.get(sid)!
  const kind = ctx.kind(d)
  const weekend = kind === 'weekend'
  const cur = cells.get(key(sid, d))
  const [mode, setMode] = useState<Mode>('menu')
  const [action, setAction] = useState<Action | null>(null)
  /** undefined = 추천 1순위, null = 휴무 안 넣기, 날짜 = 그날 */
  const [offPick, setOffPick] = useState<string | null | undefined>(undefined)

  const plan: Plan | null = useMemo(() => {
    if (!action) return null
    switch (action.type) {
      case 'set':
        return planSet(input, cells, sid, d, action.code)
      case 'weekendOut':
        return planWeekend(input, cells, d, sid, null)
      case 'weekendIn':
        return planWeekend(input, cells, d, null, sid, offPick)
      case 'sub':
        return planWeekend(input, cells, d, sid, action.inId, offPick)
      case 'add':
        return planWeekend(input, cells, d, null, action.inId, offPick)
      case 'move':
        return planMoveOff(input, cells, sid, d, action.to)
    }
  }, [action, input, cells, sid, d, offPick])

  const candidates = useMemo(() => {
    if (mode !== 'sub' && mode !== 'add') return []
    return weekendCandidates(input, cells, d, mode === 'sub' ? sid : null)
      .map(({ s: c, blocked }) => {
        const p = blocked ? null : planWeekend(input, cells, d, mode === 'sub' ? sid : null, c.id)
        const red = p ? p.added.filter((x) => x.level === 'error').length : 0
        const yellow = p ? p.added.filter((x) => x.level === 'warn').length : 0
        const off = p?.changes.find((x) => x.staff_id === c.id && x.code === 'off')?.date
        return { c, blocked, red, yellow, off }
      })
      .sort(
        (a, b) =>
          Number(!!a.blocked) - Number(!!b.blocked) ||
          a.red - b.red ||
          Number(b.c.weekendTeam) - Number(a.c.weekendTeam) ||
          (weekendCounts[a.c.id] ?? 0) - (weekendCounts[b.c.id] ?? 0),
      )
  }, [mode, input, cells, d, sid, weekendCounts])

  const moveOptions = useMemo(() => (mode === 'move' ? rankOffDays(input, cells, sid, windowStart(d)) : []), [mode, input, cells, sid, d])

  const nameOf = (id: string) => ctx.staffById.get(id)?.name ?? ''
  const pick = (a: Action) => {
    setOffPick(undefined)
    setAction(a)
  }
  const inIdOf = (a: Action | null) => (a?.type === 'sub' || a?.type === 'add' ? a.inId : a?.type === 'weekendIn' ? sid : null)
  const inId = inIdOf(action)

  function save() {
    if (!plan) return
    const msg =
      action?.type === 'sub'
        ? `${fmtMD(d)} ${s.name} 대신 ${nameOf(action.inId)} 근무로 바꿨어요.`
        : action?.type === 'add'
          ? `${fmtMD(d)} ${nameOf(action.inId)} 추가 근무를 넣었어요.`
          : action?.type === 'move'
            ? `${s.name} 휴무를 ${fmtMD(action.to)}로 옮겼어요.`
            : `${s.name} ${fmtMD(d)} 바꿨어요.`
    onApply(plan.changes, msg)
  }

  const setBtn = (code: Code, label: string) => (
    <button type="button" className={`btn sm${action?.type === 'set' && action.code === code ? ' on' : ''}`} disabled={cur === code} onClick={() => { setMode('menu'); pick({ type: 'set', code }) }}>
      {label}
    </button>
  )

  return (
    <section className="card cell-editor" role="dialog" aria-labelledby="ce-ttl">
      <div className="card-head">
        <h2 className="ttl sm" id="ce-ttl">
          {s.name} · {fmtMD(d)} · 지금 <b>{codeName(cur, weekend)}</b>
        </h2>
        {locked && <span className="bd man">손으로 고친 칸</span>}
        <div className="grow" />
        <button type="button" className="linkbtn" onClick={onClose}>닫기</button>
      </div>

      <div className="row gap8 wrap">
        {weekend ? (
          <>
            {cur === 'work' ? (
              <>
                <button type="button" className={`btn sm${mode === 'sub' ? ' on' : ''}`} onClick={() => { setMode('sub'); setAction(null) }}>대타 넣기</button>
                <button type="button" className={`btn sm${action?.type === 'weekendOut' ? ' on' : ''}`} onClick={() => { setMode('menu'); pick({ type: 'weekendOut' }) }}>휴무로 바꾸기</button>
              </>
            ) : (
              cur !== 'leave' && cur !== 'shoot' && (
                <button type="button" className={`btn sm${action?.type === 'weekendIn' ? ' on' : ''}`} onClick={() => { setMode('menu'); pick({ type: 'weekendIn' }) }}>{s.name} 주말 근무 넣기</button>
              )
            )}
            <button type="button" className={`btn sm${mode === 'add' ? ' on' : ''}`} onClick={() => { setMode('add'); setAction(null) }}>추가 근무 (다른 사람)</button>
            {setBtn('leave', '연차')}
            {setBtn('shoot', '촬영')}
          </>
        ) : (
          <>
            {setBtn('work', '근무')}
            {setBtn('off', '휴무')}
            {setBtn('leave', '연차')}
            {setBtn('shoot', '촬영')}
            {cur === 'off' && (
              <button type="button" className={`btn sm${mode === 'move' ? ' on' : ''}`} onClick={() => { setMode('move'); setAction(null) }}>휴무 다른 날로 옮기기</button>
            )}
          </>
        )}
        {locked && (
          <button type="button" className="btn sm" disabled={busy} onClick={onRevert} title="이 사람의 그 주 고친 칸과, 주말이면 같이 바꾼 사람(대타 짝)의 칸까지 한 번에 되돌려요">
            자동 배정 값으로 되돌리기{autoCode ? ` (${codeName(autoCode, weekend)})` : ''}{revertCount > 1 ? ` · 같이 고친 ${revertCount}칸` : ''}
          </button>
        )}
      </div>
      {weekend && !countsAtAcademy(s) && action?.type === 'weekendIn' && (
        <p className="warn-text">{s.name}은(는) 집체팀·학원 대타가 아니라서 주말 학원 인원으로 안 세요. 학원 근무라면 직원 관리에서 "학원 대타"를 체크해주세요.</p>
      )}

      {(mode === 'sub' || mode === 'add') && (
        <div className="col gap4">
          <p className="sub">
            {mode === 'sub' ? `${s.name} 대신 근무할 사람` : `${fmtMD(d)}에 더 넣을 사람`} · 집체팀과 학원 대타 가능자만 보여요
          </p>
          <ul className="cand" aria-label="근무할 사람 고르기">
            {candidates.length === 0 && <li className="sub">넣을 수 있는 사람이 없어요.</li>}
            {candidates.map(({ c, blocked, red, yellow, off }) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={`cand-btn${inId === c.id ? ' on' : ''}`}
                  disabled={!!blocked}
                  onClick={() => pick(mode === 'sub' ? { type: 'sub', inId: c.id } : { type: 'add', inId: c.id })}
                >
                  <b>{c.name}</b>
                  <span className="muted small">{c.weekendTeam ? '집체팀' : '학원 대타'} · {c.canSolo ? '혼자 가능' : '혼자 불가'}{!c.canWeekend ? ' · 주말 불가' : ''} · 이번 달 주말 {weekendCounts[c.id] ?? 0}회</span>
                  <span className="small">
                    {blocked
                      ? `그날 ${blocked}`
                      : red || yellow
                        ? <span className="miss-note">{red ? `빨강 ${red}` : ''}{red && yellow ? ' · ' : ''}{yellow ? `노랑 ${yellow}` : ''}</span>
                        : <span className="ok-note">문제 없음</span>}
                    {off && !blocked ? <span className="muted"> · 휴무 {fmtMD(off)}</span> : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {mode === 'move' && (
        <div className="col gap4">
          <p className="sub">같은 주에서 옮길 날 (좋은 순)</p>
          <div className="row gap8 wrap">
            {moveOptions.length === 0 && <span className="sub">옮길 수 있는 평일이 없어요.</span>}
            {moveOptions.map((o) => (
              <button key={o.date} type="button" className={`btn sm${action?.type === 'move' && action.to === o.date ? ' on' : ''}`} onClick={() => pick({ type: 'move', to: o.date })} title={o.note}>
                {fmtMD(o.date)} <span className="muted small">{o.note}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {plan && (
        <div className="plan">
          <h3 className="ttl sm">이렇게 바뀌어요</h3>
          <ul className="plan-list">
            {describeChanges(input, cells, plan.changes).map((t) => <li key={t}>{t}</li>)}
          </ul>
          {inId && plan.offOptions.length > 0 && (plan.changes.some((c) => c.staff_id === inId && c.code === 'off') || offPick === null) && (
            <label className="fld inline">
              {nameOf(inId)} 평일 휴무
              <select
                className="inp"
                value={offPick === undefined ? plan.changes.find((c) => c.staff_id === inId && c.code === 'off' && dow(c.date) !== 0 && dow(c.date) !== 6)?.date ?? '' : offPick ?? ''}
                onChange={(e) => setOffPick(e.target.value || null)}
              >
                {plan.offOptions.map((o, i) => (
                  <option key={o.date} value={o.date}>{fmtMD(o.date)} · {o.note}{i === 0 ? ' (추천)' : ''}</option>
                ))}
                <option value="">안 넣기 (주 근무일 초과)</option>
              </select>
            </label>
          )}
          {plan.added.length > 0 ? (
            <ul className="problems">
              {plan.added.map((p, i) => (
                <li key={i} className={p.level}><b>{p.level === 'error' ? '빨강' : '노랑'}</b> {p.msg}</li>
              ))}
            </ul>
          ) : (
            <p className="ok-note small">새로 생기는 문제 없어요.</p>
          )}
          {plan.removed.length > 0 && <p className="ok-note small">해결: {plan.removed.map((p) => p.msg).join(' / ')}</p>}
          {plan.added.some((p) => p.level === 'error') && <p className="sub">규칙에 안 맞아도 저장은 돼요. 빨간 표시는 일정표에 계속 남아요.</p>}
          <div className="row gap8">
            <button type="button" className="btn pri" disabled={busy || plan.changes.length === 0} onClick={save}>{busy ? '저장 중…' : '저장'}</button>
            <button type="button" className="btn" onClick={() => setAction(null)}>취소</button>
          </div>
        </div>
      )}
    </section>
  )
}
