from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from services.supabase_client import get_supabase
from api.auth.victim_dependencies import CurrentVictim, get_current_victim
import logging
from datetime import datetime, timezone

router = APIRouter()
logger = logging.getLogger(__name__)

class SOSRequest(BaseModel):
    case_id: str
    location_lat: float
    location_lng: float

@router.post("/sos")
async def trigger_sos(
    request: SOSRequest,
    current_victim: CurrentVictim = Depends(get_current_victim),
):
    """
    Trigger an SOS event for a given case.
    This creates a record in the sos_events table and kicks off the 30-minute escalation timer.
    """
    try:
        supabase = await get_supabase()

        # 1. Verify case exists, belongs to the caller, and get assigned counsellor
        case_resp = await supabase.table("cases").select("assigned_counsellor_id, user_id").eq("id", request.case_id).execute()
        if not case_resp.data:
            raise HTTPException(status_code=404, detail="Case not found")

        if case_resp.data[0].get("user_id") != current_victim.id:
            raise HTTPException(status_code=403, detail="This is not your case")

        assigned_counsellor = case_resp.data[0].get("assigned_counsellor_id")
        
        sos_id = None
        is_duplicate = False

        # 2. Insert SOS Event (Idempotent)
        sos_data = {
            "case_id": request.case_id,
            "location_lat": request.location_lat,
            "location_lng": request.location_lng,
            "assigned_counsellor_id": assigned_counsellor,
            "triggered_at": datetime.now(timezone.utc).isoformat(),
            "resolved": False
        }
        
        try:
            sos_resp = await supabase.table("sos_events").insert(sos_data).execute()
            if not sos_resp.data:
                raise Exception("Failed to insert SOS event.")
            sos_id = sos_resp.data[0]["id"]
        except Exception as e:
            if "duplicate key value violates unique constraint" in str(e).lower() or "23505" in str(e):
                logger.info(f"Duplicate active SOS ignored for case {request.case_id}")
                is_duplicate = True
                
                # Fetch the existing SOS ID to return it
                existing_sos = await supabase.table("sos_events").select("id").eq("case_id", request.case_id).eq("resolved", False).execute()
                if existing_sos.data:
                    sos_id = existing_sos.data[0]["id"]
            else:
                raise e

        # If it's not a duplicate, update the case score using fusion and schedule a task
        if not is_duplicate:
            from api.scoring.fusion import calculate_dynamic_score
            fusion_result = await calculate_dynamic_score(
                transcript="VICTIM TRIGGERED SOS BUTTON IN APP",
                call_duration=0
            )

            # Insert an interaction
            breakdown_dict = {
                k: {
                    "weight": v.weight, "raw_value": v.raw_value, "contribution": v.contribution, "notes": v.notes, "available": v.available
                } for k, v in fusion_result.score_breakdown.items()
            }
            interaction = {
                "case_id": request.case_id,
                "channel": "app",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "transcript_ref": "VICTIM TRIGGERED SOS BUTTON IN APP",
                "emotion_tag": fusion_result.emotion_tag.value,
                "sentiment_score": breakdown_dict.get("sentiment", {}).get("raw_value", 0.0),
                "engagement_score": breakdown_dict.get("engagement", {}).get("raw_value", 0.0),
                "history_score": 0.0,
                "acoustic_score": breakdown_dict.get("acoustic", {}).get("raw_value", 0.0),
                "final_score": fusion_result.distress_score,
                "score_breakdown": breakdown_dict,
                "intervention_recommended": fusion_result.intervention.value
            }

            # Update case score dynamically
            await supabase.table("cases").update({
                "current_distress_score": max(90, fusion_result.distress_score), # SOS is at least 90
                "updated_at": datetime.now(timezone.utc).isoformat()
            }).eq("id", request.case_id).execute()
            
            try:
                await supabase.table("interactions").insert(interaction).execute()
            except Exception as e:
                pass # Already updated case score, ignore interaction conflict
            
            # 3. Schedule 30-minute escalation (Idempotent)
            from datetime import timedelta
            task_data = {
                "user_id": current_victim.id,
                "case_id": request.case_id,
                "type": "SOS_ESCALATION",
                "priority": "CRITICAL",
                "status": "OPEN",
                "assignee_staff_id": assigned_counsellor,
                "sla_due_at": (datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat()
            }
            try:
                await supabase.table("tasks").insert(task_data).execute()
                logger.info(f"SOS triggered for case {request.case_id}. 30-minute escalation task created.")
            except Exception as e:
                pass # Task already exists
                
            # 4. Push notification
            from services.pushbullet_service import send_push_notification
            await send_push_notification(
                title="CRITICAL: SOS Activated",
                body=f"Victim {current_victim.id} has triggered an SOS alert in the mobile app. Immediate action required. Case ID: {request.case_id}"
            )

        return {"status": "success", "sos_id": sos_id, "is_duplicate": is_duplicate}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error triggering SOS: {e}")
        raise HTTPException(status_code=500, detail=str(e))
