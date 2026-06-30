import { useState, useRef, useEffect } from 'react'
import { genQuestions, evalAnswer, followup, questionsFromMaterials, sessionReport, modelAnswer } from './api.js'
import { MD, Loading, ErrorBox } from './ui.jsx'
import { startRecorder, analyzeDelivery } from './voice.js'
import { startCamera, runFaceAnalysis, analyzeFace } from './face.js'
import { QUESTION_BANK, ROLE_QUESTIONS } from './questionBank.js'
import { add, materialDocs } from './store.js'

const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
const PERSONAS = ['일반', '압박', '인성', '직무', '임원']
const PERSONA_DESC = { '일반': '인성·직무 균형', '압박': '허점을 파고드는 압박', '인성': '가치관·태도', '직무': '직무 전문성', '임원': '비전·인재상' }
const TIMES = [{ v: 0, t: '제한 없음' }, { v: 60, t: '60초' }, { v: 90, t: '90초' }, { v: 120, t: '120초' }]

export default function Interview({ initialCompany = '', initialJob = '' }) {
  const [src, setSrc] = useState('ai')
  const [persona, setPersona] = useState('일반')
  const [cam, setCam] = useState(false)
  const [timeLimit, setTimeLimit] = useState(0)
  const cfg = { persona, cam, timeLimit }
  return (
    <>
      <div className="card">
        <p className="desc" style={{ marginBottom: 12 }}>
          말로 답하면 AI가 내용·<b>목소리(떨림·자신감)</b>를 평가하고, 웹캠을 켜면 <b>표정·시선</b>까지 분석해요(영상은 기기 안에서만 처리).
          {!SR && ' (음성 인식은 Chrome 권장)'}
        </p>
        <label>면접관 페르소나</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {PERSONAS.map((p) => (
            <button key={p} className={`tab ${persona === p ? 'active' : ''}`} style={{ fontSize: 13 }} onClick={() => setPersona(p)} title={PERSONA_DESC[p]}>{p}</button>
          ))}
        </div>
        <div className="hint" style={{ marginTop: 6 }}>👤 {persona} — {PERSONA_DESC[persona]}</div>
        <div className="row" style={{ marginTop: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', margin: 0 }}>
            <input type="checkbox" checked={cam} onChange={(e) => setCam(e.target.checked)} style={{ width: 18 }} />
            📹 화상(표정·시선) 분석
          </label>
          <div style={{ flex: '0 0 160px' }}>
            <select value={timeLimit} onChange={(e) => setTimeLimit(Number(e.target.value))}>
              {TIMES.map((t) => <option key={t.v} value={t.v}>⏱ {t.t}</option>)}
            </select>
          </div>
        </div>
        <div className="tabs" style={{ marginTop: 14 }}>
          <button className={`tab ${src === 'ai' ? 'active' : ''}`} onClick={() => setSrc('ai')}>🤖 AI 맞춤</button>
          <button className={`tab ${src === 'bank' ? 'active' : ''}`} onClick={() => setSrc('bank')}>📚 빈출 은행</button>
          <button className={`tab ${src === 'mine' ? 'active' : ''}`} onClick={() => setSrc('mine')}>📄 내 자소서·스펙 기반</button>
        </div>
      </div>
      {src === 'ai' && <AiQuestions cfg={cfg} initialCompany={initialCompany} initialJob={initialJob} />}
      {src === 'bank' && <BankQuestions cfg={cfg} />}
      {src === 'mine' && <MineQuestions cfg={cfg} />}
    </>
  )
}

function AiQuestions({ cfg, initialCompany = '', initialJob = '' }) {
  const [job, setJob] = useState(initialJob); const [company, setCompany] = useState(initialCompany); const [count, setCount] = useState(5)
  const [questions, setQuestions] = useState([]); const [loading, setLoading] = useState(false); const [err, setErr] = useState('')
  async function start() {
    if (!job.trim()) { setErr('지원 직무를 입력하세요.'); return }
    setLoading(true); setErr(''); setQuestions([])
    try { setQuestions((await genQuestions({ job_title: job, company, count: Number(count), persona: cfg.persona })).questions || []) }
    catch (e) { setErr(e.message) }
    setLoading(false)
  }
  return (
    <>
      <div className="card">
        <div className="row">
          <div><label>지원 직무 *</label><input value={job} onChange={(e) => setJob(e.target.value)} placeholder="데이터 분석가" /></div>
          <div><label>지원 회사 (선택)</label><input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="카카오" /></div>
          <div style={{ flex: '0 0 110px' }}><label>질문 수</label><select value={count} onChange={(e) => setCount(e.target.value)}>{[3, 5, 7].map((n) => <option key={n} value={n}>{n}개</option>)}</select></div>
        </div>
        <div style={{ marginTop: 16 }}><button className="btn" onClick={start} disabled={loading}>{loading ? '질문 생성 중…' : '모의 면접 시작'}</button></div>
        {err && <div style={{ marginTop: 12 }}><ErrorBox>{err}</ErrorBox></div>}
        {loading && <Loading text="맞춤 면접 질문을 만드는 중…" />}
      </div>
      {questions.length > 0 && <QuizRunner questions={questions} job={job} cfg={cfg} />}
    </>
  )
}

const ALL_BANK = { ...QUESTION_BANK, ...ROLE_QUESTIONS }
function BankQuestions({ cfg }) {
  const commonCats = Object.keys(QUESTION_BANK), roleCats = Object.keys(ROLE_QUESTIONS)
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
      <QuizRunner key={cat} questions={ALL_BANK[cat]} job={cat} cfg={cfg} />
    </>
  )
}

function MineQuestions({ cfg }) {
  const [job, setJob] = useState(''); const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(false); const [err, setErr] = useState(''); const [note, setNote] = useState('')
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
        <p className="desc">저장한 <b>자소서·경험·스펙</b>({docCount}개)을 읽고, 면접관이 <b>나에게</b> 물어볼 질문을 만들어요.</p>
        <div className="row">
          <div><label>지원 직무 (선택)</label><input value={job} onChange={(e) => setJob(e.target.value)} placeholder="데이터 분석가" /></div>
          <button className="btn" onClick={start} disabled={loading} style={{ flex: '0 0 auto', alignSelf: 'flex-end' }}>{loading ? '생성 중…' : '내 자료 기반 질문 생성'}</button>
        </div>
        {err && <div style={{ marginTop: 12 }}><ErrorBox>{err}</ErrorBox></div>}
        {note && <p className="hint" style={{ marginTop: 10 }}>{note}</p>}
        {loading && <Loading text="내 자료를 분석해 예상 질문을 만드는 중…" />}
      </div>
      {questions.length > 0 && <QuizRunner questions={questions} job={job} cfg={cfg} />}
    </>
  )
}

