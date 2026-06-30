# -*- coding: utf-8 -*-
"""
기업 리서치 도구 모음 — 취업/면접 관점. 전부 무료·공개 데이터(DART 전자공시·네이버 뉴스).

- 회사명 → DART corp_code 해석(상장/일부 비상장 포함)
- 기업개황(대표자·설립일·업종·주소·홈페이지)
- 연간 재무(매출·영업이익·순이익, 연결) 3개년
- 최근 정기공시(사업/반기/분기보고서) 목록 + 원문 링크
- 회사 한국어 뉴스(네이버)

각 도구는 EVIDENCE에 '무엇을·어디서' 가져왔는지 남긴다 → 답변 출처 표기.
"""
import os
import re
import io
import html
import json
import zipfile
import datetime
import xml.etree.ElementTree as ET
import requests

EVIDENCE = []  # 질문 1건마다 agent에서 clear

_DART_BASE = "https://opendart.fss.or.kr/api"
_CORP_CLS = {"Y": "유가증권(코스피)", "K": "코스닥", "N": "코넥스", "E": "기타(비상장 등)"}


# ── KRX 상장사(한글 종목명→6자리 코드) : FinanceDataReader ──
# DART corp_name이 영문(예: NAVER)인 상장사도 한글 검색되게 보강.
_KRX_NAME = None


def _krx_code(name: str):
    """한글 종목명 → 6자리 종목코드(정확/부분일치). 실패 시 None."""
    global _KRX_NAME
    qn = (name or "").replace(" ", "")
    if not qn:
        return None
    try:
        if _KRX_NAME is None:
            import FinanceDataReader as fdr
            df = fdr.StockListing("KRX")
            nc = "Name" if "Name" in df.columns else df.columns[1]
            cc = "Code" if "Code" in df.columns else df.columns[0]
            _KRX_NAME = [(str(n).replace(" ", ""), str(c).zfill(6))
                         for n, c in zip(df[nc], df[cc]) if pd_notna(n) and pd_notna(c)]
        exact = [c for n, c in _KRX_NAME if n == qn]
        if exact:
            return exact[0]
        partial = [(n, c) for n, c in _KRX_NAME if qn in n]
        if partial:
            partial.sort(key=lambda x: len(x[0]))
            return partial[0][1]
    except Exception:
        return None
    return None


def pd_notna(v):
    try:
        return v is not None and str(v) != "nan"
    except Exception:
        return False


# ── DART 회사 인덱스(이름→corp_code) ──
_CORP_INDEX = None


def _corp_index():
    """corpCode.xml(전 기업)을 1회 받아 [{corp_code,corp_name,stock_code}] 인덱스로 캐시."""
    global _CORP_INDEX
    if _CORP_INDEX is not None:
        return _CORP_INDEX
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dart_corp_index.json")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            _CORP_INDEX = json.load(f)
        return _CORP_INDEX
    key = os.environ.get("DART_API_KEY")
    _CORP_INDEX = []
    if not key:
        return _CORP_INDEX
    try:
        r = requests.get(f"{_DART_BASE}/corpCode.xml", params={"crtfc_key": key}, timeout=40)
        zf = zipfile.ZipFile(io.BytesIO(r.content))
        root = ET.fromstring(zf.read(zf.namelist()[0]))
        for el in root.iter("list"):
            _CORP_INDEX.append({
                "corp_code": (el.findtext("corp_code") or "").strip(),
                "corp_name": (el.findtext("corp_name") or "").strip(),
                "stock_code": (el.findtext("stock_code") or "").strip(),
            })
        with open(path, "w", encoding="utf-8") as f:
            json.dump(_CORP_INDEX, f, ensure_ascii=False)
    except Exception:
        pass
    return _CORP_INDEX


