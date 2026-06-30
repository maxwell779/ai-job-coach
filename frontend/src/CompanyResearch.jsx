import { useState } from 'react'
import { getCompany, getBrief } from './api.js'
import { MD, Loading, ErrorBox, fmtKRW } from './ui.jsx'

export default function CompanyResearch() {
  const [name, setName] = useState('')
  const [job, setJob] = useState('')
  const [data, setData] = useState(null)
  const [brief, setBrief] = useState('')
  const [biz, setBiz] = useState(null)
  const [loading, setLoading] = useState(false)
  const [briefing, setBriefing] = useState(false)
  const [err, setErr] = useState('')

  async function search(e) {
    e?.preventDefault()
    if (!name.trim()) return
    setLoading(true); setErr(''); setData(null); setBrief(''); setBiz(null)
    try {
      const d = await getCompany(name.trim())
      setData(d)
      // 데이터 로드 후 AI 요약을 자동 생성(불친절 방지)
      if (!d?.overview?.error) makeBrief(d?.resolved?.corp_name || name.trim())
    } catch (e) { setErr(e.message) }
    setLoading(false)
  }

  async function makeBrief(targetName) {
    setBriefing(true); setErr('')
    try {
      const r = await getBrief(targetName || data?.resolved?.corp_name || name, job)
      setBrief(r.brief)
      if (r.business?.text) setBiz(r.business)
    } catch (e) { /* 요약 실패는 조용히(데이터는 이미 표시됨) */ }
    setBriefing(false)
  }

  const ov = data?.overview
  const fin = data?.financials

  return (
    <>
      <div className="card">
        <p className="desc" style={{ marginBottom: 14 }}>지원할 회사를 검색하면 DART 전자공시·사업보고서·뉴스로 한눈에 정리하고 AI가 요약해 드려요.</p>
        <form onSubmit={search}>
          <div className="row">
            <input placeholder="회사명 (예: 카카오, 삼성전자, 네이버)" value={name} onChange={(e) => setName(e.target.value)} />
            <input placeholder="지원 직무 (선택, 예: 데이터 분석가)" value={job} onChange={(e) => setJob(e.target.value)} style={{ flex: '0 0 240px' }} />
            <button className="btn" disabled={loading} style={{ flex: '0 0 auto' }}>{loading ? '검색 중…' : '분석'}</button>
          </div>
        </form>
        {err && <div style={{ marginTop: 12 }}><ErrorBox>{err}</ErrorBox></div>}
        {loading && <Loading text="DART에서 기업 정보를 모으는 중…" />}
        {data?.resolved?.candidates && (
          <p className="hint" style={{ marginTop: 10 }}>
            여러 회사가 검색됐어요: {data.resolved.candidates.map((c) => c.corp_name).join(', ')} — 정확한 이름으로 다시 검색해 보세요.
          </p>
        )}
      </div>

      {ov && !ov.error && (
        <div className="card">
          <h2>{ov.corp_name} <span className="tag">{ov.corp_class}</span></h2>
          <p className="desc">{ov.corp_name_eng}</p>
          <div className="kv">
            <Item k="대표자" v={ov.ceo} />
            <Item k="설립일" v={ov.established} />
            <Item k="종목코드" v={ov.stock_code || '비상장'} />
            <Item k="결산월" v={ov.settlement_month} />
            <Item k="홈페이지" v={ov.homepage ? <a href={ov.homepage?.startsWith('http') ? ov.homepage : `http://${ov.homepage}`} target="_blank" rel="noreferrer">{ov.homepage}</a> : '—'} />
            <Item k="주소" v={ov.address} />
          </div>
          <div style={{ marginTop: 16 }}>
            <button className="btn dark" onClick={makeBrief} disabled={briefing}>
              {briefing ? 'AI 브리핑 작성 중…' : '🤖 AI 면접 준비 브리핑 받기'}
            </button>
          </div>
          {briefing && <Loading text="사업보고서·재무·뉴스로 회사를 요약하는 중…" />}
          {brief && <div style={{ marginTop: 14 }}><MD>{brief}</MD></div>}
          {biz?.text && (
            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 13.5, color: 'var(--brand)' }}>📄 사업보고서 '사업의 개요' 원문 보기</summary>
              <div style={{ fontSize: 13, lineHeight: 1.7, marginTop: 8, color: '#374151' }}>{biz.text}</div>
              {biz.link && <a href={biz.link} target="_blank" rel="noreferrer" style={{ fontSize: 12.5 }}>DART 원문 →</a>}
            </details>
          )}
        </div>
      )}

      {fin && !fin.error && fin.revenue && (
        <div className="card">
          <h2>📊 실적 (DART 연결, 최근 {fin.revenue.length}개년)</h2>
          <p className="desc">출처: {fin.source} · 단위 원</p>
          <div className="fin">
            <FinMetric label={`매출액 (${fin.revenue[0]?.year})`} v={fin.revenue[0]?.value} yoy={fin.revenue_yoy_pct} />
            <FinMetric label={`영업이익 (${fin.operating_income?.[0]?.year})`} v={fin.operating_income?.[0]?.value} yoy={fin.operating_income_yoy_pct} />
            <FinMetric label={`순이익 (${fin.net_income?.[0]?.year})`} v={fin.net_income?.[0]?.value} yoy={fin.net_income_yoy_pct} />
          </div>
        </div>
      )}

      {data?.filings?.length > 0 && (
        <div className="card">
          <h2>📁 최근 공시 (DART)</h2>
          {data.filings.map((f, i) => (
            <div className="list-item" key={i}>
              <a href={f.link} target="_blank" rel="noreferrer">{f.title}</a>
              <div className="meta">{f.date}</div>
            </div>
          ))}
        </div>
      )}

      {data?.news?.length > 0 && (
        <div className="card">
          <h2>📰 최근 뉴스 (네이버)</h2>
          {data.news.map((n, i) => (
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

function Item({ k, v }) {
  return <div className="item"><div className="k">{k}</div><div className="v">{v || '—'}</div></div>
}

function FinMetric({ label, v, yoy }) {
  return (
    <div className="metric">
      <div className="label">{label}</div>
      <div className="num">{fmtKRW(v)}</div>
      {yoy != null && <div className={`yoy ${yoy >= 0 ? 'up' : 'down'}`}>{yoy >= 0 ? '▲' : '▼'} {Math.abs(yoy)}% (YoY)</div>}
    </div>
  )
}
