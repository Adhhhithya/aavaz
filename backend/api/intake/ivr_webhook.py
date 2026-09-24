from fastapi import APIRouter, HTTPException, Depends
from models.intake_models import BolnaWebhookPayload, BolnaDistressAssessment, BolnaPreCallPayload
from services.supabase_client import get_supabase
from api.scoring.fusion import calculate_dynamic_score
from api.auth.webhook_auth import verify_bolna_webhook
import logging

router = APIRouter(dependencies=[Depends(verify_bolna_webhook)])
logger = logging.getLogger(__name__)

@router.post("/webhook")
async def bolna_webhook(payload: BolnaWebhookPayload):
    """
    Receives call transcripts and recording URLs from Bolna IVR.
    Triggers the scoring pipeline and creates user/case if this is a first-time caller.
    """
    try:
        supabase = await get_supabase()
        
        event_id = payload.call_id or "unknown_call"
        
        # --- Idempotency Check ---
        # Use an atomic insert. If this fails due to a unique constraint violation,
        # it means the event was already processed.
        try:
            await supabase.table("webhook_events").insert({
                "provider": "bolna",
                "external_event_id": event_id,
                "event_type": payload.call_status or "completed",
                "payload": payload.dict()
            }).execute()
        except Exception as e:
            if "duplicate key value violates unique constraint" in str(e).lower() or "23505" in str(e):
                logger.info(f"Idempotency: Webhook {event_id} already processed. Skipping.")
                return {"status": "ok", "message": "Already processed"}
            raise e
        
        caller_phone = payload.caller_phone or "Unknown"
        # 1. Lookup user by phone number
        user_resp = await supabase.table("users").select("id").eq("phone_number", caller_phone).execute()
        
        if not user_resp.data:
            # IVR-First Workflow: Create a new user immediately
            new_user = {
                "phone_number": caller_phone,
                "name": "Unknown Caller",
                "role_type": "victim",
                "preferred_language": payload.language_detected or "en",
                "location_source": "ivr",
                "consent_given": False  # IVR intake cannot constitute implied consent; must be obtained explicitly in subsequent interaction
            }
            insert_resp = await supabase.table("users").insert(new_user).execute()
            user_id = insert_resp.data[0]["id"]
            logger.info(f"Created new user from IVR: {user_id}")
        else:
            user_id = user_resp.data[0]["id"]
            
        # 2. Find active case for this user
        case_resp = await supabase.table("cases").select("id").eq("user_id", user_id).neq("case_stage", "closed").execute()
        
        if not case_resp.data:
            # Create a new case
            new_case = {
                "user_id": user_id,
                "case_type": "general_inquiry", # Default until categorized by NLP
                "intake_channel": "ivr",
                "case_stage": "registered",
                "current_distress_score": 0,
                "priority_rank": 0
            }
            case_insert_resp = await supabase.table("cases").insert(new_case).execute()
            case_id = case_insert_resp.data[0]["id"]
            logger.info(f"Registered new case from IVR: {case_id}")
        else:
            case_id = case_resp.data[0]["id"]
            
        # 3. Dynamic Multimodal Scoring
        try:
            fusion_result = await calculate_dynamic_score(
                transcript=payload.transcript or "",
                call_duration=payload.duration_seconds or 0,
                audio_url=payload.audio_url or None,
            )
            final_score = fusion_result.distress_score
            intervention = fusion_result.intervention.value
            emotion_tag = fusion_result.emotion_tag.value
            
            # Extract breakdown components safely
            breakdown_dict = {
                k: {
                    "weight": v.weight,
                    "raw_value": v.raw_value,
                    "contribution": v.contribution,
                    "notes": v.notes,
                    "available": v.available
                } for k, v in fusion_result.score_breakdown.items()
            }
        except Exception as fusion_err:
            logger.warning(f"ML Scoring failed for webhook {event_id}. Falling back to default baseline: {fusion_err}")
            final_score = 0.0
            intervention = "none"
            emotion_tag = "neutral"
            breakdown_dict = {}
        
        # Update case with new score
        await supabase.table("cases").update({
            "current_distress_score": final_score,
            "updated_at": "now()"
        }).eq("id", case_id).execute()
        
        # 4. Insert into interactions
        interaction_data = {
            "case_id": case_id,
            "channel": "ivr",
            "transcript_ref": payload.transcript or "IVR call recorded",
            "audio_ref": payload.audio_url,
            "sentiment_score": breakdown_dict.get("sentiment", {}).get("raw_value", 0.0),
            "engagement_score": breakdown_dict.get("engagement", {}).get("raw_value", 0.0),
            "history_score": 0.0,
            "acoustic_score": breakdown_dict.get("acoustic", {}).get("raw_value", 0.0),
            "final_score": final_score,
            "score_breakdown": breakdown_dict,
            "emotion_tag": emotion_tag,
            "intervention_recommended": intervention
        }
        
        await supabase.table("interactions").insert(interaction_data).execute()
        
        # 5. Alerting Logic
        if final_score > 60:
            logger.warning(f"HIGH DISTRESS DETECTED ({final_score}). Escalating to Counsellor.")
        
        return {"status": "success", "case_id": case_id, "score": final_score, "intervention": intervention}
    except Exception as e:
        logger.error(f"Bolna webhook error: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}

@router.post("/distress-assessment")
async def bolna_distress_assessment(payload: BolnaDistressAssessment):
    """
    Called by the Bolna IVR agent MID-CALL as a Custom Tool to submit the NLP distress assessment.
    """
    try:
        logger.info(f"Received Distress Assessment from Bolna: {payload}")
        if payload.immediate_threat_detected:
            logger.warning("HIGH PRIORITY: Immediate threat detected on call!")
            
        return {
            "status": "success",
            "message": "Distress assessment logged successfully."
        }
    except Exception as e:
        logger.error(f"Error in distress assessment webhook: {e}")
        return {"status": "error", "message": str(e)}

@router.post("/pre-call")
async def bolna_pre_call(payload: BolnaPreCallPayload):
    """
    Called by Bolna at the very start of the call (inbound or outbound).
    Looks up victim history, case details, and assigned counsellor by phone number.
    Returns rich dynamic context to inject into Bolna's prompt variables.
    """
    user_phone = payload.phone
    logger.info(f"Received Bolna pre-call request for phone: {user_phone}")
    
    try:
        supabase = await get_supabase()
        
        user_resp = await supabase.table("users").select("*").eq("phone_number", user_phone).execute()
        if not user_resp.data and user_phone.startswith("+91"):
            user_resp = await supabase.table("users").select("*").eq("phone_number", user_phone[3:]).execute()
        if not user_resp.data and len(user_phone) == 10:
            user_resp = await supabase.table("users").select("*").eq("phone_number", f"+91{user_phone}").execute()
        
        if not user_resp.data:
            # First time / unknown caller
            return {
                "name": "Caller",
                "phone_number": user_phone or "Unknown",
                "case_id": "none",
                "case_type": "New Atrocity Support Request",
                "case_stage": "Initial Intake",
                "district": "General",
                "current_distress_score": 0,
                "distress_level": "Unassessed",
                "counsellor_name": "Helpline Duty Officer",
                "last_interaction_notes": "First time reaching out to AAVAZ support.",
                "case_summary": "New caller. Listen attentively, identify their situation, and offer empathetic guidance regarding safety and rights under the SC/ST PoA Act.",
                "is_new_caller": "true"
            }
            
        user = user_resp.data[0]
        user_name = user.get("name") or "Caller"
        district = user.get("location_district") or "Assigned District"
        
        # 2. Find active case
        case_resp = await supabase.table("cases").select("*").eq("user_id", user["id"]).neq("case_stage", "closed").execute()
        
        if not case_resp.data:
            return {
                "name": user_name,
                "phone_number": user.get("phone_number") or user_phone,
                "case_id": "none",
                "case_type": "General Inquiry",
                "case_stage": "Pre-registration",
                "district": district,
                "current_distress_score": 0,
                "distress_level": "Normal",
                "counsellor_name": "Helpline Duty Officer",
                "last_interaction_notes": "Registered user with no active legal case open.",
                "case_summary": f"Registered caller {user_name} with no active case. Inquire gently about their well-being and any assistance needed.",
                "is_new_caller": "false"
            }
            
        case = case_resp.data[0]
        case_id = case.get("id")
        case_type = (case.get("case_type") or "Atrocity Inquiry").replace('_', ' ').title()
        case_stage = (case.get("case_stage") or "Registered").replace('_', ' ').title()
        distress_score = float(case.get("current_distress_score") or 0.0)
        
        # Distress classification
        if distress_score >= 75:
            distress_level = "Critical / High Risk"
        elif distress_score >= 50:
            distress_level = "Moderate Distress"
        else:
            distress_level = "Mild / Stable"
            
        # 3. Lookup Assigned Counsellor
        counsellor_name = "Assigned Support Counsellor"
        counsellor_id = case.get("assigned_counsellor_id")
        if counsellor_id:
            try:
                c_resp = await supabase.table("counsellors").select("name").eq("id", counsellor_id).execute()
                if c_resp.data and c_resp.data[0].get("name"):
                    counsellor_name = c_resp.data[0]["name"]
            except Exception:
                pass
                
        # 4. Lookup Recent Interaction History
        last_notes = "No prior interaction logs found."
        try:
            int_resp = await supabase.table("interactions").select("transcript_ref,emotion_tag,final_score,intervention_recommended,timestamp").eq("case_id", case_id).execute()
            if int_resp.data:
                recent = int_resp.data[-1]
                emotion = recent.get("emotion_tag") or "neutral"
                score = recent.get("final_score") or 0
                rec = recent.get("intervention_recommended") or "Routine supportive follow-up"
                last_notes = f"Last check-in score: {score:.0f}/100 ({emotion}). Recommended: {rec}."
        except Exception:
            pass
            
        case_summary = (
            f"Patient {user_name}, Case: {case_type} at {case_stage} stage in {district}. "
            f"Current distress score: {distress_score:.0f}/100 ({distress_level}). "
            f"Assigned counsellor: {counsellor_name}. {last_notes}"
        )
        
        return {
            "name": user_name,
            "phone_number": user.get("phone_number") or user_phone,
            "case_id": str(case_id),
            "case_type": case_type,
            "case_stage": case_stage,
            "district": district,
            "current_distress_score": round(distress_score, 1),
            "distress_level": distress_level,
            "counsellor_name": counsellor_name,
            "last_interaction_notes": last_notes,
            "case_summary": case_summary,
            "is_new_caller": "false"
        }
    except Exception as e:
        logger.error(f"Error in Bolna pre-call webhook: {e}", exc_info=True)
        return {
            "name": "Caller",
            "phone_number": user_phone or "Unknown",
            "case_id": "none",
            "case_type": "Support Inquiry",
            "case_stage": "Active Support",
            "district": "General",
            "current_distress_score": 0,
            "distress_level": "Unassessed",
            "counsellor_name": "Helpline Officer",
            "last_interaction_notes": "Unable to retrieve real-time history.",
            "case_summary": "Inquire supportively about the caller's current well-being and emotional state.",
            "is_new_caller": "unknown"
        }
