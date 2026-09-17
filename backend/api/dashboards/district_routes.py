from fastapi import APIRouter, HTTPException
from services.supabase_client import get_supabase
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/district/{district_name}/stats")
async def get_district_stats(district_name: str):
    """
    Returns aggregate stats for the district dashboard.
    """
    supabase = await get_supabase()
    try:
        # Get total cases in district (using users join)
        # In a real app, this would use a materialized view or RPC
        users_resp = await supabase.table("users").select("id").eq("location_district", district_name).execute()
        user_ids = [u["id"] for u in users_resp.data]
        
        if not user_ids:
            return {"active_cases": 0, "critical_alerts": 0}
            
        # Get active cases
        cases_resp = await supabase.table("cases")\
            .select("id, current_distress_score")\
            .in_("user_id", user_ids)\
            .neq("case_stage", "closed")\
            .execute()
            
        active_count = len(cases_resp.data)
        critical_count = sum(1 for c in cases_resp.data if c["current_distress_score"] >= 75)
        
        return {
            "active_cases": active_count,
            "critical_alerts": critical_count,
            "district": district_name
        }
    except Exception as e:
        logger.error(f"Error fetching district stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/district/{district_name}/cases")
async def get_district_cases(district_name: str):
    """
    Returns case queue for district.
    """
    supabase = await get_supabase()
    try:
        users_resp = await supabase.table("users").select("id, name, phone_number").eq("location_district", district_name).execute()
        user_map = {u["id"]: u for u in users_resp.data}
        if not user_map:
            return []
            
        cases_resp = await supabase.table("cases").select("*").in_("user_id", list(user_map.keys())).neq("case_stage", "closed").order("current_distress_score", desc=True).execute()
        cases = cases_resp.data
        
        # Hydrate user info
        for c in cases:
            c["user_name"] = user_map[c["user_id"]]["name"]
            
        # Optional: Redact PII logic if district level needs scrubbed names per privacy doc
        # Handled at frontend level for District (via ManagementView.jsx UI redaction)
        return cases
    except Exception as e:
        logger.error(f"Error fetching district cases: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/district/{district_name}/sos")
async def get_district_sos(district_name: str):
    """
    Returns active SOS events for district map.
    """
    supabase = await get_supabase()
    try:
        # Mock logic to get SOS events for this district
        resp = await supabase.table("sos_events").select("*").eq("resolved", False).execute()
        # In prod: filter by district via case_id -> user_id -> district join
        return resp.data
    except Exception as e:
        logger.error(f"Error fetching district SOS: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/district/{district_name}/counsellors")
async def get_district_counsellors(district_name: str):
    """
    Returns active counsellors for a district.
    """
    supabase = await get_supabase()
    try:
        resp = await supabase.table("counsellors").select("*").eq("district", district_name).order("current_caseload", desc=True).execute()
        return resp.data
    except Exception as e:
        logger.error(f"Error fetching district counsellors: {e}")
        raise HTTPException(status_code=500, detail=str(e))
