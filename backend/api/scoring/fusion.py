"""
backend/api/scoring/fusion.py

Multimodal distress fusion engine.

Fuses three independent signals into a single explainable distress score:

  Final Score = w_a * D_acoustic + w_s * D_sentiment + w_e * D_engagement

Weights (configurable):
  w_acoustic   = 0.40  (vocal stress: pitch, jitter, shimmer, pauses)
  w_sentiment  = 0.40  (NLP: emotion tags, distress language)
  w_engagement = 0.20  (disengagement: missed check-ins, silence)

Invariants enforced:
  - Weights always sum to 1.0 (unit-tested in tests/test_fusion_math.py)
  - A failed/missing signal degrades gracefully: its weight is redistributed
    proportionally among the remaining available signals.
  - Every output carries a score_breakdown dict for XAI compliance.

The LLM-based case categorisation (case_type, intervention) is now driven by
the grounded AAVAZ prompt in services/llm_parser.py rather than keyword
matching. This function only computes the numeric score and classification tier.
"""
from __future__ import annotations

import logging
import math
from typing import Optional

from models.contracts import (
    DistressResult,
    EmotionTag,
    InterventionType,
    RiskLevel,
    ScoreComponent,
)
from .acoustic import analyze_acoustic_features
from .sentiment_emotion import analyze_sentiment_and_emotion
from .engagement import calculate_engagement_score
from .pii_redactor import PIIRedactor

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Weight configuration
# These three values MUST sum to exactly 1.0. Enforced by unit tests.
# ---------------------------------------------------------------------------
W_ACOUSTIC: float = 0.40
W_SENTIMENT: float = 0.40
W_ENGAGEMENT: float = 0.20
assert abs(W_ACOUSTIC + W_SENTIMENT + W_ENGAGEMENT - 1.0) < 1e-9, (
    "Fusion weights must sum to 1.0"
)

# ---------------------------------------------------------------------------
# Thresholds for risk tier classification
# ---------------------------------------------------------------------------
_RISK_HIGH: float = 70.0
_RISK_CRITICAL: float = 85.0
_RISK_MEDIUM: float = 40.0


def _redistribute_weights(
    acoustic_available: bool,
    sentiment_available: bool,
    engagement_available: bool,
    history_available: bool = False,
) -> tuple[float, float, float]:
    """
    Redistribute weights proportionally when a signal is unavailable.
    The returned weights always sum to 1.0.

    Example: if acoustic fails (w=0.40), redistribute 0.40 proportionally
    to sentiment (0.40) and engagement (0.20):
      w_s_new = 0.40 + 0.40 * (0.40/0.60) = 0.667
      w_e_new = 0.20 + 0.40 * (0.20/0.60) = 0.333
    """
    available = {
        "acoustic": (acoustic_available, W_ACOUSTIC),
        "sentiment": (sentiment_available, W_SENTIMENT),
        "engagement": (engagement_available, W_ENGAGEMENT),
    }
    active = {k: w for k, (avail, w) in available.items() if avail}
    inactive = {k: w for k, (avail, w) in available.items() if not avail}

    total_inactive_weight = sum(inactive.values())
    total_active_weight = sum(active.values())

    if total_active_weight == 0:
        return 0.3333333333333333, 0.3333333333333333, 0.3333333333333334

    weights: dict[str, float] = {}
    for key, base_w in active.items():
        weights[key] = base_w + total_inactive_weight * (base_w / total_active_weight)
    for key in inactive:
        weights[key] = 0.0

    return (
        weights.get("acoustic", 0.0),
        weights.get("sentiment", 0.0),
        weights.get("engagement", 0.0),
    )


def _classify_risk(score: float) -> RiskLevel:
    if score >= _RISK_CRITICAL:
        return RiskLevel.CRITICAL
    if score >= _RISK_HIGH:
        return RiskLevel.HIGH
    if score >= _RISK_MEDIUM:
        return RiskLevel.MEDIUM
    return RiskLevel.LOW