def resolve_company(query: str) -> dict:
    """회사명(또는 종목코드/corp_code)을 DART corp_code로 해석한다.

    Args:
        query: 회사명(예: '삼성전자', '카카오'), 6자리 종목코드, 또는 8자리 corp_code.

    Returns:
        {"corp_code","corp_name","stock_code","listed"} 또는 {"error","candidates"}.
    """
    q = (query or "").strip()
    if not q:
        return {"error": "회사명을 입력하세요."}
    # 영문/약칭으로 DART·KRX에 등록돼 한글로 안 잡히는 대표 기업 별칭
    ALIAS = {"네이버": "035420", "naver": "035420", "기아차": "000270",
             "에스케이하이닉스": "000660", "엘지전자": "066570", "엘지화학": "051910"}
    idx = _corp_index()
    al = ALIAS.get(q.replace(" ", "").lower())
    if al and idx:
        hit = next((c for c in idx if c["stock_code"] == al), None)
        if hit:
            return _resolved(hit)
    if not idx:
        return {"error": "DART_API_KEY가 없거나 기업 인덱스를 불러오지 못했습니다(.env 확인)."}
    # 8자리 corp_code 직접 입력
    if q.isdigit() and len(q) == 8:
        hit = next((c for c in idx if c["corp_code"] == q), None)
        if hit:
            return _resolved(hit)
    # 6자리 종목코드
    if q.isdigit() and len(q) == 6:
        hit = next((c for c in idx if c["stock_code"] == q), None)
        if hit:
            return _resolved(hit)
    qn = q.replace(" ", "")
    # 상장사 우선(stock_code 보유) + 정확 일치 → 부분 일치
    listed = [c for c in idx if c["stock_code"]]
    exact = [c for c in listed if c["corp_name"].replace(" ", "") == qn]
    if not exact:
        exact = [c for c in idx if c["corp_name"].replace(" ", "") == qn]
    if exact:
        return _resolved(exact[0])
    # DART corp_name이 영문인 상장사(예: NAVER)는 한글 종목명→코드(FDR)로 보강
    krx = _krx_code(q)
    if krx:
        hit = next((c for c in idx if c["stock_code"] == krx), None)
        if hit:
            return _resolved(hit)
    partial = [c for c in listed if qn in c["corp_name"].replace(" ", "")]
    if not partial:
        partial = [c for c in idx if qn in c["corp_name"].replace(" ", "")]
    if not partial:
        EVIDENCE.append({"tool": "resolve_company", "input": query, "source": "DART 기업목록", "output": "찾지 못함"})
        return {"error": f"'{query}' 회사를 DART에서 찾지 못했습니다."}
    # 상장사를 앞으로, 짧은 이름(정확도 높음) 우선
    partial.sort(key=lambda c: (c["stock_code"] == "", len(c["corp_name"])))
    best = partial[0]
    out = _resolved(best)
    if len(partial) > 1:
        out["candidates"] = [{"corp_name": c["corp_name"], "stock_code": c["stock_code"],
                              "corp_code": c["corp_code"]} for c in partial[:6]]
    return out


def _resolved(c: dict) -> dict:
    EVIDENCE.append({"tool": "resolve_company", "input": c["corp_name"], "source": "DART 기업목록",
                     "output": f"{c['corp_name']} (corp_code {c['corp_code']})"})
    return {"corp_code": c["corp_code"], "corp_name": c["corp_name"],
            "stock_code": c["stock_code"], "listed": bool(c["stock_code"])}


def _to_corp(company: str):
    """company 인자가 corp_code면 그대로, 아니면 resolve. (corp_code, name) 반환 or (None, error_dict)."""
    q = (company or "").strip()
    if q.isdigit() and len(q) == 8:
        hit = next((c for c in _corp_index() if c["corp_code"] == q), None)
        return (q, hit["corp_name"] if hit else q), None
    r = resolve_company(q)
    if r.get("error"):
        return None, r
    return (r["corp_code"], r["corp_name"]), None


def _fmt_date(s):
    s = (s or "").replace("-", "").strip()
    if len(s) == 8 and s.isdigit():
        return f"{s[:4]}.{s[4:6]}.{s[6:]}"
    return s or None


