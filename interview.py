# -*- coding: utf-8 -*-
"""모의 면접 — 질문 생성 + 답변 평가(LLM). 음성 답변은 프론트(Web Speech API)에서 STT→텍스트로 전달."""
import json
import re
import agent
import tools


def _company_context(company: str) -> str:
    if not company:
        return ""
    ov = tools.get_company_overview(company)
    if ov.get("error"):
        return ""
    bits = [f"{ov.get('corp_name')}({ov.get('corp_class')})"]
    news = tools.get_naver_news(ov.get("corp_name", company), display=3)
    if news.get("news"):
        bits.append("최근 이슈: " + " / ".join(n["title"] for n in news["news"][:3]))
    return " | ".join(bits)


# 면접관 페르소나 — 질문/평가 톤을 바꾼다
PERSONAS = {
    "일반": "균형 잡힌 일반 면접관. 인성과 직무를 고루 본다.",
    "압박": "냉정하고 날카로운 압박 면접관. 답변의 허점·모순을 집요하게 파고들고 꼬리질문을 던진다. 단, 인신공격은 하지 않는다.",
    "인성": "지원자의 가치관·성격·협업 태도·조직 적합성을 깊이 보는 인성 면접관.",
    "직무": "직무 전문성과 기술 깊이를 구체적으로 검증하는 실무진 면접관.",
    "임원": "회사 비전·장기 성장·인재상 적합성·리더십 잠재력을 보는 임원 면접관.",
}


def _persona_line(persona: str) -> str:
    return PERSONAS.get(persona, PERSONAS["일반"])


def generate_questions(job_title: str, company: str = "", count: int = 5,
                       persona: str = "일반", materials=None) -> dict:
    """직무·회사·페르소나 맞춤 모의 면접 질문을 생성한다(선택적으로 내 자료 기반).

    Args:
        job_title: 지원 직무.
        company: 지원 회사(선택).
        count: 질문 개수.
        persona: 면접관 유형(일반/압박/인성/직무/임원).
        materials: 내 자소서·경험·스펙 텍스트 리스트(선택) — 있으면 일부 질문을 여기서 도출.
    """
    ctx = _company_context(company)
    n = max(3, min(10, int(count)))
    mat = ""
    if materials:
        joined = "\n".join(f"- {m}" for m in materials if m)[:2500]
        if joined:
            mat = f"\n[지원자 자료(자소서/경험/스펙)]\n{joined}\n(이 중 일부는 자료에 근거한 검증 질문으로 만드세요.)"
    prompt = f"""당신은 한국 기업 면접관입니다. 페르소나: {_persona_line(persona)}
아래 지원자를 위한 모의 면접 질문 {n}개를 만드세요.

[지원 직무] {job_title}
[지원 회사] {company or '(미지정)'}
{('[회사 컨텍스트] ' + ctx) if ctx else ''}{mat}

규칙:
- 페르소나 성격이 드러나는 질문으로. 인성/지원동기와 직무 전문성을 섞되, 회사 정보가 있으면 회사 맞춤 질문 1~2개 포함.
- 실제 면접에서 나올 법한 구체적 질문으로.
- 반드시 JSON 배열로만 출력(설명 금지): ["질문1", "질문2", ...]"""
    raw = agent.quick_complete(prompt).strip()
    return {"questions": _parse_list(raw, n), "company_context": ctx, "persona": persona}


def questions_from_materials(materials, job_title: str = "", count: int = 5) -> dict:
    """내 자소서·이력·스펙 텍스트를 기반으로 '나올 법한' 면접 질문을 생성한다(자소서 기반 면접 대비)."""
    n = max(3, min(10, int(count)))
    joined = "\n".join(f"- {m}" for m in (materials or []) if m)[:3000]
    if not joined.strip():
        return {"questions": [], "note": "자료(자소서/경험/스펙)가 없습니다. 자소서나 경험을 먼저 저장하세요."}
    prompt = f"""당신은 지원자의 서류(자소서·이력서·스펙)를 읽은 면접관입니다.
아래 자료를 근거로, 실제 면접에서 '이 지원자에게' 물어볼 법한 질문 {n}개를 만드세요.

[지원 직무] {job_title or '(미지정)'}
[지원자 자료]
{joined}

규칙:
- 자료에 적힌 경험/수치/주장을 구체적으로 검증·심화하는 질문(예: "X 프로젝트에서 본인의 기여는?", "Y 자격증을 실무에 어떻게 쓸 건가요?").
- 과장·모순이 의심되면 확인하는 질문도 포함.
- 반드시 JSON 배열로만 출력: ["질문1", ...]"""
    return {"questions": _parse_list(agent.quick_complete(prompt).strip(), n)}


