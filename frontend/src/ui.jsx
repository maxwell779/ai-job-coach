import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function MD({ children }) {
  return <div className="md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{children || ''}</ReactMarkdown></div>
}

export function Loading({ text = '불러오는 중…' }) {
  return <div className="spin">⏳ {text}</div>
}

export function ErrorBox({ children }) {
  return <div className="err">⚠️ {children}</div>
}

// 큰 숫자 → 조/억 한국식
export function fmtKRW(v) {
  if (v == null) return '—'
  const n = Number(v)
  if (Math.abs(n) >= 1e12) return (n / 1e12).toFixed(2) + '조'
  if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(0) + '억'
  return n.toLocaleString()
}
