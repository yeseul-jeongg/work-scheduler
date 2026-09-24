// 여러 탭이 함께 쓰는 "지금 보고 있는 월 일정표" 선택
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { listPeriods, errText, type Period } from './db'

type Ctx = {
  periods: Period[]
  current: Period | null
  setCurrentId: (id: string) => void
  reload: () => Promise<void>
  error: string
  loaded: boolean
}
const PeriodCtx = createContext<Ctx | null>(null)
const KEY = 'sched-period'

function readSaved(): string {
  try {
    return window.localStorage.getItem(KEY) || ''
  } catch {
    return ''
  }
}

export function PeriodProvider({ children }: { children: ReactNode }) {
  const [periods, setPeriods] = useState<Period[]>([])
  const [currentId, setId] = useState<string>(readSaved)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)

  const reload = useCallback(async () => {
    try {
      setPeriods(await listPeriods())
      setError('')
    } catch (e) {
      setError(errText(e))
    } finally {
      setLoaded(true)
    }
  }, [])
  useEffect(() => {
    reload()
  }, [reload])

  const setCurrentId = useCallback((id: string) => {
    setId(id)
    try {
      window.localStorage.setItem(KEY, id)
    } catch {
      /* 저장 못 해도 괜찮아요 */
    }
  }, [])

  const current = useMemo(() => {
    if (!periods.length) return null
    const found = periods.find((p) => p.id === currentId)
    if (found) return found
    // 저장된 게 없으면 오늘이 들어있는 일정표, 없으면 가장 최근 것
    const t = new Date().toISOString().slice(0, 10)
    return periods.find((p) => p.start_date <= t && t <= p.end_date) ?? periods[0]
  }, [periods, currentId])

  return (
    <PeriodCtx.Provider value={{ periods, current, setCurrentId, reload, error, loaded }}>{children}</PeriodCtx.Provider>
  )
}

export function usePeriods(): Ctx {
  const c = useContext(PeriodCtx)
  if (!c) throw new Error('PeriodProvider 밖에서 사용')
  return c
}

/** 제목: "26년 9월 일정표 (8/31 ~ 10/4)" (엑셀과 같은 함수) */
export { periodTitle } from './sheet'
