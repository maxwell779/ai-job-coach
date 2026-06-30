import { useState } from 'react'
import { getRoleBrief, getNews } from './api.js'
import { MD, Loading, ErrorBox } from './ui.jsx'
import { ROLE_QUESTIONS } from './questionBank.js'
import { JOB_GROUPS, INDUSTRIES, ALL_JOBS } from './jobTaxonomy.js'

const GROUPS = Object.keys(JOB_GROUPS)

export default function RoleInsight() {
  const [industry, setIndustry] = useState('')
  const [group, setGroup] = useState(GROUPS[0])
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
    if (!target) { setErr('직무를 고르거나 입력하세요.'); return }
    setRole(target); setActive(target); setErr(''); setBrief(''); setNews([])
    setQuestions(ROLE_QUESTIONS[target] || [])
    const ctx = industry ? `${target} (${industry} 산업)` : target
    setLoading(true); setNewsLoading(true)
    getRoleBrief(ctx).then((d) => setBrief(d.brief)).catch((e) => setErr(e.message)).finally(() => setLoading(false))
    getNews(`${target} ${industry || ''} 채용 OR 산업 OR 동향`, 6).then((d) => setNews(d.news || [])).catch(() => {}).finally(() => setNewsLoading(false))
  }

  return (
    <>
      <div className="card">
        <p className="desc" style={{ marginBottom: 12 }}>산업군과 직무를 고르면 <b>핵심 역량·면접 포인트·빈출 질문·관련 뉴스</b>를 보여드려요. 세부 직무 <b>{ALL_JOBS.length}+개</b> · 같은 직무도 산업 맥락 반영.</p>
        <div className="row">
          <div><label>산업군 (선택)</label>
            <select value={industry} onChange={(e) => setIndustry(e.target.value)}>
              <option value="">전체 산업</option>
              {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
          <div><label>직군</label>
            <select value={group} onChange={(e) => setGroup(e.target.value)}>
              {GROUPS.map((g) => <option key={g} value={g}>{g} ({JOB_GROUPS[g].length})</option>)}
            </select>
          </div>
        </div>
        <label>세부 직무 (클릭 또는 직접 검색)</label>
        <input list="alljobs" value={role} onChange={(e) => setRole(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run()} placeholder="예: 데이터 분석가, 반도체 공정, 품질관리 …" />
        <datalist id="alljobs">{ALL_JOBS.map((j) => <option key={j} value={j} />)}</datalist>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {JOB_GROUPS[group].map((r) => (
            <button key={r} className={`tab ${active === r ? 'active' : ''}`} style={{ fontSize: 12.5 }} onClick={() => run(r)}>{r}</button>
          ))}
        </div>
        <div style={{ marginTop: 12 }}><button className="btn" onClick={() => run()} disabled={loading}>{loading ? '분석 중…' : '인사이트 보기'}</button></div>
        {err && <div style={{ marginTop: 12 }}><ErrorBox>{err}</ErrorBox></div>}
      </div>

      {active && (
        <div className="card">
          <h2>🧠 {active}{industry && <span className="tag" style={{ marginLeft: 8 }}>{industry}</span>}</h2>
          {loading && <Loading text="직무 인사이트를 정리하는 중…" />}
          {brief && <MD>{brief}</MD>}
        </div>
      )}

      {questions.length > 0 && (
        <div className="card">
          <h2>💬 {active} 빈출 면접 질문</h2>
          <p className="desc">🎤 모의 면접 탭에서 이 직무로 음성 연습을 해보세요.</p>
          {questions.map((q, i) => <div className="list-item" key={i} style={{ fontSize: 14.5 }}>Q{i + 1}. {q}</div>)}
        </div>
      )}

      {active && (
        <div className="card">
          <h2>📰 관련 최신 뉴스</h2>
          {newsLoading && <Loading text="네이버 뉴스를 가져오는 중…" />}
          {!newsLoading && news.length === 0 && <p className="hint">관련 뉴스를 찾지 못했어요.</p>}
          {news.map((n, i) => (
            <div className="list-item" key={i}><a href={n.link} target="_blank" rel="noreferrer">{n.title}</a><div className="meta">{n.publisher}</div></div>
          ))}
        </div>
      )}
    </>
  )
}
