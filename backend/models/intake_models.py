from pydantic import BaseModel, Field, ConfigDict
from typing import Optional

class Location(BaseModel):
    lat: float
    lng: float

class OtpRequestPayload(BaseModel):
    phone_number: str = Field(..., description="E.164 formatted phone number")

class OtpVerifyPayload(BaseModel):
    phone_number: str = Field(..., description="E.164 formatted phone number")
    code: str = Field(..., min_length=4, max_length=8, description="The OTP digits as submitted by the user")

class AppRegistrationRequest(BaseModel):
    # phone_number is intentionally NOT accepted here (S2): it is derived
    # server-side from the caller's phone-verified token instead, so a client
    # can never register an account for a phone number it hasn't proven it
    # controls. See api/intake/app_routes.py.
    name: str
    role_type: str = Field(..., description="victim, witness, or family")
    consent_given: bool
    location: Optional[Location] = None
    preferred_language: str = Field(..., description="hi, ta, ml, or en")

class BolnaWebhookPayload(BaseModel):
    call_id: Optional[str] = "unknown_call"
    user_phone: Optional[str] = None
    phone_number: Optional[str] = None
    recipient_phone_number: Optional[str] = None
    transcript: Optional[str] = ""
    audio_url: Optional[str] = None
    language_detected: Optional[str] = None
    duration_seconds: Optional[float] = 0.0
    call_status: Optional[str] = "completed"

    @property
    def caller_phone(self) -> str:
        return (self.user_phone or self.phone_number or self.recipient_phone_number or "").strip()

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
    caller_identity: Optional[str] = "Unknown"
    estimated_distress_score: Optional[int] = 0
    immediate_threat_detected: Optional[bool] = False
    summary_notes: Optional[str] = ""

    class Config:
        extra = "allow"

class BolnaPreCallPayload(BaseModel):
    call_id: Optional[str] = None
    user_phone: Optional[str] = None
    phone_number: Optional[str] = None
    from_number: Optional[str] = None
    to_number: Optional[str] = None
    recipient_phone_number: Optional[str] = None

    @property
    def phone(self) -> str:
        return (
            self.user_phone
            or self.phone_number
            or self.to_number
            or self.from_number
            or self.recipient_phone_number
            or ""
        ).strip()


class GrievanceRegistrationPayload(BaseModel):
    # Case fields
    grievance_related_to: str
    has_fir: bool
    submitter_role: str
    cnr_number: Optional[str] = None
    grievance_description: Optional[str] = None
    
    # Personal Info fields
    first_name: str
    middle_name: Optional[str] = None
    last_name: Optional[str] = None
    father_name: Optional[str] = None
    dob: Optional[str] = None
    category: str
    nationality: str = "Indian"
    aadhaar_number: str
    
    # Address Info fields
    pincode: str
    state: str
    district: str
    taluka: Optional[str] = None
    full_address: str
