import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, checkIsAdmin } from './lib/supabase'
import Login from './components/Login'
import Shell from './components/Shell'

type AdminState = 'checking' | 'yes' | 'no' | 'error'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  // 어떤 계정에 대한 확인 결과인지 같이 저장 (계정이 바뀌면 자동으로 '확인 중')
  const [adminFor, setAdminFor] = useState<{ userId: string; state: AdminState } | null>(null)
  const userId = session?.user.id ?? null
  const admin: AdminState = adminFor && adminFor.userId === userId ? adminFor.state : 'checking'

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!userId) return
    let alive = true
    checkIsAdmin()
      .then((ok) => alive && setAdminFor({ userId, state: ok ? 'yes' : 'no' }))
      .catch(() => alive && setAdminFor({ userId, state: 'error' }))
    return () => {
      alive = false
    }
  }, [userId])

  if (!supabase) {
    return (
      <Center>
        <h1 className="ttl">설정이 필요해요</h1>
        <p className="sub">
          Vercel 환경변수에 <code>VITE_SUPABASE_URL</code>, <code>VITE_SUPABASE_ANON_KEY</code>를 넣고 다시 배포해주세요.
        </p>
      </Center>
    )
  }
  if (!ready) return <Center><p className="sub">불러오는 중…</p></Center>
  if (!session) return <Login />

  if (admin === 'checking') return <Center><p className="sub">권한 확인 중…</p></Center>
  if (admin !== 'yes') {
    return (
      <Center>
        <h1 className="ttl">{admin === 'no' ? '관리자 계정이 아니에요' : '권한을 확인하지 못했어요'}</h1>
        <p className="sub">
          {admin === 'no'
            ? `${session.user.email} 계정은 스케줄러 관리자 명단에 없어요.`
            : 'Supabase에 1단계 SQL을 실행했는지 확인해주세요.'}
        </p>
        <button type="button" className="btn" onClick={() => supabase!.auth.signOut()}>로그아웃</button>
      </Center>
    )
  }
  return <Shell email={session.user.email ?? ''} />
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div className="center-wrap">
      <div className="card center-card">{children}</div>
    </div>
  )
}
