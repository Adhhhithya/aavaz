from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import asyncio
import logging

from api.auth.victim_dependencies import CurrentVictim, get_current_victim

router = APIRouter()
logger = logging.getLogger(__name__)

class ChatMessage(BaseModel):
    # user_id intentionally removed (S2): derived from the authenticated
    # victim's session instead of trusted client input.
    session_id: str
    message: str

from datetime import datetime, timezone
from services.llm_parser import build_system_prompt
from services.agents.supervisor import execute_turn, new_conversation
from api.scoring.fusion import calculate_dynamic_score_legacy

@router.post("/message")
async def handle_chatbot_message(
    payload: ChatMessage,
    current_victim: CurrentVictim = Depends(get_current_victim),
):
    """
    Chatbot LLM endpoint using Gemini.
    Returns dynamic responses for mobile app and saves to DB.
    """
    logger.info(f"Received chat from {current_victim.id}")

    reply = "I'm having trouble connecting to my service right now. Please try again in a moment."
    emotion = "neutral"
    final_score = 0.0
    escalation_risk = "unknown"
    conv_state = None
    
    try:
        from services.supabase_client import get_supabase
        supabase = await get_supabase()

        # Get active case and history for context
        cases_resp = await supabase.table("cases").select("*").eq("user_id", current_victim.id).order("created_at", desc=True).limit(1).execute()
        case_data = cases_resp.data[0] if cases_resp.data else None
        case_id = case_data["id"] if case_data else None

        user_resp = await supabase.table("users").select("name, preferred_language, role_type").eq("id", current_victim.id).execute()
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

        language = (user_data.get("preferred_language") if user_data else None) or "en"
        submitter_role = (case_data.get("submitter_role") if case_data else None) or (user_data.get("role_type") if user_data else None) or "victim"

        # --- Multi-Agent Supervisor pipeline ---
        conv_state = new_conversation(
            victim_id=current_victim.id,
            case_id=case_id,
            language=language,
            channel="chat",
            submitter_role=submitter_role,
            history_score=float(case_data.get("current_distress_score") or 0.0) if case_data else 0.0
        )

        if case_id:
            from models.contracts import Turn
            interactions = await supabase.table("interactions").select("transcript_ref").eq("case_id", case_id).eq("channel", "chatbot").order("timestamp", desc=False).execute()
            for row in interactions.data[-10:]:
                text = row["transcript_ref"]
                if text.startswith("User: "):
                    conv_state.transcript.append(Turn(
                        conversation_id=conv_state.conversation_id,
                        turn_id=f"hist_{len(conv_state.transcript)}",
                        speaker="user", language=language,
                        transcript=text[6:],
                    ))
                elif text.startswith("Bot: "):
                    conv_state.transcript.append(Turn(
                        conversation_id=conv_state.conversation_id,
                        turn_id=f"hist_{len(conv_state.transcript)}",
                        speaker="agent", language=language,
                        transcript=text[5:],
                    ))

        conv_state, reply = await execute_turn(
            state=conv_state,
            user_text=payload.message
        )

        distress = conv_state.distress
        final_score = distress.distress_score if distress else 0.0
        escalation_risk = distress.risk_level.value.lower() if distress else "medium"
        intervention = distress.intervention.value if distress else "none"
        emotion = distress.emotion_tag.value if distress else "neutral"
        score_breakdown = {
            k: {"weight": v.weight, "contribution": v.contribution, "notes": v.notes}
            for k, v in (distress.score_breakdown.items() if distress else {})
        }

        if case_id:
            if distress:
                await supabase.table("cases").update({
                    "current_distress_score": final_score,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }).eq("id", case_id).execute()

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
                "score_breakdown": score_breakdown or {"acoustic": {"contribution": 0}, "sentiment": {"contribution": 100}},
                "intervention_recommended": intervention,
            }).execute()

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
                "score_breakdown": {"acoustic": {"contribution": 0}, "sentiment": {"contribution": 0}},
            }).execute()

    except Exception as e:
        logger.error(f"Failed to process chat turn: {e}")

    return {
        "reply": reply,
        "emotion_flagged": emotion,
        "distress_score": final_score,
        "risk_level": escalation_risk,
        "escalated": bool(conv_state.escalation) if conv_state else False,
    }

@router.get("/voice-context")
async def get_voice_context(
    current_victim: CurrentVictim = Depends(get_current_victim),
):
    """
    Composes the grounded AAVAZ system prompt (same domain knowledge/crisis
    rules as the text chatbot, see services/llm_parser.build_system_prompt)
    for the authenticated victim's current case, for the voice agent
    integration to use. The mobile app fetches this once when opening the
    voice screen and sends it to the voice-agent WS as a "context" message
    right after connecting (see voice-agent/app/ws.py's "context" handler).
    """
    try:
        from services.supabase_client import get_supabase
        supabase = await get_supabase()

        cases_resp = await supabase.table("cases").select("*").eq("user_id", current_victim.id).order("created_at", desc=True).limit(1).execute()
        case_data = cases_resp.data[0] if cases_resp.data else None

        user_resp = await supabase.table("users").select("name, preferred_language, role_type").eq("id", current_victim.id).execute()
        user_data = user_resp.data[0] if user_resp.data else None

        case_context = None
        if case_data and user_data:
            case_context = {
                "user_name": user_data.get("name"),
                "role_type": user_data.get("role_type"),
                "preferred_language": user_data.get("preferred_language"),
                "case_type": case_data.get("case_type"),
                "case_stage": case_data.get("case_stage"),
                "current_distress_score": case_data.get("current_distress_score"),
            }

        return {
            "system_prompt": build_system_prompt(case_context, voice=True),
            "victim_id": current_victim.id,
            "case_id": case_data["id"] if case_data else None,
        }
    except Exception as e:
        logger.error(f"Failed to build voice context: {e}")
        return {
            "system_prompt": build_system_prompt(None, voice=True),
            "victim_id": current_victim.id if 'current_victim' in locals() else None,
            "case_id": None,
        }


@router.get("/history/{user_id}")
async def get_chat_history(
    user_id: str,
    current_victim: CurrentVictim = Depends(get_current_victim),
):
    """
    Gets chat history for the user.

    S2: `user_id` is verified against the authenticated victim's own id — a
    mismatch is rejected before any data is read.
    """
    if user_id != current_victim.id:
        raise HTTPException(status_code=403, detail="You may only view your own chat history")

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
