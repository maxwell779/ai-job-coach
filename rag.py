# -*- coding: utf-8 -*-
"""
경량 RAG — 사용자가 브라우저에 저장한 자료(경험·자소서·스펙)를 그때그때 받아
질의와의 의미 유사도로 순위를 매긴다. 영속 DB 없이 stateless로 동작.

- 임베딩: LLM_PROVIDER에 따라 GitHub(text-embedding-3-small) 또는 Gemini(gemini-embedding-001).
- 임베딩 실패(키/한도/네트워크) 시 한국어 키워드 겹침 기반 폴백으로 자동 강등 → 항상 결과를 준다.
"""
import os
import re
import math


def _provider():
    return os.environ.get("LLM_PROVIDER", "gemini").lower()


def embed(texts):
    """텍스트 리스트 → 임베딩 벡터 리스트. 실패 시 None."""
    texts = [t if t else " " for t in texts]
    if not texts:
        return []
    try:
        if _provider() == "github":
            import llm_github
            c = llm_github.build_client()
            model = os.environ.get("EMBED_MODEL", "text-embedding-3-small")
            r = c.embeddings.create(model=model, input=texts)
            return [d.embedding for d in r.data]
        else:
            from google import genai
            client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY", ""))
            out = []
            for t in texts:
                r = client.models.embed_content(model="gemini-embedding-001", contents=t)
                emb = r.embeddings[0].values if hasattr(r, "embeddings") else r.embedding.values
                out.append(list(emb))
            return out
    except Exception:
        return None


def _cosine(a, b):
    s = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return s / (na * nb) if na and nb else 0.0


def _tokens(s):
    return set(re.findall(r"[0-9a-zA-Z가-힣]{2,}", (s or "").lower()))


def _keyword_score(query, text):
    q, t = _tokens(query), _tokens(text)
    if not q or not t:
        return 0.0
    return len(q & t) / len(q)


def rank(query, docs, top_k=5):
    """docs=[{"id","text",...}] 를 query와의 유사도로 정렬해 상위 top_k 반환(score 포함).

    임베딩 가능하면 코사인 유사도, 아니면 키워드 겹침으로 폴백.
    """
    docs = [d for d in docs if (d.get("text") or "").strip()]
    if not docs:
        return []
    texts = [d["text"] for d in docs]
    vecs = embed([query] + texts)
    scored = []
    if vecs and len(vecs) == len(texts) + 1:
        qv = vecs[0]
        for d, v in zip(docs, vecs[1:]):
            scored.append({**d, "score": round(_cosine(qv, v), 4), "method": "embedding"})
    else:  # 폴백
        for d in docs:
            scored.append({**d, "score": round(_keyword_score(query, d["text"]), 4), "method": "keyword"})
    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:top_k]
