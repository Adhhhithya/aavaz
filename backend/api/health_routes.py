from fastapi import APIRouter
import time
from services.supabase_client import get_supabase
import httpx
from config import settings
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/health")
async def health_check():
    return {"status": "ok", "timestamp": time.time()}

@router.get("/health/ready")
async def health_ready():
    return {"status": "ready"}

@router.get("/health/integrations")
async def health_integrations():
    """
    Verifies connections to DB, Supabase, Bolna, LLM, etc. without exposing credentials.
    """
    status_report = {
        "status": "healthy",
        "services": {
            "database": "unknown",
            "supabase": "unknown",
            "bolna": "unknown",
            "llm": "unknown"
        }
    }
    
    # Check Supabase / DB
    try:
        supabase = await get_supabase()
        # A simple query to verify DB connection
        res = await supabase.table("users").select("id").limit(1).execute()
        status_report["services"]["database"] = "ok"
        status_report["services"]["supabase"] = "ok"
    except Exception as e:
        status_report["status"] = "degraded"
        status_report["services"]["database"] = f"error: {str(e)}"
        status_report["services"]["supabase"] = f"error: {str(e)}"
        
    # Check LLM (Groq)
    try:
        if settings.GROQ_API_KEY:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    "https://api.groq.com/openai/v1/models",
                    headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
                    timeout=3.0
                )
                if resp.status_code == 200:
                    status_report["services"]["llm"] = "ok"
                else:
                    status_report["status"] = "degraded"
                    status_report["services"]["llm"] = f"error: {resp.status_code}"
        else:
            status_report["services"]["llm"] = "unconfigured"
    except Exception as e:
        status_report["status"] = "degraded"
        status_report["services"]["llm"] = f"error: {str(e)}"
        
    # Check Bolna API
    try:
        if settings.BOLNA_API_KEY:
            async with httpx.AsyncClient() as client:
                # Bolna doesn't have a simple health endpoint documented, so we ping agents list
                resp = await client.get(
                    "https://api.bolna.dev/agents",
                    headers={"Authorization": f"Bearer {settings.BOLNA_API_KEY}"},
                    timeout=3.0
                )
                if resp.status_code in [200, 401, 403]: # Even if 401, API is reachable
                    status_report["services"]["bolna"] = "ok"
                else:
                    status_report["status"] = "degraded"
                    status_report["services"]["bolna"] = f"error: {resp.status_code}"
        else:
            status_report["services"]["bolna"] = "unconfigured"
    except Exception as e:
        status_report["status"] = "degraded"
        status_report["services"]["bolna"] = f"error: {str(e)}"

    return status_report