function parseScore(report) {
  const m = report && report.match(/종합\s*점수[^0-9]*(\d{1,3})/)
  return m ? Math.min(100, Number(m[1])) : null
}

function QuizRunner({ questions, job, cfg }) {
  const [idx, setIdx] = useState(0)
  const [log, setLog] = useState([])
  const [report, setReport] = useState(''); const [reporting, setReporting] = useState(false); const [savedScore, setSavedScore] = useState(false)
  function record(entry) { setLog((prev) => [...prev.filter((x) => x.question !== entry.question), entry]) }
  async function makeReport() {
    setReporting(true); setReport(''); setSavedScore(false)
    try {
      const r = (await sessionReport({ qa_list: log, job_title: job })).report
      setReport(r)
      const sc = parseScore(r)
      if (sc != null) { add('sessions', { score: sc, job, count: log.length, date: new Date().toISOString().slice(0, 10) }); setSavedScore(true) }
    } catch (e) { setReport('리포트 생성 실패: ' + e.message) }
    setReporting(false)
  }
  return (
    <>
      <QuestionCard key={idx} n={idx + 1} total={questions.length} question={questions[idx]} job={job} cfg={cfg} onRecord={record}
        onPrev={idx > 0 ? () => setIdx(idx - 1) : null} onNext={idx < questions.length - 1 ? () => setIdx(idx + 1) : null} />
      {log.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ margin: 0 }}>📊 세션 종합 리포트 <span className="tag gray">{log.length}문항</span></h2>
            <button className="btn dark" onClick={makeReport} disabled={reporting}>{reporting ? '분석 중…' : '종합 리포트 받기'}</button>
          </div>
          {reporting && <Loading text="전체 답변을 종합 평가하는 중…" />}
          {report && <div style={{ marginTop: 14 }}><MD>{report}</MD></div>}
          {savedScore && <div className="hint" style={{ marginTop: 8 }}>✓ 점수가 홈 대시보드 '점수 추이'에 저장됐어요.</div>}
        </div>
      )}
    </>
  )
}

