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

> 지원할 회사를 **DART 전자공시**로 분석하고, **자소서를 AI가 첨삭**하고, **음성·표정으로 모의 면접**을 연습하고, 모든 준비를 한곳에서 관리하는 **풀스택 취업 올인원**.
> *"공시로 회사를 읽고(DART), 내 경험으로 자소서를 쓰고(RAG), 목소리·표정으로 면접을 연습하는 — 무료·한국어·정직한 취업 코치"*

🤗 **라이브 데모**: **https://maxwell779-ai-job-coach.hf.space** ｜ 💻 **코드**: https://github.com/maxwell779/ai-job-coach

**스택**: React(Vite) · FastAPI · LLM 멀티프로바이더(GitHub Models·Gemini, function-calling) · **RAG(임베딩·코사인)** · DART·네이버·고용24 OpenAPI · **MediaPipe**(표정·시선) · **Web Audio/Whisper**(음성) · Docker

---

### 🖼 미리보기

**🏢 기업·직무 통합 분석** — 회사(DART 공시·재무·사업부문) + 직무 인사이트 + 뉴스를 한 화면에
![기업·직무 분석](docs/screenshots/02_explore.png)

| 🏠 홈 대시보드 | 🎤 음성·표정 모의면접 |
|---|---|
| ![홈](docs/screenshots/01_home.png) | ![모의면접](docs/screenshots/03_interview.png) |

---

## ✨ 핵심 기능

| 기능 | 설명 |
|---|---|
| 🏢 **기업·직무 분석** | 회사명 → **DART 기업개황·재무·사업보고서 '사업의 개요'·공시·뉴스 + AI 요약**. **대기업 사업부**(삼성 DS/DX/파운드리 등)·**공기업 인재상/채용직군** DB. 직무 **350+** × 18 산업군 인사이트 |
| 📝 **자소서** | 대표 문항별 **AI 초안**(STAR) + **첨삭** + 회사별 관리. **내 경험·스펙 RAG 자동 반영**. **결과 태그×스펙 합격 패턴 분석**. PDF/TXT 업로드 |
| 🎤 **음성·표정 모의면접** | **면접관 5페르소나**(압박/인성/직무/임원) · **음성 9지표**(에너지·피치·jitter·shimmer·HNR·속도·침묵·채움어·말끝) · **표정 7지표**(시선·시선고정·미소·자세·끄덕임·깜빡임·감정) · **실시간 시선 알림** · **3축 종합평가** · **꼬리질문/압박 라운드** · **STAR·모범답안** · **시간제한·질문 TTS** · **성장 리포트 PDF** |
| 🔎 **채용공고** | 고용24/워크넷 공공 OpenAPI 검색(준수사항 UI 포함) |
| 📋 **내 보드** | 지원현황 트래커 · 일정 캘린더 · 스펙(자격·수상·경력·공모전) · 자료실(RAG 검색) · **점수 추이·반복 약점** |

## 🎯 차별점 (사람인·뷰인터·Final Round 대비)

- 🇰🇷 **DART 기반 기업·사업부 심층분석 + AI 요약** — 경쟁사에 없는 빈틈
- 🎧 **음성 9지표 + 표정 7지표를 무료·온디바이스**(영상 서버 미전송)로 — 뷰인터/Final Round가 유료로 하는 분석
- 🤝 **정직성**: 출처 표기·환각 거절·거짓 경력 자소서 거부
- 🏛 **공기업/공무원 NCS** 특화 + 직무 350+ × 산업 × 기업 통합

## 🏗 아키텍처

```
React(Vite, 사이드바 SPA) ──HTTP──▶ FastAPI
  🏢 기업·직무   ├ tools.py   DART(기업개황·재무·사업보고서·공시) + 네이버뉴스
  📝 자소서      ├ resume.py  초안·첨삭·합격패턴(RAG)
  🎤 모의면접    ├ interview.py 질문·평가·꼬리질문·STAR·세션리포트(페르소나)
  🔎 채용공고    ├ jobs.py    고용24/워크넷
  📋 보드        ├ rag.py     임베딩+코사인(폴백:키워드)
  (브라우저)     ├ voice.js   Web Audio 9지표 / face.js MediaPipe 7지표
                └ transcribe.py Whisper 정확모드(로컬)
```

## 🚀 실행 (로컬)

```bash
pip install -r requirements.txt
cp .env.example .env          # 키 입력
uvicorn api:app --port 8000
cd frontend && npm install && npm run build   # → http://localhost:8000
# (선택) Whisper 정확모드: pip install faster-whisper
```

| 키 | 용도 |
|---|---|
| `LLM_PROVIDER` | `github`(로컬) / `gemini`(HF) |
| `GITHUB_TOKEN` / `GEMINI_API_KEY` | LLM |
| `DART_API_KEY` | 기업개황·재무·공시 |
| `NAVER_CLIENT_ID/SECRET` | 회사·직무 뉴스 |
| `WORK24_API_KEY` | 채용공고(기업회원 승인 필요) |

## ☁️ 배포 (HF Spaces · Docker)

`git push hf main` → Docker 자동 빌드(React→FastAPI, 포트 7860). **라이브: https://maxwell779-ai-job-coach.hf.space**
> ⚠️ HF에선 GitHub Models 도달 불가 → **`LLM_PROVIDER=groq`(무료·초고속)** 또는 `gemini` 사용. Whisper는 로컬 전용(requirements 미포함 → 자동 비활성). 음성·표정 분석은 **Chrome + 마이크/카메라 허용** 필요.

## ⚠️ 면책
공개 데이터(DART·네이버·고용24) 기반 정보 제공·연습용. 음성/표정 분석은 휴리스틱 참고치이며, AI 생성물은 참고용입니다.
