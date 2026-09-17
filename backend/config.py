import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # Supabase config
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""

    # External APIs
    BOLNA_API_KEY: str = ""
    PUSHBULLET_API_KEY: str = ""
    GROQ_API_KEY: str = ""
    NGROK_URL: str = ""
    ECOURTS_API_KEY: str = ""
    
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
