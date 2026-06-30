import { useState } from 'react'
import { useCollection, add, update, remove, materialDocs } from './store.js'
import { ragSearch, extractText } from './api.js'
import { Loading } from './ui.jsx'

const SECTIONS = [
  { id: 'apps', label: '📌 지원 현황' },
  { id: 'saved', label: '⭐ 저장 공고' },
  { id: 'plan', label: '🗓 일정' },
  { id: 'spec', label: '🎖 스펙·이력' },
  { id: 'exp', label: '💼 경험' },
  { id: 'docs', label: '📄 자료실' },
]
const STAGES = ['관심', '지원', '서류합격', '면접', '최종합격', '불합격']
const STAGE_COLOR = { '관심': '#6b7280', '지원': '#3182f6', '서류합격': '#8b5cf6', '면접': '#f59e0b', '최종합격': '#16a34a', '불합격': '#9ca3af' }

export default function Board() {
  const [sec, setSec] = useState('apps')
  return (
    <>
      <div className="card">
        <p className="desc" style={{ marginBottom: 12 }}>지원 현황·저장한 공고·채용 계획·경험·자료를 한곳에서 관리해요. (브라우저에 저장되며 서버로 전송되지 않습니다)</p>
        <div className="tabs" style={{ marginTop: 0 }}>
          {SECTIONS.map((s) => <button key={s.id} className={`tab ${sec === s.id ? 'active' : ''}`} onClick={() => setSec(s.id)}>{s.label}</button>)}
        </div>
      </div>
      {sec === 'apps' && <Applications />}
      {sec === 'saved' && <SavedJobs />}
      {sec === 'plan' && <Plans />}
      {sec === 'spec' && <Spec />}
      {sec === 'exp' && <Experiences />}
      {sec === 'docs' && <Docs />}
    </>
  )
}

function Empty({ children }) { return <p className="hint" style={{ marginTop: 8 }}>{children}</p> }

// ── 지원 현황 트래커 ──
function Applications() {
  const apps = useCollection('applications')
  const [f, setF] = useState({ company: '', title: '', stage: '관심', memo: '' })
  function addApp() {
    if (!f.company.trim()) return
    add('applications', f); setF({ company: '', title: '', stage: '관심', memo: '' })
  }
  const counts = STAGES.map((s) => ({ s, n: apps.filter((a) => a.stage === s).length }))
  return (
    <>
      <div className="card">
        <div className="row">
          <div><label>회사</label><input value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} placeholder="카카오" /></div>
          <div><label>직무/공고</label><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="데이터 분석가" /></div>
          <div style={{ flex: '0 0 130px' }}><label>단계</label><select value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })}>{STAGES.map((s) => <option key={s}>{s}</option>)}</select></div>
        </div>
        <div style={{ marginTop: 14 }}><button className="btn" onClick={addApp}>+ 지원 추가</button></div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 14 }}>
          {counts.map(({ s, n }) => <span key={s} className="tag" style={{ background: STAGE_COLOR[s] + '22', color: STAGE_COLOR[s] }}>{s} {n}</span>)}
        </div>
      </div>
      <div className="card">
        <h2>지원 목록 ({apps.length})</h2>
        {apps.length === 0 && <Empty>아직 추가한 지원이 없어요. 위에서 추가하거나 ⭐저장 공고에서 "지원으로 추가"하세요.</Empty>}
        {apps.map((a) => (
          <div className="list-item" key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <b>{a.company}</b> {a.title && <span className="muted">· {a.title}</span>}
              {a.memo && <div className="meta">{a.memo}</div>}
            </div>
            <select value={a.stage} onChange={(e) => update('applications', a.id, { stage: e.target.value })}
              style={{ width: 120, borderColor: STAGE_COLOR[a.stage], color: STAGE_COLOR[a.stage], fontWeight: 700 }}>
              {STAGES.map((s) => <option key={s}>{s}</option>)}
            </select>
            <button className="btn ghost sm" onClick={() => remove('applications', a.id)} style={{ flex: '0 0 auto' }}>삭제</button>
          </div>
        ))}
      </div>
    </>
  )
}

