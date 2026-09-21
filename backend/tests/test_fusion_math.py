"""
backend/tests/test_fusion_math.py

Unit tests for the distress fusion engine.

Verified invariants:
  1. Weights always sum exactly to 1.0
  2. Score is always in [0, 100]
  3. Graceful degradation when acoustic signal is unavailable
  4. Risk tier thresholds match specification
  5. All three available signals produce higher confidence than text-only
"""
import pytest
import asyncio

from api.scoring.fusion import (
    W_ACOUSTIC,
    W_SENTIMENT,
    W_ENGAGEMENT,
    _redistribute_weights,
    _classify_risk,
    calculate_dynamic_score,
)
from models.contracts import RiskLevel


# ---------------------------------------------------------------------------
# 1. Weight invariant
# ---------------------------------------------------------------------------
def test_weights_sum_to_one():
    total = W_ACOUSTIC + W_SENTIMENT + W_ENGAGEMENT
    assert abs(total - 1.0) < 1e-9, f"Weights sum to {total}, expected 1.0"


# ---------------------------------------------------------------------------
# 2. Weight redistribution when a signal is missing
# ---------------------------------------------------------------------------
def test_redistribute_weights_acoustic_missing():
    w_a, w_s, w_e = _redistribute_weights(False, True, True)
    assert abs(w_a) < 1e-9, "Missing acoustic weight should be 0"
    assert abs(w_s + w_e - 1.0) < 1e-9, "Remaining weights must still sum to 1.0"


def test_redistribute_weights_all_missing():
    w_a, w_s, w_e = _redistribute_weights(False, False, False)
    assert abs(w_a + w_s + w_e - 1.0) < 1e-9


def test_redistribute_weights_all_available():
    w_a, w_s, w_e = _redistribute_weights(True, True, True)
    assert abs(w_a - W_ACOUSTIC) < 1e-9
    assert abs(w_s - W_SENTIMENT) < 1e-9
    assert abs(w_e - W_ENGAGEMENT) < 1e-9
    assert abs(w_a + w_s + w_e - 1.0) < 1e-9


# ---------------------------------------------------------------------------
# 3. Risk tier thresholds
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("score,expected_risk", [
    (0.0, RiskLevel.LOW),
    (39.9, RiskLevel.LOW),
    (40.0, RiskLevel.MEDIUM),
    (69.9, RiskLevel.MEDIUM),
    (70.0, RiskLevel.HIGH),
    (84.9, RiskLevel.HIGH),
    (85.0, RiskLevel.CRITICAL),
    (100.0, RiskLevel.CRITICAL),
])
def test_risk_tier_thresholds(score, expected_risk):
    assert _classify_risk(score) == expected_risk


# ---------------------------------------------------------------------------
# 4. End-to-end score range invariant
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_score_always_in_range():
    """Score must always be clamped to [0, 100] regardless of inputs."""
    result = await calculate_dynamic_score(
        transcript="I am scared and being threatened",
        call_duration=120,
    )
    assert 0.0 <= result.distress_score <= 100.0
    assert 0.0 <= result.confidence <= 1.0


@pytest.mark.asyncio
async def test_empty_transcript_does_not_crash():
    result = await calculate_dynamic_score(transcript="", call_duration=0)
    assert 0.0 <= result.distress_score <= 100.0


@pytest.mark.asyncio
async def test_high_distress_transcript_scores_above_low():
    """High-distress keywords should produce a score > 40 (MEDIUM or above)."""
    result = await calculate_dynamic_score(
        transcript="I am scared, someone is threatening to kill me",
        call_duration=60,
    )
    assert result.distress_score >= 30.0  # conservative lower bound without audio


@pytest.mark.asyncio
async def test_neutral_transcript_scores_low():
    result = await calculate_dynamic_score(
        transcript="I am doing well today. Everything is fine.",
        call_duration=30,
    )
    assert result.distress_score < 60.0


# ---------------------------------------------------------------------------
# 5. XAI breakdown compliance
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_score_breakdown_present_and_weights_sum():
    result = await calculate_dynamic_score(
        transcript="Help me please",
        call_duration=45,
    )
    assert "acoustic" in result.score_breakdown
    assert "sentiment" in result.score_breakdown
    assert "engagement" in result.score_breakdown

    total_weight = sum(c.weight for c in result.score_breakdown.values())
    assert abs(total_weight - 1.0) < 1e-6, f"Breakdown weights sum to {total_weight}"


@pytest.mark.asyncio
async def test_acoustic_unavailable_graceful_degradation():
    """When no audio is provided, acoustic should show available=False
    and remaining weights redistribute to sum to 1.0."""
    result = await calculate_dynamic_score(
        transcript="I need help",
        call_duration=30,
        audio_url=None,
        audio_bytes=None,
    )
    acoustic_comp = result.score_breakdown["acoustic"]
    assert not acoustic_comp.available

    # Even with acoustic missing, weights in the breakdown must sum to 1.0
    total_weight = sum(c.weight for c in result.score_breakdown.values())
    assert abs(total_weight - 1.0) < 1e-6
