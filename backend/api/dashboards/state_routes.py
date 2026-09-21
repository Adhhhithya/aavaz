from fastapi import APIRouter, Depends, HTTPException
from services.supabase_client import get_supabase
from services.pii_redaction import apply_tier_redaction
from api.auth.dependencies import CurrentStaffUser, require_roles
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/stats")
async def get_state_dashboard(
    current_user: CurrentStaffUser = Depends(require_roles("state_admin", "national_admin", "super_admin")),
):
    """
    Returns aggregate stats for the state dashboard. PII is redacted.
    """
    supabase = await get_supabase()
    try:
        # Fetch the staff user's state
        staff_resp = await supabase.table("staff").select("state").eq("id", current_user.id).single().execute()
        staff_state = staff_resp.data.get("state") if staff_resp.data else None

        # Fetch cases (if staff_state is set, filter by users in that state, else all cases)
        cases_resp = await supabase.table("cases").select("id, current_distress_score, user_id, case_type").neq("case_stage", "closed").execute()
        cases = cases_resp.data
        
        user_ids = list(set([c["user_id"] for c in cases]))
        users = []
        if user_ids:
            users_resp = await supabase.table("users").select("id, location_state, location_district").in_("id", user_ids).execute()
            if staff_state:
                users = [u for u in users_resp.data if u.get("location_state") == staff_state]
            else:
                users = users_resp.data
                
        user_map = {u["id"]: u for u in users}
        valid_cases = [c for c in cases if c["user_id"] in user_map]
        
        district_stats = {}
        for c in valid_cases:
            user = user_map[c["user_id"]]
            dist = user.get("location_district") or "Unknown"
            if dist not in district_stats:
                district_stats[dist] = {"cases": 0, "critical": 0}
            
            district_stats[dist]["cases"] += 1
            if c.get("current_distress_score", 0) >= 75:
                district_stats[dist]["critical"] += 1
                
        breakdown = []
        total_cases = len(valid_cases)
        total_critical = sum(s["critical"] for s in district_stats.values())

        for dist, st in district_stats.items():
            risk_tier = "critical" if st["critical"] > 10 else ("high" if st["critical"] > 5 else "low")
            breakdown.append({
                "id": dist,
                "name": dist,
                "total": st["cases"],
                "critical": st["critical"],
                "activeSOS": st["critical"],
                "risk": risk_tier
            })

        stats = {
            "total_cases": total_cases,
            "critical_cases": total_critical
        }
        
        payload = {
            "stats": stats,
            "district_breakdown": breakdown
        }
        return apply_tier_redaction(payload, tier="state")
    except Exception as e:
        logger.error(f"Error in state dashboard: {e}")
        raise HTTPException(status_code=500, detail=str(e))
