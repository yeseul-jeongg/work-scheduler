import { useMemo, useState, type DragEvent, type KeyboardEvent } from 'react'
import {
  RANKS,
  listStaff,
  listTeams,
  addStaff,
  updateStaff,
  deleteStaff,
  reorderStaff,
  addTeam,
  updateTeam,
  deleteTeam,
  errText,
  type Staff,
  type Team,
} from '../lib/db'
import { today, fmtMD } from '../lib/dates'
import { useLoad, useToast, ConfirmButton, ErrorBox } from '../components/ui'

type Draft = Omit<Staff, 'id' | 'sort_order'>
const emptyDraft = (teamId: string | null): Draft => ({
  name: '',
  rank: '사원',
  team_id: teamId,
  can_solo: true,
  can_weekend: true,
  hire_date: null,
  leave_date: null,
  memo: '',
})

export default function StaffPage() {
  const [staff, staffErr, reloadStaff] = useLoad(listStaff, [])
  const [teams, teamErr, reloadTeams] = useLoad(listTeams, [])
  const [toast, show] = useToast()
  const [showRetired, setShowRetired] = useState(false)
  const [sel, setSel] = useState<string | 'new' | 'paste' | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [order, setOrder] = useState<string[] | null>(null) // 드래그 중 미리보기 순서
  const [ov, setOv] = useState<Record<string, Partial<Staff>>>({}) // 체크 누르자마자 표시

  const t0 = today()
  const isRetired = (s: Staff) => !!s.leave_date && s.leave_date < t0
  const teamName = (id: string | null) => teams?.find((t) => t.id === id)?.name ?? '—'

  const ordered = useMemo(() => {
    if (!staff) return []
    if (!order) return staff
    const byId = new Map(staff.map((s) => [s.id, s]))
    return order.map((id) => byId.get(id)!).filter(Boolean)
  }, [staff, order])
  const visible = ordered.filter((s) => showRetired || !isRetired(s))
  const activeCount = (staff ?? []).filter((s) => !isRetired(s)).length

  async function saveOrder(ids: string[]) {
    try {
      await reorderStaff(ids)
      await reloadStaff()
      show('순서를 저장했어요.')
    } catch (e) {
      show(errText(e), 'err')
    } finally {
      setOrder(null)
    }
  }
  function moved(ids: string[], fromId: string, toId: string): string[] {
    const arr = ids.filter((x) => x !== fromId)
    const to = arr.indexOf(toId)
    const from = ids.indexOf(fromId)
    const target = ids.indexOf(toId)
    arr.splice(from < target ? to + 1 : to, 0, fromId)
    return arr
  }
  function onDragStart(e: DragEvent, id: string) {
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }
  function onDragOver(e: DragEvent, id: string) {
    if (!dragId) return
    e.preventDefault()
    if (overId !== id) setOverId(id)
  }
  function onDrop(e: DragEvent, id: string) {
    e.preventDefault()
    if (dragId && dragId !== id && staff) saveOrder(moved(ordered.map((s) => s.id), dragId, id))
    setDragId(null)
    setOverId(null)
  }
  function onHandleKey(e: KeyboardEvent, id: string) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    e.preventDefault()
    const ids = visible.map((s) => s.id)
    const i = ids.indexOf(id)
    const j = e.key === 'ArrowUp' ? i - 1 : i + 1
    if (j < 0 || j >= ids.length) return
    const all = ordered.map((s) => s.id)
    const next = moved(all, id, ids[j])
    setOrder(next)
    saveOrder(next)
  }
  function sortByRank() {
    if (!staff) return
    const rankIdx = (r: string) => {
      const i = (RANKS as readonly string[]).indexOf(r)
      return i < 0 ? 99 : i
    }
    const ids = [...staff]
      .map((s, i) => ({ s, i }))
      .sort((a, b) => rankIdx(a.s.rank) - rankIdx(b.s.rank) || a.i - b.i)
      .map((x) => x.s.id)
    saveOrder(ids)
  }
  async function quickToggle(s: Staff, patch: Partial<Staff>) {
    setOv((o) => ({ ...o, [s.id]: { ...o[s.id], ...patch } }))
    try {
      await updateStaff(s.id, patch)
      await reloadStaff()
    } catch (e) {
      show(errText(e), 'err')
    } finally {
      setOv((o) => {
        const n = { ...o }
        delete n[s.id]
        return n
      })
    }
  }

  const selected = sel && sel !== 'new' && sel !== 'paste' ? staff?.find((s) => s.id === sel) ?? null : null

  return (
    <div className="split">
      <section className="card grow-card" aria-labelledby="staff-ttl">
        <div className="card-head">
          <h1 className="ttl" id="staff-ttl">직원 관리</h1>
          <span className="sub">재직 {activeCount}명 · 일정표에는 이 순서대로 나와요</span>
          <div className="grow" />
          <label className="chk">
            <input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} /> 퇴사자 보기
          </label>
          <button type="button" className="btn" onClick={sortByRank} disabled={!staff?.length}>
            직급순 정렬
          </button>
          <button type="button" className="btn" onClick={() => setSel('paste')}>
            여러 명 붙여넣기
          </button>
          <button type="button" className="btn pri" onClick={() => setSel('new')}>
            + 직원 추가
          </button>
        </div>
        <ErrorBox msg={staffErr} onRetry={reloadStaff} />
        <div className="tbl" role="table" aria-label="직원 목록">
          <div className="th" role="row">
            <div className="cell w40" role="columnheader"><span className="sr">순서</span></div>
            <div className="cell w72" role="columnheader">직급</div>
            <div className="cell w100" role="columnheader">성명</div>
            <div className="cell w86" role="columnheader">팀</div>
            <div className="cell w80 center" role="columnheader">혼자 근무</div>
            <div className="cell w80 center" role="columnheader">주말 근무</div>
            <div className="cell w96" role="columnheader">입사일</div>
            <div className="cell w96" role="columnheader">퇴사일</div>
            <div className="cell flex" role="columnheader">비고</div>
          </div>
          {staff && visible.length === 0 && (
            <div className="empty">아직 직원이 없어요. 오른쪽 위 <b>+ 직원 추가</b>로 넣어주세요.</div>
          )}
          {visible.map((s) => (
            <div
              key={s.id}
              role="row"
              className={`tr click${sel === s.id ? ' sel' : ''}${isRetired(s) ? ' dim' : ''}${overId === s.id && dragId !== s.id ? ' over' : ''}${dragId === s.id ? ' dragging' : ''}`}
              onDragOver={(e) => onDragOver(e, s.id)}
              onDrop={(e) => onDrop(e, s.id)}
              onClick={() => setSel(s.id)}
            >
              <div className="cell w40 center" role="cell">
                <button
                  type="button"
                  className="handle"
                  draggable
                  onDragStart={(e) => onDragStart(e, s.id)}
                  onDragEnd={() => {
                    setDragId(null)
                    setOverId(null)
                  }}
                  onKeyDown={(e) => onHandleKey(e, s.id)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`${s.name} 순서 옮기기 (끌어서 옮기거나 위·아래 화살표)`}
                  title="끌어서 순서 바꾸기"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#8a8a8a" aria-hidden="true">
                    <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" />
                    <circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
                  </svg>
                </button>
              </div>
              <div className="cell w72" role="cell">{s.rank}</div>
              <div className="cell w100 b" role="cell">
                <button type="button" className="rowlink" onClick={(e) => { e.stopPropagation(); setSel(s.id) }}>{s.name}</button>
              </div>
              <div className="cell w86" role="cell">{teamName(s.team_id)}</div>
              <div className="cell w80 center" role="cell" onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" className="cb" checked={ov[s.id]?.can_solo ?? s.can_solo} aria-label={`${s.name} 혼자 근무 가능`} onChange={(e) => quickToggle(s, { can_solo: e.target.checked })} />
              </div>
              <div className="cell w80 center" role="cell" onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" className="cb" checked={ov[s.id]?.can_weekend ?? s.can_weekend} aria-label={`${s.name} 주말 근무 가능`} onChange={(e) => quickToggle(s, { can_weekend: e.target.checked })} />
              </div>
              <div className="cell w96 muted" role="cell">{s.hire_date ?? '—'}</div>
              <div className="cell w96 muted" role="cell">{s.leave_date ?? '—'}</div>
              <div className="cell flex small muted" role="cell">
                {[isRetired(s) ? '퇴사' : '', !s.can_weekend ? '주말 불가' : '', !s.can_solo ? '혼자 불가' : '', s.memo].filter(Boolean).join(' · ')}
              </div>
            </div>
          ))}
        </div>
        <p className="sub">
          입사일·퇴사일은 월 중간에 들어오거나 나가는 경우에만 넣으면 돼요. 그 전후 날짜는 일정표에서 자동으로 빈칸이 돼요. 순서는 ⋮⋮ 손잡이를 끌거나, 손잡이를 누른 뒤 위·아래 화살표로 바꿀 수 있어요.
        </p>
      </section>

      <div className="side">
        {sel === 'paste' ? (
          <PasteStaff
            teams={teams ?? []}
            existing={staff ?? []}
            onClose={() => setSel(null)}
            onDone={async (n) => {
              await reloadStaff()
              await reloadTeams()
              setSel(null)
              show(`${n}명을 추가했어요. 필요하면 "직급순 정렬"을 눌러주세요.`)
            }}
            onError={(m) => show(m, 'err')}
          />
        ) : sel ? (
          <StaffForm
            key={sel}
            initial={selected}
            teams={teams ?? []}
            nextOrder={(staff?.length ?? 0) + 1}
            onClose={() => setSel(null)}
            onSaved={async (id, msg) => {
              await reloadStaff()
              await reloadTeams()
              setSel(id)
              show(msg)
            }}
            onDeleted={async () => {
              await reloadStaff()
              setSel(null)
              show('직원을 삭제했어요.')
            }}
            onError={(m) => show(m, 'err')}
          />
        ) : (
          <section className="card">
            <h2 className="ttl">직원 정보</h2>
            <p className="sub">목록에서 직원을 누르면 여기서 수정할 수 있어요.</p>
          </section>
        )}
        <TeamsCard teams={teams} staff={staff ?? []} err={teamErr} reload={async () => { await reloadTeams(); await reloadStaff() }} show={show} />
      </div>
      {toast}
    </div>
  )
}

