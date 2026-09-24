import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { errText } from '../lib/db'

/** 데이터 불러오기: [값, 오류, 다시불러오기, 불러오는중] */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]): [T | undefined, string, () => Promise<void>, boolean] {
  const [data, setData] = useState<T>()
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const seq = useRef(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cb = useCallback(fn, deps)
  const reload = useCallback(async () => {
    const my = ++seq.current
    setLoading(true)
    try {
      const d = await cb()
      if (my === seq.current) {
        setData(d)
        setErr('')
      }
    } catch (e) {
      if (my === seq.current) setErr(errText(e))
    } finally {
      if (my === seq.current) setLoading(false)
    }
  }, [cb])
  useEffect(() => {
    reload()
  }, [reload])
  return [data, err, reload, loading]
}

/** 잠깐 떴다 사라지는 알림 */
export function useToast(): [ReactNode, (msg: string, kind?: 'ok' | 'err') => void] {
  const [t, setT] = useState<{ msg: string; kind: 'ok' | 'err'; n: number } | null>(null)
  const show = useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => setT((p) => ({ msg, kind, n: (p?.n ?? 0) + 1 })), [])
  useEffect(() => {
    if (!t) return
    const id = window.setTimeout(() => setT(null), t.kind === 'err' ? 6000 : 2500)
    return () => window.clearTimeout(id)
  }, [t])
  const node = t ? (
    <div className={`toast ${t.kind}`} role={t.kind === 'err' ? 'alert' : 'status'} key={t.n}>
      {t.msg}
    </div>
  ) : null
  return [node, show]
}

/** 두 번 눌러야 실행되는 삭제 버튼 (실수 방지) */
export function ConfirmButton({
  onConfirm,
  children = '삭제',
  confirmText = '정말 삭제?',
  className = 'btn sm',
  disabled,
  label,
}: {
  onConfirm: () => void
  children?: ReactNode
  confirmText?: string
  className?: string
  disabled?: boolean
  label?: string
}) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const id = window.setTimeout(() => setArmed(false), 3000)
    return () => window.clearTimeout(id)
  }, [armed])
  return (
    <button
      type="button"
      className={`${className}${armed ? ' danger' : ''}`}
      disabled={disabled}
      aria-label={label && !armed ? label : undefined}
      onClick={() => {
        if (armed) {
          setArmed(false)
          onConfirm()
        } else setArmed(true)
      }}
    >
      {armed ? confirmText : children}
    </button>
  )
}

export function ErrorBox({ msg, onRetry }: { msg: string; onRetry?: () => void }) {
  if (!msg) return null
  return (
    <div className="errbox" role="alert">
      <span>{msg}</span>
      {onRetry && (
        <button type="button" className="btn sm" onClick={onRetry}>
          다시 시도
        </button>
      )}
    </div>
  )
}

export function Badge({ cls, children }: { cls: string; children: ReactNode }) {
  return <span className={`bd ${cls}`}>{children}</span>
}
