"""
backend/scripts/run_sms_listener.py

Standalone script to run the Pushbullet 2-way SMS listener.
Logs all incoming SMS messages in real-time, generates AI responses via Groq,
and automatically dispatches SMS replies back to the sender's handset.

Run via:
    python backend/scripts/run_sms_listener.py
"""
import sys
import os
import asyncio
import logging

# Ensure backend root is on sys.path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from config import settings
from services.pushbullet_service import PushbulletSMSListener, _mask_phone
from services.sms_intake_service import process_incoming_sms

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("SMSListener")


async def handle_incoming_sms(from_number: str, message_body: str, timestamp: str):
    masked = _mask_phone(from_number)
    print("\n" + "=" * 60)
    print(f"[INCOMING SMS RECEIVED] From: {masked}")
    print(f"[TIME]: {timestamp}")
    print("=" * 60)

    try:
        print("[AI INTAKE] Running demographic check and distress assessment...")
        result = await process_incoming_sms(from_number, message_body, timestamp)
        reply = result.get("reply", "")
        print(f"[AI GENERATED REPLY DISPATCHED]")
        print(f"[STATUS]: {result.get('status')} | Dispatched: {result.get('sms_dispatched')}")
        print("=" * 60 + "\n")
    except Exception as e:
        logger.error("Failed to process inbound SMS: %s", e)


async def main():
    if not settings.PUSHBULLET_API_KEY:
        print("[ERROR] PUSHBULLET_API_KEY is not set in backend/.env!")
        return

    print("\n" + "=" * 60)
    print("      AAVAZ 2-WAY PUSHBULLET SMS LISTENER & SENDER      ")
    print("=" * 60)
    print("Listening for incoming SMS events on Pushbullet WebSocket stream...")
    print("Press Ctrl+C to stop.\n")

    listener = PushbulletSMSListener(callback=handle_incoming_sms, poll_interval=10.0)
    try:
        await listener.start()
    except asyncio.CancelledError:
        pass
    finally:
        listener.stop()
        print("\nListener shut down cleanly.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nStopped by user.")
