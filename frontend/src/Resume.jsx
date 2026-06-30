import { useState } from 'react'
import { draftResume, reviewResume } from './api.js'
import { MD, Loading, ErrorBox } from './ui.jsx'
import { useCollection, add, remove, materialDocs } from './store.js'
import { ESSAY_PROMPTS } from './essayBank.js'

export default function Resume({ initialCompany = '', initialJob = '' }) {
  const [mode, setMode] = useState('draft') // draft | review | mine
  return (
    <>
      <div className="card">
        <p className="desc" style={{ marginBottom: 12 }}>대표 문항을 고르면 회사·직무 맞춤 초안을 만들고, 첨삭하고, <b>회사별로 저장·관리</b>해요. (거짓 경력은 만들지 않습니다)</p>
        <div className="tabs" style={{ marginTop: 0 }}>
          <button className={`tab ${mode === 'draft' ? 'active' : ''}`} onClick={() => setMode('draft')}>✍️ 작성·생성</button>
          <button className={`tab ${mode === 'review' ? 'active' : ''}`} onClick={() => setMode('review')}>🔍 첨삭</button>
          <button className={`tab ${mode === 'mine' ? 'active' : ''}`} onClick={() => setMode('mine')}>📁 내 자소서</button>
        </div>
      </div>
      {mode === 'draft' && <Draft initialCompany={initialCompany} initialJob={initialJob} />}
      {mode === 'review' && <Review />}
      {mode === 'mine' && <MyEssays />}
    </>
  )
}

function Draft({ initialCompany = '', initialJob = '' }) {
  const [f, setF] = useState({ company: initialCompany, job_title: initialJob, question: '', experience: '', strengths: '' })
  const [picked, setPicked] = useState('')
  const [tip, setTip] = useState('')
  const [out, setOut] = useState('')
  const [usedMat, setUsedMat] = useState([])
  const [useRag, setUseRag] = useState(true)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [saved, setSaved] = useState(false)
  const exps = useCollection('experiences')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  function pick(p) {
    setPicked(p.key); setTip(p.tip); setF((s) => ({ ...s, question: p.q }))
  }
  function insertExp(x) {
    const star = [x.situation && `상황:${x.situation}`, x.task && `과제:${x.task}`,
      x.action && `행동:${x.action}`, x.result && `결과:${x.result}`].filter(Boolean).join(' / ')
    const line = `[${x.title}] ${star || x.result || ''}`.trim()
    setF((p) => ({ ...p, experience: p.experience ? p.experience + '\n' + line : line }))
  }
  async function go() {
    if (!f.job_title.trim() || !f.experience.trim()) { setErr('지원 직무와 경험은 필수입니다.'); return }
    setLoading(true); setErr(''); setOut(''); setSaved(false); setUsedMat([])
    try {
      const materials = useRag ? materialDocs().map((d) => d.text) : []
      const r = await draftResume({ ...f, materials })
      setOut(r.draft); setUsedMat(r.used_materials || [])
    } catch (e) { setErr(e.message) }
    setLoading(false)
  }
  function saveDoc() {
    add('resumes', { title: picked || f.question || '자소서', company: f.company, job: f.job_title, question: f.question, content: out })
    setSaved(true)
  }

  return (
    <div className="card">
      <div className="row">
        <div><label>지원 회사 (선택)</label><input value={f.company} onChange={set('company')} placeholder="카카오" /></div>
        <div><label>지원 직무 *</label><input value={f.job_title} onChange={set('job_title')} placeholder="데이터 분석가" /></div>
      </div>

      <label>자소서 문항 선택</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {ESSAY_PROMPTS.map((p) => (
          <button key={p.key} className={`tab ${picked === p.key ? 'active' : ''}`} style={{ fontSize: 12.5 }} onClick={() => pick(p)}>{p.key}</button>
        ))}
      </div>
      <input value={f.question} onChange={set('question')} placeholder="문항을 고르거나 직접 입력 (예: 지원 동기와 입사 후 포부)" />
      {tip && <div className="hint" style={{ marginTop: 6 }}>💡 {tip}</div>}

      <label>나의 경험 / 프로젝트 / 역량 *</label>
      <textarea value={f.experience} onChange={set('experience')} placeholder="예: KDT 부트캠프 수료, ML 프로젝트 3건(웨이퍼 결함검사 0.93), 파이썬·SQL ..." />
      {exps.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div className="hint">💼 저장된 경험 넣기:</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {exps.slice(0, 8).map((x) => <button key={x.id} className="tab" style={{ fontSize: 12.5 }} onClick={() => insertExp(x)}>+ {x.title}</button>)}
          </div>
        </div>
      )}
      <label>강조하고 싶은 강점 (선택)</label>
      <input value={f.strengths} onChange={set('strengths')} placeholder="끈기, 문제정의력, 협업" />

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 14 }}>
        <input type="checkbox" checked={useRag} onChange={(e) => setUseRag(e.target.checked)} style={{ width: 18 }} />
        <span>📚 내 저장 경험·스펙을 RAG로 자동 반영 (문항과 관련 높은 것만 골라 넣어요)</span>
      </label>

      <div style={{ marginTop: 16 }}><button className="btn" onClick={go} disabled={loading}>{loading ? '작성 중…' : '초안 생성'}</button></div>
      {err && <div style={{ marginTop: 12 }}><ErrorBox>{err}</ErrorBox></div>}
      {loading && <Loading text="자소서 초안을 작성하는 중…" />}
      {out && <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
          <b>{picked || '초안'}</b>
          <span className="tag gray">{out.replace(/\s/g, '').length}자 (공백제외)</span>
        </div>
        <div style={{ marginTop: 8, whiteSpace: 'pre-wrap', lineHeight: 1.8, fontSize: 14.5 }}>{out}</div>
        {usedMat.length > 0 && (
          <div className="hint" style={{ marginTop: 10, padding: '10px 12px', background: '#f5f6f8', borderRadius: 8 }}>
            📚 RAG가 반영한 내 자료: {usedMat.map((m) => m.slice(0, 40)).join(' · ')}
          </div>
        )}
        <button className="btn ghost sm" onClick={saveDoc} disabled={saved} style={{ marginTop: 12 }}>{saved ? '✓ 내 자소서에 저장됨' : '📁 내 자소서에 저장'}</button>
      </>}
    </div>
  )
}