def _recommend_intervention(
    risk: RiskLevel,
    emotion: EmotionTag,
    signals: list[str],
) -> InterventionType:
    """
    Rule-based intervention recommendation.
    The Triage Agent may override this in multi-agent mode.
    """
    if risk == RiskLevel.CRITICAL:
        if "witness_intimidation" in signals or emotion == EmotionTag.FEAR:
            return InterventionType.WITNESS_PROTECTION
        return InterventionType.COUNSELLING

    if risk == RiskLevel.HIGH:
        if emotion == EmotionTag.HOPELESSNESS:
            return InterventionType.MEDICAL_TREATMENT
        if emotion == EmotionTag.ANGER:
            return InterventionType.LEGAL_AID
        return InterventionType.COUNSELLING

    if risk == RiskLevel.MEDIUM:
        return InterventionType.LEGAL_AID

    return InterventionType.NONE


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

async def calculate_dynamic_score(
    transcript: str,
    call_duration: int = 0,
    audio_url: Optional[str] = None,
    audio_bytes: Optional[bytes] = None,
    missed_checkins: int = 0,
    total_checkins: int = 0,
    last_interaction_days_ago: int = 0,
    language: str = "en",
    submitter_role: str = "victim",
    history_score: float = 0.0,
) -> DistressResult:
    """
    Compute the fused distress score from acoustic, NLP, and engagement signals.

    Parameters
    ----------
    transcript            : Caller transcript text (may be empty for audio-only)
    call_duration         : Call duration in seconds (for engagement scoring)
    audio_url             : Remote URL for audio file (Bolna recording / Supabase Storage)
    audio_bytes           : Raw audio bytes (WebSocket voice stream)
    missed_checkins       : Number of missed scheduled check-ins
    total_checkins        : Total scheduled check-ins so far
    last_interaction_days_ago: Days since last engagement
    language              : ISO language code for NLP model selection
    submitter_role        : Submitter role (e.g. 'victim', 'relative'). Non-victims nullify acoustic weight.
    history_score         : Distress score carried over from case history.

    Returns
    -------
    DistressResult with score, risk_level, XAI breakdown, and intervention recommendation.
    """
    # 1. PII redaction before any LLM/logging touch
    safe_transcript = PIIRedactor.redact(transcript) if transcript else ""

    # 2. Run the three signal extractors concurrently where possible
    import asyncio

    acoustic_task = analyze_acoustic_features(
        audio_url=audio_url,
        audio_bytes=audio_bytes,
    )
    sentiment_task = analyze_sentiment_and_emotion(safe_transcript, language)
    engagement_task = calculate_engagement_score(
        missed_checkins=missed_checkins,
        total_checkins=total_checkins,
        last_interaction_days_ago=last_interaction_days_ago,
    )

    acoustic_result, sentiment_result, engagement_result = await asyncio.gather(
        acoustic_task, sentiment_task, engagement_task
    )

    # 3. Determine signal availability with NaN guards
    acoustic_score = acoustic_result.get("score")
    if acoustic_score is not None and math.isnan(acoustic_score):
        acoustic_score = None
        
    sentiment_score: float = sentiment_result.get("sentiment_score", 0.0)
    if sentiment_score is None or math.isnan(sentiment_score):
        sentiment_score = 0.0
        
    engagement_score: float = engagement_result.get("engagement_score", 0.0)
    if engagement_score is None or math.isnan(engagement_score):
        engagement_score = 0.0

    acoustic_available = acoustic_score is not None
    sentiment_available = True
    engagement_available = True

    # Disable acoustic if it's not the victim (relatives' voice doesn't measure victim's distress)
    if str(submitter_role).lower() != "victim":
        acoustic_available = False

    history_available = history_score > 0.0

    # 4. Redistribute weights if a signal is unavailable
    w_a, w_s, w_e = _redistribute_weights(
        acoustic_available, sentiment_available, engagement_available
    )

    # 5. Weighted fusion
    a_val = float(acoustic_score) if acoustic_available else 0.0
    final_score = w_a * a_val + w_s * sentiment_score + w_e * engagement_score
    if history_available:
        # Subtle adjustment for repeat trauma victims without breaking base weight invariant
        final_score = max(final_score, min(100.0, final_score * 0.9 + history_score * 0.1))
    final_score = max(0.0, min(100.0, final_score))

    # 6. Confidence: 1.0 only when all signals are available
    acoustic_conf = acoustic_result.get("confidence", 0.0) if acoustic_available else 0.0
    confidence = (
        acoustic_conf * W_ACOUSTIC + 0.9 * W_SENTIMENT + 0.9 * W_ENGAGEMENT
    )  # weighted average, bounded to 1.0
    confidence = min(confidence, 1.0) if acoustic_available else 0.7

    # 7. Emotion tag and risk classification
    emotion_tag = EmotionTag(sentiment_result.get("emotion_tag", EmotionTag.NEUTRAL))
    risk_level = _classify_risk(final_score)

    # 8. Aggregate distress signals for human-readable XAI output
    all_signals: list[str] = acoustic_result.get("signals", []).copy()
    sentiment_notes = sentiment_result.get("notes", "")
    if sentiment_notes:
        all_signals.append(sentiment_notes)
    engagement_notes = engagement_result.get("notes", "")
    if engagement_notes and engagement_score > 20:
        all_signals.append(engagement_notes)

    intervention = _recommend_intervention(risk_level, emotion_tag, all_signals)

    # 9. XAI breakdown (required for compliance)
    score_breakdown: dict[str, ScoreComponent] = {
        "acoustic": ScoreComponent(
            weight=w_a,
            raw_value=a_val,
            contribution=round(w_a * a_val, 2),
            notes=acoustic_result.get("notes", "unavailable" if not acoustic_available else ""),
            available=acoustic_available,
        ),
        "sentiment": ScoreComponent(
            weight=w_s,
            raw_value=sentiment_score,
            contribution=round(w_s * sentiment_score, 2),
            notes=sentiment_notes,
            available=True,
        ),
        "engagement": ScoreComponent(
            weight=w_e,
            raw_value=engagement_score,
            contribution=round(w_e * engagement_score, 2),
            notes=engagement_notes,
            available=True,
        ),
    }

    return DistressResult(
        distress_score=round(final_score, 2),
        confidence=round(confidence, 2),
        risk_level=risk_level,
        emotion_tag=emotion_tag,
        intervention=intervention,
        signals=all_signals,
        score_breakdown=score_breakdown,
    )


