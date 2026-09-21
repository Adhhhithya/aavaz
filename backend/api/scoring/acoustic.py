"""
backend/api/scoring/acoustic.py

Thin adapter wrapping backend/services/acoustic_extractor.py for use
inside the scoring pipeline.

Why this layer exists: ivr_webhook.py, chatbot_routes.py, and other intake
routes pass either an audio URL (Bolna/Supabase recording) or raw audio bytes
(WebSocket stream). This module normalises both paths into a single
(score, confidence, features, signals) tuple consumed by fusion.py.
"""
from __future__ import annotations

import logging
from typing import Optional

from models.contracts import AcousticFeatures
from services.acoustic_extractor import (
    extract_from_url,
    extract_from_bytes,
    acoustic_features_to_score,
)

logger = logging.getLogger(__name__)


async def analyze_acoustic_features(
    audio_url: Optional[str] = None,
    audio_bytes: Optional[bytes] = None,
) -> dict:
    """
    Primary entry point for acoustic analysis in the scoring pipeline.

    Accepts either:
      - audio_url  : URL to a remote audio file (Bolna recording, Supabase Storage)
      - audio_bytes: Raw bytes from a WebSocket voice stream

    Returns a dict compatible with fusion.py:
      {
        "score": float [0-100] or None if extraction fully failed,
        "confidence": float [0-1],
        "features": AcousticFeatures,
        "signals": list[str],
        "notes": str,
      }
    """
    features: AcousticFeatures

    if audio_bytes is not None:
        logger.info("Acoustic extraction from raw bytes (%d B)", len(audio_bytes))
        features = await extract_from_bytes(audio_bytes)
    elif audio_url:
        logger.info("Acoustic extraction from URL: %s", audio_url[:80])
        features = await extract_from_url(audio_url)
    else:
        logger.debug("No audio provided to acoustic analyser - returning null result")
        return {
            "score": None,
            "confidence": 0.0,
            "features": AcousticFeatures(extraction_error="no audio provided"),
            "signals": [],
            "notes": "No audio provided",
        }

    if features.extraction_error:
        logger.warning("Acoustic extraction error: %s", features.extraction_error)
        return {
            "score": None,
            "confidence": 0.0,
            "features": features,
            "signals": [],
            "notes": f"Extraction error: {features.extraction_error}",
        }

    score, confidence, signals = acoustic_features_to_score(features)
    notes_parts = []
    if features.pitch_std is not None:
        notes_parts.append(f"pitch_std={features.pitch_std:.1f}Hz")
    if features.jitter is not None:
        notes_parts.append(f"jitter={features.jitter:.4f}")
    if features.pause_ratio is not None:
        notes_parts.append(f"pause_ratio={features.pause_ratio:.2f}")

    return {
        "score": score,
        "confidence": confidence,
        "features": features,
        "signals": signals,
        "notes": "; ".join(notes_parts) if notes_parts else "normal acoustic baseline",
    }