def get_company_overview(company: str) -> dict:
    """기업개황(DART): 정식명·영문명·대표자·설립일·법인구분·업종·주소·홈페이지·종목코드.

    Args:
        company: 회사명 또는 corp_code.

    Returns:
        회사 기본 정보. 취업준비생이 '이 회사가 어떤 곳인지' 파악하는 데 사용.
    """
    key = os.environ.get("DART_API_KEY")
    if not key:
        return {"error": "DART_API_KEY가 없습니다(.env)."}
    resolved, err = _to_corp(company)
    if err:
        return err
    corp_code, _ = resolved
    try:
        d = requests.get(f"{_DART_BASE}/company.json",
                         params={"crtfc_key": key, "corp_code": corp_code}, timeout=15).json()
        if d.get("status") != "000":
            return {"error": f"DART 기업개황 조회 실패: {d.get('message')}"}
        out = {
            "corp_code": corp_code,
            "corp_name": d.get("corp_name"),
            "corp_name_eng": d.get("corp_name_eng"),
            "ceo": d.get("ceo_nm"),
            "corp_class": _CORP_CLS.get(d.get("corp_cls"), d.get("corp_cls")),
            "stock_code": (d.get("stock_code") or "").strip() or None,
            "established": _fmt_date(d.get("est_dt")),
            "address": d.get("adres"),
            "homepage": d.get("hm_url"),
            "phone": d.get("phn_no"),
            "settlement_month": f"{d.get('acc_mt')}월" if d.get("acc_mt") else None,
        }
        EVIDENCE.append({"tool": "get_company_overview", "input": out["corp_name"], "source": "DART 기업개황",
                         "output": f"대표 {out['ceo']}, 설립 {out['established']}, {out['corp_class']}"})
        return out
    except Exception as e:
        return {"error": f"기업개황 조회 실패: {e}"}


def get_dart_financials(company: str) -> dict:
    """연간 매출·영업이익·순이익(연결, 최근 3개년)을 DART 전자공시에서 조회(공식·정확).

    Args:
        company: 회사명 또는 corp_code. (상장사 정기보고서 기준 — 비상장은 없을 수 있음)

    Returns:
        revenue/operating_income/net_income 연도별 + 전년대비 성장률(%). 면접 때 실적 언급에 사용.
    """
    key = os.environ.get("DART_API_KEY")
    if not key:
        return {"error": "DART_API_KEY가 없습니다(.env)."}
    resolved, err = _to_corp(company)
    if err:
        return err
    corp_code, name = resolved

    def fetch(year):
        try:
            d = requests.get(f"{_DART_BASE}/fnlttSinglAcnt.json",
                             params={"crtfc_key": key, "corp_code": corp_code,
                                     "bsns_year": str(year), "reprt_code": "11011"}, timeout=15).json()
            return d.get("list", []) if d.get("status") == "000" else None
        except Exception:
            return None

    rows = None
    for y in (datetime.date.today().year, datetime.date.today().year - 1):
        rows = fetch(y)
        if rows:
            break
    if not rows:
        return {"error": f"{name}의 DART 재무 데이터를 찾지 못했습니다(비상장이거나 미공시)."}

    def num(s):
        try:
            return int(str(s).replace(",", ""))
        except Exception:
            return None

    want = {"매출액": "revenue", "영업이익": "operating_income", "당기순이익": "net_income"}
    acc = {v: {} for v in want.values()}
    yrs = set()
    try:
        base_year = int(rows[0].get("bsns_year") or 0)
    except (TypeError, ValueError):
        base_year = 0
    if not base_year:  # 위 연도 폴백에서 성공한 연도 사용
        base_year = y
    year_for = {"thstrm_amount": base_year, "frmtrm_amount": base_year - 1, "bfefrmtrm_amount": base_year - 2}
    for it in rows:
        if it.get("fs_div") != "CFS":  # 연결재무제표
            continue
        kn = want.get(it.get("account_nm"))
        if not kn:
            continue
        for amt_key, yr in year_for.items():
            v = num(it.get(amt_key))
            if v is not None and yr:
                acc[kn][yr] = v
                yrs.add(yr)
    if not yrs:  # 연결이 없으면 개별(OFS)로 폴백
        for it in rows:
            if it.get("fs_div") != "OFS":
                continue
            kn = want.get(it.get("account_nm"))
            if not kn:
                continue
            for amt_key, yr in year_for.items():
                v = num(it.get(amt_key))
                if v is not None and yr:
                    acc[kn][yr] = v
                    yrs.add(yr)
    if not yrs:
        return {"error": f"{name} DART 재무 항목을 파싱하지 못했습니다."}
    years = sorted(yrs, reverse=True)[:3]

    def series(m):
        s = [{"year": str(y), "value": acc[m].get(y)} for y in years]
        return s if any(x["value"] is not None for x in s) else None

    def yoy(m):
        if len(years) >= 2 and acc[m].get(years[0]) and acc[m].get(years[1]):
            return round((acc[m][years[0]] / acc[m][years[1]] - 1) * 100, 1)
        return None

    out = {"corp_name": name, "unit": "원", "source": "DART(연결)",
           "revenue": series("revenue"), "revenue_yoy_pct": yoy("revenue"),
           "operating_income": series("operating_income"), "operating_income_yoy_pct": yoy("operating_income"),
           "net_income": series("net_income"), "net_income_yoy_pct": yoy("net_income")}
    EVIDENCE.append({"tool": "get_dart_financials", "input": name, "source": "DART 전자공시(연결)",
                     "output": f"매출 YoY {out['revenue_yoy_pct']}%, 영업이익 YoY {out['operating_income_yoy_pct']}%"})
    return out


