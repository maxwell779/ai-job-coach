// localStorage 기반 로컬 저장소 (서버 없이 브라우저에 보관)
import { useSyncExternalStore } from 'react'

const KEY = (name) => `jobcoach.${name}`
const listeners = new Set()
const snap = {} // name → 안정적 배열 참조(변경 시에만 교체)

function read(name) {
  if (!(name in snap)) {
    try { snap[name] = JSON.parse(localStorage.getItem(KEY(name))) || [] } catch { snap[name] = [] }
  }
  return snap[name]
}
function write(name, arr) {
  snap[name] = arr
  localStorage.setItem(KEY(name), JSON.stringify(arr))
  listeners.forEach((l) => l())
}

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36)

export function add(name, item) {
  const withId = { id: uid(), createdAt: new Date().toISOString(), ...item }
  write(name, [withId, ...read(name)])
  return withId
}
export function update(name, id, patch) {
  write(name, read(name).map((x) => (x.id === id ? { ...x, ...patch } : x)))
}
export function remove(name, id) {
  write(name, read(name).filter((x) => x.id !== id))
}
export function all(name) { return read(name) }

// 공고 저장: 중복(auth_no) 방지 토글
export function toggleSavedJob(job) {
  const arr = read('savedJobs')
  if (job.auth_no && arr.some((j) => j.auth_no === job.auth_no)) {
    write('savedJobs', arr.filter((j) => j.auth_no !== job.auth_no))
    return false
  }
  write('savedJobs', [{ id: uid(), createdAt: new Date().toISOString(), ...job }, ...arr])
  return true
}
export function isJobSaved(authNo) {
  return !!authNo && read('savedJobs').some((j) => j.auth_no === authNo)
}

// 저장된 자료(경험·스펙·자소서)를 RAG/면접용 텍스트 문서로 모은다
export function materialDocs() {
  const docs = []
  for (const x of read('experiences')) {
    const star = [x.situation, x.task, x.action, x.result].filter(Boolean).join(' ')
    docs.push({ id: 'exp-' + x.id, kind: '경험', text: `[경험] ${x.title}. ${star}`.trim() })
  }
  for (const x of read('specs')) {
    docs.push({ id: 'spec-' + x.id, kind: '스펙', text: `[${x.type}] ${x.title} ${x.org || ''} ${x.memo || ''}`.trim() })
  }
  for (const x of read('resumes')) {
    docs.push({ id: 'res-' + x.id, kind: '자소서', text: `[자소서:${x.title}] ${x.content || ''}`.slice(0, 600) })
  }
  return docs.filter((d) => d.text && d.text.length > 4)
}

// React 구독 훅 — write() 시 자동 리렌더
export function useCollection(name) {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb) },
    () => read(name)
  )
}
