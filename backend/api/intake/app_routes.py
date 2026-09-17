from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from models.intake_models import AppRegistrationRequest
from services.supabase_client import get_supabase
from services.location_resolver import resolve_location
import logging
from datetime import datetime, timezone

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/register")
async def register_user(request: AppRegistrationRequest):
    """
    Workflow A - App Registration.
    Captures identity, role, location, consent. Creates a case.
    """
    try:
        supabase = await get_supabase()
        
        # Resolve location
        district, state = None, None
        if request.location:
            district, state = await resolve_location(request.location.lat, request.location.lng)
        
        # 1. Insert User
        user_data = {
            "phone_number": request.phone_number,
            "name": request.name, # PII, in a real prod app we'd encrypt this
            "role_type": request.role_type,
            "preferred_language": request.preferred_language,
            "consent_given": request.consent_given,
            "consent_timestamp": datetime.now(timezone.utc).isoformat() if request.consent_given else None,
            "location_source": "app",
            "location_lat": request.location.lat if request.location else None,
            "location_lng": request.location.lng if request.location else None,
            "location_district": district,
            "location_state": state
        }
        
        user_resp = await supabase.table("users").insert(user_data).execute()
        if not user_resp.data:
            raise HTTPException(status_code=400, detail="Failed to create user. May already exist.")
            
        user_id = user_resp.data[0]["id"]
        
        # 3. Auto-assign counsellor based on location and language
        from api.assignment.auto_assign import assign_counsellor
        counsellor_id = None
        if district:
            counsellor_id = await assign_counsellor(district, request.preferred_language or "en")
            
        case_data = {
            "user_id": user_id,
            "case_type": "unspecified", # Will be updated during investigation
            "intake_channel": "app",
            "case_stage": "registered",
            "assigned_counsellor_id": counsellor_id
        }
        
        case_resp = await supabase.table("cases").insert(case_data).execute()
        if not case_resp.data:
            raise HTTPException(status_code=400, detail="Failed to create case")
            
        return {"status": "success", "user_id": user_id, "case_id": case_resp.data[0]["id"]}
        
    except Exception as e:
        logger.error(f"Registration error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class CheckinRequest(BaseModel):
    user_id: str
    mood: str

@router.post("/checkin")
async def quick_checkin(request: CheckinRequest):
    """
    Logs a quick mood checkin to the interactions table.
    """
    try:
        supabase = await get_supabase()
        
        # Get active case for user (just grabbing latest for MVP)
        cases_resp = await supabase.table("cases").select("id").eq("user_id", request.user_id).order("created_at", desc=True).limit(1).execute()
        
        case_id = cases_resp.data[0]["id"] if cases_resp.data else None
        
        interaction = {
            "case_id": case_id,
            "channel": "app",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "transcript_ref": f"User reported mood: {request.mood}",
            "emotion_tag": "neutral" if request.mood == "calm" else "fear",
            "sentiment_score": 0.5,
            "engagement_score": 0.5,
            "history_score": 0.5,
            "final_score": 0.5,
            "score_breakdown": {"sentiment": 0.5, "engagement": 0.5, "history": 0.5}
        }
        
        await supabase.table("interactions").insert(interaction).execute()
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Checkin error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class NewCaseRequest(BaseModel):
    user_id: str
    description: str

@router.post("/cases")
async def create_case(request: NewCaseRequest):
    try:
        supabase = await get_supabase()
        
        case_data = {
            "user_id": request.user_id,
            "case_type": "app_filed",
            "intake_channel": "app",
            "case_stage": "registered",
            "assigned_counsellor_id": "11111111-1111-1111-1111-111111111111" # Assign dummy counsellor for MVP
        }
        case_resp = await supabase.table("cases").insert(case_data).execute()
        
        # Log the description as an interaction
        await supabase.table("interactions").insert({
            "case_id": case_resp.data[0]["id"],
            "channel": "app",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "transcript_ref": f"User filed complaint: {request.description}",
            "emotion_tag": "fear",
            "sentiment_score": 0.8,
            "engagement_score": 0.8,
            "history_score": 0.8,
            "final_score": 0.8,
            "score_breakdown": {"sentiment": 0.8, "engagement": 0.8, "history": 0.8}
        }).execute()
        
        return {"status": "success", "case": case_resp.data[0]}
    except Exception as e:
        logger.error(f"Case creation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/cases/{user_id}")
async def get_user_cases(user_id: str):
    try:
        supabase = await get_supabase()
        cases_resp = await supabase.table("cases").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
        
        # Format for mobile app
        formatted = []
        for c in cases_resp.data:
            # Determine best title
            title = "Case Report"
            if c.get("ecourts_data") and "title" in c["ecourts_data"]:
                title = c["ecourts_data"]["title"]
            elif c.get("cnr"):
                title = f"CNR: {c['cnr']}"
                
            formatted.append({
                "id": c["id"],
                "title": title,
                "dateFiled": c["created_at"][:10],
                "status": c["case_stage"].upper(),
                "isResolved": c["case_stage"] == "resolved",
                "cnr": c.get("cnr"),
                "ecourts_data": c.get("ecourts_data"),
                "timeline": [
                    {
                        "step": "Complaint Registered",
                        "timestamp": c["created_at"][:10],
                        "active": c["case_stage"] == "registered",
                        "completed": True
                    },
                    {
                        "step": "Investigation",
                        "timestamp": "Pending",
                        "active": c["case_stage"] == "investigating",
                        "completed": c["case_stage"] in ["resolved", "closed"]
                    }
                ]
            })
            
        return {"cases": formatted}
    except Exception as e:
        logger.error(f"Fetch cases error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