def get_dart_filings(company: str, limit: int = 6) -> dict:
    """최근 DART 정기공시(사업/반기/분기보고서 등) 목록 + 원문 링크(공개 법정 공시).

    Args:
        company: 회사명 또는 corp_code.
        limit: 개수(기본 6).

    Returns:
        {"filings": [{"title","date","corp","link"}, ...]}  (최신 사업 동향 파악용)
    """
    key = os.environ.get("DART_API_KEY")
    if not key:
        return {"error": "DART_API_KEY가 없습니다.", "filings": []}
    resolved, err = _to_corp(company)
    if err:
        return err
    corp_code, name = resolved
    try:
        bgn = (datetime.date.today() - datetime.timedelta(days=540)).strftime("%Y%m%d")
        d = requests.get(f"{_DART_BASE}/list.json",
                         params={"crtfc_key": key, "corp_code": corp_code, "bgn_de": bgn,
                                 "pblntf_ty": "A", "page_count": str(limit)}, timeout=15).json()
        if d.get("status") != "000":
            return {"error": d.get("message"), "filings": []}
        out = [{"title": it.get("report_nm"), "date": _fmt_date(it.get("rcept_dt")),
                "corp": it.get("corp_name"),
                "link": f"https://dart.fss.or.kr/dsaf001/main.do?rcpNo={it.get('rcept_no')}"}
               for it in d.get("list", [])[:limit]]
        if out:
            EVIDENCE.append({"tool": "get_dart_filings", "input": name, "source": "DART 공시",
                             "output": f"{len(out)}건 (최근 {out[0]['title']})"})
        return {"filings": out}
    except Exception as e:
        return {"error": str(e), "filings": []}


