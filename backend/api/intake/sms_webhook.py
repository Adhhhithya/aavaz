from fastapi import APIRouter, HTTPException, Depends
from models.intake_models import PushbulletWebhookPayload
from services.supabase_client import get_supabase
from config import settings
from api.auth.webhook_auth import verify_pushbullet_webhook
import logging
import json
from datetime import datetime, timezone
from groq import AsyncGroq

router = APIRouter(dependencies=[Depends(verify_pushbullet_webhook)])
logger = logging.getLogger(__name__)

@router.post("/webhook")
async def pushbullet_webhook(payload: PushbulletWebhookPayload):
    """
    Receives SMS messages via Pushbullet.
    LLM checks for missing demographic fields or routes as chatbot.
    """
    if not settings.PUSHBULLET_API_KEY:
        logger.info("Pushbullet integration skipped: No API key provided.")
        # We proceed anyway for the sake of the hackathon logic testing if hit directly
    
    try:
        supabase = await get_supabase()
        msg = payload.message_body.strip()
        phone = payload.from_number
        
        # 1. Fetch user or create
        user_resp = await supabase.table("users").select("*").eq("phone_number", phone).execute()
        user_data = user_resp.data[0] if user_resp.data else None
        
        missing_fields = []
        if not user_data:
            # Create user on the fly via SMS
            new_user = {
                "phone_number": phone,
                "name": None,
                "role_type": "victim", # default MVP assumption
                "preferred_language": None,
                "consent_given": True, # implied by texting in
                "location_source": "sms"
            }
            user_insert = await supabase.table("users").insert(new_user).execute()
            user_data = user_insert.data[0]
            
            # Create a case
            case_data = {
                "user_id": user_data["id"],
                "case_type": "unspecified",
                "intake_channel": "sms",
                "case_stage": "registered"
            }
            await supabase.table("cases").insert(case_data).execute()
            
            missing_fields = ["name", "preferred_language", "district"]
        else:
            if not user_data.get("name"): missing_fields.append("name")
            if not user_data.get("preferred_language"): missing_fields.append("preferred_language")
            if not user_data.get("location_district"): missing_fields.append("district")

        if settings.GROQ_API_KEY:
            client = AsyncGroq(api_key=settings.GROQ_API_KEY)
            prompt = f"""
            You are the MoSJE Justice System AI assistant. A user has texted via SMS.
            Current user missing fields: {', '.join(missing_fields) if missing_fields else 'None'}
            
            If there are missing fields, your reply MUST be a natural, conversational question asking the user to provide them (e.g., "Hello, to register your case, what is your name and district?"). Keep it under 160 characters.
            If there are NO missing fields, respond to their message empathetically as a support chatbot.
            
            User message: "{msg}"
            """
            
            response = await client.chat.completions.create(
                model='llama-3.3-70b-versatile',
                messages=[{"role": "system", "content": prompt}]
            )
            reply = response.choices[0].message.content
        else:
            if missing_fields:
                reply = f"Please reply with your {missing_fields[0]}."
            else:
                reply = "We have received your message and your counsellor will reach out."
                
        # Send SMS back via Pushbullet (mocked via logger if no key)
        if settings.PUSHBULLET_API_KEY:
            logger.info(f"Sending Pushbullet SMS to {phone}: {reply}")
            # Mocking the actual HTTP call to pushbullet for brevity
            
        return {"status": "success", "reply": reply}
    except Exception as e:
        logger.error(f"Pushbullet webhook error: {e}")
        return {"status": "error", "message": str(e)}
