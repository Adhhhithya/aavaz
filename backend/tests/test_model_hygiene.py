import pytest
from datetime import datetime, timezone
from models.intake_models import BolnaDistressAssessment
from models.contracts import (
    DistressResult,
    EscalationState,
    Turn,
    RiskLevel,
    EmotionTag,
    InterventionType,
    ScoreComponent,
)

def test_bolna_distress_assessment_pydantic_v2_config():
    """Verify that BolnaDistressAssessment uses modern Pydantic V2 ConfigDict and allows extra fields."""
    assessment = BolnaDistressAssessment(
        caller_identity="Victim-1",
        estimated_distress_score=78,
        immediate_threat_detected=True,
        summary_notes="Follow-up call notes",
        custom_metadata_tag="ivr_priority_intake"  # extra field
    )
    assert assessment.caller_identity == "Victim-1"
    assert assessment.estimated_distress_score == 78
    assert assessment.immediate_threat_detected is True
    # Extra field allowed
    assert getattr(assessment, "custom_metadata_tag") == "ivr_priority_intake"


def test_contracts_datetime_utc_timezone_awareness():
    """Verify that all core contract models generate timezone-aware UTC datetimes."""
    # 1. DistressResult
    score_comp = ScoreComponent(
        weight=0.3,
        raw_value=80.0,
        contribution=24.0,
        notes="Acoustic stress marker"
    )
    result = DistressResult(
        distress_score=75.0,
        confidence=0.85,
        risk_level=RiskLevel.HIGH,
        emotion_tag=EmotionTag.FEAR,
        intervention=InterventionType.COUNSELLING,
        signals=["tremor_detected"],
        score_breakdown={"acoustic": score_comp}
    )
    assert result.computed_at.tzinfo is not None
    assert result.computed_at.tzinfo == timezone.utc

    # 2. EscalationState
    escalation = EscalationState(
        severity=RiskLevel.CRITICAL,
        reason="Repeated SOS triggers",
        summary="High priority case escalation",
        victim_id="v-100"
    )
    assert escalation.created_at.tzinfo is not None
    assert escalation.created_at.tzinfo == timezone.utc

    # 3. Turn
    turn = Turn(
        conversation_id="conv-1",
        turn_id="turn-1",
        speaker="user",
        transcript="Help me please"
    )
    assert turn.created_at.tzinfo is not None
    assert turn.created_at.tzinfo == timezone.utc
