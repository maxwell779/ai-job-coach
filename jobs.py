# -*- coding: utf-8 -*-
"""
채용공고 검색 — 고용24/워크넷 채용정보 OpenAPI (work24.go.kr, 공공·합법).

채용정보 목록 API:
  GET https://www.work24.go.kr/cm/openApi/call/wk/callOpenApiSvcInfo210L01.do
  필수: authKey, callTp=L, returnType=xml, startPage, display
  선택: keyword, region, occupation, education, career, coTp, regDate, sortOrderBy ...
응답: <wantedRoot><wanted>...</wanted></wantedRoot> (XML)
"""
import os
import xml.etree.ElementTree as ET
import requests

_URL = "https://www.work24.go.kr/cm/openApi/call/wk/callOpenApiSvcInfo210L01.do"
_URL_DTL = "https://www.work24.go.kr/cm/openApi/call/wk/callOpenApiSvcInfo210D01.do"

# ⚠️ work24 준수사항: 상세화면에 반드시 노출해야 하는 '채용정보 제공사이트로 이동' 링크 + 출처 문구
SOURCE_NOTICE = "본 자료는 고용노동부 고용24(www.work24.go.kr)에서 제공된 정보이며, 무단복제 및 배포를 금지합니다."


def work24_detail_url(wanted_auth_no: str, mobile: bool = False) -> str:
    """work24 채용정보 상세화면 URL(준수사항: '제공사이트로 이동' 버튼에 사용)."""
    host = "https://m.work24.go.kr" if mobile else "https://www.work24.go.kr"
    return (f"{host}/wk/a/b/1500/empDetailAuthView.do?wantedAuthNo={wanted_auth_no}"
            "&infoTypeCd=VALIDATION&infoTypeGroup=tb_workinfoworknet")

# 학력 코드(요청용)
EDU_CODE = {"무관": "00", "고졸": "03", "대졸2~3년": "04", "대졸4년": "05", "석사": "06", "박사": "07"}
# 경력 코드
CAREER_CODE = {"신입": "N", "경력": "E", "무관": "Z"}


def _text(el, tag):
    c = el.find(tag)
    return c.text.strip() if (c is not None and c.text) else None


def search_jobs(keyword: str = "", region: str = "", education: str = "",
                career: str = "", co_tp: str = "", reg_date: str = "",
                display: int = 20, start_page: int = 1) -> dict:
    """워크넷 채용공고를 검색한다(공공 OpenAPI).

    Args:
        keyword: 검색어(직무·기술, 예: '데이터 분석', 'AI 엔지니어').
        region: 근무지역코드(선택, 예: '11'=서울). 미입력시 전국.
        education: 학력 라벨('대졸4년','석사' 등) 또는 코드.
        career: 경력 라벨('신입','경력','무관') 또는 코드(N/E/Z).
        co_tp: 기업형태 코드(01 대기업/03 벤처/04 공공기관/05 외국계/09 청년친화강소).
        display: 출력건수(최대 100).
        start_page: 시작 페이지(1~).

    Returns:
        {"total","jobs":[{company,title,sal,region,career,edu,reg_date,close_date,url,...}]}
    """
    key = os.environ.get("WORK24_API_KEY")
    if not key:
        return {"error": "WORK24_API_KEY가 없습니다(.env).", "jobs": []}
    params = {"authKey": key, "callTp": "L", "returnType": "XML",
              "startPage": max(1, int(start_page)), "display": max(1, min(100, int(display))),
              "sortOrderBy": "DESC"}
    if keyword:
        params["keyword"] = keyword
    if region:
        params["region"] = region
    if education:
        params["education"] = EDU_CODE.get(education, education)
    if career:
        params["career"] = CAREER_CODE.get(career, career)
    if co_tp:
        params["coTp"] = co_tp
    if reg_date:
        params["regDate"] = reg_date  # D-0/D-3/W-1/W-2/M-1
    try:
        r = requests.get(_URL, params=params, timeout=20)
        r.encoding = "utf-8"
        root = ET.fromstring(r.text)
        # 에러 응답: <GO24><error>...</error></GO24>
        err = _text(root, "error") or (root.text.strip() if root.tag.upper() == "ERROR" and root.text else None)
        if err:
            hint = ""
            if "존재하지 않" in err or "서비스가" in err:
                hint = " (work24.go.kr → 오픈API → '채용정보' 활용신청·승인이 필요합니다.)"
            return {"error": f"워크넷: {err}{hint}", "jobs": []}
        msg = _text(root, "message") or _text(root, "errMsg")
        total = _text(root, "total")
        jobs = []
        for w in root.findall(".//wanted"):
            jobs.append({
                "company": _text(w, "company"),
                "title": _text(w, "title"),
                "industry": _text(w, "indTpNm"),
                "sal_type": _text(w, "salTpNm"),
                "sal": _text(w, "sal"),
                "region": _text(w, "region"),
                "career": _text(w, "career"),
                "edu_min": _text(w, "minEdubg"),
                "edu_max": _text(w, "maxEdubg"),
                "work_type": _text(w, "holidayTpNm"),
                "reg_date": _text(w, "regDt"),
                "close_date": _text(w, "closeDt"),
                "address": _text(w, "basicAddr"),
                "url": _text(w, "wantedInfoUrl"),
                "mobile_url": _text(w, "wantedMobileInfoUrl"),
                "auth_no": _text(w, "wantedAuthNo"),
            })
        if not jobs and msg:
            return {"error": f"워크넷 응답: {msg}", "jobs": []}
        return {"total": int(total) if (total and total.isdigit()) else len(jobs),
                "count": len(jobs), "jobs": jobs, "source": "고용24/워크넷"}
    except ET.ParseError:
        return {"error": "워크넷 응답 파싱 실패(인증키/파라미터 확인).", "jobs": [], "raw": r.text[:300]}
    except Exception as e:
        return {"error": f"채용공고 조회 실패: {e}", "jobs": []}


