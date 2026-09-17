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
            .select("id, case_type, case_stage, current_distress_score, updated_at, has_sos, user_id")\
            .eq("assigned_counsellor_id", counsellor_id)\
            .neq("case_stage", "closed")\
            .order("current_distress_score", desc=True)\
            .execute()
            
        cases = resp.data
        
        # Hydrate with user names (In production, use a postgres view or RPC for joins)
        for c in cases:
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

        if current_user.role == "counsellor" and case_data.get("assigned_counsellor_id") != current_user.id:
            raise HTTPException(status_code=403, detail="This case is not assigned to you")

        u_resp = await supabase.table("users").select("name, phone_number, role_type").eq("id", case_data["user_id"]).single().execute()
        if u_resp.data:
            case_data["user_name"] = u_resp.data["name"]
            case_data["phone_number"] = u_resp.data["phone_number"]
            case_data["role_type"] = u_resp.data["role_type"]

        interactions_resp = await supabase.table("interactions").select("*").eq("case_id", case_id).order("timestamp", desc=True).execute()
        
        # Compute engagement profile based on recent interactions
        interactions = interactions_resp.data
        missed = sum(1 for i in interactions if i["engagement_score"] > 50)
        profile = {
            "missed_calls": missed,
            "response_rate": "65%" if missed > 0 else "95%",
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
