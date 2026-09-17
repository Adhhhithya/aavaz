from pydantic import BaseModel, Field
from typing import Optional

class Location(BaseModel):
    lat: float
    lng: float

class AppRegistrationRequest(BaseModel):
    phone_number: str = Field(..., description="E.164 formatted phone number")
    name: str
    role_type: str = Field(..., description="victim, witness, or family")
    consent_given: bool
    location: Optional[Location] = None
    preferred_language: str = Field(..., description="hi, ta, ml, or en")

class BolnaWebhookPayload(BaseModel):
    call_id: str
    user_phone: str
    transcript: str
    audio_url: Optional[str] = None
    language_detected: Optional[str] = None
    duration_seconds: float
    call_status: str

class PushbulletWebhookPayload(BaseModel):
    from_number: str
    message_body: str
    timestamp: str

class ChatbotRequest(BaseModel):
    user_id: str
    session_id: str
    message: str
    channel: str # app|sms

class BolnaDistressAssessment(BaseModel):
    caller_identity: str
    estimated_distress_score: int
    immediate_threat_detected: bool
    summary_notes: str

class BolnaPreCallPayload(BaseModel):
    call_id: str
    user_phone: str
    from_number: Optional[str] = None
    to_number: Optional[str] = None
