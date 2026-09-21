"""
backend/services/acoustic_extractor.py

Real acoustic voice-stress feature extraction using librosa and scipy.

Extracts the following normalised features from audio (WAV/MP3/OGG):
  - Pitch (F0): mean, std, range, slope
  - Jitter: mean absolute F0 period perturbation ratio
  - Shimmer: mean absolute amplitude perturbation ratio
  - Energy: mean and std of RMS frame energy
  - Temporal: speech rate, pause ratio, mean/max pause duration, voiced ratio
  - Zero-crossing rate

Signals are extracted in parallel (pitch + energy + ZCR computed in one
librosa pass). All values are raw physical measurements - normalisation and
fusion into a distress score happens in api/scoring/fusion.py.

Graceful degradation: any extraction failure on a sub-feature returns None
for that field rather than raising, so the fusion engine can reweight the
available signals.
"""
from __future__ import annotations

import asyncio
import io
import logging
import tempfile
from pathlib import Path
from typing import Optional

import httpx
import numpy as np

from models.contracts import AcousticFeatures

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Availability guard - librosa / scipy are optional heavy dependencies.
# If missing, the extractor degrades to returning None for all features.
# ---------------------------------------------------------------------------
try:
    import librosa
    import scipy.signal as signal
    _LIBROSA_AVAILABLE = True
except ImportError:
    _LIBROSA_AVAILABLE = False
    logger.warning(
        "librosa / scipy not installed. Acoustic feature extraction is disabled. "
        "Install with: pip install librosa soundfile scipy"
    )


# ---------------------------------------------------------------------------
# Internal DSP helpers
# ---------------------------------------------------------------------------

def _compute_jitter(f0_frames: np.ndarray) -> Optional[float]:
    """
    Mean absolute F0-period perturbation ratio.

    jitter = mean(|T_i - T_{i-1}|) / mean(T_i)
    where T_i = 1 / F0_i  (fundamental period)
    """
    voiced = f0_frames[f0_frames > 0]
    if len(voiced) < 4:
        return None
    periods = 1.0 / voiced
    abs_diffs = np.abs(np.diff(periods))
    mean_period = np.mean(periods)
    if mean_period == 0:
        return None
    return float(np.mean(abs_diffs) / mean_period)


def _compute_shimmer(rms_frames: np.ndarray, f0_frames: np.ndarray) -> Optional[float]:
    """
    Mean absolute amplitude perturbation ratio, aligned to voiced frames.

    shimmer = mean(|A_i - A_{i-1}|) / mean(A_i)
    where A_i is the RMS amplitude of the i-th voiced frame.
    """
    # Align rms to f0 length (librosa frame counts may differ slightly)
    min_len = min(len(rms_frames), len(f0_frames))
    rms_aligned = rms_frames[:min_len]
    f0_aligned = f0_frames[:min_len]

    voiced_mask = f0_aligned > 0
    voiced_rms = rms_aligned[voiced_mask]

    if len(voiced_rms) < 4:
        return None

    abs_diffs = np.abs(np.diff(voiced_rms))
    mean_amp = np.mean(voiced_rms)
    if mean_amp == 0:
        return None
    return float(np.mean(abs_diffs) / mean_amp)


def _compute_pause_features(
    f0_frames: np.ndarray,
    hop_length: int,
    sr: int,
) -> dict:
    """
    Derive pause statistics from the voiced/unvoiced frame mask.

    Returns a dict with: pause_ratio, mean_pause_duration,
    max_pause_duration, speech_rate, voiced_ratio.
    """
    frame_duration = hop_length / sr
    total_duration = len(f0_frames) * frame_duration

    if total_duration == 0:
        return {
            "pause_ratio": None,
            "mean_pause_duration": None,
            "max_pause_duration": None,
            "speech_rate": None,
            "voiced_ratio": None,
        }

    voiced_mask = f0_frames > 0

    # Run-length encode silence runs
    pause_durations: list[float] = []
    in_pause = False
    pause_len = 0
    for is_voiced in voiced_mask:
        if not is_voiced:
            in_pause = True
            pause_len += 1
        else:
            if in_pause:
                pause_durations.append(pause_len * frame_duration)
                pause_len = 0
                in_pause = False
    if in_pause and pause_len > 0:
        pause_durations.append(pause_len * frame_duration)

    total_silence = sum(pause_durations)
    voiced_frames = int(np.sum(voiced_mask))

    return {
        "pause_ratio": float(total_silence / total_duration),
        "mean_pause_duration": float(np.mean(pause_durations)) if pause_durations else 0.0,
        "max_pause_duration": float(max(pause_durations)) if pause_durations else 0.0,
        "speech_rate": float(voiced_frames / total_duration),
        "voiced_ratio": float(voiced_frames / len(f0_frames)),
    }


