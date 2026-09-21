"""
backend/services/pushbullet_service.py

Handles sending outbound push notifications to Counsellors via Pushbullet API.
Used for immediate alerting during SOS triggers or critical distress escalations.
"""
import logging
import httpx
from typing import Optional

logger = logging.getLogger(__name__)

async def send_push_notification(title: str, body: str, api_key: Optional[str] = None) -> bool:
    """
    Sends a push notification via Pushbullet.
    Returns True if successful, False otherwise.
    """
    from config import settings
    key = api_key or getattr(settings, "PUSHBULLET_API_KEY", None)
    
    if not key:
        logger.warning("Pushbullet API key not configured. Skipping push notification.")
        return False

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.pushbullet.com/v2/pushes",
                headers={
                    "Access-Token": key,
                    "Content-Type": "application/json"
                },
                json={
                    "type": "note",
                    "title": title,
                    "body": body
                },
                timeout=5.0
            )
            response.raise_for_status()
            logger.info("Successfully dispatched Pushbullet notification.")
            return True
    except Exception as e:
        logger.error(f"Failed to send Pushbullet notification: {e}")
        return False
