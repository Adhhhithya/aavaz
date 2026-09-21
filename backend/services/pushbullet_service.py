"""
backend/services/pushbullet_service.py

Pushbullet Service:
1. Outgoing SMS Dispatch via Pushbullet texts API (/v2/texts).
2. Incoming SMS Listener via Pushbullet WebSocket Stream (wss://stream.pushbullet.com)
   with real-time event handling, permanent threads fallback, and automatic reconnection.
3. Outbound Push Notifications for counsellors/officials.
"""
from typing import Any, Awaitable, Callable, Dict, List, Optional, Set
import asyncio
import logging
import ssl
import certifi
import httpx
import websockets
import json
import re
from datetime import datetime, timezone

from config import settings

logger = logging.getLogger(__name__)

PUSHBULLET_API_BASE = "https://api.pushbullet.com/v2"
PUSHBULLET_WS_BASE = "wss://stream.pushbullet.com/websocket"

# In-memory cache for discovered SMS device
_cached_device_iden: Optional[str] = None


def _mask_phone(phone: str) -> str:
    """Mask phone number to adhere to raw PII logging constraints."""
    if not phone or len(phone) < 4:
        return "****"
    return phone[:3] + "****" + phone[-3:]


def _get_ssl_context() -> ssl.SSLContext:
    """Create an SSL context using certifi CA bundle to prevent certificate verification errors."""
    try:
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


async def get_sms_device_iden(api_key: Optional[str] = None) -> Optional[str]:
    """
    Retrieves the device iden of the active Android phone with SMS capabilities.
    Uses settings.PUSHBULLET_TARGET_DEVICE_IDEN if set; otherwise queries /v2/devices.
    """
    global _cached_device_iden
    configured_device = getattr(settings, "PUSHBULLET_TARGET_DEVICE_IDEN", "").strip()
    if configured_device:
        return configured_device

    if _cached_device_iden:
        return _cached_device_iden

    key = api_key or getattr(settings, "PUSHBULLET_API_KEY", "").strip()
    if not key:
        return None

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{PUSHBULLET_API_BASE}/devices",
                headers={"Access-Token": key}
            )
            resp.raise_for_status()
            devices = resp.json().get("devices", [])
            for d in devices:
                if d.get("active") and d.get("has_sms"):
                    _cached_device_iden = d.get("iden")
                    logger.info("Discovered Pushbullet SMS device: %s (%s)", d.get("nickname") or d.get("model"), _cached_device_iden)
                    return _cached_device_iden
    except Exception as e:
        logger.error("Failed to query Pushbullet devices: %s", e)

    return None


async def send_sms(
    phone_number: str,
    message: str,
    api_key: Optional[str] = None,
    target_device_iden: Optional[str] = None
) -> bool:
    """
    Sends an SMS via Pushbullet's /v2/texts API through the connected phone.
    Returns True if successfully queued, False otherwise.
    """
    key = api_key or getattr(settings, "PUSHBULLET_API_KEY", "").strip()
    if not key:
        logger.warning("Pushbullet API key is not configured. Outgoing SMS skipped.")
        return False

    device_iden = target_device_iden or await get_sms_device_iden(key)
    if not device_iden:
        logger.error("No active SMS-capable device found on Pushbullet account. Cannot send SMS.")
        return False

    clean_phone = phone_number.strip()
    payload = {
        "data": {
            "target_device_iden": device_iden,
            "addresses": [clean_phone],
            "message": message,
        }
    }

    headers = {
        "Access-Token": key,
        "Content-Type": "application/json"
    }

    masked_phone = _mask_phone(clean_phone)

    # Attempt dispatch with single retry
    for attempt in range(1, 3):
        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                resp = await client.post(f"{PUSHBULLET_API_BASE}/texts", headers=headers, json=payload)
                resp.raise_for_status()
                logger.info("Successfully queued SMS to %s via Pushbullet (device: %s)", masked_phone, device_iden)
                return True
        except Exception as e:
            logger.warning("Pushbullet send_sms attempt %d failed for %s: %s", attempt, masked_phone, e)
            if attempt < 2:
                await asyncio.sleep(1.0)

    logger.error("All attempts to send SMS to %s via Pushbullet failed.", masked_phone)
    return False


