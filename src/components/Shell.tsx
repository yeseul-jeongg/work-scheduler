import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { CalendarIcon } from './Login'
import Placeholder from '../pages/Placeholder'

const TABS = [
  { id: 'schedule', label: '일정표' },
  { id: 'requests', label: '요청사항' },
  { id: 'staff', label: '직원 관리' },
  { id: 'setup', label: '과정 · 공휴일 · 설정' },
] as const
type TabId = (typeof TABS)[number]['id']

function readHash(): TabId {
  const h = window.location.hash.replace('#/', '')
  return (TABS.find((t) => t.id === h)?.id ?? 'schedule') as TabId
}

export default function Shell({ email }: { email: string }) {
  const [tab, setTab] = useState<TabId>(readHash)

  useEffect(() => {
    const onHash = () => setTab(readHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <CalendarIcon />
          <span>근무 스케줄러</span>
        </div>
        <nav className="tabs" aria-label="메뉴">
          {TABS.map((t) => (
            <a key={t.id} href={`#/${t.id}`} className={`tab${tab === t.id ? ' on' : ''}`} aria-current={tab === t.id ? 'page' : undefined}>
              {t.label}
            </a>
          ))}
        </nav>
        <div className="grow" />
        <span className="who">{email}</span>
        <button type="button" className="linkbtn" onClick={() => supabase?.auth.signOut()}>로그아웃</button>
      </header>
      <main>
        {tab === 'schedule' && <Placeholder title="일정표" step="3~6단계" />}
        {tab === 'requests' && <Placeholder title="요청사항" step="3단계" />}
        {tab === 'staff' && <Placeholder title="직원 관리" step="2단계" />}
        {tab === 'setup' && <Placeholder title="과정 · 공휴일 · 설정" step="2단계" />}
      </main>
    </div>
  )
}