function Review() {
  const [text, setText] = useState('')
  const [job, setJob] = useState('')
  const [out, setOut] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  async function go() {
    if (text.trim().length < 30) { setErr('첨삭할 자소서를 30자 이상 입력하세요.'); return }
    setLoading(true); setErr(''); setOut('')
    try { setOut((await reviewResume({ text, job_title: job })).review) } catch (e) { setErr(e.message) }
    setLoading(false)
  }
  return (
    <div className="card">
      <label>지원 직무 (선택)</label>
      <input value={job} onChange={(e) => setJob(e.target.value)} placeholder="데이터 분석가" />
      <label>첨삭받을 자소서 본문 *</label>
      <textarea value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 180 }} placeholder="작성한 자소서를 붙여넣으세요." />
      <div className="hint" style={{ marginTop: 6 }}>{text.replace(/\s/g, '').length}자 (공백제외)</div>
      <div style={{ marginTop: 14 }}><button className="btn" onClick={go} disabled={loading}>{loading ? '첨삭 중…' : '첨삭 받기'}</button></div>
      {err && <div style={{ marginTop: 12 }}><ErrorBox>{err}</ErrorBox></div>}
      {loading && <Loading text="자소서를 분석하는 중…" />}
      {out && <div style={{ marginTop: 16 }}><MD>{out}</MD></div>}
    </div>
  )
}

// 저장된 자소서를 회사별로 묶어 보기
function MyEssays() {
  const docs = useCollection('resumes')
  const groups = {}
  for (const d of docs) { const k = d.company || '회사 미지정'; (groups[k] = groups[k] || []).push(d) }
  const companies = Object.keys(groups)
  return (
    <div className="card">
      <h2>📁 내 자소서 ({docs.length})</h2>
      {docs.length === 0 && <p className="hint">✍️ 작성·생성 탭에서 자소서를 만들고 "내 자소서에 저장"하면 회사별로 모여요.</p>}
      {companies.map((co) => (
        <div key={co} style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--brand)' }}>🏢 {co} <span className="tag gray">{groups[co].length}</span></div>
          {groups[co].map((d) => (
            <details className="list-item" key={d.id}>
              <summary style={{ cursor: 'pointer', fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                <span>{d.title} {d.job && <span className="muted">· {d.job}</span>}</span>
                <span className="tag gray">{(d.content || '').replace(/\s/g, '').length}자</span>
              </summary>
              {d.question && <div className="meta" style={{ marginTop: 6 }}>문항: {d.question}</div>}
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.7, marginTop: 8 }}>{d.content}</div>
              <button className="btn ghost sm" onClick={() => remove('resumes', d.id)} style={{ marginTop: 8 }}>삭제</button>
            </details>
          ))}
        </div>
      ))}
    </div>
  )
}
