import { useState } from 'react'
import { useCollection } from './store.js'

const STAGES = ['관심', '지원', '서류합격', '면접', '최종합격', '불합격']
const pad = (n) => String(n).padStart(2, '0')

function MiniCalendar({ plans }) {
  const [cur, setCur] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } })
  const first = new Date(cur.y, cur.m, 1)
  const startDow = first.getDay()
  const days = new Date(cur.y, cur.m + 1, 0).getDate()
  const todayStr = `${new Date().getFullYear()}-${pad(new Date().getMonth() + 1)}-${pad(new Date().getDate())}`
  const byDate = {}
  for (const p of plans) if (p.due) (byDate[p.due] = byDate[p.due] || []).push(p)
  const cells = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= days; d++) cells.push(`${cur.y}-${pad(cur.m + 1)}-${pad(d)}`)
  function move(x) { let m = cur.m + x, y = cur.y; if (m < 0) { m = 11; y-- } else if (m > 11) { m = 0; y++ } setCur({ y, m }) }
  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button className="btn ghost sm" onClick={() => move(-1)}>‹</button>
        <h2 style={{ margin: 0 }}>🗓 {cur.y}.{pad(cur.m + 1)}</h2>
        <button className="btn ghost sm" onClick={() => move(1)}>›</button>
      </div>
      <div className="cal">
        {['일', '월', '화', '수', '목', '금', '토'].map((w, i) => (
          <div key={w} className="cal-dow" style={{ color: i === 0 ? 'var(--up)' : i === 6 ? 'var(--brand)' : 'var(--muted)' }}>{w}</div>
        ))}
        {cells.map((c, i) => (
          <div key={i} className={`cal-cell ${c ? '' : 'empty'} ${c === todayStr ? 'today' : ''}`} title={c && byDate[c] ? byDate[c].map((p) => p.text).join(', ') : ''}>
            {c && <><span className="cal-num">{Number(c.slice(-2))}</span>{byDate[c] && <span className="cal-dot" />}</>}
          </div>
        ))}
      </div>
    </div>
  )
}

function ScoreTrend({ sessions }) {
  const data = sessions.slice(0, 8).reverse()
  if (data.length === 0) return null
  return (
    <div className="card">
      <h2>📈 모의면접 점수 추이</h2>
      <div className="trend">
        {data.map((s, i) => (
          <div className="trend-col" key={i}>
            <div className="trend-v" style={{ color: s.score >= 75 ? 'var(--ok)' : s.score >= 50 ? 'var(--warn)' : 'var(--up)' }}>{s.score}</div>
            <div className="trend-bar" style={{ height: `${Math.max(6, s.score * 0.9)}%` }} />
            <div className="trend-d">{(s.date || '').slice(5)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
const STAGE_COLOR = { '관심': '#6b7280', '지원': '#5b5bf0', '서류합격': '#7c3aed', '면접': '#f59e0b', '최종합격': '#16a34a', '불합격': '#9ca3af' }

function dday(due) {
  if (!due) return null
  const d = new Date(due + 'T00:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = Math.round((d - today) / 86400000)
  return diff
}

export default function Home({ onNav }) {
  const apps = useCollection('applications')
  const plans = useCollection('plans')
  const saved = useCollection('savedJobs')
  const resumes = useCollection('resumes')
  const exps = useCollection('experiences')
  const specs = useCollection('specs')
  const sessions = useCollection('sessions')

  const active = apps.filter((a) => !['최종합격', '불합격'].includes(a.stage)).length
  const upcoming = plans.filter((p) => !p.done && p.due)
    .map((p) => ({ ...p, d: dday(p.due) }))
    .filter((p) => p.d != null && p.d >= 0)
    .sort((a, b) => a.d - b.d).slice(0, 5)
  const stageCounts = STAGES.map((s) => ({ s, n: apps.filter((a) => a.stage === s).length })).filter((x) => x.n > 0)

  const STATS = [
    { k: '지원 진행', v: active, sub: `총 ${apps.length}개`, grad: 'linear-gradient(135deg,#5b5bf0,#7c3aed)', go: 'board' },
    { k: '저장 공고', v: saved.length, sub: '관심 공고', grad: 'linear-gradient(135deg,#0ea5e9,#3182f6)', go: 'jobs' },
    { k: '내 자소서', v: resumes.length, sub: '작성·저장', grad: 'linear-gradient(135deg,#f59e0b,#f04452)', go: 'resume' },
    { k: '경험·스펙', v: exps.length + specs.length, sub: `경험 ${exps.length}·스펙 ${specs.length}`, grad: 'linear-gradient(135deg,#16a34a,#0ea5e9)', go: 'board' },
  ]

  const ACTIONS = [
    { icon: '🏢', label: '기업·직무 분석', go: 'explore' },
    { icon: '📝', label: '자소서 작성', go: 'resume' },
    { icon: '🎤', label: '모의 면접', go: 'interview' },
    { icon: '🔎', label: '공고 검색', go: 'jobs' },
  ]

  const empty = apps.length + plans.length + saved.length + resumes.length + exps.length + specs.length === 0

  return (
    <>
      <div className="hero-card">
        <div className="hero-emoji">🚀</div>
        <div>
          <h2>취업, 데이터로 준비해요</h2>
          <p>기업 분석부터 자소서·모의 면접까지 — 오늘 할 일을 한눈에.</p>
        </div>
      </div>

      <div className="stat-grid">
        {STATS.map((s) => (
          <button key={s.k} className="stat-card" style={{ background: s.grad }} onClick={() => onNav(s.go)}>
            <div className="stat-v">{s.v}</div>
            <div className="stat-k">{s.k}</div>
            <div className="stat-sub">{s.sub}</div>
          </button>
        ))}
      </div>

      <div className="card">
        <h2>⚡ 바로 시작</h2>
        <div className="action-row">
          {ACTIONS.map((a) => (
            <button key={a.go} className="action-btn" onClick={() => onNav(a.go)}>
              <span className="action-ico">{a.icon}</span>{a.label}
            </button>
          ))}
        </div>
      </div>

      {stageCounts.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0 }}>📌 지원 현황</h2>
            <button className="btn ghost sm" onClick={() => onNav('board')}>관리 →</button>
          </div>
          <div className="funnel">
            {stageCounts.map(({ s, n }) => (
              <div className="funnel-item" key={s}>
                <div className="funnel-bar" style={{ background: STAGE_COLOR[s] }}>{n}</div>
                <div className="funnel-label">{s}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ScoreTrend sessions={sessions} />

      <MiniCalendar plans={plans} />

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>🗓 다가오는 일정</h2>
          <button className="btn ghost sm" onClick={() => onNav('board')}>일정 →</button>
        </div>
        {upcoming.length === 0 && <p className="hint" style={{ marginTop: 8 }}>예정된 일정이 없어요. 내 보드 → 일정에서 마감일을 등록해보세요.</p>}
        {upcoming.map((p) => (
          <div className="list-item" key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{p.text}</span>
            <span className="dday" style={{ background: p.d <= 3 ? '#fff0f1' : '#eef0ff', color: p.d <= 3 ? 'var(--up)' : 'var(--brand)' }}>
              {p.d === 0 ? 'D-DAY' : `D-${p.d}`}
            </span>
          </div>
        ))}
      </div>

      {empty && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--muted)' }}>
          👋 처음이시군요! 위 버튼으로 <b>기업 분석</b>이나 <b>모의 면접</b>부터 시작해 보세요.
          기록은 자동으로 이 홈 대시보드에 모여요.
        </div>
      )}
    </>
  )
}