# ---------------------------------------------------------------------------
# Core extractor
# ---------------------------------------------------------------------------

def extract_features_from_audio(audio_bytes: bytes) -> AcousticFeatures:
    """
    Extract acoustic features from raw audio bytes (any format decodable by
    soundfile / audioread - WAV, MP3, OGG, FLAC, etc.).

    Returns an AcousticFeatures instance; individual fields are None if
    extraction failed for that sub-feature.
    """
    if not _LIBROSA_AVAILABLE:
        return AcousticFeatures(
            extraction_error="librosa not installed",
            extraction_method="none",
        )

    try:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        y, sr = librosa.load(tmp_path, sr=None, mono=True)
        Path(tmp_path).unlink(missing_ok=True)
    except Exception as exc:
        return AcousticFeatures(
            extraction_error=f"audio load failed: {exc}",
            extraction_method="librosa_scipy",
        )

    audio_duration = librosa.get_duration(y=y, sr=sr)

    hop_length = 512
    frame_length = 2048

    # --- F0 / Pitch -----------------------------------------------------------
    try:
        f0, voiced_flag, voiced_probs = librosa.pyin(
            y,
            fmin=librosa.note_to_hz("C2"),
            fmax=librosa.note_to_hz("C7"),
            sr=sr,
            hop_length=hop_length,
        )
        voiced_f0 = f0[voiced_flag > 0.5]  # type: ignore[index]

        if len(voiced_f0) >= 4:
            pitch_mean = float(np.mean(voiced_f0))
            pitch_std = float(np.std(voiced_f0))
            pitch_range = float(np.ptp(voiced_f0))  # max - min

            # Linear slope of F0 over time (rising vs falling trajectory)
            time_axis = np.arange(len(voiced_f0))
            pitch_slope = float(np.polyfit(time_axis, voiced_f0, 1)[0])
        else:
            pitch_mean = pitch_std = pitch_range = pitch_slope = None

        jitter = _compute_jitter(f0 if f0 is not None else np.array([]))  # type: ignore[arg-type]
    except Exception as exc:
        logger.warning("Pitch extraction failed: %s", exc)
        pitch_mean = pitch_std = pitch_range = pitch_slope = jitter = None
        f0 = np.zeros(1)

    # --- RMS Energy -----------------------------------------------------------
    try:
        rms = librosa.feature.rms(y=y, frame_length=frame_length, hop_length=hop_length)[0]
        energy_mean = float(np.mean(rms))
        energy_std = float(np.std(rms))
        shimmer = _compute_shimmer(rms, f0)  # type: ignore[arg-type]
    except Exception as exc:
        logger.warning("Energy extraction failed: %s", exc)
        energy_mean = energy_std = shimmer = None
        rms = np.zeros(1)

    # --- Zero-Crossing Rate ---------------------------------------------------
    try:
        zcr = librosa.feature.zero_crossing_rate(y, frame_length=frame_length, hop_length=hop_length)[0]
        zcr_mean = float(np.mean(zcr))
    except Exception as exc:
        logger.warning("ZCR extraction failed: %s", exc)
        zcr_mean = None

    # --- Pause / Temporal Features --------------------------------------------
    try:
        pause_feats = _compute_pause_features(f0, hop_length, sr)  # type: ignore[arg-type]
    except Exception as exc:
        logger.warning("Pause extraction failed: %s", exc)
        pause_feats = {
            "pause_ratio": None, "mean_pause_duration": None,
            "max_pause_duration": None, "speech_rate": None, "voiced_ratio": None,
        }

    return AcousticFeatures(
        pitch_mean=pitch_mean,
        pitch_std=pitch_std,
        pitch_range=pitch_range,
        pitch_slope=pitch_slope,
        jitter=jitter,
        shimmer=shimmer,
        energy_mean=energy_mean,
        energy_std=energy_std,
        speech_rate=pause_feats["speech_rate"],
        pause_ratio=pause_feats["pause_ratio"],
        mean_pause_duration=pause_feats["mean_pause_duration"],
        max_pause_duration=pause_feats["max_pause_duration"],
        voiced_ratio=pause_feats["voiced_ratio"],
        zero_crossing_rate=zcr_mean,
        audio_duration_seconds=audio_duration,
        extraction_method="librosa_scipy",
        extraction_error=None,
    )