function QuestionCard({ n, total, question, job, cfg, onRecord, onPrev, onNext }) {
  const { persona, cam, timeLimit } = cfg
  const [q, setQ] = useState(question)
  const [answer, setAnswer] = useState('')
  const [rec, setRec] = useState(false)
  const [level, setLevel] = useState(0)
  const [remaining, setRemaining] = useState(timeLimit)
  const [feedback, setFeedback] = useState('')
  const [delivery, setDelivery] = useState(null)
  const [faceRes, setFaceRes] = useState(null)
  const [camLoading, setCamLoading] = useState(false)
  const [fup, setFup] = useState(''); const [model, setModel] = useState('')
  const [loading, setLoading] = useState(false); const [fuping, setFuping] = useState(false); const [modeling, setModeling] = useState(false)
  const [err, setErr] = useState(''); const [saved, setSaved] = useState(false)
  const recogRef = useRef(null), recorderRef = useRef(null), faceRef = useRef(null), videoRef = useRef(null), camRef = useRef(null)
  const baseRef = useRef(''), answerRef = useRef(''), timerRef = useRef(null)

  useEffect(() => { answerRef.current = answer }, [answer])
  useEffect(() => () => { stopAll(true); try { camRef.current?.stop() } catch {} }, [])

  // 화상 모드: 켜면 즉시 카메라 미리보기 시작(녹음과 무관하게 내 얼굴이 보이도록)
  const [camReady, setCamReady] = useState(false)
  useEffect(() => {
    let alive = true
    if (cam && videoRef.current) {
      setCamReady(false)
      startCamera(videoRef.current)
        .then((c) => { if (alive) { camRef.current = c; setCamReady(true) } else c.stop() })
        .catch(() => alive && setErr('카메라를 켤 수 없어요(권한/지원 확인).'))
    }
    return () => { alive = false; try { camRef.current?.stop() } catch {}; camRef.current = null; setCamReady(false) }
  }, [cam])

  function stopAll(silent) {
    try { recogRef.current?.stop() } catch {}
    const m = recorderRef.current ? recorderRef.current.stop() : null
    recorderRef.current = null
    const fm = faceRef.current ? faceRef.current.stop() : null
    faceRef.current = null
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    setLevel(0)
    if (!silent) {
      if (m) setDelivery(analyzeDelivery(m, answerRef.current))
      if (fm) setFaceRes(analyzeFace(fm))
    }
    setRec(false)
    try { window.speechSynthesis?.cancel() } catch {}
  }

  function speakQuestion() {
    try { window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(q); u.lang = 'ko-KR'; u.rate = 0.98; window.speechSynthesis.speak(u) }
    catch { setErr('이 브라우저는 음성 읽기를 지원하지 않아요.') }
  }

  async function startRec() {
    setErr(''); setDelivery(null); setFaceRes(null)
    try { window.speechSynthesis?.cancel() } catch {}
    try { recorderRef.current = await startRecorder((lv) => setLevel(lv)) }
    catch { setErr('마이크 권한이 필요해요.'); return }
    if (cam && videoRef.current && camReady) {
      setCamLoading(true)
      try { faceRef.current = await runFaceAnalysis(videoRef.current) }
      catch { setErr('표정 분석을 시작하지 못했어요.') }
      setCamLoading(false)
    }
    if (SR) {
      const r = new SR(); r.lang = 'ko-KR'; r.continuous = true; r.interimResults = true
      baseRef.current = answer ? answer + ' ' : ''
      r.onresult = (e) => { let s = ''; for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript; setAnswer(baseRef.current + s) }
      r.onerror = (e) => { if (e.error !== 'no-speech') setErr('음성 인식: ' + e.error) }
      recogRef.current = r; try { r.start() } catch {}
    }
    if (timeLimit > 0) {
      setRemaining(timeLimit)
      timerRef.current = setInterval(() => setRemaining((s) => { if (s <= 1) { stopAll(false); return 0 } return s - 1 }), 1000)
    }
    setRec(true)
  }
  function toggleRec() { if (rec) stopAll(false); else startRec() }

  async function submit() {
    if (!answer.trim()) { setErr('답변을 말하거나 입력하세요.'); return }
    if (rec) stopAll(false)
    setLoading(true); setErr(''); setFeedback('')
    try { const fb = (await evalAnswer({ question: q, answer, job_title: job, persona })).feedback; setFeedback(fb); onRecord?.({ question: q, answer, delivery }) }
    catch (e) { setErr(e.message) }
    setLoading(false)
  }
  async function getFollowup() { setFuping(true); setFup(''); try { setFup((await followup({ question: q, answer, job_title: job, persona })).followup) } catch (e) { setErr(e.message) } setFuping(false) }
  async function getModel() { setModeling(true); setModel(''); try { setModel((await modelAnswer({ question: q, answer, job_title: job })).model_answer) } catch (e) { setErr(e.message) } setModeling(false) }
  function practiceFollowup() { setQ(fup); setFup(''); setAnswer(''); setFeedback(''); setDelivery(null); setFaceRes(null); setModel('') }
  function saveExperience() { add('experiences', { title: q.slice(0, 40), result: answer, fromInterview: true, tags: [job] }); setSaved(true) }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="muted" style={{ fontSize: 13, fontWeight: 600 }}>질문 {n} / {total} · 👤 {persona}{cam && ' · 📹'}</div>
        <button className="btn ghost sm" onClick={speakQuestion}>🔊 질문 듣기</button>
      </div>
      <div className="qcard" style={{ marginTop: 8 }}>Q. {q}</div>

      {cam && (
        <div style={{ marginTop: 14, textAlign: 'center' }}>
          <video ref={videoRef} muted playsInline autoPlay className="cam-view" />
          <div className="hint">{camLoading ? '얼굴 분석 모델 준비 중…' : camReady ? (rec ? '🔴 표정·시선 분석 중' : '📹 카메라 켜짐 — 답변을 시작하면 분석해요') : '카메라 준비 중…'}</div>
        </div>
      )}

      <div className="recbox" style={{ marginTop: 14 }}>
        <div className={`mic ${rec ? 'pulse' : ''}`}>{rec ? '🔴' : '🎙️'}</div>
        {rec && <div className="meter"><div className="meter-fill" style={{ width: `${Math.round(level * 100)}%` }} /></div>}
        {rec && timeLimit > 0 && <div className={`timer ${remaining <= 10 ? 'warn' : ''}`}>⏱ {remaining}s</div>}
        <div style={{ margin: '10px 0' }}>
          <button className={`btn ${rec ? 'rec' : 'dark'}`} onClick={toggleRec}>{rec ? '⏹ 종료' : '🎤 음성으로 답변'}</button>
        </div>
        <div className="hint">{rec ? '말씀하세요… 종료하면 분석해요.' : (cam ? '버튼을 누르면 음성+표정·시선을 함께 분석해요.' : '버튼을 누르고 말하면 음성→텍스트 + 목소리 분석.')}</div>
      </div>

      {delivery && <DeliveryCard d={delivery} />}
      {faceRes && <FaceCard f={faceRes} />}

      <label>답변 (음성 인식 결과 · 수정 가능)</label>
      <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} style={{ minHeight: 110 }} placeholder="음성으로 답하거나 직접 입력하세요." />

      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn" onClick={submit} disabled={loading} style={{ flex: '0 0 auto' }}>{loading ? '평가 중…' : '✅ 답변 평가'}</button>
        {feedback && <button className="btn ghost sm" onClick={getFollowup} disabled={fuping} style={{ flex: '0 0 auto' }}>{fuping ? '…' : '🔎 꼬리질문'}</button>}
        <button className="btn ghost sm" onClick={getModel} disabled={modeling} style={{ flex: '0 0 auto' }}>{modeling ? '…' : '🌟 모범답안'}</button>
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
          <div style={{ fontWeight: 700, marginBottom: 6 }}>🔎 꼬리질문</div>{fup}
          <div style={{ marginTop: 10 }}><button className="btn ghost sm" onClick={practiceFollowup}>이 질문으로 이어서 답하기 →</button></div>
        </div>
      )}
      {model && (
        <div className="card" style={{ marginTop: 14, background: '#f5f7ff' }}>
          <h2 style={{ fontSize: 15 }}>🌟 모범답안</h2><MD>{model}</MD>
        </div>
      )}
    </div>
  )
}

