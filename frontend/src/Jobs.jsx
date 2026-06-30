import { useState, useEffect } from 'react'
import { searchJobs, getJobDetail } from './api.js'
import { Loading, ErrorBox } from './ui.jsx'
import { toggleSavedJob, useCollection } from './store.js'

const REGIONS = { '전국': '', '서울': '11000', '부산': '26000', '대구': '27000', '인천': '28000',
  '광주': '29000', '대전': '30000', '경기': '41000' }
const EDU = ['', '고졸', '대졸2~3년', '대졸4년', '석사', '박사']
const CAREER = ['', '신입', '경력', '무관']
const COTP = { '전체': '', '대기업': '01', '벤처기업': '03', '공공기관': '04', '외국계': '05', '청년친화강소': '09' }
const REGDATE = { '전체기간': '', '오늘': 'D-0', '3일': 'D-3', '1주': 'W-1', '2주': 'W-2', '한달': 'M-1' }

export default function Jobs() {
  const [f, setF] = useState({ keyword: '', region: '', education: '', career: '', co_tp: '', reg_date: '' })
  const [res, setRes] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [detailNo, setDetailNo] = useState(null)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  async function go(e) {
    e?.preventDefault()
    setLoading(true); setErr(''); setRes(null)
    try { setRes(await searchJobs({ ...f, display: 40 })) } catch (e) { setErr(e.message) }
    setLoading(false)
  }

  return (
    <>
      <div className="card">
        <p className="desc" style={{ marginBottom: 12 }}>고용24/워크넷 공공 채용정보(합법 공개 데이터). 공고를 클릭하면 상세를, ⭐로 저장해 <b>내 보드</b>에서 관리하세요.</p>
        <form onSubmit={go}>
          <label>키워드</label>
          <input value={f.keyword} onChange={set('keyword')} placeholder="데이터 분석, AI 엔지니어, 마케팅 …" />
          <div className="row" style={{ marginTop: 4 }}>
            <Sel label="지역" v={f.region} on={set('region')} opts={REGIONS} />
            <div><label>학력</label><select value={f.education} onChange={set('education')}>{EDU.map((e) => <option key={e} value={e}>{e || '무관'}</option>)}</select></div>
            <div><label>경력</label><select value={f.career} onChange={set('career')}>{CAREER.map((c) => <option key={c} value={c}>{c || '무관'}</option>)}</select></div>
            <Sel label="기업형태" v={f.co_tp} on={set('co_tp')} opts={COTP} />
            <Sel label="등록일" v={f.reg_date} on={set('reg_date')} opts={REGDATE} />
          </div>
          <div style={{ marginTop: 16 }}><button className="btn" disabled={loading}>{loading ? '검색 중…' : '채용공고 검색'}</button></div>
        </form>
        {err && <div style={{ marginTop: 12 }}><ErrorBox>{err}</ErrorBox></div>}
        {loading && <Loading text="워크넷에서 공고를 가져오는 중…" />}
      </div>

      {res && (
        <div className="card">
          <h2>검색 결과 {res.total != null && <span className="tag gray">{res.total.toLocaleString()}건</span>}</h2>
          {(!res.jobs || res.jobs.length === 0) && <p className="hint">조건에 맞는 공고가 없습니다.</p>}
          {res.jobs?.map((j, i) => <JobRow key={j.auth_no || i} j={j} onOpen={() => setDetailNo(j.auth_no)} />)}
        </div>
      )}

      {detailNo && <JobDetail authNo={detailNo} onClose={() => setDetailNo(null)} />}
    </>
  )
}

function Sel({ label, v, on, opts }) {
  return <div><label>{label}</label><select value={v} onChange={on}>{Object.entries(opts).map(([k, val]) => <option key={k} value={val}>{k}</option>)}</select></div>
}

function JobRow({ j, onOpen }) {
  const savedJobs = useCollection('savedJobs')
  const saved = !!j.auth_no && savedJobs.some((s) => s.auth_no === j.auth_no)
  function save(e) {
    e.stopPropagation()
    toggleSavedJob({ auth_no: j.auth_no, title: j.title, company: j.company, region: j.region, url: j.url || j.mobile_url })
  }
  return (
    <div className="list-item" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <button className="btn ghost sm" onClick={save} title="저장" style={{ flex: '0 0 auto', padding: '4px 9px' }}>{saved ? '⭐' : '☆'}</button>
      <div style={{ flex: 1, cursor: 'pointer' }} onClick={onOpen}>
        <a style={{ cursor: 'pointer' }}>{j.title}</a>
        <div className="meta"><b>{j.company}</b> · {j.region || '—'} · {j.career || '경력무관'} · {j.edu_min || '학력무관'}{j.sal && ` · 💰 ${j.sal}`}</div>
        <div className="meta">{j.industry} {j.close_date && `· 마감 ${j.close_date}`}</div>
      </div>
    </div>
  )
}