def generate_followup(question: str, answer: str, job_title: str = "", persona: str = "압박") -> dict:
    """직전 답변을 듣고 면접관이 이어서 던질 '꼬리질문' 1개를 생성한다(페르소나 반영).

    압박 면접 대비: 답변의 약한 고리(추상성·근거부족·수치없음·모순·본인 기여 불명확)를
    정확히 찾아 구체적으로 파고드는 한 방 질문을 만든다.
    """
    if not (answer or "").strip():
        return {"followup": ""}
    prompt = f"""당신은 면접관입니다. 페르소나: {_persona_line(persona)}
아래 지원자의 답변을 듣고, 실제 면접에서 이어서 던질 '꼬리질문' 1개를 만드세요.

[직무] {job_title or '(미지정)'}
[원질문] {question}
[지원자 답변] {answer}

꼬리질문 원칙:
- 답변에서 가장 약한 지점을 1개 골라 파고든다: ① 추상적/뜬구름 → 구체 사례·수치 요구 ② "팀이 했다" → 본인의 구체적 기여 ③ 결과만 있고 과정 없음 → 어떻게 했는지 ④ 근거 없는 주장 → 근거/데이터 ⑤ 모순/과장 → 사실 확인.
- 실제로 답하기 까다로운, 그러나 공정한 질문으로.
- 질문 1개만 출력(설명·번호·따옴표 없이)."""
    return {"followup": agent.quick_complete(prompt).strip().strip('"')}


def session_report(qa_list, job_title: str = "") -> dict:
    """면접 세션 전체(여러 질문-답변)를 종합 평가한 리포트를 생성한다."""
    items = [x for x in (qa_list or []) if (x.get("answer") or "").strip()]
    if not items:
        return {"report": "평가할 답변이 없습니다. 먼저 질문에 답해보세요."}
    body = "\n\n".join(f"[Q{i+1}] {x.get('question')}\n[A] {x.get('answer')}"
                       + (f"\n[전달력] 긴장도 {x['delivery'].get('tensionScore')}/100, "
                          f"말속도 {x['delivery'].get('charsPerSec')}자/초" if x.get("delivery") else "")
                       for i, x in enumerate(items))[:6000]
    prompt = f"""당신은 면접 코치입니다. 아래 모의 면접 전체를 종합 평가하세요.

[지원 직무] {job_title or '(미지정)'}
[질문-답변 기록]
{body}

마크다운으로:
## 종합 점수 (100점 만점)
## 전반적 강점 (2~3가지)
## 공통적으로 개선할 점 (2~3가지)
## 답변별 한줄 코멘트
## 다음 연습 추천 (구체적으로)

규칙: 내용(논리·구체성·직무적합)과 전달력(긴장도·속도)을 함께 본다. 솔직하되 건설적으로."""
    return {"report": agent.quick_complete(prompt).strip(), "count": len(items)}


def _parse_list(raw: str, n: int):
    """LLM 응답에서 질문 리스트를 견고하게 추출(JSON 우선, 실패 시 줄 단위)."""
    m = re.search(r"\[.*\]", raw, re.S)
    if m:
        try:
            arr = json.loads(m.group(0))
            qs = [str(x).strip() for x in arr if str(x).strip()]
            if qs:
                return qs[:n]
        except Exception:
            pass
    # 폴백: 번호/불릿 줄 파싱
    lines = []
    for ln in raw.splitlines():
        ln = re.sub(r"^\s*(\d+[\.\)]|[-*•])\s*", "", ln).strip().strip('",')
        if len(ln) > 5:
            lines.append(ln)
    return lines[:n] if lines else [raw[:200]]


def evaluate_answer(question: str, answer: str, job_title: str = "", persona: str = "일반") -> dict:
    """면접 답변을 평가하고 피드백을 준다(면접관 페르소나 반영).

    Args:
        question: 면접 질문.
        answer: 지원자 답변(음성→STT 텍스트 포함).
        job_title: 지원 직무(선택).
        persona: 면접관 유형(일반/압박/인성/직무/임원).

    Returns:
        {"feedback": "...(마크다운)"}
    """
    if not (answer or "").strip():
        return {"feedback": "답변이 비어 있습니다. 음성 인식이 안 됐다면 다시 녹음하거나 직접 입력해 주세요."}
    prompt = f"""당신은 한국 기업 면접관이자 코치입니다. 페르소나: {_persona_line(persona)}
아래 답변을 그 페르소나의 시선으로 평가하세요.

[지원 직무] {job_title or '(미지정)'}
[질문] {question}
[지원자 답변] {answer}

다음 형식(마크다운)으로:
## 점수 (5점 만점)
## 좋았던 점 (1~2가지)
## 개선할 점 (2~3가지, 구체적으로)
## 더 좋은 답변 구성 (STAR 기법 기반 핵심 포인트 3가지)

규칙: 두괄식/구체성/직무연관성/논리/진정성을 본다. 답변이 짧거나 추상적이면 솔직히 지적하되 어떻게 보완할지 알려준다. 200~400자."""
    return {"feedback": agent.quick_complete(prompt).strip()}
