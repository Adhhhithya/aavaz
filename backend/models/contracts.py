"""
backend/models/contracts.py

Shared typed data contracts used across the voice-agent, FastAPI backend,
and multi-agent orchestration system. All inter-service data must be
serialised/deserialised through these models so that acoustic, NLP, memory,
and agent subsystems remain decoupled from each other's internals.

No PII (names, phone numbers, addresses) should appear in these contracts
at rest - use victim_id / case_id references throughout.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal, Optional
from pydantic import BaseModel, Field, field_validator


# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------

class EmotionTag(str, Enum):
    FEAR = "fear"
    ANGER = "anger"
    SADNESS = "sadness"
    HOPELESSNESS = "hopelessness"
    NEUTRAL = "neutral"
    HIGH_STRESS = "high_stress"


class RiskLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class MemoryType(str, Enum):
    IDENTITY = "IDENTITY"
    INCIDENT = "INCIDENT"
    EMOTIONAL_STATE = "EMOTIONAL_STATE"
    SAFETY_RISK = "SAFETY_RISK"
    PREVIOUS_ACTION = "PREVIOUS_ACTION"
    LEGAL_CONTEXT = "LEGAL_CONTEXT"
    PREFERENCE = "PREFERENCE"
    FOLLOW_UP = "FOLLOW_UP"


class EscalationStatus(str, Enum):
    PENDING = "PENDING"
    NOTIFIED = "NOTIFIED"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    RESOLVED = "RESOLVED"


class InterventionType(str, Enum):
    COUNSELLING = "counselling"
    MEDICAL_TREATMENT = "medical_treatment"
    WITNESS_PROTECTION = "witness_protection"
    RELOCATION_SUPPORT = "relocation_support"
    FINANCIAL_ASSISTANCE = "financial_assistance"
    LEGAL_AID = "legal_aid"
    REHABILITATION_MEASURES = "rehabilitation_measures"
    NONE = "none"


# ---------------------------------------------------------------------------
# Acoustic Analysis Contract
# ---------------------------------------------------------------------------

class AcousticFeatures(BaseModel):
    """
    Normalised vocal stress features extracted from an audio segment.
    All float fields represent raw physical measurements (not normalised scores)
    so that callers can apply their own normalisation strategy.

    Null fields indicate that the feature could not be reliably extracted
    (e.g. no voiced frames found, audio too short, corrupt segment).
    The fusion engine must degrade gracefully when fields are null.
    """
    # Fundamental frequency / pitch
    pitch_mean: Optional[float] = Field(None, description="Mean F0 in Hz")
    pitch_std: Optional[float] = Field(None, description="Standard deviation of F0")
    pitch_range: Optional[float] = Field(None, description="Max F0 - Min F0 in Hz")
    pitch_slope: Optional[float] = Field(None, description="Linear regression slope of F0 over time")

    # Perturbation measures (voice quality)
    jitter: Optional[float] = Field(None, description="Mean absolute F0 period perturbation ratio")
    shimmer: Optional[float] = Field(None, description="Mean absolute amplitude perturbation ratio")

    # Energy / loudness
    energy_mean: Optional[float] = Field(None, description="Mean RMS energy")
    energy_std: Optional[float] = Field(None, description="Std dev of RMS energy")

    # Temporal / rhythm
    speech_rate: Optional[float] = Field(None, description="Voiced frames per second")
    pause_ratio: Optional[float] = Field(None, description="Silence duration / total duration [0-1]")
    mean_pause_duration: Optional[float] = Field(None, description="Mean pause duration in seconds")
    max_pause_duration: Optional[float] = Field(None, description="Longest pause in seconds")
    voiced_ratio: Optional[float] = Field(None, description="Voiced frames / total frames [0-1]")
    zero_crossing_rate: Optional[float] = Field(None, description="Mean ZCR")

    # Extraction metadata
    audio_duration_seconds: Optional[float] = None
    extraction_method: str = "librosa_scipy"
    extraction_error: Optional[str] = None


# ---------------------------------------------------------------------------
# Distress Scoring Contract
# ---------------------------------------------------------------------------

class ScoreComponent(BaseModel):
    """One weighted signal contributing to the final distress score."""
    weight: float = Field(..., ge=0.0, le=1.0)
    raw_value: float = Field(..., ge=0.0, le=100.0)
    contribution: float = Field(..., description="weight * raw_value")
    notes: str = ""
    available: bool = True


class DistressResult(BaseModel):
    """
    Output of the distress fusion engine.

    distress_score: fused weighted score [0-100]. 0 = no distress, 100 = extreme.
    confidence:     model confidence in [0-1]. Low if signals are missing/corrupt.
    risk_level:     categorical tier used by intervention engine and alert routing.
    emotion_tag:    dominant emotion detected from NLP.
    intervention:   intervention type recommended by rules engine.
    signals:        human-readable list of dominant distress signals detected.
    score_breakdown: per-component XAI breakdown (required for compliance).
    """
    distress_score: float = Field(..., ge=0.0, le=100.0)
    confidence: float = Field(..., ge=0.0, le=1.0)
    risk_level: RiskLevel
    emotion_tag: EmotionTag = EmotionTag.NEUTRAL
    intervention: InterventionType = InterventionType.NONE
    signals: list[str] = Field(default_factory=list)
    score_breakdown: dict[str, ScoreComponent]
    computed_at: datetime = Field(default_factory=datetime.utcnow)


# ---------------------------------------------------------------------------
# Triage / Crisis Classification Contract
# ---------------------------------------------------------------------------

class TriageResult(BaseModel):
    """
    Output of the Triage Agent. Determines routing to Empathy / Crisis path.
    This is NOT a diagnosis - it is a routing decision.
    """
    risk_level: RiskLevel
    immediate_danger: bool = False
    self_harm_signal: bool = False
    witness_intimidation_signal: bool = False
    intent: str = "GENERAL_SUPPORT"
    requires_escalation: bool = False
    requires_medical: bool = False
    reason_codes: list[str] = Field(default_factory=list)
    confidence: float = Field(0.5, ge=0.0, le=1.0)


# ---------------------------------------------------------------------------
# Memory Contracts
# ---------------------------------------------------------------------------

class MemoryChunk(BaseModel):
    """A single persisted memory extracted from a conversation turn."""
    id: Optional[str] = None
    victim_id: str
    conversation_id: str
    memory_type: MemoryType
    content: str  # PII-scrubbed summary
    metadata: dict = Field(default_factory=dict)
    similarity_score: Optional[float] = None  # Populated on retrieval
    created_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Legal / RAG Document Contract
# ---------------------------------------------------------------------------

class LegalDoc(BaseModel):
    """A retrieved legal/scheme document from the pgvector knowledge base."""
    document_id: str
    title: str
    content: str
    source: str
    category: str
    jurisdiction: str = "IN"
    language: str = "en"
    similarity: float = Field(..., ge=0.0, le=1.0)
    citation: Optional[str] = None


# ---------------------------------------------------------------------------
# Escalation Contract
# ---------------------------------------------------------------------------

class EscalationState(BaseModel):
    """Tracks the lifecycle of a counsellor/authority escalation."""
    escalation_id: Optional[str] = None
    severity: RiskLevel
    reason: str
    summary: str  # PII-free summary for handoff
    victim_id: str
    case_id: Optional[str] = None
    recommended_action: str = "human_handoff"
    status: EscalationStatus = EscalationStatus.PENDING
    counsellor_task_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ---------------------------------------------------------------------------
# Conversation Turn and State Contracts
# ---------------------------------------------------------------------------

class ASRResult(BaseModel):
    provider: str = "whisper"
    transcript: str
    confidence: Optional[float] = None
    language_detected: Optional[str] = None


class Turn(BaseModel):
    """
    A single timestamped exchange in a conversation.
    Stored append-only; never mutated after creation.
    """
    conversation_id: str
    turn_id: str
    speaker: Literal["user", "agent", "system"]
    language: str = "en"

    # Raw text (always present; may come from ASR or direct text channel)
    transcript: str

    # Optional rich data (voice channels only)
    audio_url: Optional[str] = None
    asr: Optional[ASRResult] = None
    acoustic: Optional[AcousticFeatures] = None
    distress: Optional[DistressResult] = None

    created_at: datetime = Field(default_factory=datetime.utcnow)


class ConversationState(BaseModel):
    """
    The single shared state object threaded through all agent calls in one turn.
    The Supervisor reads and writes this; individual agents receive a view of it
    and return a mutated copy - they do not hold private state.

    NEVER put raw PII (phone numbers, names, addresses) into this object.
    Use victim_id / case_id references and let the DB layer handle lookup.
    """
    conversation_id: str
    victim_id: Optional[str] = None
    case_id: Optional[str] = None
    language: str = "en"
    turn_id: int = 0
    channel: Literal["voice", "chat", "sms", "ivr"] = "chat"
    submitter_role: str = "victim"
    history_score: float = 0.0

    @field_validator("submitter_role", mode="before")
    @classmethod
    def default_submitter_role(cls, v):
        return v or "victim"

    @field_validator("language", mode="before")
    @classmethod
    def default_language(cls, v):
        return v or "en"

    @field_validator("channel", mode="before")
    @classmethod
    def default_channel(cls, v):
        return v or "chat"

    @field_validator("history_score", mode="before")
    @classmethod
    def default_history_score(cls, v):
        return float(v) if v is not None else 0.0

    # Conversation history (bounded - trim to last N turns for context window)
    transcript: list[Turn] = Field(default_factory=list)

    # Agent results from the current turn
    triage: Optional[TriageResult] = None
    distress: Optional[DistressResult] = None

    # Retrieved context
    memories: list[MemoryChunk] = Field(default_factory=list)
    retrieved_legal_context: list[LegalDoc] = Field(default_factory=list)
    medical_advice: Optional[str] = None

    # Escalation state (None if no active escalation)
    escalation: Optional[EscalationState] = None
