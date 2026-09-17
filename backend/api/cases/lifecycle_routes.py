from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.supabase_client import get_supabase
from datetime import datetime, timezone
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

class StageUpdateRequest(BaseModel):
    new_stage: str
    update_source: str
    notes: str = ""

@router.post("/{case_id}/stage")
async def update_case_stage(case_id: str, payload: StageUpdateRequest):
    """
    Updates the lifecycle stage of a case.
    """
    supabase = await get_supabase()
    try:
        # Get old stage
        case = await supabase.table("cases").select("case_stage").eq("id", case_id).single().execute()
        old_stage = case.data["case_stage"]
        
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
    except Exception as e:
        logger.error(f"Error updating stage: {e}")
        raise HTTPException(status_code=500, detail=str(e))
