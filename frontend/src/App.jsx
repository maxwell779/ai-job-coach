import { useState } from 'react'
import CompanyResearch from './CompanyResearch.jsx'
import Resume from './Resume.jsx'
import Interview from './Interview.jsx'
import Jobs from './Jobs.jsx'
import Board from './Board.jsx'
import RoleInsight from './RoleInsight.jsx'

const TABS = [
  { id: 'company', icon: '🏢', label: '기업 분석', desc: '지원할 회사를 DART로 분석' },
  { id: 'role', icon: '📰', label: '직무·뉴스', desc: '직무 인사이트와 관련 뉴스' },
  { id: 'resume', icon: '📝', label: '자소서', desc: '작성·첨삭·회사별 관리' },
  { id: 'interview', icon: '🎤', label: '모의 면접', desc: '음성 면접 + 목소리 분석' },
  { id: 'jobs', icon: '🔎', label: '채용공고', desc: '공공 채용정보 검색' },
  { id: 'board', icon: '📋', label: '내 보드', desc: '지원현황·일정·스펙·자료' },
]

export default function App() {
  const [tab, setTab] = useState('company')
  const active = TABS.find((t) => t.id === tab)
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="side-brand"><span className="logo">🧭</span><span className="bname">AI 취업 코치</span></div>
        <nav className="side-nav">
          {TABS.map((t) => (
            <button key={t.id} className={`nav-item ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              <span className="nav-ico">{t.icon}</span>
              <span className="nav-txt">{t.label}</span>
            </button>
          ))}
        </nav>
        <div className="side-foot">공개 데이터(DART·네이버·고용24)<br />기반 · AI는 출처에 근거해 답해요</div>
      </aside>

      <main className="main">
        <header className="page-head">
          <h1>{active.icon} {active.label}</h1>
          <p>{active.desc}</p>
        </header>
        <div className="content">
          {tab === 'company' && <CompanyResearch />}
          {tab === 'role' && <RoleInsight />}
          {tab === 'resume' && <Resume />}
          {tab === 'interview' && <Interview />}
          {tab === 'jobs' && <Jobs />}
          {tab === 'board' && <Board />}
        </div>
      </main>
    </div>
  )
}
