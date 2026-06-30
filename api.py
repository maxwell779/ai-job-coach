# -*- coding: utf-8 -*-
"""
AI 취업 코치 — FastAPI 백엔드.
- /api/company   기업 리서치(DART 기업개황·재무·공시·뉴스, 데이터만·빠름)
- /api/company/brief  회사 면접 준비 브리핑(LLM 요약)
- /api/chat      기업 리서치 챗(도구 사용 에이전트, 출처 인용)
- /api/jobs      채용공고 검색(고용24/워크넷 공공 API)
- /api/resume/*  자소서 작성·첨삭
- /api/interview/*  모의 면접 질문 생성·답변 평가
- /            빌드된 React(frontend/dist) 서빙
"""
import os
from dotenv import load_dotenv
load_dotenv()

import io
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from pydantic import BaseModel

import tools
import jobs
import resume
import interview
import rag
import agent as agent_mod

app = FastAPI(title="AI 취업 코치")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

_AGENT = None


def _get_agent():
    global _AGENT
    if _AGENT is None:
        _AGENT = agent_mod.build_agent()
    return _AGENT


@app.get("/api/health")
def health():
    return {"ok": True, "provider": os.environ.get("LLM_PROVIDER", "gemini"),
            "dart": bool(os.environ.get("DART_API_KEY")),
            "work24": bool(os.environ.get("WORK24_API_KEY")),
            "naver": bool(os.environ.get("NAVER_CLIENT_ID"))}


# ── 기업 리서치(데이터) ──
@app.get("/api/company")
def company(name: str):
    tools.EVIDENCE.clear()
    r = tools.resolve_company(name)
    if r.get("error"):
        return JSONResponse({"error": r["error"]}, status_code=404)
    corp = r["corp_code"]
    out = {"resolved": r,
           "overview": tools.get_company_overview(corp),
           "financials": tools.get_dart_financials(corp),
           "filings": tools.get_dart_filings(corp).get("filings", []),
           "news": tools.get_naver_news(r["corp_name"]).get("news", []),
           "evidence": list(tools.EVIDENCE)}
    return out


class BriefIn(BaseModel):
    name: str
    job_title: str = ""


@app.post("/api/company/brief")
def company_brief(body: BriefIn):
    """회사 면접 준비 브리핑(LLM): 무슨 회사·실적·면접 어필 포인트·예상 질문."""
    ov = tools.get_company_overview(body.name)
    if ov.get("error"):
        return JSONResponse({"error": ov["error"]}, status_code=404)
    fin = tools.get_dart_financials(body.name)
    news = tools.get_naver_news(ov.get("corp_name", body.name), display=5).get("news", [])
    biz = tools.get_dart_business_overview(body.name)
    biz_text = "" if biz.get("error") else biz.get("text", "")[:2200]
    fin_str = ""
    if not fin.get("error") and fin.get("revenue"):
        rev = fin["revenue"][0]
        fin_str = f"최근 매출 {rev.get('value')}원(YoY {fin.get('revenue_yoy_pct')}%), 영업이익 YoY {fin.get('operating_income_yoy_pct')}%"
    news_str = " / ".join(n["title"] for n in news[:5])
    prompt = f"""당신은 취업 준비생을 돕는 기업 분석 코치입니다. 아래 '공개 데이터'만 근거로 면접 준비 브리핑을 작성하세요.
없는 사실은 지어내지 말고, 데이터에 있는 것만 사용하세요.

[회사] {ov.get('corp_name')} (대표 {ov.get('ceo')}, 설립 {ov.get('established')}, {ov.get('corp_class')})
[홈페이지] {ov.get('homepage')}
[재무] {fin_str or '공개 재무 데이터 없음'}
[사업보고서 '사업의 개요' 발췌]
{biz_text or '(사업보고서 본문 없음)'}
[최근 뉴스] {news_str or '뉴스 없음'}
[지원 직무] {body.job_title or '(미지정)'}

마크다운으로:
## 한 줄 요약 (무슨 회사인지 — 사업보고서 기반)
## 주요 사업·부문 (사업보고서 기반, 쉽게 풀어서)
## 최근 실적·이슈 (재무·뉴스 기반)
## 면접에서 어필할 포인트 (3가지)
## 예상 면접 질문 (3가지)"""
    return {"brief": agent_mod.quick_complete(prompt).strip(),
            "overview": ov, "financials": fin, "news": news,
            "business": ({} if biz.get("error") else {"text": biz_text, "link": biz.get("link")})}


# ── 뉴스 검색(직무·산업·키워드) ──
@app.get("/api/news")
def news(query: str, display: int = 8):
    tools.EVIDENCE.clear()
    return tools.get_naver_news(query, display=display)


# ── 직무 인사이트(LLM) ──
class RoleIn(BaseModel):
    role: str


@app.post("/api/role_brief")
def role_brief(body: RoleIn):
    role = (body.role or "").strip()
    if not role:
        return JSONResponse({"error": "직무를 입력하세요."}, status_code=400)
    prompt = f"""당신은 한국 취업 직무 전문 코치입니다. '{role}' 직무를 준비하는 취업준비생을 위해 간결한 직무 인사이트를 작성하세요.

마크다운으로:
## 어떤 일을 하나요
## 핵심 역량 (3~5가지)
## 면접에서 자주 보는 포인트
## 준비하면 좋은 것 (자격증·도구·경험)

규칙: 한국 채용 시장 기준, 구체적이고 현실적으로. 200~400자."""
    return {"role": role, "brief": agent_mod.quick_complete(prompt).strip()}