function StaffForm({
  initial,
  teams,
  nextOrder,
  onClose,
  onSaved,
  onDeleted,
  onError,
}: {
  initial: Staff | null
  teams: Team[]
  nextOrder: number
  onClose: () => void
  onSaved: (id: string, msg: string) => void
  onDeleted: () => void
  onError: (m: string) => void
}) {
  const [d, setD] = useState<Draft>(() =>
    initial
      ? { name: initial.name, rank: initial.rank, team_id: initial.team_id, can_solo: initial.can_solo, can_weekend: initial.can_weekend, hire_date: initial.hire_date, leave_date: initial.leave_date, memo: initial.memo ?? '' }
      : emptyDraft(teams[0]?.id ?? null),
  )
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }))

  async function save(extra?: Partial<Draft>, okMsg?: string) {
    const v = { ...d, ...extra, name: d.name.trim(), memo: d.memo.trim() }
    if (!v.name) return setMsg('이름을 넣어주세요.')
    if (v.hire_date && v.leave_date && v.leave_date < v.hire_date) return setMsg('퇴사일이 입사일보다 빨라요.')
    setMsg('')
    setBusy(true)
    try {
      if (initial) {
        await updateStaff(initial.id, v)
        onSaved(initial.id, okMsg ?? `${v.name} 정보를 저장했어요.`)
      } else {
        const row = await addStaff({ ...v, sort_order: nextOrder })
        onSaved(row.id, `${v.name}님을 추가했어요.`)
      }
    } catch (e) {
      onError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card" aria-labelledby="sf-ttl">
      <div className="card-head">
        <h2 className="ttl" id="sf-ttl">{initial ? '직원 정보 수정' : '새 직원 추가'}</h2>
        <div className="grow" />
        <button type="button" className="linkbtn" onClick={onClose}>닫기</button>
      </div>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <div className="grid2">
          <label className="fld">
            성명
            <input className="inp" value={d.name} onChange={(e) => set('name', e.target.value)} required autoFocus={!initial} />
          </label>
          <label className="fld">
            직급
            <select className="inp" value={d.rank} onChange={(e) => set('rank', e.target.value)}>
              {RANKS.map((r) => <option key={r}>{r}</option>)}
              {!(RANKS as readonly string[]).includes(d.rank) && <option>{d.rank}</option>}
            </select>
          </label>
          <label className="fld span2">
            팀
            <select className="inp" value={d.team_id ?? ''} onChange={(e) => set('team_id', e.target.value || null)}>
              <option value="">(팀 없음)</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}{t.weekend_duty ? ' · 주말 근무 팀' : ''}</option>)}
            </select>
          </label>
          <label className="fld">
            <span>입사일 <span className="opt">월 중간 입사만</span></span>
            <input className="inp" type="date" value={d.hire_date ?? ''} onChange={(e) => set('hire_date', e.target.value || null)} />
          </label>
          <label className="fld">
            <span>퇴사일 <span className="opt">없으면 비워두기</span></span>
            <input className="inp" type="date" value={d.leave_date ?? ''} onChange={(e) => set('leave_date', e.target.value || null)} />
          </label>
        </div>
        <div className="soft col">
          <label className="chk top">
            <input type="checkbox" checked={d.can_solo} onChange={(e) => set('can_solo', e.target.checked)} />
            <span><b>혼자 근무 가능</b><br /><span className="sub">끄면 주말에 다른 사람과 함께일 때만 배정</span></span>
          </label>
          <label className="chk top">
            <input type="checkbox" checked={d.can_weekend} onChange={(e) => set('can_weekend', e.target.checked)} />
            <span><b>주말 근무 가능</b><br /><span className="sub">신입 기간에는 꺼두고, 나중에 켜면 돼요</span></span>
          </label>
        </div>
        <label className="fld">
          비고 (선택)
          <input className="inp" value={d.memo} onChange={(e) => set('memo', e.target.value)} placeholder="예: 신입, 수요일 오전 외근" />
        </label>
        {msg && <p className="err" role="alert">{msg}</p>}
        <div className="row gap8">
          <button type="submit" className="btn pri flex" disabled={busy}>{busy ? '저장 중…' : initial ? '저장' : '추가'}</button>
          {initial && !initial.leave_date && (
            <button type="button" className="btn" disabled={busy} onClick={() => {
              const day = d.leave_date || today()
              set('leave_date', day)
              save({ leave_date: day }, `${d.name}님 퇴사일을 ${fmtMD(day)}로 저장했어요.`)
            }}>
              퇴사 처리
            </button>
          )}
        </div>
        {initial && (
          <div className="danger-zone">
            <span className="sub">퇴사자는 "퇴사 처리"로 남겨두는 걸 추천해요. 삭제하면 이 직원의 요청사항·배정 기록도 함께 지워져요.</span>
            <ConfirmButton
              className="btn sm"
              confirmText="정말 삭제할까요?"
              onConfirm={async () => {
                try {
                  await deleteStaff(initial.id)
                  onDeleted()
                } catch (e) {
                  onError(errText(e))
                }
              }}
            >
              완전 삭제
            </ConfirmButton>
          </div>
        )}
      </form>
    </section>
  )
}

