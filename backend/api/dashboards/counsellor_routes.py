from fastapi import APIRouter, Depends, HTTPException
from services.supabase_client import get_supabase
from api.auth.dependencies import CurrentStaffUser, require_roles
from typing import List
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

# Counsellors may only see their own queue/cases; district/state/national/super_admin
# have broader oversight per the original access matrix (SYSTEM_SPEC.md 2.2).
_ALLOWED_ROLES = ("counsellor", "district_admin", "state_admin", "national_admin", "super_admin")


@router.get("/queue/{counsellor_id}")
async def get_counsellor_queue(
    counsellor_id: str,
    current_user: CurrentStaffUser = Depends(require_roles(*_ALLOWED_ROLES)),
):
    """
    Returns the assigned cases for a counsellor, sorted by distress score.
    """
    if current_user.role == "counsellor" and current_user.id != counsellor_id:
        raise HTTPException(status_code=403, detail="Counsellors may only view their own queue")

    supabase = await get_supabase()
    try:
        resp = await supabase.table("cases")\
            .select("id, case_type, case_stage, current_distress_score, updated_at, user_id, assigned_counsellor_id")\
            .neq("case_stage", "closed")\
            .order("current_distress_score", desc=True)\
            .execute()
            
        all_cases = resp.data or []
        # Cases assigned to this counsellor
        cases = [c for c in all_cases if c.get("assigned_counsellor_id") == counsellor_id]
        # If none assigned yet, include unassigned cases so counsellor can triage
        if not cases:
            cases = [c for c in all_cases if not c.get("assigned_counsellor_id")]
        
        # Check active SOS for these cases
        case_ids = [c["id"] for c in cases]
        sos_case_ids = set()
        if case_ids:
            try:
                sos_resp = await supabase.table("sos_events").select("case_id").in_("case_id", case_ids).eq("resolved", False).execute()
                sos_case_ids = set(s["case_id"] for s in (sos_resp.data or []))
            except Exception:
                pass

        # Hydrate with user names and SOS indicator
        for c in cases:
            c["has_sos"] = c["id"] in sos_case_ids
            u_resp = await supabase.table("users").select("name, phone_number").eq("id", c["user_id"]).single().execute()
            if u_resp.data:
                c["user_name"] = u_resp.data["name"]
                c["phone_number"] = u_resp.data["phone_number"]
                
        return {"queue": cases, "total_cases": len(cases)}
    except Exception as e:
        logger.error(f"Error fetching counsellor queue: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/case/{case_id}")
async def get_case_detail(
    case_id: str,
    current_user: CurrentStaffUser = Depends(require_roles(*_ALLOWED_ROLES)),
):
    """
    Returns case detail, interactions history, and engagement profile.
    """
    supabase = await get_supabase()
    try:
        case_resp = await supabase.table("cases").select("*").eq("id", case_id).single().execute()
        case_data = case_resp.data

        assigned_c = case_data.get("assigned_counsellor_id")
        if current_user.role == "counsellor" and assigned_c and assigned_c != current_user.id:
            raise HTTPException(status_code=403, detail="This case is assigned to another counsellor")

        u_resp = await supabase.table("users").select("name, phone_number, role_type").eq("id", case_data["user_id"]).single().execute()
        if u_resp.data:
            case_data["user_name"] = u_resp.data["name"]
            case_data["phone_number"] = u_resp.data["phone_number"]
            case_data["role_type"] = u_resp.data["role_type"]

        interactions_resp = await supabase.table("interactions").select("*").eq("case_id", case_id).order("timestamp", desc=True).execute()
        
        # Compute engagement profile based on recent interactions
        interactions = interactions_resp.data
        total_interactions = len(interactions)
        
        # In engagement.py, high engagement_score indicates high disengagement risk (bad).
        missed = sum(1 for i in interactions if i.get("engagement_score", 0) > 50 or i.get("status") == "missed")
        
        if total_interactions > 0:
            rate = int(((total_interactions - missed) / total_interactions) * 100)
            response_rate_str = f"{rate}%"
        else:
            response_rate_str = "N/A"
            
        profile = {
            "missed_calls": missed,
            "response_rate": response_rate_str,
            "risk_level": "High" if missed > 1 else "Low",
            "nudge": "Consider manual SMS" if missed > 1 else "Active engagement"
        }
        
        return {
            "case_info": case_data,
            "interactions": interactions,
            "engagement_profile": profile
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching case detail: {e}")
        raise HTTPException(status_code=500, detail=str(e))