def get_dart_business_overview(company: str) -> dict:
    """최신 사업보고서 본문에서 '사업의 개요'를 추출한다(이 회사가 실제로 무슨 사업을 하는지).

    Args:
        company: 회사명 또는 corp_code.

    Returns:
        {"corp_name","rcept_no","text"(사업개요 발췌, ~3000자),"link"} 또는 {"error"}.
    """
    key = os.environ.get("DART_API_KEY")
    if not key:
        return {"error": "DART_API_KEY가 없습니다."}
    resolved, err = _to_corp(company)
    if err:
        return err
    corp_code, name = resolved
    # 최신 '사업보고서' 접수번호 찾기
    try:
        bgn = (datetime.date.today() - datetime.timedelta(days=540)).strftime("%Y%m%d")
        d = requests.get(f"{_DART_BASE}/list.json",
                         params={"crtfc_key": key, "corp_code": corp_code, "bgn_de": bgn,
                                 "pblntf_ty": "A", "page_count": "30"}, timeout=15).json()
        if d.get("status") != "000":
            return {"error": f"DART 공시목록 조회 실패: {d.get('message')}"}
        rcept = None
        for it in d.get("list", []):
            nm = it.get("report_nm", "")
            if "사업보고서" in nm and "정정" not in nm:
                rcept = it.get("rcept_no"); break
        if not rcept:  # 사업보고서 없으면 반기/분기라도
            for it in d.get("list", []):
                if any(k in it.get("report_nm", "") for k in ("반기보고서", "분기보고서")):
                    rcept = it.get("rcept_no"); break
        if not rcept:
            return {"error": f"{name}의 사업/분기 보고서를 찾지 못했습니다(비상장 등)."}
    except Exception as e:
        return {"error": f"공시목록 조회 실패: {e}"}
    # 보고서 원문(zip) 받아 텍스트화 → '사업의 개요' 발췌
    try:
        r = requests.get(f"{_DART_BASE}/document.xml", params={"crtfc_key": key, "rcept_no": rcept}, timeout=30)
        zf = zipfile.ZipFile(io.BytesIO(r.content))
        # zip 안 여러 파일(본문/감사보고서/첨부) 중 '사업의 개요/내용'이 있는 본문을 찾는다
        KWS = ("사업의 개요", "사업의 내용", "회사의 개요")
        snippet = ""
        fallback = ""
        for nm in zf.namelist():
            raw = zf.read(nm)
            try:
                t = raw.decode("utf-8")
            except UnicodeDecodeError:
                t = raw.decode("cp949", errors="ignore")
            t = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", t))).strip()
            if not fallback and len(t) > 500:
                fallback = t
            for kw in KWS:
                i = t.find(kw)
                if i >= 0:
                    snippet = t[i:i + 3500]
                    break
            if snippet:
                break
        if not snippet:
            snippet = fallback[:3000]
        EVIDENCE.append({"tool": "get_dart_business_overview", "input": name, "source": "DART 사업보고서 본문",
                         "output": f"사업개요 {len(snippet)}자 발췌"})
        return {"corp_name": name, "rcept_no": rcept, "text": snippet,
                "link": f"https://dart.fss.or.kr/dsaf001/main.do?rcpNo={rcept}"}
    except Exception as e:
        return {"error": f"사업보고서 본문 처리 실패: {e}"}


def get_naver_news(query: str, display: int = 6) -> dict:
    """네이버 뉴스 검색 API로 회사 관련 한국어 최신 뉴스를 조회한다.

    Args:
        query: 검색어(회사명 권장).
        display: 개수(기본 6).

    Returns:
        {"news": [{"title","publisher","link"}, ...]}
    """
    cid, csec = os.environ.get("NAVER_CLIENT_ID"), os.environ.get("NAVER_CLIENT_SECRET")
    if not (cid and csec):
        return {"error": "NAVER API 키가 없습니다(.env).", "news": []}
    try:
        r = requests.get("https://openapi.naver.com/v1/search/news.json",
                         params={"query": query, "display": max(1, min(100, int(display))), "sort": "date"},
                         headers={"X-Naver-Client-Id": cid, "X-Naver-Client-Secret": csec}, timeout=15)
        items = []
        for it in r.json().get("items", []):
            title = html.unescape(re.sub(r"<[^>]+>", "", it.get("title", "")))
            items.append({"title": title, "publisher": it.get("pubDate", "")[:16],
                          "link": it.get("originallink") or it.get("link")})
        if not items:
            return {"news": [], "note": "관련 뉴스를 찾지 못했습니다."}
        for it in items:
            EVIDENCE.append({"tool": "get_naver_news", "input": query, "source": "네이버 뉴스",
                             "output": it["title"], "link": it["link"]})
        return {"news": items}
    except Exception as e:
        return {"error": f"네이버 뉴스 조회 실패: {e}", "news": []}


# 기업 리서치 챗(에이전트)이 자율 호출하는 도구
TOOLS = [resolve_company, get_company_overview, get_dart_financials, get_dart_filings, get_naver_news]
