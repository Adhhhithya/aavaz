from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import asyncio
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

class ChatMessage(BaseModel):
    user_id: str
    session_id: str
    message: str

from datetime import datetime, timezone
from services.llm_parser import generate_chat_response
from api.scoring.fusion import calculate_dynamic_score

@router.post("/message")
async def handle_chatbot_message(payload: ChatMessage):
    """
    Chatbot LLM endpoint using Gemini.
    Returns dynamic responses for mobile app and saves to DB.
    """
    logger.info(f"Received chat from {payload.user_id}: {payload.message}")
    
    reply = "I'm having trouble connecting right now, but I'm here for you. Please try again in a moment."
    emotion = "neutral"
    
    try:
        from services.supabase_client import get_supabase
        supabase = await get_supabase()
        
        # Get active case and history for context
        cases_resp = await supabase.table("cases").select("*").eq("user_id", payload.user_id).order("created_at", desc=True).limit(1).execute()
        case_data = cases_resp.data[0] if cases_resp.data else None
        case_id = case_data["id"] if case_data else None
        
        user_resp = await supabase.table("users").select("name, preferred_language, role_type").eq("id", payload.user_id).execute()
        user_data = user_resp.data[0] if user_resp.data else None
        
        case_context = None
        if case_data and user_data:
            case_context = {
                "user_name": user_data.get("name"),
                "role_type": user_data.get("role_type"),
                "preferred_language": user_data.get("preferred_language"),
                "case_type": case_data.get("case_type"),
                "case_stage": case_data.get("case_stage"),
                "current_distress_score": case_data.get("current_distress_score")
            }
        
        history_messages = []
        if case_id:
            interactions = await supabase.table("interactions").select("transcript_ref").eq("case_id", case_id).eq("channel", "chatbot").order("timestamp", desc=False).execute()
            for row in interactions.data[-10:]: # last 10 messages
                text = row["transcript_ref"]
                if text.startswith("User: "):
                    history_messages.append({"role": "user", "content": text[6:]})
                elif text.startswith("Bot: "):
                    history_messages.append({"role": "model", "content": text[5:]})
                    
        # Append current message
        history_messages.append({"role": "user", "content": payload.message})
        
        # Generate response using LLM
        reply = await generate_chat_response(history_messages, case_context)
        
        # Calculate dynamic score using the XAI fusion engine based on the user's message
        fusion_result = await calculate_dynamic_score(payload.message, 0)
        
        final_score = fusion_result["final_score"]
        escalation_risk = fusion_result["escalation_risk"]
        case_type = fusion_result["case_type"]
        intervention = fusion_result["recommended_intervention"]
        xai_reasoning = fusion_result["reasoning"]
        
        emotion = "high_stress" if final_score > 60 else "neutral"
        if "help" in payload.message.lower() or "scared" in payload.message.lower():
            emotion = "fear"

        # Update case with new score and LLM categorizations
        if case_id:
            await supabase.table("cases").update({
                "current_distress_score": final_score,
                "predicted_escalation_risk": escalation_risk,
                "case_type": case_type,
                "recommended_intervention": intervention
            }).eq("id", case_id).execute()
        
            # Save user message
            await supabase.table("interactions").insert({
                "case_id": case_id,
                "channel": "chatbot",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "transcript_ref": f"User: {payload.message}",
                "emotion_tag": emotion,
                "sentiment_score": final_score * 0.8,
                "engagement_score": 100,
                "history_score": 0.0,
                "final_score": final_score,
                "score_breakdown": {
                    "acoustic": {"contribution": 0, "reason": "Text-only channel, no acoustic data"},
                    "sentiment": {"contribution": 100, "reason": xai_reasoning}
                },
                "intervention_recommended": intervention
            }).execute()
            
            # Save bot message
            await supabase.table("interactions").insert({
                "case_id": case_id,
                "channel": "chatbot",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "transcript_ref": f"Bot: {reply}",
                "emotion_tag": "neutral",
                "sentiment_score": 0,
                "engagement_score": 100,
                "history_score": 0,
                "final_score": 0,
                "score_breakdown": {
                    "acoustic": {"contribution": 0, "reason": "Bot message"},
                    "sentiment": {"contribution": 0, "reason": "Bot message"}
                }
            }).execute()
    except Exception as e:
        logger.error(f"Failed to save chat: {e}")
        
    return {
        "reply": reply,
        "emotion_flagged": emotion
    }

@router.get("/history/{user_id}")
async def get_chat_history(user_id: str):
    """
    Gets chat history for the user
    """
    try:
        from services.supabase_client import get_supabase
        supabase = await get_supabase()
        
        cases_resp = await supabase.table("cases").select("id").eq("user_id", user_id).order("created_at", desc=True).limit(1).execute()
        if not cases_resp.data:
            return {"messages": []}
            
        case_id = cases_resp.data[0]["id"]
        
        interactions = await supabase.table("interactions").select("*").eq("case_id", case_id).eq("channel", "chatbot").order("timestamp", desc=False).execute()
        
        messages = []
        for row in interactions.data:
            text = row["transcript_ref"]
            if text.startswith("User: "):
                messages.append({"id": row["id"], "text": text[6:], "sender": "user"})
            elif text.startswith("Bot: "):
                messages.append({"id": row["id"], "text": text[5:], "sender": "bot"})
                
        return {"messages": messages}
    except Exception as e:
        logger.error(f"Failed to fetch history: {e}")
        return {"messages": []}
