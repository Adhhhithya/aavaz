"""
voice-agent/app/aavaz_bridge.py

Bridge between the voice-agent pipeline and the AAVAZ backend.

This module is the ONLY file in the voice-agent codebase that reaches out to
the backend. It keeps the voice-agent repository clean and unaware of backend
internals -- all AAVAZ business logic stays in `backend/`.

Responsibilities:
  1. Report each completed turn (transcript + PCM audio) to the backend
     Supervisor via HTTP POST.
  2. Receive back the enriched response text (after distress scoring +
     multi-agent pipeline), distress score, risk level, and escalation state.
  3. On CRITICAL risk, inject an emergency instruction into the TTS pipeline
     before the normal agent reply.

Integration points in ws.py / pipeline.py:
  - ws.py calls bridge.report_turn() after ASR produces a transcript.
  - pipeline.py uses bridge.ResponseEnvelope.reply as the LLM seed if it
    is provided, skipping the LLM call for that turn (backend drove it).
    For voice channels where the backend drives the response, the LLM in the
    voice-agent acts as a TTS text formatter only (short sentences, no
    markdown), not as the decision-maker.

The bridge degrades gracefully: if the backend is unreachable, report_turn()
returns None and the voice-agent falls back to its own LLM-driven path.
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from typing import Optional

import httpx

log = logging.getLogger(__name__)

BACKEND_BASE_URL: str = os.getenv("BACKEND_URL", "http://localhost:8000")
BRIDGE_TIMEOUT: float = float(os.getenv("BRIDGE_TIMEOUT_S", "8.0"))
BRIDGE_ENABLED: bool = os.getenv("BRIDGE_ENABLED", "true").lower() in ("1", "true", "yes")


@dataclass
class ResponseEnvelope:
    """
    Typed response from the backend turn endpoint.
    All fields default gracefully to None / safe values.
    """
    reply: Optional[str] = None          # Agent text to speak
    distress_score: float = 0.0
    risk_level: str = "low"
    emotion_tag: str = "neutral"
    escalated: bool = False
    intervention: str = "none"
    # True = backend handled this turn; voice-agent should use `reply` directly
    handled: bool = False


async def report_turn(
    session_id: str,
    user_text: str,
    victim_id: Optional[str] = None,
    case_id: Optional[str] = None,
    language: str = "en",
    audio_bytes: Optional[bytes] = None,
) -> Optional[ResponseEnvelope]:
    """
    POST the current turn to the backend Supervisor and return the enriched
    ResponseEnvelope, or None if the bridge is disabled or the request fails.

    The backend runs: Triage → Legal RAG → Memory → Escalation → Distress → Empathy.

    Parameters
    ----------
    session_id  : Voice-agent session id (for logging only; not used for auth)
    user_text   : ASR transcript of the user's utterance
    victim_id   : Backend victim UUID (obtained from the mobile app JWT on connect)
    case_id     : Backend case UUID (from the pre-call context endpoint)
    language    : ISO language code from ASR detection
    audio_bytes : Raw PCM bytes for acoustic analysis (optional; large payloads
                  may be skipped to keep latency under 500ms)
    """
    if not BRIDGE_ENABLED:
        return None

    payload: dict = {
        "session_id": session_id,
        "user_text": user_text,
        "victim_id": victim_id,
        "case_id": case_id,
        "language": language,
        "channel": "voice",
    }

    # Only send audio if small enough to not blow latency budget (< 500 KB)
    if audio_bytes and len(audio_bytes) < 500_000:
        import base64
        payload["audio_b64"] = base64.b64encode(audio_bytes).decode()

    try:
        async with httpx.AsyncClient(timeout=BRIDGE_TIMEOUT) as client:
            resp = await client.post(
                f"{BACKEND_BASE_URL}/api/v1/intake/voice/turn",
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()
            return ResponseEnvelope(
                reply=data.get("reply"),
                distress_score=float(data.get("distress_score", 0.0)),
                risk_level=data.get("risk_level", "low"),
                emotion_tag=data.get("emotion_tag", "neutral"),
                escalated=bool(data.get("escalated", False)),
                intervention=data.get("intervention", "none"),
                handled=bool(data.get("reply")),
            )
    except httpx.TimeoutException:
        log.warning("session=%s bridge timeout after %.1fs", session_id, BRIDGE_TIMEOUT)
    except httpx.HTTPStatusError as exc:
        log.warning("session=%s bridge HTTP error %d", session_id, exc.response.status_code)
    except Exception as exc:
        log.warning("session=%s bridge error: %s", session_id, exc)
    return None


def emergency_tts_prefix(risk_level: str, escalated: bool) -> Optional[str]:
    """
    Return a short TTS-safe emergency instruction to prepend to the agent
    reply when a CRITICAL escalation is detected. Returns None for non-critical.

    This is spoken BEFORE the main reply so the user hears it immediately,
    regardless of how long the empathy agent's response is.
    """
    if risk_level.upper() == "CRITICAL" or escalated:
        return (
            "I can hear that you may be in danger. Please press the red SOS button "
            "in the app right now, or call one-one-two immediately."
        )
    return None
