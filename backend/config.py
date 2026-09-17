import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # Deployment environment. Must be explicitly set to "production" in any real
    # deployment; defaults to "development" so local/dev setups work out of the box.
    # Used to gate destructive development-only utilities (see scripts/clear_db.py) so
    # they cannot run against a production database.
    ENVIRONMENT: str = "development"

    # Supabase config
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""

    # External APIs
    BOLNA_API_KEY: str = ""
    PUSHBULLET_API_KEY: str = ""
    GROQ_API_KEY: str = ""
    NGROK_URL: str = ""
    ECOURTS_API_KEY: str = ""

    # Shared secrets for verifying inbound provider webhooks (S1/S2 remediation —
    # neither provider's real signature scheme is confirmed/available in this repo;
    # this is a generic interim shared-secret check, not a vendor-specific signature
    # verification. See docs/AAVAZ_IMPLEMENTATION_AUDIT.md.
    BOLNA_WEBHOOK_SECRET: str = ""
    PUSHBULLET_WEBHOOK_SECRET: str = ""

    # -- Victim OTP authentication (S2) --------------------------------------
    # Server-side pepper mixed into every phone-number hash and OTP-code hash.
    # Required in any non-development environment; falls back to a clearly-labeled
    # insecure constant only when ENVIRONMENT=="development" (see
    # services/otp_service.py). Losing/rotating this invalidates all pending OTPs,
    # which is fine — it is not used for any long-lived data.
    OTP_PEPPER: str = ""
    OTP_LENGTH: int = 6
    OTP_TTL_SECONDS: int = 300  # 5 minutes, per AAVAZ v0.2 spec (Workflow A2)
    OTP_MAX_ATTEMPTS: int = 3
    OTP_RATE_LIMIT_WINDOW_SECONDS: int = 900  # 15 minutes
    OTP_RATE_LIMIT_PER_PHONE: int = 5
    OTP_RATE_LIMIT_PER_IP: int = 20

    # Signing secret + lifetimes for the two victim-side tokens this milestone
    # introduces (see api/auth/victim_dependencies.py). Distinct from Supabase
    # Auth, which is only used for staff (see docs/AAVAZ_IMPLEMENTATION_AUDIT.md
    # for why victims aren't provisioned as Supabase Auth users in this pass).
    VICTIM_SESSION_SECRET: str = ""
    VICTIM_SESSION_TTL_SECONDS: int = 86400  # 24h
    PHONE_VERIFIED_TOKEN_TTL_SECONDS: int = 600  # 10 minutes — just enough to complete registration

    # Thresholds
    # Tunable thresholds
    CRITICAL_DISTRESS_THRESHOLD: float = 75.0
    
    # Model configuration
    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(__file__), ".env"), 
        env_file_encoding="utf-8", 
        extra="ignore"
    )

settings = Settings()