async def fetch_latest_sms_threads(
    api_key: Optional[str] = None,
    target_device_iden: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Fetches the SMS threads from Pushbullet permanently stored objects for the target device.
    """
    key = api_key or getattr(settings, "PUSHBULLET_API_KEY", "").strip()
    if not key:
        return []

    device_iden = target_device_iden or await get_sms_device_iden(key)
    if not device_iden:
        return []

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{PUSHBULLET_API_BASE}/permanents/{device_iden}_threads",
                headers={"Access-Token": key}
            )
            if resp.status_code == 200:
                data = resp.json()
                return data.get("threads", [])
    except Exception as e:
        logger.error("Failed to fetch Pushbullet SMS threads: %s", e)

    return []


async def send_push_notification(title: str, body: str, api_key: Optional[str] = None) -> bool:
    """
    Sends a push notification via Pushbullet.
    Used for immediate alerting during SOS triggers or critical distress escalations.
    """
    key = api_key or getattr(settings, "PUSHBULLET_API_KEY", "").strip()
    if not key:
        logger.warning("Pushbullet API key not configured. Skipping push notification.")
        return False

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{PUSHBULLET_API_BASE}/pushes",
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
        logger.error("Failed to send Pushbullet notification: %s", e)
        return False


class PushbulletSMSListener:
    """
    Persistent background worker that listens for incoming SMS messages via
    Pushbullet's real-time WebSocket stream and synchronizes thread changes.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        callback: Optional[Callable[[str, str, str], Awaitable[Any]]] = None,
        poll_interval: float = 12.0
    ):
        self.api_key = api_key or getattr(settings, "PUSHBULLET_API_KEY", "").strip()
        self.callback = callback
        self.poll_interval = poll_interval
        self._seen_message_ids: Set[str] = set()
        self._is_running = False
        self._stop_event = asyncio.Event()

    async def _init_seen_messages(self) -> None:
        """Seed seen message IDs with existing threads on boot so historical SMS aren't re-processed."""
        threads = await fetch_latest_sms_threads(self.api_key)
        for t in threads:
            latest = t.get("latest") or {}
            msg_id = str(latest.get("id", ""))
            if msg_id:
                self._seen_message_ids.add(msg_id)
        logger.info("Initialized Pushbullet SMS listener with %d existing messages.", len(self._seen_message_ids))

    async def _check_threads_for_new_sms(self) -> None:
        """Check all threads for any unhandled incoming SMS."""
        threads = await fetch_latest_sms_threads(self.api_key)
        for t in threads:
            latest = t.get("latest") or {}
            msg_id = str(latest.get("id", ""))
            direction = latest.get("direction", "")
            body = (latest.get("body") or "").strip()

            if not msg_id or not body or direction != "incoming":
                continue

            if msg_id in self._seen_message_ids:
                continue

            # Found a new incoming SMS!
            self._seen_message_ids.add(msg_id)
            recipients = t.get("recipients", [])
            sender_phone = ""
            if recipients and isinstance(recipients, list):
                sender_phone = recipients[0].get("address") or recipients[0].get("number") or ""

            # Ignore promotional/transactional shortcodes (e.g. JX-SKCHRS-P, VK-HDFCBK)
            digits_only = re.sub(r"[^\d]", "", sender_phone)
            if len(digits_only) < 7:
                logger.debug("Skipping promotional/shortcode sender: %s", sender_phone)
                continue

            ts = str(latest.get("timestamp") or datetime.now(timezone.utc).isoformat())

            logger.info("Received new incoming SMS from %s (msg_id: %s)", _mask_phone(sender_phone), msg_id)

            if self.callback and sender_phone:
                try:
                    await self.callback(sender_phone, body, ts)
                except Exception as cb_err:
                    logger.error("Error executing callback for SMS from %s: %s", _mask_phone(sender_phone), cb_err)

    async def _ws_loop(self) -> None:
        """Main WebSocket loop with automatic reconnection and exponential backoff."""
        ssl_ctx = _get_ssl_context()
        backoff = 2.0

        while self._is_running and not self._stop_event.is_set():
            ws_url = f"{PUSHBULLET_WS_BASE}/{self.api_key}"
            try:
                logger.info("Connecting to Pushbullet WebSocket stream...")
                async with websockets.connect(
                    ws_url,
                    ssl=ssl_ctx,
                    ping_interval=None,
                    ping_timeout=None,
                    close_timeout=10.0
                ) as ws:
                    logger.info("Connected to Pushbullet WebSocket stream. Listening for incoming SMS...")
                    backoff = 2.0  # Reset backoff on successful connection

                    while self._is_running and not self._stop_event.is_set():
                        try:
                            raw_msg = await asyncio.wait_for(ws.recv(), timeout=60.0)
                            data = json.loads(raw_msg)
                            msg_type = data.get("type")

                            if msg_type == "nop":
                                # Heartbeat ping from Pushbullet server
                                continue

                            elif msg_type == "tickle":
                                subtype = data.get("subtype")
                                if subtype in ("sms_changed", "texts"):
                                    logger.debug("Pushbullet tickle (%s) received. Checking for new SMS...", subtype)
                                    await self._check_threads_for_new_sms()

                            elif msg_type == "push":
                                push_data = data.get("push", {})
                                if push_data.get("type") == "mirror" and "sms" in (push_data.get("package_name") or "").lower():
                                    await self._check_threads_for_new_sms()

                        except asyncio.TimeoutError:
                            # Pushbullet sends nop every ~30s; timeout allows loop iteration check
                            continue
            except Exception as e:
                if not self._is_running or self._stop_event.is_set():
                    break
                logger.warning("Pushbullet WebSocket disconnected: %s. Reconnecting in %.1fs...", e, backoff)
                try:
                    await asyncio.wait_for(self._stop_event.wait(), timeout=backoff)
                except asyncio.TimeoutError:
                    pass
                backoff = min(backoff * 1.5, 30.0)

    async def _poll_loop(self) -> None:
        """Periodic fallback poller to ensure no SMS is missed during connection switches."""
        while self._is_running and not self._stop_event.is_set():
            try:
                await asyncio.sleep(self.poll_interval)
                if self._is_running and not self._stop_event.is_set():
                    await self._check_threads_for_new_sms()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.debug("Periodic SMS poll check error: %s", e)

    async def start(self) -> None:
        """Starts the listener."""
        if not self.api_key:
            logger.warning("Pushbullet API key not configured. SMS listener will not start.")
            return

        self._is_running = True
        self._stop_event.clear()

        # Initialize existing message IDs
        await self._init_seen_messages()

        # Run WebSocket loop and polling fallback concurrently
        await asyncio.gather(
            self._ws_loop(),
            self._poll_loop(),
            return_exceptions=True
        )

    def stop(self) -> None:
        """Signals the listener to stop."""
        self._is_running = False
        self._stop_event.set()
        logger.info("Pushbullet SMS listener stopped.")


