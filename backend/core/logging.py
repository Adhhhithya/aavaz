import logging
import json
import contextvars
from services.pii_redaction import redact_pii

# Context variable to hold the correlation ID for the current request
correlation_id_var = contextvars.ContextVar("correlation_id", default="system")

class SafeJSONFormatter(logging.Formatter):
    def format(self, record):
        # Extract correlation ID from context
        correlation_id = correlation_id_var.get()
        
        # Redact PII from the log message
        safe_message = redact_pii(record.getMessage())
        
        log_record = {
            "level": record.levelname,
            "logger": record.name,
            "correlation_id": correlation_id,
            "message": safe_message,
        }
        
        if record.exc_info:
            log_record["exc_info"] = self.formatException(record.exc_info)
            
        return json.dumps(log_record)

def setup_logging():
    # Remove existing handlers
    root = logging.getLogger()
    if root.handlers:
        for handler in root.handlers:
            root.removeHandler(handler)
            
    handler = logging.StreamHandler()
    formatter = SafeJSONFormatter()
    handler.setFormatter(formatter)
    
    root.addHandler(handler)
    root.setLevel(logging.INFO)
    
    # Silence chatty loggers if needed
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
