from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from models.intake_models import AppRegistrationRequest
from services.supabase_client import get_supabase
from services.location_resolver import resolve_location
from api.auth.victim_dependencies import (
    CurrentVictim,
    get_current_victim,
    get_phone_verified_number,
    issue_victim_session_token,
)
import logging
from datetime import datetime, timezone

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/register")
async def register_user(
    request: AppRegistrationRequest,
    phone_number: str = Depends(get_phone_verified_number),
):
    """
    Workflow A - App Registration.
    Captures identity, role, location, consent. Creates a case.

    S2: `phone_number` is no longer accepted from the request body. It is
    derived from a phone-verified token (issued only after real OTP
    verification — see api/auth/auth_routes.py), so a caller can never register
    an account for a phone number it hasn't proven it controls. On success, a
    full victim session token is issued so the client doesn't need a second
    round trip through OTP verification.
    """
    try:
        supabase = await get_supabase()

        # Resolve location
        district, state = None, None
        if request.location:
            district, state = await resolve_location(request.location.lat, request.location.lng)

        # 1. Insert User
        user_data = {
            "phone_number": phone_number,
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

        session_token = issue_victim_session_token(user_id, phone_number)

        return {
            "status": "success",
            "user_id": user_id,
            "case_id": case_resp.data[0]["id"],
            "token": session_token,
            "token_type": "victim_session",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Registration error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class CheckinRequest(BaseModel):
    mood: str

@router.post("/checkin")
async def quick_checkin(
    request: CheckinRequest,
    current_victim: CurrentVictim = Depends(get_current_victim),
):
    """
    Logs a quick mood checkin to the interactions table.

    S2: the case owner is the authenticated victim, not a client-supplied
    `user_id` (the field was removed from the request body entirely — there is
    no legitimate reason for a caller to ever supply someone else's id here).
    """
    try:
        supabase = await get_supabase()

        # Get active case for user (just grabbing latest for MVP)
        cases_resp = await supabase.table("cases").select("id").eq("user_id", current_victim.id).order("created_at", desc=True).limit(1).execute()

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
    description: str

@router.post("/cases")
async def create_case(
    request: NewCaseRequest,
    current_victim: CurrentVictim = Depends(get_current_victim),
):
    """S2: case owner is the authenticated victim, not a client-supplied `user_id`."""
    try:
        supabase = await get_supabase()

        case_data = {
            "user_id": current_victim.id,
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
async def get_user_cases(
    user_id: str,
    current_victim: CurrentVictim = Depends(get_current_victim),
):
    """
    S2: `user_id` is still taken from the URL (unchanged shape, to minimize
    client churn) but is now treated as untrusted input and verified against
    the authenticated victim's own id — a mismatch is rejected before any data
    is read, closing the IDOR where any victim could read any other victim's
    case list by changing this path parameter.
    """
    if user_id != current_victim.id:
        raise HTTPException(status_code=403, detail="You may only view your own cases")

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
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Fetch cases error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