# ── 기업 리서치 챗(에이전트) ──
class ChatIn(BaseModel):
    question: str


@app.post("/api/chat")
def chat(body: ChatIn):
    try:
        answer, evidence = agent_mod.ask(_get_agent(), body.question)
        return {"answer": answer, "evidence": evidence}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


# ── 채용공고 ──
@app.get("/api/jobs")
def jobs_search(keyword: str = "", region: str = "", education: str = "",
                career: str = "", co_tp: str = "", reg_date: str = "",
                display: int = 20, start_page: int = 1):
    return jobs.search_jobs(keyword=keyword, region=region, education=education,
                            career=career, co_tp=co_tp, reg_date=reg_date,
                            display=display, start_page=start_page)


@app.get("/api/jobs/detail")
def jobs_detail(auth_no: str):
    return jobs.get_job_detail(auth_no)


# ── 자소서 ──
class DraftIn(BaseModel):
    company: str = ""
    job_title: str
    experience: str
    strengths: str = ""
    question: str = ""
    materials: list[str] = []


class ReviewIn(BaseModel):
    text: str
    job_title: str = ""


@app.post("/api/resume/draft")
def resume_draft(body: DraftIn):
    return resume.draft_resume(body.company, body.job_title, body.experience,
                               body.strengths, body.question, materials=body.materials)


@app.post("/api/resume/review")
def resume_review(body: ReviewIn):
    return resume.review_resume(body.text, body.job_title)


# ── 모의 면접 ──
class QIn(BaseModel):
    job_title: str
    company: str = ""
    count: int = 5
    persona: str = "일반"
    materials: list[str] = []


class EvalIn(BaseModel):
    question: str
    answer: str
    job_title: str = ""
    persona: str = "일반"


class FollowupIn(BaseModel):
    question: str
    answer: str
    job_title: str = ""
    persona: str = "압박"


class MaterialsQIn(BaseModel):
    materials: list[str] = []
    job_title: str = ""
    count: int = 5


class ReportIn(BaseModel):
    qa_list: list[dict] = []
    job_title: str = ""


@app.post("/api/interview/questions")
def interview_questions(body: QIn):
    return interview.generate_questions(body.job_title, body.company, body.count,
                                        persona=body.persona, materials=body.materials)


@app.post("/api/interview/evaluate")
def interview_evaluate(body: EvalIn):
    return interview.evaluate_answer(body.question, body.answer, body.job_title, persona=body.persona)


@app.post("/api/interview/followup")
def interview_followup(body: FollowupIn):
    return interview.generate_followup(body.question, body.answer, body.job_title, persona=body.persona)


@app.post("/api/interview/followup_chain")
def interview_followup_chain(body: FollowupIn):
    return interview.followup_chain(body.question, body.answer, body.job_title, persona=body.persona)


@app.post("/api/interview/from_materials")
def interview_from_materials(body: MaterialsQIn):
    return interview.questions_from_materials(body.materials, body.job_title, body.count)


@app.post("/api/interview/report")
def interview_report(body: ReportIn):
    return interview.session_report(body.qa_list, body.job_title)


class ModelAnsIn(BaseModel):
    question: str
    answer: str = ""
    job_title: str = ""


@app.post("/api/interview/model_answer")
def interview_model_answer(body: ModelAnsIn):
    return interview.model_answer(body.question, body.answer, body.job_title)


@app.post("/api/interview/star")
def interview_star(body: ModelAnsIn):
    return interview.star_coach(body.question, body.answer, body.job_title)


# ── RAG 검색(내 자료) ──
class RagIn(BaseModel):
    query: str
    docs: list[dict] = []
    top_k: int = 5


@app.post("/api/rag/search")
def rag_search(body: RagIn):
    return {"results": rag.rank(body.query, body.docs, top_k=body.top_k)}


# ── 파일 업로드 → 텍스트 추출(자소서·이력서 PDF/TXT) ──
@app.post("/api/extract_text")
async def extract_text(file: UploadFile = File(...)):
    name = (file.filename or "").lower()
    raw = await file.read()
    if len(raw) > 8 * 1024 * 1024:
        return JSONResponse({"error": "8MB 이하 파일만 가능합니다."}, status_code=400)
    try:
        if name.endswith(".pdf"):
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(raw))
            text = "\n".join((p.extract_text() or "") for p in reader.pages)
        elif name.endswith((".txt", ".md", ".csv")):
            try:
                text = raw.decode("utf-8")
            except UnicodeDecodeError:
                text = raw.decode("cp949", errors="ignore")
        else:
            return JSONResponse({"error": "PDF 또는 TXT 파일만 지원합니다(.docx는 텍스트로 변환 후 올려주세요)."}, status_code=400)
        text = (text or "").strip()
        if not text:
            return JSONResponse({"error": "텍스트를 추출하지 못했습니다(이미지 PDF일 수 있어요)."}, status_code=400)
        return {"text": text[:20000], "chars": len(text), "filename": file.filename}
    except Exception as e:
        return JSONResponse({"error": f"파일 처리 실패: {e}"}, status_code=400)


# ── 정적 프론트(빌드 결과) ──
_DIST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend", "dist")
if os.path.isdir(_DIST):
    app.mount("/", StaticFiles(directory=_DIST, html=True), name="static")
