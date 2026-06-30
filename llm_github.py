# -*- coding: utf-8 -*-
"""OpenAI 호환 LLM 백엔드 — GitHub Models / Groq(무료·초고속) 공용. tool-calling 구동."""
import os
import json
from openai import OpenAI
import tools
from prompts import SYSTEM


def _conf():
    """LLM_PROVIDER에 따라 (base_url, model, api_key) 반환. groq=무료·초고속."""
    prov = os.environ.get("LLM_PROVIDER", "github").lower()
    if prov == "groq":
        return ("https://api.groq.com/openai/v1",
                os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile"),
                os.environ.get("GROQ_API_KEY"))
    return (os.environ.get("GITHUB_MODELS_BASE", "https://models.github.ai/inference"),
            os.environ.get("GITHUB_MODEL", "openai/gpt-4o-mini"),
            os.environ.get("GITHUB_TOKEN"))


BASE_URL, MODEL, _ = _conf()

TOOL_SCHEMAS = [
    {"type": "function", "function": {
        "name": "resolve_company", "description": "회사명을 DART corp_code로 해석(회사가 모호하면 먼저 호출).",
        "parameters": {"type": "object", "properties": {"query": {"type": "string", "description": "회사명/종목코드"}}, "required": ["query"]}}},
    {"type": "function", "function": {
        "name": "get_company_overview", "description": "기업개황(대표자·설립일·법인구분·주소·홈페이지·종목코드).",
        "parameters": {"type": "object", "properties": {"company": {"type": "string", "description": "회사명 또는 corp_code"}}, "required": ["company"]}}},
    {"type": "function", "function": {
        "name": "get_dart_financials", "description": "연간 매출·영업이익·순이익(연결, 3개년)과 성장률(DART 공식).",
        "parameters": {"type": "object", "properties": {"company": {"type": "string"}}, "required": ["company"]}}},
    {"type": "function", "function": {
        "name": "get_dart_filings", "description": "최근 DART 정기공시(사업/반기/분기보고서) 목록 + 원문 링크.",
        "parameters": {"type": "object", "properties": {"company": {"type": "string"}}, "required": ["company"]}}},
    {"type": "function", "function": {
        "name": "get_naver_news", "description": "회사 관련 한국어 최신 뉴스(네이버). query=회사명.",
        "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}}},
]
DISPATCH = {"resolve_company": tools.resolve_company, "get_company_overview": tools.get_company_overview,
            "get_dart_financials": tools.get_dart_financials, "get_dart_filings": tools.get_dart_filings,
            "get_naver_news": tools.get_naver_news}


def build_client():
    tok = os.environ.get("GITHUB_TOKEN")
    base, model, tok = _conf()
    if not tok:
        raise RuntimeError("LLM 토큰이 없습니다(GITHUB_TOKEN 또는 GROQ_API_KEY).")
    return OpenAI(base_url=base, api_key=tok)


def complete(prompt: str) -> str:
    """도구 없이 단순 1회 완성(자소서·면접 평가 등)."""
    c = build_client()
    r = c.chat.completions.create(model=_conf()[1], messages=[{"role": "user", "content": prompt}], temperature=0.4)
    return r.choices[0].message.content or ""


def ask(client, question: str, max_rounds: int = 8):
    """수동 tool-call 루프로 질문 처리 → (답변, EVIDENCE)."""
    tools.EVIDENCE.clear()
    messages = [{"role": "system", "content": SYSTEM}, {"role": "user", "content": question}]
    for _ in range(max_rounds):
        try:
            resp = client.chat.completions.create(
                model=MODEL, messages=messages, tools=TOOL_SCHEMAS, tool_choice="auto", temperature=0)
        except Exception as e:
            s = str(e).lower()
            if "permission" in s or "no_access" in s or "no access" in s:
                raise RuntimeError(
                    "GitHub 토큰에 'Models' 권한이 없습니다. Settings → Developer settings → "
                    "Fine-grained tokens → Account permissions → 'Models' = Read-only 추가 후 재시도하세요.") from e
            raise
        msg = resp.choices[0].message
        if not msg.tool_calls:
            return (msg.content or "(응답 없음)"), list(tools.EVIDENCE)
        messages.append({"role": "assistant", "content": msg.content or "",
                         "tool_calls": [tc.model_dump() for tc in msg.tool_calls]})
        for tc in msg.tool_calls:
            fn = DISPATCH.get(tc.function.name)
            try:
                args = json.loads(tc.function.arguments or "{}")
                result = fn(**args) if fn else {"error": f"unknown tool {tc.function.name}"}
            except Exception as e:
                result = {"error": f"도구 실행 오류: {e}"}
            messages.append({"role": "tool", "tool_call_id": tc.id,
                             "content": json.dumps(result, ensure_ascii=False, default=str)})
    return "(도구 호출 한도를 초과했습니다)", list(tools.EVIDENCE)