const STATUS = { good: { c: 'var(--ok)', e: '✅' }, warn: { c: 'var(--warn)', e: '⚠️' }, bad: { c: 'var(--up)', e: '❗' } }
function Verdicts({ dims }) {
  return (
    <div className="verdicts">
      {dims.map((v) => (
        <div className="verdict" key={v.key} style={{ borderLeft: `4px solid ${STATUS[v.status].c}` }}>
          <div className="vhead"><span className="vkey">{v.key}</span><span className="vval" style={{ color: STATUS[v.status].c }}>{STATUS[v.status].e} {v.value}</span></div>
          <div className="vmsg">{v.msg}</div>
        </div>
      ))}
    </div>
  )
}
function DeliveryCard({ d }) {
  const color = d.tensionScore >= 60 ? 'var(--up)' : d.tensionScore >= 35 ? 'var(--warn)' : 'var(--ok)'
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>🎧 목소리 분석</h2><span style={{ color, fontWeight: 800, fontSize: 15 }}>{d.level}</span>
        <div style={{ flex: 1 }} /><div style={{ textAlign: 'right' }}><div className="muted" style={{ fontSize: 12 }}>긴장도</div><div style={{ fontWeight: 800, fontSize: 22, color }}>{d.tensionScore}<span style={{ fontSize: 13, color: 'var(--muted)' }}> /100</span></div></div>
      </div>
      <div style={{ height: 10, background: '#eef0f3', borderRadius: 99, margin: '10px 0 16px', overflow: 'hidden' }}><div style={{ width: `${d.tensionScore}%`, height: '100%', background: color, borderRadius: 99, transition: 'width .5s' }} /></div>
      <Verdicts dims={d.dims} />
    </div>
  )
}
function FaceCard({ f }) {
  if (!f.ok) return <div className="card" style={{ marginTop: 14 }}><h2 style={{ fontSize: 15 }}>📹 표정·시선</h2><p className="hint">{f.note}</p></div>
  const color = f.score >= 75 ? 'var(--ok)' : f.score >= 50 ? 'var(--warn)' : 'var(--up)'
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>📹 표정·시선 분석</h2><span style={{ color, fontWeight: 800, fontSize: 15 }}>{f.label}</span>
        <div style={{ flex: 1 }} /><div style={{ textAlign: 'right' }}><div className="muted" style={{ fontSize: 12 }}>비언어 점수</div><div style={{ fontWeight: 800, fontSize: 22, color }}>{f.score}<span style={{ fontSize: 13, color: 'var(--muted)' }}> /100</span></div></div>
      </div>
      <Verdicts dims={f.dims} />
      <div className="hint" style={{ marginTop: 8 }}>영상은 기기에서만 분석하고 서버로 전송하지 않아요.</div>
    </div>
  )
}