function TeamsCard({
  teams,
  staff,
  err,
  reload,
  show,
}: {
  teams: Team[] | undefined
  staff: Staff[]
  err: string
  reload: () => Promise<void>
  show: (m: string, k?: 'ok' | 'err') => void
}) {
  const [name, setName] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const t0 = today()
  const count = (id: string) => staff.filter((s) => s.team_id === id && !(s.leave_date && s.leave_date < t0)).length

  async function act(fn: () => Promise<unknown>, ok?: string) {
    try {
      await fn()
      await reload()
      if (ok) show(ok)
    } catch (e) {
      show(errText(e), 'err')
    }
  }

  return (
    <section className="card" aria-labelledby="team-ttl">
      <div className="card-head">
        <h2 className="ttl" id="team-ttl">팀 목록</h2>
        <span className="sub">조직도에 맞게 추가·수정</span>
      </div>
      <ErrorBox msg={err} onRetry={reload} />
      {teams && teams.length === 0 && (
        <div className="soft col">
          <span className="sub">아직 팀이 없어요. 기본 팀을 한 번에 만들 수 있어요.</span>
          <button
            type="button"
            className="btn"
            onClick={() =>
              act(async () => {
                await addTeam('집체팀', 1)
                await addTeam('원격팀', 2)
                const list = await listTeams()
                const j = list.find((t) => t.name === '집체팀')
                if (j) await updateTeam(j.id, { weekend_duty: true })
              }, '집체팀(주말 근무 팀), 원격팀을 만들었어요.')
            }
          >
            집체팀 · 원격팀 만들기
          </button>
        </div>
      )}
      {teams && teams.length > 0 && (
        <ul className="list">
          {teams.map((t) => (
            <li key={t.id} className="li">
              {editId === t.id ? (
                <form
                  className="row gap8 flex"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const n = editName.trim()
                    if (!n) return
                    act(() => updateTeam(t.id, { name: n }), '팀 이름을 바꿨어요.').then(() => setEditId(null))
                  }}
                >
                  <input className="inp sm flex" value={editName} onChange={(e) => setEditName(e.target.value)} aria-label="팀 이름" autoFocus />
                  <button type="submit" className="btn sm pri">저장</button>
                  <button type="button" className="btn sm" onClick={() => setEditId(null)}>취소</button>
                </form>
              ) : (
                <>
                  <b className="w80">{t.name}</b>
                  <span className="sub nowrap">{count(t.id)}명</span>
                  <span className="grow" />
                  <label className="chk small">
                    <input type="checkbox" checked={t.weekend_duty} onChange={(e) => act(() => updateTeam(t.id, { weekend_duty: e.target.checked }))} />
                    주말 근무 팀
                  </label>
                  <button type="button" className="btn sm" onClick={() => { setEditId(t.id); setEditName(t.name) }}>수정</button>
                  <ConfirmButton label={`${t.name} 삭제`} onConfirm={() => act(() => deleteTeam(t.id), `${t.name}을(를) 삭제했어요. 소속 직원은 "팀 없음"이 돼요.`)} />
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <form
        className="row gap8"
        onSubmit={(e) => {
          e.preventDefault()
          const n = name.trim()
          if (!n) return
          act(() => addTeam(n, (teams?.length ?? 0) + 1), `${n}을(를) 추가했어요.`).then(() => setName(''))
        }}
      >
        <input className="inp flex" value={name} onChange={(e) => setName(e.target.value)} placeholder="새 팀 이름" aria-label="새 팀 이름" />
        <button type="submit" className="btn">추가</button>
      </form>
      <p className="sub">"주말 근무 팀"에 체크한 팀만 주말 자동 배정 대상이에요. (예: 집체팀)</p>
    </section>
  )
}

/** 엑셀에서 복사한 여러 줄을 한 번에 추가 (예: "주임 정예슬" 또는 "정예슬	주임") */
function parseLines(text: string): { name: string; rank: string }[] {
  const ranks = RANKS as readonly string[]
  return text
    .split(/\r?\n/)
    .map((line) => line.split(/[\t,]+|\s+/).map((x) => x.trim()).filter((x) => x && !/^[\d.]+$/.test(x) && !['직급', '성명', '이름', '팀', '번호', 'No'].includes(x)))
    .filter((parts) => parts.length > 0)
    .map((parts) => {
      const rank = parts.find((x) => ranks.includes(x)) ?? '사원'
      const name = parts.filter((x) => x !== rank || !ranks.includes(x)).join('') || ''
      return { name, rank }
    })
    .filter((r) => r.name)
}

function PasteStaff({
  teams,
  existing,
  onClose,
  onDone,
  onError,
}: {
  teams: Team[]
  existing: Staff[]
  onClose: () => void
  onDone: (n: number) => void
  onError: (m: string) => void
}) {
  const [text, setText] = useState('')
  const [teamId, setTeamId] = useState<string>(teams[0]?.id ?? '')
  const [weekend, setWeekend] = useState(true)
  const [busy, setBusy] = useState(false)
  const rows = parseLines(text)
  const names = new Set(existing.map((s) => s.name))
  const fresh = rows.filter((r) => !names.has(r.name))
  const dup = rows.length - fresh.length
  const team = teams.find((t) => t.id === teamId)

  return (
    <section className="card" aria-labelledby="ps-ttl">
      <div className="card-head">
        <h2 className="ttl" id="ps-ttl">여러 명 붙여넣기</h2>
        <div className="grow" />
        <button type="button" className="linkbtn" onClick={onClose}>닫기</button>
      </div>
      <p className="sub">기존 엑셀에서 <b>직급·성명 칸</b>을 같이 복사해서 붙여넣으세요. 한 줄에 한 명이에요. 직급이 없으면 사원으로 넣어요.</p>
      <textarea
        className="inp area"
        rows={8}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'과장 이서윤\n주임 박시연\n사원 채수영'}
        aria-label="직원 목록 붙여넣기"
      />
      <label className="fld">
        팀 (한 번에 같은 팀으로 넣어요)
        <select className="inp" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          <option value="">(팀 없음)</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}{t.weekend_duty ? ' · 주말 근무 팀' : ''}</option>)}
        </select>
      </label>
      <label className="chk"><input type="checkbox" checked={weekend} onChange={(e) => setWeekend(e.target.checked)} /> 주말 근무 가능</label>
      {rows.length > 0 && (
        <div className="soft col small">
          <b>미리보기 {fresh.length}명{team ? ` · ${team.name}` : ''}</b>
          <span>{fresh.map((r) => `${r.rank} ${r.name}`).join(', ') || '새로 넣을 사람이 없어요.'}</span>
          {dup > 0 && <span className="muted">이미 있는 이름 {dup}명은 건너뛰어요.</span>}
        </div>
      )}
      <button
        type="button"
        className="btn pri"
        disabled={busy || fresh.length === 0}
        onClick={async () => {
          setBusy(true)
          try {
            let order = existing.length
            for (const r of fresh) {
              order += 1
              await addStaff({ name: r.name, rank: r.rank, team_id: teamId || null, can_solo: true, can_weekend: weekend, hire_date: null, leave_date: null, memo: '', sort_order: order })
            }
            onDone(fresh.length)
          } catch (e) {
            onError(errText(e))
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? '추가 중…' : `${fresh.length}명 추가`}
      </button>
      <p className="sub">팀이 섞여 있으면 팀별로 나눠서 두 번 붙여넣으면 돼요. 혼자 근무·입사일 같은 건 추가한 뒤 한 명씩 고치면 돼요.</p>
    </section>
  )
}
