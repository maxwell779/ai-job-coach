# -*- coding: utf-8 -*-
"""Whisper 정확 모드(로컬 전용) — faster-whisper로 음성→텍스트. 브라우저 STT보다 정확.
HF 무료서버엔 무겁고 느려 권장하지 않음 → 설치돼 있을 때만 동작(없으면 안내 반환)."""
import os
import tempfile

_model = None
_load_error = None


def available() -> bool:
    try:
        import faster_whisper  # noqa
        return True
    except Exception:
        return False


def _get_model():
    global _model, _load_error
    if _model is not None:
        return _model
    from faster_whisper import WhisperModel
    size = os.environ.get("WHISPER_MODEL", "base")  # tiny/base/small…
    _model = WhisperModel(size, device="cpu", compute_type="int8")
    return _model


def transcribe(raw: bytes, lang: str = "ko") -> dict:
    if not available():
        return {"error": "Whisper(faster-whisper)가 설치되지 않았습니다. 로컬에서 'pip install faster-whisper' 후 사용하세요.", "available": False}
    suffix = ".webm"
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    try:
        tmp.write(raw); tmp.close()
        segs, info = _get_model().transcribe(tmp.name, language=lang, vad_filter=True, beam_size=1)
        text = " ".join(s.text.strip() for s in segs).strip()
        return {"text": text, "available": True}
    except Exception as e:
        return {"error": f"음성 인식 실패: {e}", "available": True}
    finally:
        try:
            os.remove(tmp.name)
        except Exception:
            pass