def get_job_detail(wanted_auth_no: str) -> dict:
    """채용공고 상세(고용24 210D01) — 회사규모·주요사업·직무내용·전형방법·복리후생 등 + 준수용 링크.

    Args:
        wanted_auth_no: 구인인증번호(목록의 auth_no).

    Returns:
        {"corp":{...}, "wanted":{...}, "contact":{...},
         "work24_url","work24_mobile_url","source_notice","auth_no"}
    """
    key = os.environ.get("WORK24_API_KEY")
    if not key:
        return {"error": "WORK24_API_KEY가 없습니다(.env)."}
    if not wanted_auth_no:
        return {"error": "구인인증번호(wantedAuthNo)가 필요합니다."}
    params = {"authKey": key, "callTp": "D", "returnType": "XML",
              "wantedAuthNo": wanted_auth_no, "infoSvc": "VALIDATION"}
    try:
        r = requests.get(_URL_DTL, params=params, timeout=20)
        r.encoding = "utf-8"
        root = ET.fromstring(r.text)
        err = _text(root, "error") or (root.text.strip() if root.tag.upper() == "ERROR" and root.text else None)
        if err:
            return {"error": f"워크넷: {err}"}

        def grab(parent_tag, fields):
            p = root.find(parent_tag)
            return {k: _text(p, t) for k, t in fields.items()} if p is not None else {}

        corp = grab("corpInfo", {
            "name": "corpNm", "ceo": "reperNm", "employees": "totPsncnt",
            "capital": "capitalAmt", "year_sales": "yrSalesAmt", "industry": "indTpCdNm",
            "business": "busiCont", "address": "corpAddr", "homepage": "homePg", "size": "busiSize"})
        wanted = grab("wantedInfo", {
            "title": "wantedTitle", "job": "jobsNm", "related_job": "relJobsNm",
            "job_content": "jobCont", "close_date": "receiptCloseDt", "emp_type": "empTpNm",
            "headcount": "collectPsncnt", "salary": "salTpNm", "career": "enterTpNm",
            "education": "eduNm", "foreign_lang": "forLang", "major": "major",
            "certificate": "certificate", "computer": "compAbl", "preference": "pfCond",
            "etc_preference": "etcPfCond", "select_method": "selMthd", "receipt_method": "rcptMthd",
            "submit_docs": "submitDoc", "etc_guide": "etcHopeCont", "work_region": "workRegion",
            "near_line": "nearLine", "work_hours": "workdayWorkhrCont", "four_ins": "fourIns",
            "retire_pay": "retirepay", "etc_welfare": "etcWelfare"})
        contact = grab("empchargeInfo", {
            "department": "empChargerDpt", "tel": "contactTelno", "fax": "chargerFaxNo"})
        keywords = [k.text.strip() for k in root.findall(".//keywordList/srchKeywordNm") if k.text]

        if not (corp or wanted):
            return {"error": "상세 정보를 찾지 못했습니다.", "auth_no": wanted_auth_no}
        return {"auth_no": wanted_auth_no, "corp": corp, "wanted": wanted, "contact": contact,
                "keywords": keywords,
                "work24_url": work24_detail_url(wanted_auth_no),
                "work24_mobile_url": work24_detail_url(wanted_auth_no, mobile=True),
                "source_notice": SOURCE_NOTICE, "source": "고용24"}
    except ET.ParseError:
        return {"error": "상세 응답 파싱 실패.", "raw": r.text[:300]}
    except Exception as e:
        return {"error": f"채용 상세 조회 실패: {e}"}


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    import json
    res = search_jobs(keyword="데이터 분석", display=5)
    print(json.dumps(res, ensure_ascii=False, indent=2)[:2000])
