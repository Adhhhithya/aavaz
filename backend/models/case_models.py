from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from uuid import UUID

class User(BaseModel):
    id: UUID
    phone_number: str
    name: str
    role_type: str
    preferred_language: str
    consent_given: bool
    consent_timestamp: Optional[datetime] = None
    location_district: Optional[str] = None
    location_state: Optional[str] = None
    location_source: Optional[str] = None
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None
    created_at: datetime

class Case(BaseModel):
    id: UUID
    user_id: UUID
    case_type: str
    intake_channel: str
    case_stage: str
    assigned_counsellor_id: Optional[UUID] = None
    current_distress_score: float = 0.0
    priority_rank: int = 0
    created_at: datetime
    updated_at: datetime
    # Joined fields for UI convenience
    user_name: Optional[str] = None
    counsellor_name: Optional[str] = None
    has_sos: bool = False

class Interaction(BaseModel):
    id: UUID
    case_id: UUID
    timestamp: datetime
    channel: str
    acoustic_score: Optional[float] = None
    sentiment_score: float
    emotion_tag: str
    engagement_score: float
    history_score: float
    final_score: float
    score_breakdown: Dict[str, Any]
    transcript_ref: Optional[str] = None
    audio_ref: Optional[str] = None
    intervention_recommended: Optional[str] = None

class CaseUpdate(BaseModel):
    id: UUID
    case_id: UUID
    timestamp: datetime
    previous_stage: str
    new_stage: str
    update_source: str
    notes: Optional[str] = None

class SOSEvent(BaseModel):
    id: UUID
    case_id: UUID
    triggered_at: datetime
    location_lat: float
    location_lng: float
    assigned_counsellor_id: UUID
    escalated: bool = False
    escalated_at: Optional[datetime] = None
    escalated_to_counsellor_id: Optional[UUID] = None
    resolved: bool = False
    resolved_by: Optional[str] = None
    resolved_at: Optional[datetime] = None
    # Joined fields
    user_name: Optional[str] = None
    phone_number: Optional[str] = None

class Counsellor(BaseModel):
    id: UUID
    name: str
    district: str
    languages: List[str]
    current_caseload: int = 0
