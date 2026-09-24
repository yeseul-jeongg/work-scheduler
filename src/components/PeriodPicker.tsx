import { usePeriods, periodTitle } from '../lib/periods'

/** 월 일정표 고르기 (일정표·요청사항·개강종강이 함께 씀) */
export default function PeriodPicker({ label = '일정표' }: { label?: string }) {
  const { periods, current, setCurrentId } = usePeriods()
  if (!periods.length) {
    return (
      <span className="sub">
        아직 월 일정표가 없어요. <a href="#/schedule">일정표 탭</a>에서 먼저 만들어주세요.
      </span>
    )
  }
  return (
    <label className="inline-fld">
      <span>{label}</span>
      <select className="inp sm" value={current?.id ?? ''} onChange={(e) => setCurrentId(e.target.value)}>
        {periods.map((p) => (
          <option key={p.id} value={p.id}>
            {periodTitle(p)}
            {p.status === 'confirmed' ? ' · 확정' : ''}
          </option>
        ))}
      </select>
    </label>
  )
}
