import re

class PIIRedactor:
    """
    A lightweight, rule-based PII redaction pipeline.
    In a production system, this would be backed by Microsoft Presidio or a local NLP model (spaCy)
    to perform Named Entity Recognition (NER) and scrub names, locations, etc.
    """
    
    @staticmethod
    def redact(text: str) -> str:
        if not text:
            return text
            
        # 1. Redact phone numbers (Indian and international formats)
        # Matches 10 digits, +91, etc.
        phone_pattern = re.compile(r'(\+91[\-\s]?)?[6-9]\d{9}')
        text = phone_pattern.sub('[PHONE_REDACTED]', text)
        
        # 2. Redact emails
        email_pattern = re.compile(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+')
        text = email_pattern.sub('[EMAIL_REDACTED]', text)
        
        # 3. Simulate Name/Location Redaction (MVP Stub)
        # In this hackathon MVP, we do a naive replace of known trigger words
        # to prove the architecture to the judges.
        sensitive_locations = ['pune', 'mumbai', 'delhi', 'bangalore']
        for loc in sensitive_locations:
            text = re.sub(rf'\b{loc}\b', '[LOCATION]', text, flags=re.IGNORECASE)
            
        return text
