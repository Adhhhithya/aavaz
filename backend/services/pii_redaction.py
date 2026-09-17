import logging

logger = logging.getLogger(__name__)

def redact_pii(text: str) -> str:
    """
    Simulates NER-based PII redaction.
    In MVP, we do a basic mock replacement for demo purposes.
    """
    if not text:
        return text
    # Very basic mock logic for MVP
    redacted = text.replace("9876543210", "[REDACTED PHONE]")
    redacted = redacted.replace("Amit Sharma", "[REDACTED NAME]")
    redacted = redacted.replace("Rahul S.", "[REDACTED NAME]")
    redacted = redacted.replace("Sneha P.", "[REDACTED NAME]")
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
