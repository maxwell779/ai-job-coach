import { useState, useRef, useEffect } from 'react'
import { genQuestions, evalAnswer, followup, questionsFromMaterials, sessionReport } from './api.js'
import { MD, Loading, ErrorBox } from './ui.jsx'
import { startRecorder, analyzeDelivery } from './voice.js'
import { QUESTION_BANK, ROLE_QUESTIONS } from './questionBank.js'
import { add, materialDocs } from './store.js'

const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
const PERSONAS = ['일반', '압박', '인성', '직무', '임원']
const PERSONA_DESC = {
  '일반': '인성·직무 균형', '압박': '허점을 파고드는 압박', '인성': '가치관·태도 중심',
  '직무': '직무 전문성 검증', '임원': '비전·인재상 적합성',
}

export default function Interview() {
  const [src, setSrc] = useState('ai')
  const [persona, setPersona] = useState('일반')
  return (
    <>
      <div className="card">
        <h2>🎤 음성 모의 면접</h2>
        <p className="desc">
          말로 답하면 AI가 내용을 평가하고 <b>떨림·자신감·속도</b>까지 분석해요. <b>꼬리질문</b>·<b>세션 종합 리포트</b>도 제공.
          {!SR && ' (음성 인식은 Chrome 권장)'}
        </p>
        <label>면접관 페르소나</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {PERSONAS.map((p) => (
            <button key={p} className={`tab ${persona === p ? 'active' : ''}`} style={{ fontSize: 13 }} onClick={() => setPersona(p)}
              title={PERSONA_DESC[p]}>{p}</button>
          ))}
        </div>
        <div className="hint" style={{ marginTop: 6 }}>👤 {persona} 면접관 — {PERSONA_DESC[persona]}</div>
        <div className="tabs" style={{ marginTop: 14 }}>
          <button className={`tab ${src === 'ai' ? 'active' : ''}`} onClick={() => setSrc('ai')}>🤖 AI 맞춤</button>
          <button className={`tab ${src === 'bank' ? 'active' : ''}`} onClick={() => setSrc('bank')}>📚 빈출 은행</button>
          <button className={`tab ${src === 'mine' ? 'active' : ''}`} onClick={() => setSrc('mine')}>📄 내 자소서·스펙 기반</button>
        </div>
      </div>
      {src === 'ai' && <AiQuestions persona={persona} />}
      {src === 'bank' && <BankQuestions persona={persona} />}
      {src === 'mine' && <MineQuestions persona={persona} />}
    </>
  )
}

function AiQuestions({ persona }) {
  const [job, setJob] = useState('')
  const [company, setCompany] = useState('')
  const [count, setCount] = useState(5)
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  async function start() {
    if (!job.trim()) { setErr('지원 직무를 입력하세요.'); return }
    setLoading(true); setErr(''); setQuestions([])
    try { setQuestions((await genQuestions({ job_title: job, company, count: Number(count), persona })).questions || []) }
    catch (e) { setErr(e.message) }
    setLoading(false)
  }
  return (
    <>
      <div className="card">
        <div className="row">
          <div><label>지원 직무 *</label><input value={job} onChange={(e) => setJob(e.target.value)} placeholder="데이터 분석가" /></div>
          <div><label>지원 회사 (선택)</label><input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="카카오" /></div>
          <div style={{ flex: '0 0 110px' }}><label>질문 수</label>
            <select value={count} onChange={(e) => setCount(e.target.value)}>{[3, 5, 7].map((n) => <option key={n} value={n}>{n}개</option>)}</select></div>
        </div>
        <div style={{ marginTop: 16 }}><button className="btn" onClick={start} disabled={loading}>{loading ? '질문 생성 중…' : '모의 면접 시작'}</button></div>
        {err && <div style={{ marginTop: 12 }}><ErrorBox>{err}</ErrorBox></div>}
        {loading && <Loading text="맞춤 면접 질문을 만드는 중…" />}
      </div>
      {questions.length > 0 && <QuizRunner questions={questions} job={job} persona={persona} />}
    </>
  )
}

