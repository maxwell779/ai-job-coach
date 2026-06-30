# -*- coding: utf-8 -*-
"""자소서(자기소개서) 작성·첨삭 — LLM 기반. 회사 정보(DART)로 문맥을 보강한다."""
import agent
import tools
import rag


def _company_context(company: str) -> str:
    """회사명이 주어지면 DART 기업개황 + 최근 뉴스로 짧은 컨텍스트를 만든다(있으면)."""
    if not company:
        return ""
    parts = []
    ov = tools.get_company_overview(company)
    if not ov.get("error"):
        parts.append(f"[회사정보] {ov.get('corp_name')} | 대표 {ov.get('ceo')} | "
                     f"설립 {ov.get('established')} | {ov.get('corp_class')}")
    news = tools.get_naver_news(ov.get("corp_name", company), display=4)
    if news.get("news"):
        titles = " / ".join(n["title"] for n in news["news"][:4])
        parts.append(f"[최근 뉴스] {titles}")
    return "\n".join(parts)


def draft_resume(company: str, job_title: str, experience: str,
                 strengths: str = "", question: str = "", materials=None) -> dict:
    """자소서 초안을 생성한다(회사·직무 맞춤, 내 자료 RAG 반영).

    Args:
        company: 지원 회사명(선택, DART로 문맥 보강).
        job_title: 지원 직무.
        experience: 내 경험/프로젝트/역량(자유 서술).
        strengths: 강조하고 싶은 강점(선택).
        question: 자소서 문항. 없으면 일반 지원동기.
        materials: 내 저장 자료(경험·스펙) 텍스트 리스트 — 문항과 관련된 것만 RAG로 골라 반영.

    Returns:
        {"draft": "...", "context_used": "...", "used_materials": [...]}
    """
    ctx = _company_context(company)
    q = question.strip() or "지원 동기와 입사 후 포부"
    used = []
    mat_block = ""
    if materials:
        docs = [{"id": i, "text": m} for i, m in enumerate(materials) if m]
        top = rag.rank(f"{job_title} {q}", docs, top_k=3)
        used = [t["text"] for t in top if t.get("score", 0) > 0]
        if used:
            mat_block = "\n[참고할 내 경험·스펙(관련 높은 순)]\n" + "\n".join(f"- {u}" for u in used)
    prompt = f"""당신은 한국 취업 자기소개서 코치입니다. 아래 정보로 자소서 항목 1개의 초안을 작성하세요.

[지원 회사] {company or '(미지정)'}
[지원 직무] {job_title}
[자소서 문항] {q}
[지원자 경험/역량]
{experience}
[강조할 강점] {strengths or '(지정 안 함)'}{mat_block}
{ctx}

작성 규칙:
- 한국어, 600~900자. 두괄식(결론 먼저)으로.
- 구체적 경험·수치·행동(STAR: 상황-과제-행동-결과)을 활용해 진정성 있게.
- 회사 정보가 주어졌다면 회사/직무와 자연스럽게 연결(없는 사실은 지어내지 말 것).
- 추상적 미사여구·과장·거짓 금지. 거짓 경력은 절대 만들지 말 것.
- 결과만 출력(설명/머리말 없이 자소서 본문만)."""
    return {"draft": agent.quick_complete(prompt).strip(), "context_used": ctx, "used_materials": used}


def result_pattern(passed=None, failed=None, specs=None) -> dict:
    """합격/통과한 자소서와 불합격 자소서, 내 스펙·경험을 비교해 '통하는 패턴'을 분석한다."""
    passed = [p for p in (passed or []) if p]
    failed = [f for f in (failed or []) if f]
    specs = [s for s in (specs or []) if s]
    if not passed and not failed:
        return {"pattern": "결과(서류합격/면접/최종합격/불합격)를 기록한 자소서가 있어야 분석할 수 있어요. 내 자소서에서 결과를 먼저 선택해 주세요."}
    P = "\n---\n".join(passed)[:4000]
    F = "\n---\n".join(failed)[:2500]
    S = "\n".join(f"- {s}" for s in specs)[:1500]
    prompt = f"""당신은 채용 데이터 분석가이자 자소서 코치입니다. 지원자의 합격/불합격 이력과 스펙을 비교해 '무엇이 통했는지' 분석하세요.

[서류 이상 통과한 자소서]
{P or '(없음)'}
[불합격 자소서]
{F or '(없음)'}
[내 스펙·경험]
{S or '(없음)'}

마크다운으로:
## 통하는 패턴 (합격 자소서·스펙의 공통 강점)
## 불합격과의 차이 (있다면)
## 내 스펙 중 가장 잘 먹힌 것 / 덜 활용된 것
## 다음 지원에 강화할 전략 (구체적으로 2~3가지)

규칙: 표본이 적으면 단정하지 말고 '경향'으로 표현. 데이터에 있는 것만 근거로."""
    return {"pattern": agent.quick_complete(prompt).strip(), "n_pass": len(passed), "n_fail": len(failed)}


def review_resume(text: str, job_title: str = "") -> dict:
    """작성한 자소서를 첨삭한다(강점·약점·문항별 개선·표현).

    Args:
        text: 첨삭받을 자소서 본문.
        job_title: 지원 직무(선택, 맥락).

    Returns:
        {"review": "...(마크다운 피드백)"}
    """
    prompt = f"""당신은 한국 대기업/공공기관 채용 자소서를 첨삭하는 전문 코치입니다.
아래 자소서를 평가하고 구체적으로 첨삭하세요.

[지원 직무] {job_title or '(미지정)'}
[자소서 본문]
{text}

다음 형식(마크다운)으로 답하세요:
## 총평 (100자 내외 + 5점 만점 점수)
## 잘된 점 (3가지, 근거와 함께)
## 개선할 점 (3~5가지, '왜'와 '어떻게'를 구체적으로)
## 문장 다듬기 예시 (원문 → 수정안 2~3개)
## 추가하면 좋을 내용

규칙: 과장·추상 표현, 진부한 클리셰, 구체성 부족, 두괄식 여부, 직무 적합성을 중점적으로 본다. 솔직하되 건설적으로."""
    return {"review": agent.quick_complete(prompt).strip()}
