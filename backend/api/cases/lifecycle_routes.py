from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from services.supabase_client import get_supabase
from api.auth.dependencies import CurrentStaffUser, require_roles
from datetime import datetime, timezone
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

class StageUpdateRequest(BaseModel):
    new_stage: str
    update_source: str
    notes: str = ""

_ALLOWED_ROLES = ("counsellor", "district_admin", "state_admin", "national_admin", "super_admin")


@router.post("/{case_id}/stage")
async def update_case_stage(
    case_id: str,
    payload: StageUpdateRequest,
    current_user: CurrentStaffUser = Depends(require_roles(*_ALLOWED_ROLES)),
):
    """
    Updates the lifecycle stage of a case. Staff-only (case managers and above).
    """
    supabase = await get_supabase()
    try:
        # Get old stage
        case = await supabase.table("cases").select("case_stage, assigned_counsellor_id").eq("id", case_id).single().execute()
        old_stage = case.data["case_stage"]

        if current_user.role == "counsellor" and case.data.get("assigned_counsellor_id") != current_user.id:
            raise HTTPException(status_code=403, detail="This case is not assigned to you")

        # Update stage
        await supabase.table("cases").update({
            "case_stage": payload.new_stage,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }).eq("id", case_id).execute()
        
        # Log to case_updates
        await supabase.table("case_updates").insert({
            "case_id": case_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "previous_stage": old_stage,
            "new_stage": payload.new_stage,
            "update_source": payload.update_source,
            "notes": payload.notes
        }).execute()
        
        return {"status": "success", "new_stage": payload.new_stage}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating stage: {e}")
        raise HTTPException(status_code=500, detail=str(e))