# Module-level singleton listener task
_listener_task: Optional[asyncio.Task] = None
_listener_instance: Optional[PushbulletSMSListener] = None


def start_pushbullet_sms_listener(
    callback: Optional[Callable[[str, str, str], Awaitable[Any]]] = None,
    poll_interval: float = 12.0
) -> Optional[asyncio.Task]:
    """
    Launches the Pushbullet SMS listener as a background asyncio task.
    """
    global _listener_task, _listener_instance

    key = getattr(settings, "PUSHBULLET_API_KEY", "").strip()
    if not key:
        logger.info("PUSHBULLET_API_KEY is not set. Pushbullet SMS listener is disabled.")
        return None

    if _listener_task and not _listener_task.done():
        logger.info("Pushbullet SMS listener task is already running.")
        return _listener_task

    _listener_instance = PushbulletSMSListener(
        api_key=key,
        callback=callback,
        poll_interval=poll_interval
    )
    _listener_task = asyncio.create_task(_listener_instance.start())
    logger.info("Pushbullet SMS background listener task started.")
    return _listener_task


def stop_pushbullet_sms_listener() -> None:
    """Stops the active Pushbullet SMS listener task if running."""
    global _listener_task, _listener_instance
    if _listener_instance:
        _listener_instance.stop()
    if _listener_task and not _listener_task.done():
        _listener_task.cancel()
    _listener_task = None
    _listener_instance = None


if __name__ == "__main__":
    # Allows running standalone listener: python -m services.pushbullet_service
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    async def default_handler(from_num: str, msg: str, ts: str):
        print(f"\n[INCOMING SMS] From: {_mask_phone(from_num)} | Message: {msg}\n")
        # Try processing via sms_intake_service if available
        try:
            from services.sms_intake_service import process_incoming_sms
            res = await process_incoming_sms(from_num, msg, ts)
            print(f"[AI RESPONSE] Result: {res.get('status')} | Reply: {res.get('reply')}\n")
        except Exception as err:
            print(f"[ERROR] Could not run intake: {err}")

    print("=== Starting Pushbullet SMS Real-time Listener ===")
    listener = PushbulletSMSListener(callback=default_handler)
    try:
        asyncio.run(listener.start())
    except KeyboardInterrupt:
        listener.stop()
        print("Listener stopped.")
