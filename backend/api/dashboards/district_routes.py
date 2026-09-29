from fastapi import APIRouter, Depends, HTTPException
from services.supabase_client import get_supabase
from api.auth.dependencies import CurrentStaffUser, require_roles
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

# NOTE: the data model has no per-admin `district` scoping field (users.role_type is
# the only staff-role signal available), so a district_admin here is authorized for
# ANY district, not just their own. Fine-grained per-district scoping needs a schema
# change and is out of scope for this remediation pass — see
# docs/AAVAZ_IMPLEMENTATION_AUDIT.md for this gap.
_ALLOWED_ROLES = ("district_admin", "state_admin", "national_admin", "super_admin")


@router.get("/district/{district_name}/stats")
async def get_district_stats(
    district_name: str,
    current_user: CurrentStaffUser = Depends(require_roles(*_ALLOWED_ROLES)),
):
    """
    Returns aggregate stats for the district dashboard.
    """
    supabase = await get_supabase()
    try:
        # First attempt to query the SQL view created for district stats
        try:
            view_resp = await supabase.table("vw_district_stats").select("*").ilike("district", district_name).execute()
            if view_resp.data:
                row = view_resp.data[0]
                total_cases = row.get("total_cases", 0)
                active_cases = row.get("active_cases", 0)
                critical_alerts = row.get("critical_alerts", 0)
                active_sos = row.get("active_sos", 0)
                return {
                    "district": district_name,
                    "total_cases": total_cases,
                    "totalCases": total_cases,
                    "active_cases": active_cases,
                    "activeCases": active_cases,
                    "critical_alerts": critical_alerts,
                    "criticalAlerts": critical_alerts,
                    "active_sos": active_sos,
                    "activeSos": active_sos,
                }
        except Exception as ve:
            logger.debug(f"View vw_district_stats query failed, falling back to manual query: {ve}")

        # Fallback to direct queries
        users_resp = await supabase.table("users").select("id").ilike("location_district", district_name).execute()
        user_ids = [u["id"] for u in users_resp.data] if users_resp.data else []
        
        if not user_ids:
            return {
                "district": district_name,
                "total_cases": 0,
                "totalCases": 0,
                "active_cases": 0,
                "activeCases": 0,
                "critical_alerts": 0,
                "criticalAlerts": 0,
                "active_sos": 0,
                "activeSos": 0,
            }
            
        all_cases_resp = await supabase.table("cases").select("id, current_distress_score, case_stage").in_("user_id", user_ids).execute()
        cases_data = all_cases_resp.data or []
        total_cases = len(cases_data)
        active_cases_list = [c for c in cases_data if c.get("case_stage") != "closed"]
        active_count = len(active_cases_list)
        critical_count = sum(1 for c in active_cases_list if (c.get("current_distress_score") or 0) >= 75)
        
        case_ids = [c["id"] for c in cases_data]
        active_sos = 0
        if case_ids:
            sos_resp = await supabase.table("sos_events").select("id").in_("case_id", case_ids).eq("resolved", False).execute()
            active_sos = len(sos_resp.data) if sos_resp.data else 0

        return {
            "district": district_name,
            "total_cases": total_cases,
            "totalCases": total_cases,
            "active_cases": active_count,
            "activeCases": active_count,
            "critical_alerts": critical_count,
            "criticalAlerts": critical_count,
            "active_sos": active_sos,
            "activeSos": active_sos,
        }
    except Exception as e:
        logger.error(f"Error fetching district stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/district/{district_name}/cases")
@router.get("/district/{district_name}/queue")
async def get_district_cases(
    district_name: str,
    current_user: CurrentStaffUser = Depends(require_roles(*_ALLOWED_ROLES)),
):
    """
    Returns case queue for district with enriched fields for triage display.
    """
    supabase = await get_supabase()
    try:
        users_resp = await supabase.table("users").select("id, name, phone_number").ilike("location_district", district_name).execute()
        user_map = {u["id"]: u for u in (users_resp.data or [])}
        if not user_map:
            return []
            
        cases_resp = await supabase.table("cases").select("*").in_("user_id", list(user_map.keys())).neq("case_stage", "closed").order("current_distress_score", desc=True).execute()
        cases = cases_resp.data or []
        
        # Counsellor cache for assigned names
        counsellor_ids = list(set([c.get("assigned_counsellor_id") for c in cases if c.get("assigned_counsellor_id")]))
        counsellor_map = {}
        if counsellor_ids:
            try:
                co_resp = await supabase.table("counsellors").select("id, name").in_("id", counsellor_ids).execute()
                counsellor_map = {co["id"]: co["name"] for co in (co_resp.data or [])}
            except Exception:
                pass

        # Hydrate user info & display fields
        for c in cases:
            c["user_name"] = user_map.get(c.get("user_id"), {}).get("name", "Unknown")
            c["assigned_counsellor_name"] = counsellor_map.get(c.get("assigned_counsellor_id")) or "Unassigned"
            score = c.get("current_distress_score") or 0
            c["distress_score"] = score
            c["risk"] = "critical" if score >= 75 else ("high" if score >= 60 else ("moderate" if score >= 40 else "low"))
            
        return cases
    except Exception as e:
        logger.error(f"Error fetching district cases: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/district/{district_name}/sos")
async def get_district_sos(
    district_name: str,
    current_user: CurrentStaffUser = Depends(require_roles(*_ALLOWED_ROLES)),
):
    """
    Returns active SOS events for district map.
    """
    supabase = await get_supabase()
    try:
        users_resp = await supabase.table("users").select("id").ilike("location_district", district_name).execute()
        user_ids = [u["id"] for u in (users_resp.data or [])]
        if not user_ids:
            return []
            
        cases_resp = await supabase.table("cases").select("id").in_("user_id", user_ids).execute()
        case_ids = [c["id"] for c in (cases_resp.data or [])]
        if not case_ids:
            return []
            
        resp = await supabase.table("sos_events").select("*").in_("case_id", case_ids).eq("resolved", False).execute()
        return resp.data or []
    except Exception as e:
        logger.error(f"Error fetching district SOS: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/district/{district_name}/counsellors")
@router.get("/district/{district_name}/roster")
async def get_district_counsellors(
    district_name: str,
    current_user: CurrentStaffUser = Depends(require_roles(*_ALLOWED_ROLES)),
):
    """
    Returns active counsellors for a district.
    """
    supabase = await get_supabase()
    try:
        resp = await supabase.table("counsellors").select("*").ilike("district", district_name).order("current_caseload", desc=True).execute()
        data = resp.data or []
        for c in data:
            c["active_cases"] = c.get("current_caseload", 0)
        return data
    except Exception as e:
        logger.error(f"Error fetching district counsellors: {e}")
        raise HTTPException(status_code=500, detail=str(e))
