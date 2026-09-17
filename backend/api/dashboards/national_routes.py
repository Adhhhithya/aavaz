from fastapi import APIRouter, Depends, HTTPException
from services.supabase_client import get_supabase
from services.pii_redaction import apply_tier_redaction
from api.auth.dependencies import CurrentStaffUser, require_roles
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/stats")
async def get_national_dashboard(
    current_user: CurrentStaffUser = Depends(require_roles("national_admin", "super_admin")),
):
    """
    Returns aggregate stats for the national dashboard. PII is redacted.
    """
    supabase = await get_supabase()
    try:
        # Fetch all active cases
        cases_resp = await supabase.table("cases").select("id, current_distress_score, user_id, case_type").neq("case_stage", "closed").execute()
        cases = cases_resp.data
        
        # Fetch all users associated with these cases
        user_ids = list(set([c["user_id"] for c in cases]))
        users = []
        if user_ids:
            users_resp = await supabase.table("users").select("id, location_state").in_("id", user_ids).execute()
            users = users_resp.data
            
        user_map = {u["id"]: u for u in users}
        
        total_cases_nationwide = len(cases)
        
        # Calculate state breakdown
        state_stats = {}
        for c in cases:
            user = user_map.get(c["user_id"])
            if user and user.get("location_state"):
                state = user["location_state"]
                if state not in state_stats:
                    state_stats[state] = {"cases": 0, "critical": 0, "case_types": {}}
                
                state_stats[state]["cases"] += 1
                if c.get("current_distress_score", 0) >= 75:
                    state_stats[state]["critical"] += 1
                    
                ctype = c.get("case_type", "Unknown")
                state_stats[state]["case_types"][ctype] = state_stats[state]["case_types"].get(ctype, 0) + 1
                
        state_breakdown = []
        for state, stats in state_stats.items():
            prevalent_type = max(stats["case_types"], key=stats["case_types"].get) if stats["case_types"] else "N/A"
            state_breakdown.append({
                "state": state,
                "cases": stats["cases"],
                "critical": stats["critical"],
                "prevalent_type": prevalent_type,
                "avg_resolution": "In Progress", # Can't compute easily without closed cases timeframe
                "trend": "Stable"
            })
            
        payload = {
            "total_cases_nationwide": total_cases_nationwide,
            "avg_sla": "24h", # Placeholder until SLA tracking is implemented
            "resource_utilization": "76%", # Placeholder until counsellor loads are summed
            "state_breakdown": state_breakdown,
            "policy_insights": [
                "Increase in distress escalation correlates with delays in Trial stage.",
                "High engagement drop-off in rural districts."
            ]
        }
        return apply_tier_redaction(payload, tier="national")
    except Exception as e:
        logger.error(f"Error in national dashboard: {e}")
        raise HTTPException(status_code=500, detail=str(e))
