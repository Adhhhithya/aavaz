from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.supabase_client import get_supabase
import logging
from datetime import datetime, timezone

router = APIRouter()
logger = logging.getLogger(__name__)

class SOSRequest(BaseModel):
    case_id: str
    location_lat: float
    location_lng: float

@router.post("/sos")
async def trigger_sos(request: SOSRequest):
    """
    Trigger an SOS event for a given case.
    This creates a record in the sos_events table and kicks off the 30-minute escalation timer.
    """
    try:
        supabase = await get_supabase()
        
        # 1. Verify case exists and get assigned counsellor
        case_resp = await supabase.table("cases").select("assigned_counsellor_id").eq("id", request.case_id).execute()
        if not case_resp.data:
            raise HTTPException(status_code=404, detail="Case not found")
            
        assigned_counsellor = case_resp.data[0].get("assigned_counsellor_id")
        
        # 2. Insert SOS Event
        sos_data = {
            "case_id": request.case_id,
            "location_lat": request.location_lat,
            "location_lng": request.location_lng,
            "assigned_counsellor_id": assigned_counsellor,
            "triggered_at": datetime.now(timezone.utc).isoformat()
        }
        
        sos_resp = await supabase.table("sos_events").insert(sos_data).execute()
        
        if not sos_resp.data:
            raise HTTPException(status_code=500, detail="Failed to create SOS event")
            
        # 3. Schedule 30-minute escalation (Mocked)
        # In a real system, this would push a task to Celery/Redis Queue, or use a cron job.
        logger.info(f"SOS triggered for case {request.case_id}. 30-minute escalation timer started.")
        
        return {"status": "success", "sos_id": sos_resp.data[0]["id"]}
        
    except Exception as e:
        logger.error(f"Error triggering SOS: {e}")
        raise HTTPException(status_code=500, detail=str(e))
