import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { CalendarIcon } from './Login'
import { PeriodProvider } from '../lib/periods'
import SchedulePage from '../pages/Schedule'
import RequestsPage from '../pages/Requests'
import StaffPage from '../pages/Staff'
import SetupPage from '../pages/Setup'

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
      <PeriodProvider>
        <main>
          {tab === 'schedule' && <SchedulePage />}
          {tab === 'requests' && <RequestsPage />}
          {tab === 'staff' && <StaffPage />}
          {tab === 'setup' && <SetupPage />}
        </main>
      </PeriodProvider>
    </div>
  )
}