# ---------------------------------------------------------------------------
# Legacy compatibility shim
# Routes that call the old calculate_dynamic_score(transcript, call_duration)
# signature and expect a plain dict will still work until they are updated.
# ---------------------------------------------------------------------------

async def calculate_dynamic_score_legacy(
    transcript: str,
    call_duration: int = 0,
    audio_url: Optional[str] = None,
    audio_bytes: Optional[bytes] = None,
    missed_checkins: int = 0,
    total_checkins: int = 0,
    last_interaction_days_ago: int = 0,
    language: str = "en",
    **kwargs,
) -> dict:
    """
    Backward-compatible wrapper returning the original dict shape expected
    by ivr_webhook.py until that route is updated to use DistressResult.
    """
    result = await calculate_dynamic_score(
        transcript=transcript,
        call_duration=call_duration,
        audio_url=audio_url,
        audio_bytes=audio_bytes,
        missed_checkins=missed_checkins,
        total_checkins=total_checkins,
        last_interaction_days_ago=last_interaction_days_ago,
        language=language,
    )
    return {
        "final_score": result.distress_score,
        "escalation_risk": result.risk_level.value.lower(),
        "case_type": "general_inquiry",  # LLM categorisation removed from here
        "recommended_intervention": result.intervention.value,
        "reasoning": "; ".join(result.signals) or "No dominant distress signals detected.",
    }
