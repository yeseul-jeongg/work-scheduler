import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setError('이메일 또는 비밀번호가 맞지 않아요.')
  }

  return (
    <div className="center-wrap">
      <form className="card center-card" onSubmit={onSubmit}>
        <div className="brand">
          <CalendarIcon />
          <span>근무 스케줄러</span>
        </div>
        <p className="sub">관리자 계정으로 로그인해주세요.</p>
        <label className="fld">
          이메일
          <input className="inp" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="fld">
          비밀번호
          <input className="inp" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="err" role="alert">{error}</p>}
        <button type="submit" className="btn pri" disabled={busy}>{busy ? '로그인 중…' : '로그인'}</button>
      </form>
    </div>
  )
}

export function CalendarIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1d6f42" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 2v4M16 2v4" />
    </svg>
  )
}
