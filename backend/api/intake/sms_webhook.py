"""
backend/api/intake/sms_webhook.py

Inbound SMS Webhook Router:
Receives HTTP webhook requests for incoming SMS and delegates business logic
to services/sms_intake_service.py.
"""
from typing import Any, Dict
from fastapi import APIRouter, Depends
import logging

from models.intake_models import PushbulletWebhookPayload
from api.auth.webhook_auth import verify_pushbullet_webhook
from services.sms_intake_service import process_incoming_sms

router = APIRouter(dependencies=[Depends(verify_pushbullet_webhook)])
logger = logging.getLogger(__name__)


@router.post("/webhook")
async def pushbullet_webhook(payload: PushbulletWebhookPayload) -> Dict[str, Any]:
    """
    Receives incoming SMS webhook payloads and delegates to sms_intake_service.
    """
    return await process_incoming_sms(
        from_number=payload.from_number,
        message_body=payload.message_body,
        timestamp=payload.timestamp,
    )