// ── 저장한 공고 ──
function SavedJobs() {
  const saved = useCollection('savedJobs')
  function toApp(j) { add('applications', { company: j.company, title: j.title, stage: '관심' }) }
  return (
    <div className="card">
      <h2>저장한 공고 ({saved.length})</h2>
      {saved.length === 0 && <Empty>🔎 채용공고 탭에서 ⭐로 저장하면 여기 모여요.</Empty>}
      {saved.map((j) => (
        <div className="list-item" key={j.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            {j.url ? <a href={j.url} target="_blank" rel="noreferrer">{j.title}</a> : <b>{j.title}</b>}
            <div className="meta"><b>{j.company}</b> {j.region && `· ${j.region}`}</div>
          </div>
          <button className="btn ghost sm" onClick={() => toApp(j)} style={{ flex: '0 0 auto' }}>지원으로 추가</button>
          <button className="btn ghost sm" onClick={() => remove('savedJobs', j.id)} style={{ flex: '0 0 auto' }}>삭제</button>
        </div>
      ))}
    </div>
  )
}

// ── 일정 (캘린더 + 목록) ──
const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function Plans() {
  const plans = useCollection('plans')
  const [text, setText] = useState(''); const [due, setDue] = useState('')
  const [cur, setCur] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } })
  const [selDay, setSelDay] = useState('')

  function addPlan() { if (!text.trim()) return; add('plans', { text, due: due || selDay, done: false }); setText(''); setDue('') }

  // 달력 셀 구성
  const first = new Date(cur.y, cur.m, 1)
  const startDow = first.getDay()
  const daysInMonth = new Date(cur.y, cur.m + 1, 0).getDate()
  const todayStr = ymd(new Date())
  const byDate = {}
  for (const p of plans) if (p.due) (byDate[p.due] = byDate[p.due] || []).push(p)
  const cells = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${cur.y}-${pad(cur.m + 1)}-${pad(d)}`)

  function move(delta) {
    let m = cur.m + delta, y = cur.y
    if (m < 0) { m = 11; y-- } else if (m > 11) { m = 0; y++ }
    setCur({ y, m }); setSelDay('')
  }
  const dayPlans = selDay ? (byDate[selDay] || []) : plans.filter((p) => !p.due)

  return (
    <>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button className="btn ghost sm" onClick={() => move(-1)}>‹</button>
          <h2 style={{ margin: 0 }}>🗓 {cur.y}년 {cur.m + 1}월</h2>
          <button className="btn ghost sm" onClick={() => move(1)}>›</button>
        </div>
        <div className="cal">
          {['일', '월', '화', '수', '목', '금', '토'].map((w, i) => (
            <div key={w} className="cal-dow" style={{ color: i === 0 ? 'var(--up)' : i === 6 ? 'var(--brand)' : 'var(--muted)' }}>{w}</div>
          ))}
          {cells.map((c, i) => (
            <div key={i} className={`cal-cell ${c ? '' : 'empty'} ${c === todayStr ? 'today' : ''} ${c && c === selDay ? 'sel' : ''}`}
              onClick={() => c && setSelDay(c === selDay ? '' : c)}>
              {c && <>
                <span className="cal-num">{Number(c.slice(-2))}</span>
                {byDate[c] && <span className="cal-dot" />}
              </>}
            </div>
          ))}
        </div>
      </div>
      <div className="card">
        <div className="row">
          <div style={{ flex: 2 }}><label>할 일</label><input value={text} onChange={(e) => setText(e.target.value)} placeholder="OO 자소서 마감 / 면접 준비 등" /></div>
          <div style={{ flex: '0 0 160px' }}><label>날짜{selDay && ` (${selDay} 선택됨)`}</label><input type="date" value={due || selDay} onChange={(e) => setDue(e.target.value)} /></div>
        </div>
        <div style={{ marginTop: 8 }}>
          <div className="hint">빠른 추가(전형 단계):</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {['서류 마감', '인적성 검사', '코딩테스트', 'AI 역량검사', '1차 면접', '2차 면접', '임원 면접', '최종 발표'].map((t) => (
              <button key={t} className="tab" style={{ fontSize: 12.5 }} onClick={() => setText(text ? text : t)}>+ {t}</button>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 14 }}><button className="btn" onClick={addPlan}>+ 추가</button></div>
        <h2 style={{ fontSize: 15, marginTop: 18 }}>{selDay ? `${selDay} 일정` : '날짜 미지정 할 일'} ({dayPlans.length})</h2>
        {dayPlans.length === 0 && <Empty>{selDay ? '이 날짜엔 일정이 없어요.' : '달력에서 날짜를 누르면 그 날 일정만 볼 수 있어요.'}</Empty>}
        {dayPlans.map((p) => (
          <div className="list-item" key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="checkbox" checked={p.done} onChange={() => update('plans', p.id, { done: !p.done })} style={{ width: 18, flex: '0 0 auto' }} />
            <div style={{ flex: 1, textDecoration: p.done ? 'line-through' : 'none', color: p.done ? 'var(--muted)' : 'inherit' }}>
              {p.text} {p.due && <span className="tag gray">{p.due}</span>}
            </div>
            <button className="btn ghost sm" onClick={() => remove('plans', p.id)} style={{ flex: '0 0 auto' }}>삭제</button>
          </div>
        ))}
      </div>
    </>
  )
}

// ── 내 자료 RAG 의미검색 (경험·스펙·자소서 전체) ──
function RagSearch() {
  const [q, setQ] = useState('')
  const [res, setRes] = useState(null)
  const [loading, setLoading] = useState(false)
  async function go() {
    const docs = materialDocs()
    if (!q.trim() || docs.length === 0) { setRes([]); return }
    setLoading(true)
    try { setRes((await ragSearch({ query: q, docs, top_k: 6 })).results || []) } catch { setRes([]) }
    setLoading(false)
  }
  return (
    <div className="card">
      <h2>🔍 내 자료 검색 (RAG)</h2>
      <p className="desc">저장한 경험·스펙·자소서를 의미로 검색해요. 예: "리더십 보여줄 경험", "데이터 분석 역량"</p>
      <div className="row">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} placeholder="찾고 싶은 내용을 입력…" />
        <button className="btn" onClick={go} disabled={loading} style={{ flex: '0 0 auto' }}>{loading ? '검색 중…' : '검색'}</button>
      </div>
      {loading && <Loading text="의미 유사도로 찾는 중…" />}
      {res && res.length === 0 && !loading && <p className="hint" style={{ marginTop: 10 }}>결과가 없어요(저장한 자료가 없거나 매칭 없음).</p>}
      {res && res.map((r) => (
        <div className="list-item" key={r.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span className="tag">{r.kind}</span>
            <span className="muted" style={{ fontSize: 12 }}>유사도 {(r.score * 100).toFixed(0)}% · {r.method === 'embedding' ? '임베딩' : '키워드'}</span>
          </div>
          <div style={{ fontSize: 14, marginTop: 6 }}>{r.text}</div>
        </div>
      ))}
    </div>
  )
}

// ── 스펙·이력 (자격증·수상·경력·공모전·동아리 + 이력서/포트폴리오) ──
const SPEC_TYPES = ['자격증', '수상', '경력·인턴', '공모전·프로젝트', '동아리·대외활동', '교육·연수', '어학', '기타']

function Spec() {
  const specs = useCollection('specs')
  const links = useCollection('portfolios')
  const [s, setS] = useState({ type: '자격증', title: '', org: '', date: '', memo: '' })
  const [l, setL] = useState({ title: '', url: '', memo: '' })
  const setS_ = (k) => (e) => setS({ ...s, [k]: e.target.value })

  function addSpec() { if (!s.title.trim()) return; add('specs', s); setS({ type: s.type, title: '', org: '', date: '', memo: '' }) }
  function addLink() { if (!l.title.trim()) return; add('portfolios', l); setL({ title: '', url: '', memo: '' }) }

  const byType = {}
  for (const x of specs) (byType[x.type] = byType[x.type] || []).push(x)

  return (
    <>
      <div className="card">
        <h2>🎖 스펙·이력 추가</h2>
        <p className="desc">자격증·수상·경력·공모전·동아리 등을 모아두면 자소서·이력서 쓸 때 바로 꺼내 쓸 수 있어요.</p>
        <div className="row">
          <div style={{ flex: '0 0 150px' }}><label>종류</label><select value={s.type} onChange={setS_('type')}>{SPEC_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
          <div style={{ flex: 2 }}><label>제목 *</label><input value={s.title} onChange={setS_('title')} placeholder="예: 정보처리기사 / 교내 공모전 대상" /></div>
        </div>
        <div className="row">
          <div><label>기관/회사</label><input value={s.org} onChange={setS_('org')} placeholder="한국산업인력공단" /></div>
          <div style={{ flex: '0 0 160px' }}><label>날짜</label><input type="date" value={s.date} onChange={setS_('date')} /></div>
        </div>
        <label>메모 (선택)</label><input value={s.memo} onChange={setS_('memo')} placeholder="점수·역할·성과 등" />
        <div style={{ marginTop: 14 }}><button className="btn" onClick={addSpec}>+ 추가</button></div>
      </div>

      <div className="card">
        <h2>내 스펙 ({specs.length})</h2>
        {specs.length === 0 && <Empty>아직 등록한 스펙이 없어요.</Empty>}
        {Object.keys(byType).map((t) => (
          <div key={t} style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--brand)' }}>{t} <span className="tag gray">{byType[t].length}</span></div>
            {byType[t].map((x) => (
              <div className="list-item" key={x.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <b>{x.title}</b> {x.date && <span className="tag gray">{x.date}</span>}
                  <div className="meta">{[x.org, x.memo].filter(Boolean).join(' · ')}</div>
                </div>
                <button className="btn ghost sm" onClick={() => remove('specs', x.id)} style={{ flex: '0 0 auto' }}>삭제</button>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="card">
        <h2>📎 이력서·포트폴리오</h2>
        <p className="desc">이력서/포트폴리오 링크(구글드라이브·노션·깃허브 등)나 메모를 정리해두세요.</p>
        <div className="row">
          <div><label>제목 *</label><input value={l.title} onChange={(e) => setL({ ...l, title: e.target.value })} placeholder="이력서 v2 / 포트폴리오(Notion)" /></div>
          <div style={{ flex: 2 }}><label>링크 URL</label><input value={l.url} onChange={(e) => setL({ ...l, url: e.target.value })} placeholder="https://..." /></div>
        </div>
        <label>메모</label><input value={l.memo} onChange={(e) => setL({ ...l, memo: e.target.value })} />
        <div style={{ marginTop: 14 }}><button className="btn" onClick={addLink}>+ 추가</button></div>
        <div style={{ marginTop: 8 }}>
          {links.length === 0 && <Empty>이력서/포트폴리오 링크를 추가하세요.</Empty>}
          {links.map((x) => (
            <div className="list-item" key={x.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                {x.url ? <a href={x.url} target="_blank" rel="noreferrer">{x.title}</a> : <b>{x.title}</b>}
                {x.memo && <div className="meta">{x.memo}</div>}
              </div>
              <button className="btn ghost sm" onClick={() => remove('portfolios', x.id)} style={{ flex: '0 0 auto' }}>삭제</button>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

// ── 경험 라이브러리 (STAR) ──
function Experiences() {
  const exps = useCollection('experiences')
  const [f, setF] = useState({ title: '', situation: '', task: '', action: '', result: '' })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  function save() { if (!f.title.trim()) return; add('experiences', f); setF({ title: '', situation: '', task: '', action: '', result: '' }) }
  return (
    <>
      <div className="card">
        <h2>💼 경험 정리 (STAR)</h2>
        <p className="desc">경험을 상황-과제-행동-결과로 정리해두면 자소서·면접에서 바로 꺼내 쓸 수 있어요.</p>
        <label>제목 *</label><input value={f.title} onChange={set('title')} placeholder="예: 웨이퍼 결함검사 프로젝트" />
        <div className="row">
          <div><label>상황(S)</label><textarea value={f.situation} onChange={set('situation')} /></div>
          <div><label>과제(T)</label><textarea value={f.task} onChange={set('task')} /></div>
        </div>
        <div className="row">
          <div><label>행동(A)</label><textarea value={f.action} onChange={set('action')} /></div>
          <div><label>결과(R)</label><textarea value={f.result} onChange={set('result')} /></div>
        </div>
        <div style={{ marginTop: 14 }}><button className="btn" onClick={save}>+ 경험 저장</button></div>
      </div>
      <div className="card">
        <h2>저장된 경험 ({exps.length})</h2>
        {exps.length === 0 && <Empty>경험을 추가하거나, 🎤모의면접에서 "경험으로 저장"하면 모여요.</Empty>}
        {exps.map((x) => (
          <div className="list-item" key={x.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <b>{x.title}</b>
              <button className="btn ghost sm" onClick={() => remove('experiences', x.id)}>삭제</button>
            </div>
            {[['S', x.situation], ['T', x.task], ['A', x.action], ['R', x.result]].filter(([, v]) => v).map(([k, v]) => (
              <div className="meta" key={k} style={{ marginTop: 3 }}><b>{k}</b> {v}</div>
            ))}
          </div>
        ))}
      </div>
    </>
  )
}

// ── 자료실 (저장한 자소서·메모 + RAG 검색) ──
function Docs() {
  const docs = useCollection('resumes')
  useCollection('experiences'); useCollection('specs') // 검색 대상 변화 구독
  const [f, setF] = useState({ title: '', content: '' })
  const [uploading, setUploading] = useState(false)
  function save() { if (!f.content.trim()) return; add('resumes', { title: f.title || '제목없음', content: f.content }); setF({ title: '', content: '' }) }
  async function onFile(e) {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true)
    try { const r = await extractText(file); add('resumes', { title: file.name.replace(/\.[^.]+$/, ''), content: r.text }) }
    catch (err) { alert('업로드 실패: ' + err.message) }
    setUploading(false); e.target.value = ''
  }
  return (
    <>
      <RagSearch />
      <div className="card">
        <h2>📄 자료실</h2>
        <p className="desc">자소서 초안·메모를 저장해두세요. (자소서 탭에서 "자료실에 저장"으로도 추가됩니다)</p>
        <label>제목</label><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="카카오 자소서 - 지원동기" />
        <label>내용</label><textarea value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} style={{ minHeight: 120 }} />
        <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn" onClick={save}>+ 저장</button>
          <span className="upload-btn">📎 파일 업로드(PDF·TXT)
            <input type="file" accept=".pdf,.txt,.md" onChange={onFile} style={{ display: 'none' }} />
          </span>
          {uploading && <span className="hint">추출·저장 중…</span>}
        </div>
      </div>
      <div className="card">
        <h2>저장된 자료 ({docs.length})</h2>
        {docs.length === 0 && <Empty>저장된 자료가 없어요.</Empty>}
        {docs.map((x) => (
          <details className="list-item" key={x.id}>
            <summary style={{ cursor: 'pointer', fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
              <span>{x.title} {x.company && <span className="muted">· {x.company}</span>}</span>
            </summary>
            <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.7, marginTop: 8 }}>{x.content}</div>
            <button className="btn ghost sm" onClick={() => remove('resumes', x.id)} style={{ marginTop: 8 }}>삭제</button>
          </details>
        ))}
      </div>
    </>
  )
}
