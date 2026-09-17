"""
OTP delivery provider abstraction.

The OTP generation/hashing/verification logic in services/otp_service.py does not
know or care how a code is actually delivered to a victim's phone — that is
entirely this module's job. This separation is deliberate: it lets development and
tests run without any real SMS provider configured, while keeping the security-
relevant code (generation, hashing, expiry, attempt-limiting) identical in every
environment.

Two providers exist:

- SyntheticOtpProvider: development/test only. Refuses to be constructed outside
  ENVIRONMENT=="development". Never sends anything externally; logs the code with
  a loud "DEV ONLY" prefix so a developer can complete the flow manually.
- PushbulletOtpProvider: a best-effort real implementation against Pushbullet's
  SMS API. NOTE: this has not been verified against a live Pushbullet account —
  no credentials were available in the environment this was written in. Treat it
  as unverified until someone with real PUSHBULLET_API_KEY/device credentials
  confirms it end-to-end. The existing sms_webhook.py code had the same gap
  before this change (it only ever logged what it would send, never sent it).
"""

import logging
from abc import ABC, abstractmethod

import httpx

from config import settings

logger = logging.getLogger(__name__)


class OtpDeliveryError(Exception):
    """Raised when an OTP could not be dispatched. Never includes the code itself."""


class OtpProvider(ABC):
    @abstractmethod
    async def send_otp(self, phone_number: str, code: str, channel: str = "sms") -> None:
        """Deliver `code` to `phone_number` over `channel` ("sms" or "ivr").

        Implementations must not log `code` in any non-development context.
        """
        raise NotImplementedError


class SyntheticOtpProvider(OtpProvider):
    """Development/test-only provider. Never reachable in a non-development
    environment — see __init__."""

    def __init__(self):
        if settings.ENVIRONMENT.strip().lower() != "development":
            raise RuntimeError(
                "SyntheticOtpProvider must never be used outside ENVIRONMENT=development"
            )

    async def send_otp(self, phone_number: str, code: str, channel: str = "sms") -> None:
        logger.warning(
            "[DEV ONLY — NEVER DO THIS IN PRODUCTION] Synthetic OTP for %s via %s: %s",
            phone_number,
            channel,
            code,
        )


class PushbulletOtpProvider(OtpProvider):
    """
    Best-effort real SMS delivery via Pushbullet's texts API.

    UNVERIFIED: no live Pushbullet account/device credentials were available when
    this was written. The request shape below follows Pushbullet's documented
    `/v2/texts` endpoint (send-SMS via a paired Android device), but this has not
    been exercised against a real account. Do not treat this as a confirmed-working
    integration — confirm it manually with real credentials before relying on it.
    """

    API_URL = "https://api.pushbullet.com/v2/texts"

    async def send_otp(self, phone_number: str, code: str, channel: str = "sms") -> None:
        if channel != "sms":
            raise OtpDeliveryError(f"PushbulletOtpProvider only supports channel='sms', got {channel!r}")
        if not settings.PUSHBULLET_API_KEY:
            raise OtpDeliveryError("PUSHBULLET_API_KEY is not configured")

        message = f"Your verification code is {code}. It expires in {settings.OTP_TTL_SECONDS // 60} minutes."
        headers = {"Access-Token": settings.PUSHBULLET_API_KEY, "Content-Type": "application/json"}
        payload = {
            "data": {
                "addresses": [phone_number],
                "message": message,
            }
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(self.API_URL, headers=headers, json=payload)
            response.raise_for_status()
        except httpx.HTTPError as e:
            # Deliberately does not include `code` in the raised error/log.
            logger.error("Pushbullet OTP delivery failed for %s: %s", phone_number, e)
            raise OtpDeliveryError("Failed to send OTP via Pushbullet") from e


def get_otp_provider() -> OtpProvider:
    """
    Selects the OTP delivery provider for the current environment.

    Fails closed: a production-shaped environment with no real provider
    configured raises rather than silently falling back to the synthetic
    provider (that provider refuses construction outside development anyway,
    so this would fail regardless — this just gives a clearer error).
    """
    if settings.ENVIRONMENT.strip().lower() == "development":
        return SyntheticOtpProvider()

    if settings.PUSHBULLET_API_KEY:
        return PushbulletOtpProvider()

    raise RuntimeError(
        "No OTP delivery provider is configured for this environment. Set "
        "PUSHBULLET_API_KEY (or run with ENVIRONMENT=development for the synthetic "
        "provider)."
    )
