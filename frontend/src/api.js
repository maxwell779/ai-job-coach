// 백엔드 호출 헬퍼
const J = { 'Content-Type': 'application/json' }

async function handle(r) {
  const data = await r.json().catch(() => ({ error: '응답 파싱 실패' }))
  if (!r.ok) throw new Error(data.error || `오류 ${r.status}`)
  return data
}

export const getCompany = (name) =>
  fetch(`/api/company?name=${encodeURIComponent(name)}`).then(handle)

export const getBrief = (name, job_title) =>
  fetch('/api/company/brief', { method: 'POST', headers: J, body: JSON.stringify({ name, job_title }) }).then(handle)

export const chat = (question) =>
  fetch('/api/chat', { method: 'POST', headers: J, body: JSON.stringify({ question }) }).then(handle)

export const searchJobs = (params) => {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString()
  return fetch(`/api/jobs?${q}`).then(handle)
}

export const getJobDetail = (auth_no) =>
  fetch(`/api/jobs/detail?auth_no=${encodeURIComponent(auth_no)}`).then(handle)

export const draftResume = (body) =>
  fetch('/api/resume/draft', { method: 'POST', headers: J, body: JSON.stringify(body) }).then(handle)

export const reviewResume = (body) =>
  fetch('/api/resume/review', { method: 'POST', headers: J, body: JSON.stringify(body) }).then(handle)

export const resultPattern = (body) =>
  fetch('/api/resume/pattern', { method: 'POST', headers: J, body: JSON.stringify(body) }).then(handle)

export const genQuestions = (body) =>
  fetch('/api/interview/questions', { method: 'POST', headers: J, body: JSON.stringify(body) }).then(handle)

export const evalAnswer = (body) =>
  fetch('/api/interview/evaluate', { method: 'POST', headers: J, body: JSON.stringify(body) }).then(handle)

export const followup = (body) =>
  fetch('/api/interview/followup', { method: 'POST', headers: J, body: JSON.stringify(body) }).then(handle)

export const followupChain = (body) =>
  fetch('/api/interview/followup_chain', { method: 'POST', headers: J, body: JSON.stringify(body) }).then(handle)

export const questionsFromMaterials = (body) =>
  fetch('/api/interview/from_materials', { method: 'POST', headers: J, body: JSON.stringify(body) }).then(handle)

export const sessionReport = (body) =>
  fetch('/api/interview/report', { method: 'POST', headers: J, body: JSON.stringify(body) }).then(handle)

export const modelAnswer = (body) =>
  fetch('/api/interview/model_answer', { method: 'POST', headers: J, body: JSON.stringify(body) }).then(handle)

export const starCoach = (body) =>
  fetch('/api/interview/star', { method: 'POST', headers: J, body: JSON.stringify(body) }).then(handle)

export const ragSearch = (body) =>
  fetch('/api/rag/search', { method: 'POST', headers: J, body: JSON.stringify(body) }).then(handle)

export const getNews = (query, display = 8) =>
  fetch(`/api/news?query=${encodeURIComponent(query)}&display=${display}`).then(handle)

export const getRoleBrief = (role) =>
  fetch('/api/role_brief', { method: 'POST', headers: J, body: JSON.stringify({ role }) }).then(handle)

export const extractText = (file) => {
  const fd = new FormData(); fd.append('file', file)
  return fetch('/api/extract_text', { method: 'POST', body: fd }).then(handle)
}

export const health = () => fetch('/api/health').then(handle)
