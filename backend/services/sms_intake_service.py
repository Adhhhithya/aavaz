"""
backend/services/sms_intake_service.py

Service handling inbound SMS processing, victim onboarding/lookup,
conversational AI response generation via Groq, and automatic SMS reply dispatch.
"""
from typing import Any, Dict, List, Optional
import logging
from datetime import datetime, timezone
from groq import AsyncGroq

from config import settings
from services.supabase_client import get_supabase
from services.pushbullet_service import send_sms

logger = logging.getLogger(__name__)


def mask_phone(phone: str) -> str:
    """Mask phone number for safe logging to adhere to PII privacy rules."""
    if not phone or len(phone) < 4:
        return "****"
    return phone[:3] + "****" + phone[-3:]


async def process_incoming_sms(
    from_number: str,
    message_body: str,
    timestamp: Optional[str] = None
) -> Dict[str, Any]:
    """
    Process an incoming SMS message:
    1. Look up or register the victim in Supabase with valid NOT NULL defaults.
    2. Link or create a registered case record.
    3. If profile fields are missing, extract any provided details (name/district).
    4. Generate an empathetic AI response via Groq LLM (<160 chars).
    5. Log the interaction turn to the interactions table for dashboard visibility.
    6. Automatically dispatch the reply back via Pushbullet SMS.
    """
    clean_phone = from_number.strip()
    clean_msg = message_body.strip()
    masked = mask_phone(clean_phone)

    logger.info("Processing inbound SMS from %s (length: %d chars)", masked, len(clean_msg))

    try:
        supabase = await get_supabase()

        # 1. Fetch user or create a new victim profile
        user_resp = await supabase.table("users").select("*").eq("phone_number", clean_phone).execute()
        user_data = user_resp.data[0] if user_resp.data else None

        missing_fields: List[str] = []
        if not user_data:
            # Satisfies Postgres NOT NULL constraints on name and preferred_language
            placeholder_name = f"Citizen ({clean_phone[-4:] if len(clean_phone) >= 4 else 'SMS'})"
            new_user = {
                "phone_number": clean_phone,
                "name": placeholder_name,
                "role_type": "victim",
                "preferred_language": "en",
                "consent_given": True,  # Implied by texting the helpline
                "location_source": "sms"
            }
            user_insert = await supabase.table("users").insert(new_user).execute()
            user_data = user_insert.data[0] if user_insert.data else new_user
            missing_fields = ["name", "district"]
        else:
            name_val = user_data.get("name") or ""
            if not name_val or name_val.startswith("Citizen ("):
                missing_fields.append("name")
            if not user_data.get("location_district"):
                missing_fields.append("district")

        user_id = user_data.get("id")

        # 2. Link or create active case
        case_id: Optional[str] = None
        if user_id:
            case_resp = await supabase.table("cases").select("id").eq("user_id", user_id).neq("case_stage", "closed").limit(1).execute()
            if case_resp.data:
                case_id = case_resp.data[0]["id"]
            else:
                case_data = {
                    "user_id": user_id,
                    "case_type": "unspecified",
                    "intake_channel": "sms",
                    "case_stage": "registered",
                    "current_distress_score": 0.0,
                    "priority_rank": 0
                }
                case_insert = await supabase.table("cases").insert(case_data).execute()
                if case_insert.data:
                    case_id = case_insert.data[0]["id"]

        # 3. Extract profile details if user provided name or district in the SMS
        if missing_fields and settings.GROQ_API_KEY and user_id:
            try:
                extract_client = AsyncGroq(api_key=settings.GROQ_API_KEY)
                extract_prompt = f"""
Extract profile information from this SMS message if the citizen is introducing themselves with a name, district, or language.
Valid languages: 'hi', 'ta', 'ml', 'en'.
Message: "{clean_msg}"

Respond ONLY with valid JSON (no markdown):
{{"name": "...", "location_district": "...", "preferred_language": "..."}}
Use null for any field not explicitly provided.
"""
                extract_res = await extract_client.chat.completions.create(
                    model="qwen/qwen3.8-27b",
                    messages=[{"role": "user", "content": extract_prompt}],
                    temperature=0.1,
                    max_tokens=60
                )
                raw_json = extract_res.choices[0].message.content.strip()
                import json
                if "{" in raw_json and "}" in raw_json:
                    json_str = raw_json[raw_json.find("{"):raw_json.rfind("}")+1]
                    extracted = json.loads(json_str)
                    updates: Dict[str, Any] = {}
                    if extracted.get("name") and isinstance(extracted["name"], str):
                        val = extracted["name"].strip()
                        if val and not val.lower().startswith("citizen"):
                            updates["name"] = val
                    if extracted.get("location_district") and isinstance(extracted["location_district"], str):
                        updates["location_district"] = extracted["location_district"].strip()
                    if extracted.get("preferred_language") in ("hi", "ta", "ml", "en"):
                        updates["preferred_language"] = extracted["preferred_language"]

                    if updates:
                        await supabase.table("users").update(updates).eq("id", user_id).execute()
                        user_data.update(updates)
                        if "name" in updates and "name" in missing_fields:
                            missing_fields.remove("name")
                        if "location_district" in updates and "district" in missing_fields:
                            missing_fields.remove("district")
            except Exception as extract_err:
                logger.debug("Profile detail extraction skipped: %s", extract_err)

        # 4. Formulate AI response
        reply = ""
        if settings.GROQ_API_KEY:
            try:
                client = AsyncGroq(api_key=settings.GROQ_API_KEY)
                missing_desc = ", ".join(missing_fields) if missing_fields else "None"
                prompt = f"""You are the official MoSJE Justice & Psychological Support AI assistant.
A victim/citizen has contacted via SMS.
Current missing profile fields: {missing_desc}

Guidelines:
1. If there are missing fields, ask a gentle, empathetic question to collect them (e.g. "Namaste. To assist and assign a counselor, may I have your name and district?").
2. If there are NO missing fields, respond with warmth, comfort, and assurance of safety and legal/counseling support.
3. Keep the total reply under 160 characters (single SMS constraint). Do not include quotes, disclaimers or markdown formatting.
User message: "{clean_msg}"
"""
                response = await client.chat.completions.create(
                    model="qwen/qwen3.8-27b",
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=80,
                    temperature=0.3
                )
                reply = response.choices[0].message.content.strip().strip('"')
            except Exception as llm_err:
                logger.warning("Groq AI response generation failed, falling back to template: %s", llm_err)

        if not reply:
            if missing_fields:
                field_label = "name and district" if len(missing_fields) > 1 else missing_fields[0]
                reply = f"Thank you for contacting NHAA support. To assist and assign a counsellor, please reply with your {field_label}."
            else:
                reply = "We have received your message. Your assigned counsellor has been notified and will contact you shortly."

        # 5. Persist interaction turns for counselor/dashboard visibility
        if case_id:
            try:
                now_iso = datetime.now(timezone.utc).isoformat()
                await supabase.table("interactions").insert({
                    "case_id": case_id,
                    "channel": "sms",
                    "timestamp": now_iso,
                    "transcript_ref": f"Victim: {clean_msg}",
                    "emotion_tag": "neutral",
                    "sentiment_score": 0.0,
                    "engagement_score": 100.0,
                    "history_score": 0.0,
                    "final_score": 0.0,
                    "score_breakdown": {"channel": "sms", "direction": "inbound"},
                    "intervention_recommended": "none"
                }).execute()

                await supabase.table("interactions").insert({
                    "case_id": case_id,
                    "channel": "sms",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "transcript_ref": f"Helpline: {reply}",
                    "emotion_tag": "neutral",
                    "sentiment_score": 0.0,
                    "engagement_score": 100.0,
                    "history_score": 0.0,
                    "final_score": 0.0,
                    "score_breakdown": {"channel": "sms", "direction": "outbound"},
                    "intervention_recommended": "none"
                }).execute()
            except Exception as db_err:
                logger.warning("Failed to log SMS interaction to DB: %s", db_err)

        # 6. Dispatch the response via SMS
        sms_sent = False
        if settings.PUSHBULLET_API_KEY:
            logger.info("Dispatching SMS response to %s", masked)
            sms_sent = await send_sms(phone_number=clean_phone, message=reply)
        else:
            logger.info("PUSHBULLET_API_KEY not configured; skipped outgoing SMS dispatch.")

        return {
            "status": "success",
            "reply": reply,
            "sms_dispatched": sms_sent,
            "missing_fields": missing_fields,
            "case_id": case_id
        }

    except Exception as e:
        logger.error("Error processing inbound SMS for %s: %s", masked, e)
        return {"status": "error", "message": str(e)}
