import { useState } from 'react'
import { getCompany, getBrief, getRoleBrief, getNews } from './api.js'
import { MD, Loading, ErrorBox, fmtKRW } from './ui.jsx'
import { ROLE_QUESTIONS } from './questionBank.js'
import { JOB_GROUPS, INDUSTRIES, ALL_JOBS } from './jobTaxonomy.js'
import { findDivisions, COMPANY_NAMES } from './companyDivisions.js'

const GROUPS = Object.keys(JOB_GROUPS)

export default function Explore({ goTo, onContext }) {
  const [company, setCompany] = useState('')
  const [industry, setIndustry] = useState('')
  const [group, setGroup] = useState(GROUPS[0])
  const [role, setRole] = useState('')
  const [division, setDivision] = useState('')

  const [data, setData] = useState(null)
  const [brief, setBrief] = useState(''); const [biz, setBiz] = useState(null)
  const [roleBrief, setRoleBrief] = useState('')
  const [questions, setQuestions] = useState([])
  const [news, setNews] = useState([])
  const [loading, setLoading] = useState(false)
  const [briefing, setBriefing] = useState(false)
  const [err, setErr] = useState('')

  async function analyze(e) {
    e?.preventDefault()
    if (!company.trim() && !role.trim()) { setErr('회사명 또는 직무 중 하나는 입력하세요.'); return }
    setErr(''); setData(null); setBrief(''); setBiz(null); setRoleBrief(''); setQuestions(ROLE_QUESTIONS[role] || []); setNews([]); setDivision('')
    onContext?.({ company: company.trim(), role: role.trim() })
    const jobCtx = [role, industry && `${industry} 산업`].filter(Boolean).join(' · ')

    // 1) 기업 데이터 + AI 요약
    if (company.trim()) {
      setLoading(true)
      try {
        const d = await getCompany(company.trim()); setData(d)
        if (!d?.overview?.error) {
          setBriefing(true)
          getBrief(d?.resolved?.corp_name || company.trim(), jobCtx || role)
            .then((r) => { setBrief(r.brief); if (r.business?.text) setBiz(r.business) })
            .catch(() => {}).finally(() => setBriefing(false))
        }
      } catch (e) { setErr(e.message) }
      setLoading(false)
    }
    // 2) 직무 인사이트
    if (role.trim()) {
      const rc = industry ? `${role} (${industry} 산업)` : role
      getRoleBrief(rc).then((r) => setRoleBrief(r.brief)).catch(() => {})
    }
    // 3) 뉴스(회사 우선, 없으면 직무+산업)
    const nq = company.trim() ? company.trim() : `${role} ${industry || ''} 채용 OR 동향`
    getNews(nq, 6).then((r) => setNews(r.news || [])).catch(() => {})
  }

  async function pickDivision(div) {
    setDivision(div)
    const cn = data?.resolved?.corp_name || company
    const jc = [role, div, industry && `${industry} 산업`].filter(Boolean).join(' · ')
    setBriefing(true)
    try { const r = await getBrief(cn, jc); setBrief(r.brief); if (r.business?.text) setBiz(r.business) } catch {}
    setBriefing(false)
  }

  const ov = data?.overview, fin = data?.financials
  const divInfo = ov && !ov.error ? findDivisions(ov.corp_name) : null
  const ready = data || brief || roleBrief || news.length

  return (
    <>
      <div className="card">
        <p className="desc" style={{ marginBottom: 12 }}>회사·산업군·직무를 한 번에 넣으면 <b>기업 분석 + 직무 인사이트 + 뉴스</b>를 통합해 보여줘요. 같은 직무도 산업/회사 맥락 반영.</p>
        <form onSubmit={analyze}>
          <div className="row">
            <div><label>지원 회사 (대기업·공기업 자동완성)</label>
              <input list="complist" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="삼성전자 / 한국전력공사 …" />
              <datalist id="complist">{COMPANY_NAMES.map((n) => <option key={n} value={n} />)}</datalist>
            </div>
            <div><label>산업군 (선택)</label>
              <select value={industry} onChange={(e) => setIndustry(e.target.value)}>
                <option value="">전체 산업</option>{INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
          </div>
          <div className="row" style={{ marginTop: 4 }}>
            <div style={{ flex: '0 0 220px' }}><label>직군</label>
              <select value={group} onChange={(e) => setGroup(e.target.value)}>{GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}</select>
            </div>
            <div><label>세부 직무 ({ALL_JOBS.length}+)</label>
              <input list="alljobs2" value={role} onChange={(e) => setRole(e.target.value)} placeholder="예: 반도체 공정, 데이터 분석가" />
              <datalist id="alljobs2">{ALL_JOBS.map((j) => <option key={j} value={j} />)}</datalist>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {JOB_GROUPS[group].slice(0, 14).map((r) => (
              <button type="button" key={r} className={`tab ${role === r ? 'active' : ''}`} style={{ fontSize: 12.5 }} onClick={() => setRole(r)}>{r}</button>
            ))}
          </div>
          <div style={{ marginTop: 14 }}><button className="btn" disabled={loading}>{loading ? '분석 중…' : '🔎 통합 분석'}</button></div>
        </form>
        {err && <div style={{ marginTop: 12 }}><ErrorBox>{err}</ErrorBox></div>}
        {loading && <Loading text="DART에서 기업 정보를 모으는 중…" />}
      </div>

      {ov && !ov.error && (
        <div className="card">
          <h2>{ov.corp_name} <span className="tag">{ov.corp_class}</span>{industry && <span className="tag gray" style={{ marginLeft: 6 }}>{industry}</span>}</h2>
          <p className="desc">{ov.corp_name_eng}</p>
          <div className="kv">
            <Item k="대표자" v={ov.ceo} /><Item k="설립일" v={ov.established} /><Item k="종목코드" v={ov.stock_code || '비상장'} />
            <Item k="결산월" v={ov.settlement_month} /><Item k="주소" v={ov.address} />
          </div>
          {divInfo && (
            <div style={{ marginTop: 14 }}>
              <div className="hint" style={{ fontWeight: 700, color: 'var(--text)' }}>🏭 사업부문 / 채용직군 선택(부문별 맞춤 분석)</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {divInfo.divisions.map((d) => (
                  <button key={d} className={`tab ${division === d ? 'active' : ''}`} style={{ fontSize: 12.5 }} onClick={() => pickDivision(d)}>{d}</button>
                ))}
              </div>
            </div>
          )}
          <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {goTo && <button className="btn" onClick={() => goTo('interview', { company: ov.corp_name + (division ? ` ${division}` : ''), role })}>🎤 이 회사{division ? ` ${division}` : ''}{role && `·${role}`}로 모의면접</button>}
            {goTo && <button className="btn ghost" onClick={() => goTo('resume', {})}>📝 자소서 쓰기</button>}
          </div>
          {briefing && <Loading text="사업보고서·재무·뉴스로 회사를 요약하는 중…" />}
          {brief && <div style={{ marginTop: 14 }}><MD>{brief}</MD></div>}
          {biz?.text && (
            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 13.5, color: 'var(--brand)' }}>📄 사업보고서 '사업의 개요' 원문</summary>
              <div style={{ fontSize: 13, lineHeight: 1.7, marginTop: 8, color: '#374151' }}>{biz.text}</div>
            </details>
          )}
        </div>
      )}

      {fin && !fin.error && fin.revenue && (
        <div className="card">
          <h2>📊 실적 (DART 연결)</h2>
          <div className="fin">
            <FinMetric label={`매출 (${fin.revenue[0]?.year})`} v={fin.revenue[0]?.value} yoy={fin.revenue_yoy_pct} />
            <FinMetric label={`영업이익`} v={fin.operating_income?.[0]?.value} yoy={fin.operating_income_yoy_pct} />
            <FinMetric label={`순이익`} v={fin.net_income?.[0]?.value} yoy={fin.net_income_yoy_pct} />
          </div>
        </div>
      )}

      {(roleBrief || questions.length > 0) && (
        <div className="card">
          <h2>🧠 {role} 직무 인사이트{industry && <span className="tag" style={{ marginLeft: 6 }}>{industry}</span>}</h2>
          {roleBrief ? <MD>{roleBrief}</MD> : <Loading text="직무 인사이트 정리 중…" />}
          {questions.length > 0 && <>
            <h2 style={{ fontSize: 14, marginTop: 14 }}>💬 빈출 면접 질문</h2>
            {questions.map((q, i) => <div className="list-item" key={i} style={{ fontSize: 14 }}>Q{i + 1}. {q}</div>)}
          </>}
        </div>
      )}

      {data?.filings?.length > 0 && (
        <div className="card"><h2>📁 최근 공시 (DART)</h2>
          {data.filings.map((f, i) => <div className="list-item" key={i}><a href={f.link} target="_blank" rel="noreferrer">{f.title}</a><div className="meta">{f.date}</div></div>)}
        </div>
      )}

      {news.length > 0 && (
        <div className="card"><h2>📰 관련 뉴스</h2>
          {news.map((n, i) => <div className="list-item" key={i}><a href={n.link} target="_blank" rel="noreferrer">{n.title}</a><div className="meta">{n.publisher}</div></div>)}
        </div>
      )}

      {!ready && !loading && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--muted)' }}>
          🔎 회사명(예: 삼성전자) 또는 직무(예: 반도체 공정)를 넣고 통합 분석을 눌러보세요.
        </div>
      )}
    </>
  )
}

function Item({ k, v }) { return <div className="item"><div className="k">{k}</div><div className="v">{v || '—'}</div></div> }
function FinMetric({ label, v, yoy }) {
  return (
    <div className="metric"><div className="label">{label}</div><div className="num">{fmtKRW(v)}</div>
      {yoy != null && <div className={`yoy ${yoy >= 0 ? 'up' : 'down'}`}>{yoy >= 0 ? '▲' : '▼'} {Math.abs(yoy)}% (YoY)</div>}
    </div>
  )
}