function JobDetail({ authNo, onClose }) {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let alive = true
    getJobDetail(authNo).then((x) => alive && setD(x)).catch((e) => alive && setErr(e.message))
    return () => { alive = false }
  }, [authNo])
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '40px 12px' }}>
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 680, width: '100%', marginTop: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>채용공고 상세</h2>
          <button className="btn ghost sm" onClick={onClose}>✕ 닫기</button>
        </div>
        {!d && !err && <Loading text="상세 정보를 불러오는 중…" />}
        {err && <div style={{ marginTop: 12 }}><ErrorBox>{err}</ErrorBox></div>}
        {d?.error && <div style={{ marginTop: 12 }}><ErrorBox>{d.error}</ErrorBox></div>}
        {d && !d.error && <DetailBody d={d} />}
      </div>
    </div>
  )
}

function Field({ k, v }) {
  if (!v) return null
  return <div className="list-item"><div className="meta" style={{ fontWeight: 700, color: '#374151' }}>{k}</div><div style={{ fontSize: 14, marginTop: 3, whiteSpace: 'pre-wrap' }}>{v}</div></div>
}

function DetailBody({ d }) {
  const c = d.corp || {}, w = d.wanted || {}, ct = d.contact || {}
  return (
    <div style={{ marginTop: 12 }}>
      <h2 style={{ fontSize: 18 }}>{w.title || c.name}</h2>
      <p className="desc">{c.name} {c.size && `· ${c.size}`} {c.industry && `· ${c.industry}`}</p>

      <Field k="모집 직종" v={w.job} />
      <Field k="직무 내용" v={w.job_content} />
      <Field k="고용형태 / 모집인원" v={[w.emp_type, w.headcount].filter(Boolean).join(' · ')} />
      <Field k="자격요건" v={[w.career, w.education, w.major, w.certificate].filter(Boolean).join(' · ')} />
      <Field k="임금조건" v={w.salary} />
      <Field k="근무지 / 근무시간" v={[w.work_region, w.work_hours].filter(Boolean).join(' · ')} />
      <Field k="우대조건" v={[w.preference, w.etc_preference, w.computer, w.foreign_lang].filter(Boolean).join(' · ')} />
      <Field k="복리후생" v={[w.four_ins, w.retire_pay, w.etc_welfare].filter(Boolean).join(' · ')} />
      <Field k="전형방법" v={w.select_method} />
      <Field k="접수방법 / 제출서류" v={[w.receipt_method, w.submit_docs].filter(Boolean).join(' · ')} />
      <Field k="접수 마감" v={w.close_date} />
      <Field k="기타 안내" v={w.etc_guide} />

      <h2 style={{ fontSize: 15, marginTop: 16 }}>회사 정보</h2>
      <Field k="대표자 / 규모" v={[c.ceo, c.size, c.employees && `${c.employees}명`].filter(Boolean).join(' · ')} />
      <Field k="주요 사업" v={c.business} />
      <Field k="연매출 / 자본금" v={[c.year_sales, c.capital].filter(Boolean).join(' · ')} />
      <Field k="주소" v={c.address} />
      <Field k="채용 담당" v={[ct.department, ct.tel].filter(Boolean).join(' · ')} />

      {/* ⚠️ work24 준수: '채용정보 제공사이트로 이동' 버튼 필수 노출 */}
      <div style={{ marginTop: 18 }}>
        <a className="btn dark" href={d.work24_url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', textDecoration: 'none' }}>
          🔗 채용정보 제공사이트로 이동
        </a>
      </div>

      {/* ⚠️ work24 준수: 출처 명기 */}
      <div style={{ marginTop: 16, padding: '12px 14px', background: '#f5f6f8', borderRadius: 10, fontSize: 12, color: 'var(--muted)' }}>
        <b>정보출처: 고용24</b><br />
        {d.source_notice}
      </div>
    </div>
  )
}
