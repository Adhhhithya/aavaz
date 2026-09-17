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
        # Mock aggregation for MVP
        stats = {
            "total_cases": 1250,
            "critical_cases": 85,
            "avg_resolution_time_hrs": 4.2
        }
        breakdown = [
            {"district": "North District", "cases": 450, "critical": 40},
            {"district": "South District", "cases": 800, "critical": 45}
        ]
        
        payload = {
            "stats": stats,
            "district_breakdown": breakdown
        }
        return apply_tier_redaction(payload, tier="state")
    except Exception as e:
        logger.error(f"Error in state dashboard: {e}")
        raise HTTPException(status_code=500, detail=str(e))