const ALL_BANK = { ...QUESTION_BANK, ...ROLE_QUESTIONS }
function BankQuestions({ persona }) {
  const commonCats = Object.keys(QUESTION_BANK)
  const roleCats = Object.keys(ROLE_QUESTIONS)
  const [cat, setCat] = useState(commonCats[0])
  return (
    <>
      <div className="card">
        <label>질문 카테고리</label>
        <select value={cat} onChange={(e) => setCat(e.target.value)}>
          <optgroup label="공통·인성">{commonCats.map((c) => <option key={c} value={c}>{c} ({QUESTION_BANK[c].length})</option>)}</optgroup>
          <optgroup label="직무별">{roleCats.map((c) => <option key={c} value={c}>{c} ({ROLE_QUESTIONS[c].length})</option>)}</optgroup>
        </select>
        <div className="hint" style={{ marginTop: 10 }}>실제 면접에서 자주 나오는 질문이에요.</div>
      </div>
      <QuizRunner key={cat} questions={ALL_BANK[cat]} job={cat} persona={persona} />
    </>
  )
}

function MineQuestions({ persona }) {
  const [job, setJob] = useState('')
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  async function start() {
    const docs = materialDocs()
    if (docs.length === 0) { setErr('먼저 자소서·경험·스펙을 저장하세요(자소서 탭 / 내 보드).'); return }
    setLoading(true); setErr(''); setNote(''); setQuestions([])
    try {
      const r = await questionsFromMaterials({ materials: docs.map((d) => d.text), job_title: job, count: 5 })
      setQuestions(r.questions || []); if (r.note) setNote(r.note)
    } catch (e) { setErr(e.message) }
    setLoading(false)
  }
  const docCount = materialDocs().length
  return (
    <>
      <div className="card">
        <p className="desc">저장한 <b>자소서·경험·스펙</b>({docCount}개)을 읽고, 면접관이 <b>나에게</b> 물어볼 법한 질문을 만들어요. (자소서/이력 기반 면접 대비)</p>
        <div className="row">
          <div><label>지원 직무 (선택)</label><input value={job} onChange={(e) => setJob(e.target.value)} placeholder="데이터 분석가" /></div>
          <button className="btn" onClick={start} disabled={loading} style={{ flex: '0 0 auto', alignSelf: 'flex-end' }}>{loading ? '생성 중…' : '내 자료 기반 질문 생성'}</button>
        </div>
        {err && <div style={{ marginTop: 12 }}><ErrorBox>{err}</ErrorBox></div>}
        {note && <p className="hint" style={{ marginTop: 10 }}>{note}</p>}
        {loading && <Loading text="내 자료를 분석해 예상 질문을 만드는 중…" />}
      </div>
      {questions.length > 0 && <QuizRunner questions={questions} job={job} persona={persona} />}
    </>
  )
}

// 질문 세트를 진행하며 세션 기록 + 종합 리포트
function QuizRunner({ questions, job, persona }) {
  const [idx, setIdx] = useState(0)
  const [log, setLog] = useState([]) // {question, answer, delivery}
  const [report, setReport] = useState('')
  const [reporting, setReporting] = useState(false)

  function record(entry) {
    setLog((prev) => {
      const others = prev.filter((x) => x.question !== entry.question)
      return [...others, entry]
    })
  }
  async function makeReport() {
    setReporting(true); setReport('')
    try { setReport((await sessionReport({ qa_list: log, job_title: job })).report) } catch (e) { setReport('리포트 생성 실패: ' + e.message) }
    setReporting(false)
  }

  return (
    <>
      <QuestionCard key={idx} n={idx + 1} total={questions.length} question={questions[idx]} job={job} persona={persona}
        onRecord={record}
        onPrev={idx > 0 ? () => setIdx(idx - 1) : null}
        onNext={idx < questions.length - 1 ? () => setIdx(idx + 1) : null} />
      {log.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ margin: 0 }}>📊 세션 종합 리포트 <span className="tag gray">{log.length}문항 답변</span></h2>
            <button className="btn dark" onClick={makeReport} disabled={reporting}>{reporting ? '분석 중…' : '종합 리포트 받기'}</button>
          </div>
          {reporting && <Loading text="전체 답변을 종합 평가하는 중…" />}
          {report && <div style={{ marginTop: 14 }}><MD>{report}</MD></div>}
        </div>
      )}
    </>
  )
}

