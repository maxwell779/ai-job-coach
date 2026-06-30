# -*- coding: utf-8 -*-
"""기업 리서치 챗 에이전트 — LLM_PROVIDER(github|gemini)에 따라 백엔드 분기. 투자앱과 동일 패턴."""
import os
import time
import tools
from prompts import SYSTEM

MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest"]


def build_agent():
    provider = os.environ.get("LLM_PROVIDER", "gemini").lower()
    if provider in ("github", "groq"):
        import llm_github
        return (provider, llm_github.build_client())
    from google import genai
    from google.genai import types
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("GEMINI_API_KEY가 없습니다(.env).")
    client = genai.Client(api_key=key)
    config = types.GenerateContentConfig(system_instruction=SYSTEM, tools=tools.TOOLS)
    return ("gemini", (client, config))


def ask(agent, question: str):
    """질문 1건 → (답변, 근거리스트)."""
    provider, obj = agent
    if provider in ("github", "groq"):
        import llm_github
        return llm_github.ask(obj, question)
    from google.genai import errors as genai_errors
    client, config = obj
    last_err = None
    for model in MODELS:
        for attempt in range(3):
            tools.EVIDENCE.clear()
            try:
                chat = client.chats.create(model=model, config=config)
                resp = chat.send_message(question)
                return (resp.text or "(응답 없음)"), list(tools.EVIDENCE)
            except genai_errors.ServerError as e:
                last_err = e
                time.sleep(2 * (attempt + 1))
            except genai_errors.ClientError as e:
                last_err = e
                if getattr(e, "code", None) == 429:
                    time.sleep(3.0)
                    break
                raise
    raise RuntimeError(f"무료 한도 소진 또는 일시 과부하. 잠시 후 재시도. 마지막 오류: {last_err}")


def quick_complete(prompt: str) -> str:
    """도구 없이 단순 1회 LLM 완성(자소서·면접 평가). 프로바이더 자동 분기."""
    provider = os.environ.get("LLM_PROVIDER", "gemini").lower()
    if provider in ("github", "groq"):
        import llm_github
        return llm_github.complete(prompt)
    from google import genai
    client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY", ""))
    last = None
    for model in MODELS:
        try:
            txt = client.models.generate_content(model=model, contents=prompt).text
            if txt:
                return txt
        except Exception as e:
            last = e
            continue
    return f"(LLM 응답을 받지 못했습니다. 무료 한도 소진이거나 키 오류일 수 있어요. {last or ''})".strip()


if __name__ == "__main__":
    import sys
    from dotenv import load_dotenv
    load_dotenv()
    q = sys.argv[1] if len(sys.argv) > 1 else "카카오는 어떤 회사야?"
    agent = build_agent()
    answer, evidence = ask(agent, q)
    print("\n=== 답변 ===\n", answer)
    print("\n=== 근거 ===")
    for e in evidence:
        print(" -", e)
