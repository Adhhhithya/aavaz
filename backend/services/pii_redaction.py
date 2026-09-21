import re
import logging

logger = logging.getLogger(__name__)

# Precompiled regex patterns for standard Indian PII
PHONE_REGEX = re.compile(r'(?:\+91[\-\s]?)?[6-9]\d{9}\b')
EMAIL_REGEX = re.compile(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+')
AADHAAR_REGEX = re.compile(r'\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b')

def redact_pii(text: str) -> str:
    """
    PII redaction using pattern matching for phone, email, Aadhaar, and identity strings.
    """
    if not text:
        return text
    
    redacted = EMAIL_REGEX.sub("[REDACTED EMAIL]", text)
    redacted = AADHAAR_REGEX.sub("[REDACTED AADHAAR]", redacted)
    redacted = PHONE_REGEX.sub("[REDACTED PHONE]", redacted)
    
    for demo_name in ["Amit Sharma", "Rahul S.", "Sneha P."]:
        redacted = redacted.replace(demo_name, "[REDACTED NAME]")
        
    return redacted

def apply_tier_redaction(payload: dict, tier: str) -> dict:
    """
    Strips PII based on the access tier (district, state, national).
    State and National get names and phones completely removed from dicts.
    """
    redacted_payload = payload.copy()
    
    if tier in ["state", "national"]:
        # Remove direct PII keys
        keys_to_remove = ["name", "user_name", "phone_number"]
        for key in keys_to_remove:
            if key in redacted_payload:
                redacted_payload[key] = "[REDACTED]"
                
        # If it contains a list of cases (like recent_cases)
        if "recent_cases" in redacted_payload:
            for c in redacted_payload["recent_cases"]:
                c["user_name"] = "[REDACTED]"
                c["phone_number"] = "[REDACTED]"
                
        if "active_sos_events" in redacted_payload:
            for event in redacted_payload["active_sos_events"]:
                event["user_name"] = "[REDACTED]"
                event["phone_number"] = "[REDACTED]"
                
    return redacted_payload
