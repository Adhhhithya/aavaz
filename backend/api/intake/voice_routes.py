"""
backend/api/intake/voice_routes.py

Backend endpoint called by the voice-agent bridge (aavaz_bridge.py) for
every completed voice turn.

POST /api/v1/intake/voice/turn
  - Receives: session_id, user_text, victim_id, case_id, language, channel,
              optional audio_b64 (base64-encoded PCM/WAV for acoustic analysis)
  - Runs: full Supervisor pipeline (Triage + Legal + Memory + Escalation +
          Distress + Empathy)
  - Returns: reply, distress_score, risk_level, emotion_tag, escalated,
             intervention

This endpoint has no victim auth middleware (the voice-agent is a trusted
internal service; the victim session is established at WebSocket connect time
by the mobile app, not re-validated per turn here). Protect via network-level
firewall or shared service secret in production.
"""
from __future__ import annotations

import base64
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.agents.supervisor import new_conversation, execute_turn

logger = logging.getLogger(__name__)
router = APIRouter()


class VoiceTurnRequest(BaseModel):
    session_id: str
    user_text: str
    victim_id: Optional[str] = None
    case_id: Optional[str] = None
    language: str = "en"
    channel: str = "voice"
    audio_b64: Optional[str] = None   # base64-encoded PCM/WAV


class VoiceTurnResponse(BaseModel):
    reply: str
    distress_score: float
    risk_level: str
    emotion_tag: str
    escalated: bool
    intervention: str


# In-memory conversation state cache keyed by session_id.
# In production this should be Redis/Supabase; for this milestone it provides
# continuity across turns within a single voice session.
_session_states: dict = {}
_MAX_SESSIONS = 500


@router.post("/turn", response_model=VoiceTurnResponse)
async def voice_turn(payload: VoiceTurnRequest) -> VoiceTurnResponse:
    """
    Process a single voice turn through the full AAVAZ Supervisor pipeline.
    Called by the voice-agent bridge approximately once per utterance.
    """
    # Decode audio bytes if provided
    audio_bytes: Optional[bytes] = None
    if payload.audio_b64:
        try:
            audio_bytes = base64.b64decode(payload.audio_b64)
        except Exception as exc:
            logger.warning("Invalid audio_b64 in voice turn: %s", exc)

    # Retrieve or create conversation state for this session
    state = _session_states.get(payload.session_id)
    if state is None:
        state = new_conversation(
            victim_id=payload.victim_id,
            case_id=payload.case_id,
            language=payload.language,
            channel="voice",
        )
        # Evict oldest if over cap
        if len(_session_states) >= _MAX_SESSIONS:
            oldest_key = next(iter(_session_states))
            del _session_states[oldest_key]
        _session_states[payload.session_id] = state

    # Update identity in state if provided for the first time
    if payload.victim_id and not state.victim_id:
        state.victim_id = payload.victim_id
    if payload.case_id and not state.case_id:
        state.case_id = payload.case_id

    # Run the full Supervisor pipeline
    try:
        state, reply = await execute_turn(
            state=state,
            user_text=payload.user_text
        )
        _session_states[payload.session_id] = state
    except Exception as exc:
        logger.error("Voice turn supervisor error: %s", exc)
        return VoiceTurnResponse(
            reply="I'm here with you. If you need urgent help please press the SOS button or call 112.",
            distress_score=0.0,
            risk_level="unknown",
            emotion_tag="neutral",
            escalated=False,
            intervention="none",
        )

    distress = state.distress
    return VoiceTurnResponse(
        reply=reply,
        distress_score=distress.distress_score if distress else 0.0,
        risk_level=distress.risk_level.value.lower() if distress else "low",
        emotion_tag=distress.emotion_tag.value if distress else "neutral",
        escalated=bool(state.escalation),
        intervention=distress.intervention.value if distress else "none",
    )


@router.delete("/session/{session_id}")
async def end_voice_session(session_id: str):
    """Clean up voice session state on disconnect."""
    _session_states.pop(session_id, None)
    return {"status": "ok"}
