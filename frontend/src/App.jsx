import { useState } from 'react'
import CompanyResearch from './CompanyResearch.jsx'
import Resume from './Resume.jsx'
import Interview from './Interview.jsx'
import Jobs from './Jobs.jsx'
import Board from './Board.jsx'
import RoleInsight from './RoleInsight.jsx'

const TABS = [
  { id: 'company', label: '🏢 기업 분석' },
  { id: 'role', label: '📰 직무·뉴스' },
  { id: 'resume', label: '📝 자소서' },
  { id: 'interview', label: '🎤 모의 면접' },
  { id: 'jobs', label: '🔎 채용공고' },
  { id: 'board', label: '📋 내 보드' },
]

export default function App() {
  const [tab, setTab] = useState('company')
  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <span className="logo">🧭</span>
          <div>
            <h1>AI 취업 코치</h1>
            <div className="sub">DART 기업분석 · 자소서 첨삭 · 음성 모의면접 · 채용공고 — 출처 있는 정직한 취업 도우미</div>
          </div>
        </div>
        <div className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'company' && <CompanyResearch />}
      {tab === 'role' && <RoleInsight />}
      {tab === 'resume' && <Resume />}
      {tab === 'interview' && <Interview />}
      {tab === 'jobs' && <Jobs />}
      {tab === 'board' && <Board />}

      <div className="foot">
        공개 데이터(DART 전자공시 · 네이버 뉴스 · 고용24/워크넷)만 사용 · AI는 출처에 근거해 답하며, 모르면 지어내지 않습니다.
      </div>
    </div>
  )
}
