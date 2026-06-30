---
title: AI 취업 코치
emoji: 🧭
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
license: mit
---

# 🧭 AI 취업 코치 (AI Job Coach)

> 지원할 회사를 **DART 전자공시**로 분석하고, **자소서를 AI가 첨삭**하고, **음성으로 모의 면접**을 연습하고, **공공 채용공고**를 검색하는 풀스택 취업 도우미.
> 사람인·잡코리아·자소설닷컴이 약한 **"기업 심층분석 + 면접 연습 + 출처 있는 정직한 AI"** 빈틈을 노립니다.

**스택**: React(Vite) · FastAPI · LLM 멀티프로바이더(GitHub Models·Gemini, function-calling) · DART 전자공시 · 네이버 뉴스 API · 고용24/워크넷 채용 OpenAPI · Web Speech API(브라우저 STT) · Docker

---

## ✨ 핵심 기능

| 기능 | 설명 | 데이터 |
|---|---|---|
| 🏢 **기업 분석** | 회사명 검색 → 기업개황(대표·설립·업종)·재무(매출/영업이익/순이익 3개년)·최근 공시·뉴스 + **AI 면접 준비 브리핑**(무슨 회사·실적·어필 포인트·예상 질문) | **DART** 전자공시(공식·정확) · 네이버 뉴스 |
| 📝 **자소서 도우미** | 경험·직무 입력 → **회사 맞춤 초안**(STAR 기법) / 작성한 자소서 **첨삭**(총평·잘된점·개선점·문장수정) | LLM (+회사정보로 문맥 보강) |
| 🎤 **음성 모의 면접** | 직무·회사 맞춤 질문 생성 → **말로 답변(음성 인식)** → AI 면접관이 점수·피드백·모범답안 | Web Speech API STT + LLM |
| 🔎 **채용공고** | 키워드·지역·학력·경력·기업형태로 공공 채용정보 검색 | **고용24/워크넷** 공공 OpenAPI |

## 🎯 차별점 (사람인·잡코리아·자소설닷컴 대비)

- **🇰🇷 기업 심층분석**: 단순 채용공고가 아니라 **DART 공식 재무·공시**로 "이 회사가 어떤 곳인지"를 면접 관점으로 정리.
- **🎤 음성 면접 연습**: 텍스트가 아니라 **실제로 말하면서** 연습 → STT → AI 피드백 (대부분의 취업 사이트엔 없음).
- **🤝 정직한 AI**: 모든 사실은 **공개 데이터(DART·뉴스)에 근거**해 답하고, 없는 정보는 지어내지 않음 · 거짓 경력 자소서 생성 거부.
- **⚖️ 합법 데이터만**: 크롤링 대신 **공식 OpenAPI**(DART·네이버·고용24)만 사용.

## 🏗 아키텍처

```
React(Vite) ──HTTP──▶ FastAPI ──┬─ tools.py   기업 리서치(DART 기업개황·재무·공시 + 네이버 뉴스)
  🏢 기업분석                     ├─ resume.py  자소서 초안·첨삭(LLM)
  📝 자소서                       ├─ interview.py 면접 질문생성·답변평가(LLM)
  🎤 모의면접(브라우저 STT)        ├─ jobs.py    고용24/워크넷 채용공고 검색
  🔎 채용공고                     └─ agent.py   기업 리서치 챗(function-calling, 출처 인용)
```

## 🚀 실행 (로컬)

```bash
pip install -r requirements.txt
cp .env.example .env          # 키 입력 (아래 표)
uvicorn api:app --port 8000   # 백엔드
cd frontend && npm install && npm run dev   # 프론트(5173, /api→8000)
# 프로덕션식: cd frontend && npm run build  후  uvicorn api:app --port 8000 → http://localhost:8000
```

| 키 | 발급 | 용도 |
|---|---|---|
| `LLM_PROVIDER` | `github` 또는 `gemini` | 로컬=github 권장 |
| `GITHUB_TOKEN` | github.com/settings/tokens (**Models** 권한) | LLM(로컬) |
| `GEMINI_API_KEY` | aistudio.google.com/apikey | LLM(HF) |
| `DART_API_KEY` | opendart.fss.or.kr | 기업개황·재무·공시 |
| `NAVER_CLIENT_ID/SECRET` | developers.naver.com | 회사 뉴스 |
| `WORK24_API_KEY` | work24.go.kr (오픈API → **채용정보** 활용신청·승인) | 채용공고 |

> ⚠️ 채용공고 검색은 work24.go.kr 오픈API에서 **'채용정보' 서비스 활용신청·승인**이 된 인증키가 필요합니다(키가 있어도 해당 API 미승인 시 "서비스가 존재하지 않습니다"). 승인되면 코드 수정 없이 바로 동작합니다.

## ☁️ 배포 (HF Spaces · Docker)

`git push hf main` → Space(Docker) 자동 빌드(React→FastAPI) → `<user>-<space>.hf.space`.
> HF 네트워크는 GitHub Models 도달 불가 → HF에선 `LLM_PROVIDER=gemini` (코드가 프로바이더 자동 분기). 음성 인식(STT)은 브라우저(Chrome 권장)에서 동작.

## 📁 구조

```
api.py        FastAPI(엔드포인트 + React 서빙)
tools.py      기업 리서치 도구(DART 기업개황·재무·공시 + 네이버 뉴스, 출처 EVIDENCE)
resume.py     자소서 초안·첨삭
interview.py  면접 질문 생성·답변 평가
jobs.py       고용24/워크넷 채용공고 검색
agent.py      LLM 프로바이더 분기 + 기업 리서치 챗(function-calling)
llm_github.py GitHub Models(OpenAI 호환) tool-call 루프
prompts.py    정직성 시스템 지침
frontend/     React(Vite): CompanyResearch·Resume·Interview·Jobs
Dockerfile    React 빌드 → FastAPI 서빙(HF)
```

## ⚠️ 면책
공개 데이터(DART·네이버·고용24) 기반 정보 제공용입니다. 재무·공시는 지연·오차가 있을 수 있고, AI 생성 자소서/피드백은 참고용입니다. 거짓 경력은 작성하지 않습니다.
