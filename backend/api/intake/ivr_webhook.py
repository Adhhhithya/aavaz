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
        
        # 1. Lookup user by phone number
        user_resp = await supabase.table("users").select("id").eq("phone_number", payload.user_phone).execute()
        
        if not user_resp.data:
            # IVR-First Workflow: Create a new user immediately
            new_user = {
                "phone_number": payload.user_phone,
                "name": "Unknown Caller",
                "role_type": "victim",
                "preferred_language": payload.language_detected or "en",
                "location_source": "ivr",
                "consent_given": True # Implied by IVR interaction for demo
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
                "predicted_escalation_risk": "medium"
            }
            case_insert_resp = await supabase.table("cases").insert(new_case).execute()
            case_id = case_insert_resp.data[0]["id"]
            logger.info(f"Registered new case from IVR: {case_id}")
        else:
            case_id = case_resp.data[0]["id"]
            
        # 3. Dynamic LLM-Based Scoring & Categorization
        # We pass the transcript to our new Privacy-Preserving LLM Fusion Engine
        fusion_result = await calculate_dynamic_score(
            transcript=payload.transcript or "", 
            call_duration=payload.duration_seconds or 0
        )
        
        final_score = fusion_result["final_score"]
        escalation_risk = fusion_result["escalation_risk"]
        case_type = fusion_result["case_type"]
        intervention = fusion_result["recommended_intervention"]
        xai_reasoning = fusion_result["reasoning"]
        
        emotion_tag = "high_stress" if final_score > 60 else "neutral"
        
        # Update case with new score and LLM categorizations
        await supabase.table("cases").update({
            "current_distress_score": final_score,
            "predicted_escalation_risk": escalation_risk,
            "case_type": case_type,
            "recommended_intervention": intervention
        }).eq("id", case_id).execute()
        
        # 4. Insert into interactions
        interaction_data = {
            "case_id": case_id,
            "channel": "ivr",
            "transcript_ref": payload.transcript,
            "audio_ref": payload.audio_url,
            "sentiment_score": final_score * 0.8,
            "engagement_score": 100,
            "history_score": 0.0,
            "final_score": final_score,
            "score_breakdown": {
                "acoustic": {"contribution": 30, "reason": "Derived from call metadata"}, 
                "sentiment": {"contribution": 70, "reason": xai_reasoning}
            },
            "emotion_tag": emotion_tag,
            "intervention_recommended": intervention
        }
        
        await supabase.table("interactions").insert(interaction_data).execute()
        
        # 5. Alerting Logic
        if final_score > 60:
            logger.warning(f"HIGH DISTRESS DETECTED ({final_score}). Escalating to Counsellor.")
            # In a real app, this would trigger Pushbullet/WhatsApp or Auto-assign
        
        return {"status": "success", "case_id": case_id, "score": final_score, "intervention": intervention}
    except Exception as e:
        logger.error(f"Bolna webhook error: {e}")
        return {"status": "error", "message": str(e)}

@router.post("/distress-assessment")
async def bolna_distress_assessment(payload: BolnaDistressAssessment):
    """
    Called by the Bolna IVR agent MID-CALL as a Custom Tool to submit the NLP distress assessment.
    """
    try:
        # Here we would normally link this back to the user/case based on caller ID or session,
        # but for the hackathon MVP, we just log the distress assessment or update the active case.
        logger.info(f"Received Distress Assessment from Bolna: {payload}")
        
        # Example logic: if immediate threat is detected, we could escalate right here.
        if payload.immediate_threat_detected:
            logger.warning("HIGH PRIORITY: Immediate threat detected on call!")
            # Trigger escalation
            
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
    Called by Bolna at the very start of the call.
    Returns dynamic context (name, case stage) to inject into the agent's prompt.
    """
    try:
        supabase = await get_supabase()
        user_phone = payload.user_phone
        
        # 1. Lookup user by phone number
        user_resp = await supabase.table("users").select("*").eq("phone_number", user_phone).execute()
        
        if not user_resp.data:
            # First time caller
            return {
                "name": "Caller",
                "case_type": "an unclassified issue",
                "case_stage": "initial assessment",
                "is_new_caller": "true"
            }
            
        user = user_resp.data[0]
        
        # 2. Find active case
        case_resp = await supabase.table("cases").select("*").eq("user_id", user["id"]).neq("case_stage", "closed").execute()
        
        if not case_resp.data:
            return {
                "name": user["name"] or "Caller",
                "case_type": "a new inquiry",
                "case_stage": "registration",
                "is_new_caller": "false"
            }
            
        case = case_resp.data[0]
        
        # Return context to Bolna
        return {
            "name": user["name"] or "Caller",
            "case_type": case["case_type"].replace('_', ' '),
            "case_stage": case["case_stage"].replace('_', ' '),
            "is_new_caller": "false"
        }
    except Exception as e:
        logger.error(f"Error in pre-call webhook: {e}")
        # Return safe defaults if DB fails, so the call doesn't crash
        return {
            "name": "Caller",
            "case_type": "your case",
            "case_stage": "processing",
            "is_new_caller": "unknown"
        }