function QuestionCard({ n, total, question, job, persona, onRecord, onPrev, onNext }) {
  const [q, setQ] = useState(question)
  const [answer, setAnswer] = useState('')
  const [rec, setRec] = useState(false)
  const [level, setLevel] = useState(0)
  const [feedback, setFeedback] = useState('')
  const [delivery, setDelivery] = useState(null)
  const [fup, setFup] = useState('')
  const [loading, setLoading] = useState(false)
  const [fuping, setFuping] = useState(false)
  const [err, setErr] = useState('')
  const [saved, setSaved] = useState(false)
  const recogRef = useRef(null)
  const recorderRef = useRef(null)
  const baseRef = useRef('')
  const answerRef = useRef('')

  useEffect(() => { answerRef.current = answer }, [answer])
  useEffect(() => () => {
    try { recogRef.current?.stop() } catch {}
    try { recorderRef.current?.stop() } catch {}
    try { window.speechSynthesis?.cancel() } catch {}
  }, [])

  function speakQuestion() {
    try {
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(q); u.lang = 'ko-KR'; u.rate = 0.98
      window.speechSynthesis.speak(u)
    } catch { setErr('이 브라우저는 음성 읽기를 지원하지 않아요.') }
  }

  async function toggleRec() {
    if (rec) {
      try { recogRef.current?.stop() } catch {}
      const m = recorderRef.current ? recorderRef.current.stop() : null
      recorderRef.current = null; setLevel(0)
      if (m) setDelivery(analyzeDelivery(m, answerRef.current))
      setRec(false); return
    }
    setErr(''); setDelivery(null)
    try { window.speechSynthesis?.cancel() } catch {}
    try { recorderRef.current = await startRecorder((lv) => setLevel(lv)) }
    catch { setErr('마이크 권한이 필요해요.'); return }
    if (SR) {
      const r = new SR(); r.lang = 'ko-KR'; r.continuous = true; r.interimResults = true
      baseRef.current = answer ? answer + ' ' : ''
      r.onresult = (e) => { let s = ''; for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript; setAnswer(baseRef.current + s) }
      r.onerror = (e) => { if (e.error !== 'no-speech') setErr('음성 인식: ' + e.error) }
      recogRef.current = r; try { r.start() } catch {}
    }
    setRec(true)
  }

  async function submit() {
    if (!answer.trim()) { setErr('답변을 말하거나 입력하세요.'); return }
    if (rec) await toggleRec()
    setLoading(true); setErr(''); setFeedback('')
    try {
      const fb = (await evalAnswer({ question: q, answer, job_title: job, persona })).feedback
      setFeedback(fb)
      onRecord?.({ question: q, answer, delivery })
    } catch (e) { setErr(e.message) }
    setLoading(false)
  }

  async function getFollowup() {
    setFuping(true); setFup('')
    try { setFup((await followup({ question: q, answer, job_title: job })).followup) } catch (e) { setErr(e.message) }
    setFuping(false)
  }
  function practiceFollowup() {
    setQ(fup); setFup(''); setAnswer(''); setFeedback(''); setDelivery(null)
  }
  function saveExperience() {
    add('experiences', { title: q.slice(0, 40), result: answer, fromInterview: true, tags: [job] })
    setSaved(true)
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="muted" style={{ fontSize: 13, fontWeight: 600 }}>질문 {n} / {total} · 👤 {persona}</div>
        <button className="btn ghost sm" onClick={speakQuestion}>🔊 질문 듣기</button>
      </div>
      <div className="qcard" style={{ marginTop: 8 }}>Q. {q}</div>

      <div className="recbox" style={{ marginTop: 16 }}>
        <div className={`mic ${rec ? 'pulse' : ''}`}>{rec ? '🔴' : '🎙️'}</div>
        {rec && <div className="meter"><div className="meter-fill" style={{ width: `${Math.round(level * 100)}%` }} /></div>}
        <div style={{ margin: '10px 0' }}>
          <button className={`btn ${rec ? 'rec' : 'dark'}`} onClick={toggleRec}>{rec ? '⏹ 녹음 종료' : '🎤 음성으로 답변'}</button>
        </div>
        <div className="hint">{rec ? '말씀하세요… 종료하면 떨림·자신감까지 분석해요.' : '버튼을 누르고 말하면 음성→텍스트 + 목소리 분석을 합니다.'}</div>
      </div>

      {delivery && <DeliveryCard d={delivery} />}

      <label>답변 (음성 인식 결과 · 직접 수정 가능)</label>
      <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} style={{ minHeight: 110 }} placeholder="음성으로 답하거나 직접 입력하세요." />

      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn" onClick={submit} disabled={loading} style={{ flex: '0 0 auto' }}>{loading ? '평가 중…' : '✅ 답변 평가'}</button>
        {feedback && <button className="btn ghost sm" onClick={getFollowup} disabled={fuping} style={{ flex: '0 0 auto' }}>{fuping ? '…' : '🔎 꼬리질문'}</button>}
        {answer.trim() && <button className="btn ghost sm" onClick={saveExperience} disabled={saved} style={{ flex: '0 0 auto' }}>{saved ? '저장됨' : '💼 경험 저장'}</button>}
        <div style={{ flex: 1 }} />
        {onPrev && <button className="btn ghost sm" onClick={onPrev} disabled={rec} style={{ flex: '0 0 auto' }}>← 이전</button>}
        {onNext && <button className="btn ghost sm" onClick={onNext} disabled={rec} style={{ flex: '0 0 auto' }}>다음 →</button>}
      </div>

      {err && <div style={{ marginTop: 12 }}><ErrorBox>{err}</ErrorBox></div>}
      {loading && <Loading text="면접관이 답변을 평가하는 중…" />}
      {feedback && <div style={{ marginTop: 16 }}><MD>{feedback}</MD></div>}

      {fup && (
        <div className="qcard" style={{ marginTop: 14, background: '#fff7ed' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>🔎 꼬리질문</div>
          {fup}
          <div style={{ marginTop: 10 }}><button className="btn ghost sm" onClick={practiceFollowup}>이 질문으로 이어서 답하기 →</button></div>
        </div>
      )}
    </div>
  )
}

const STATUS = { good: { c: 'var(--ok)', e: '✅' }, warn: { c: 'var(--warn)', e: '⚠️' }, bad: { c: 'var(--up)', e: '❗' } }
function DeliveryCard({ d }) {
  const color = d.tensionScore >= 60 ? 'var(--up)' : d.tensionScore >= 35 ? 'var(--warn)' : 'var(--ok)'
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>🎧 목소리 분석</h2>
        <span style={{ color, fontWeight: 800, fontSize: 15 }}>{d.level}</span>
        <div style={{ flex: 1 }} />
        <div style={{ textAlign: 'right' }}>
          <div className="muted" style={{ fontSize: 12 }}>긴장도</div>
          <div style={{ fontWeight: 800, fontSize: 22, color }}>{d.tensionScore}<span style={{ fontSize: 13, color: 'var(--muted)' }}> /100</span></div>
        </div>
      </div>
      <div style={{ height: 10, background: '#eef0f3', borderRadius: 99, margin: '10px 0 16px', overflow: 'hidden' }}>
        <div style={{ width: `${d.tensionScore}%`, height: '100%', background: color, borderRadius: 99, transition: 'width .5s' }} />
      </div>
      <div className="verdicts">
        {d.dims.map((v) => (
          <div className="verdict" key={v.key} style={{ borderLeft: `4px solid ${STATUS[v.status].c}` }}>
            <div className="vhead"><span className="vkey">{v.key}</span><span className="vval" style={{ color: STATUS[v.status].c }}>{STATUS[v.status].e} {v.value}</span></div>
            <div className="vmsg">{v.msg}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