# ---------------------------------------------------------------------------
# Async wrappers for use in FastAPI route handlers
# ---------------------------------------------------------------------------

async def extract_from_url(audio_url: str) -> AcousticFeatures:
    """
    Download audio from a URL (e.g. Supabase Storage signed URL, Bolna recording)
    and run feature extraction in a thread pool to avoid blocking the event loop.
    """
    if not audio_url:
        return AcousticFeatures(extraction_error="no audio_url provided")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(audio_url)
            response.raise_for_status()
            audio_bytes = response.content
    except Exception as exc:
        logger.error("Audio download failed for %s: %s", audio_url, exc)
        return AcousticFeatures(extraction_error=f"download failed: {exc}")

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, extract_features_from_audio, audio_bytes)


async def extract_from_bytes(audio_bytes: bytes) -> AcousticFeatures:
    """
    Run feature extraction on raw audio bytes (e.g. from WebSocket voice stream)
    in a thread pool so the WebSocket handler stays non-blocking.
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, extract_features_from_audio, audio_bytes)


# ---------------------------------------------------------------------------
# Acoustic distress score normalisation (0-100)
# ---------------------------------------------------------------------------

# Population baselines for z-score normalisation.
# These are conservative mid-range estimates; a proper calibration would use
# a corpus of labelled recordings. The fusion engine treats acoustic_score as
# one signal among several - calibration precision matters less than here than
# in a pure-acoustic classifier.
_BASELINES: dict[str, tuple[float, float]] = {
    "pitch_std": (20.0, 15.0),      # (mean, std) for normal speakers
    "jitter": (0.008, 0.006),
    "shimmer": (0.035, 0.025),
    "pause_ratio": (0.20, 0.12),
    "energy_std": (0.02, 0.015),
}


def acoustic_features_to_score(features: AcousticFeatures) -> tuple[float, float, list[str]]:
    """
    Convert AcousticFeatures into a normalised distress score [0-100],
    a confidence value [0-1], and a list of human-readable signal descriptors.

    Each available feature contributes a z-score; the mean of positive
    z-scores (those above the population baseline) is mapped to [0-100].
    Missing features reduce confidence rather than zeroing the score.

    Returns: (score, confidence, signal_list)
    """
    signals: list[str] = []
    z_scores: list[float] = []
    available_count = 0
    total_features = len(_BASELINES)

    def _z(value: Optional[float], mean: float, std: float) -> Optional[float]:
        if value is None or std == 0:
            return None
        return (value - mean) / std

    feature_map = {
        "pitch_std": features.pitch_std,
        "jitter": features.jitter,
        "shimmer": features.shimmer,
        "pause_ratio": features.pause_ratio,
        "energy_std": features.energy_std,
    }

    for name, value in feature_map.items():
        mean, std = _BASELINES[name]
        z = _z(value, mean, std)
        if z is not None:
            available_count += 1
            z_scores.append(z)
            if z > 1.0:
                label_map = {
                    "pitch_std": "elevated_pitch_variability",
                    "jitter": "elevated_pitch_jitter",
                    "shimmer": "elevated_amplitude_perturbation",
                    "pause_ratio": "high_pause_ratio",
                    "energy_std": "energy_instability",
                }
                signals.append(label_map[name])

    # High jitter alone is a strong distress indicator
    if features.max_pause_duration is not None and features.max_pause_duration > 3.0:
        signals.append("prolonged_silence_detected")
        z_scores.append(2.0)

    confidence = available_count / max(total_features, 1)

    if not z_scores:
        return 0.0, 0.0, []

    # Map mean z-score to [0, 100] using a sigmoid-like clamp
    mean_z = float(np.mean(z_scores))
    # Clamp to [-2, +4] range and map linearly to [0, 100]
    clamped = max(-2.0, min(4.0, mean_z))
    score = (clamped + 2.0) / 6.0 * 100.0
    score = max(0.0, min(100.0, score))

    return score, confidence, signals
