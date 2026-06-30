import { useState } from 'react'
import { getRoleBrief, getNews } from './api.js'
import { MD, Loading, ErrorBox } from './ui.jsx'
import { ROLE_QUESTIONS } from './questionBank.js'

const ROLES = Object.keys(ROLE_QUESTIONS)

export default function RoleInsight() {
  const [role, setRole] = useState('')
  const [active, setActive] = useState('')
  const [brief, setBrief] = useState('')
  const [news, setNews] = useState([])
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(false)
  const [newsLoading, setNewsLoading] = useState(false)
  const [err, setErr] = useState('')

  async function run(r) {
    const target = (r ?? role).trim()
    if (!target) { setErr('직무나 키워드를 입력하세요.'); return }
    setActive(target); setErr(''); setBrief(''); setNews([])
    setQuestions(ROLE_QUESTIONS[target] || [])
    setLoading(true); setNewsLoading(true)
    // AI 인사이트
    getRoleBrief(target).then((d) => setBrief(d.brief)).catch((e) => setErr(e.message)).finally(() => setLoading(false))
    // 관련 뉴스
    getNews(target + ' 채용 OR 산업 OR 동향', 6).then((d) => setNews(d.news || [])).catch(() => {}).finally(() => setNewsLoading(false))
  }

  return (
    <>
      <div className="card">
        <h2>📰 직무·산업 인사이트</h2>
        <p className="desc">직무를 고르거나 검색하면 <b>핵심 역량·면접 포인트</b>, <b>빈출 질문</b>, <b>관련 최신 뉴스</b>를 한 번에 보여드려요.</p>
        <div className="row">
          <input value={role} onChange={(e) => setRole(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run()}
            placeholder="예: 반도체 공정, IT 풀스택, 품질관리, 마케팅 …" />
          <button className="btn" onClick={() => run()} disabled={loading} style={{ flex: '0 0 auto' }}>{loading ? '분석 중…' : '인사이트 보기'}</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          {ROLES.map((r) => (
            <button key={r} className={`tab ${active === r ? 'active' : ''}`} style={{ fontSize: 12.5 }} onClick={() => { setRole(r); run(r) }}>{r}</button>
          ))}
        </div>
        {err && <div style={{ marginTop: 12 }}><ErrorBox>{err}</ErrorBox></div>}
      </div>

      {active && (
        <div className="card">
          <h2>🧠 {active} — AI 인사이트</h2>
          {loading && <Loading text="직무 인사이트를 정리하는 중…" />}
          {brief && <MD>{brief}</MD>}
        </div>
      )}

      {questions.length > 0 && (
        <div className="card">
          <h2>💬 {active} 빈출 면접 질문</h2>
          <p className="desc">🎤 모의 면접 탭에서 음성으로 답하며 연습해 보세요.</p>
          {questions.map((q, i) => (
            <div className="list-item" key={i} style={{ fontSize: 14.5 }}>Q{i + 1}. {q}</div>
          ))}
        </div>
      )}

      {active && (
        <div className="card">
          <h2>📰 관련 최신 뉴스</h2>
          {newsLoading && <Loading text="네이버 뉴스를 가져오는 중…" />}
          {!newsLoading && news.length === 0 && <p className="hint">관련 뉴스를 찾지 못했어요.</p>}
          {news.map((n, i) => (
            <div className="list-item" key={i}>
              <a href={n.link} target="_blank" rel="noreferrer">{n.title}</a>
              <div className="meta">{n.publisher}</div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
