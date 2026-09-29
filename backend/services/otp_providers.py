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
            "[DEV ONLY — NEVER DO THIS IN PRODUCTION] Synthetic OTP dispatched for %s via %s",
            phone_number,
            channel,
        )




class PushbulletOtpProvider(OtpProvider):
    """
    Real SMS delivery via Pushbullet API through the connected device.
    """

    async def send_otp(self, phone_number: str, code: str, channel: str = "sms") -> None:
        if channel != "sms":
            raise OtpDeliveryError(f"PushbulletOtpProvider only supports channel='sms', got {channel!r}")
        if not settings.PUSHBULLET_API_KEY:
            raise OtpDeliveryError("PUSHBULLET_API_KEY is not configured")

        if settings.ENVIRONMENT.strip().lower() == "development":
            logger.info("[DEV OTP] Verification code dispatched to %s", phone_number)

        message = f"Your verification code is {code}. It expires in {settings.OTP_TTL_SECONDS // 60} minutes."
        from services.pushbullet_service import send_sms
        try:
            success = await send_sms(phone_number=phone_number, message=message)
            if not success:
                raise OtpDeliveryError("Failed to send OTP via Pushbullet")
        except Exception as e:
            logger.error("Pushbullet OTP delivery failed: %s", e)
            raise OtpDeliveryError("Failed to send OTP via Pushbullet") from e


def get_otp_provider() -> OtpProvider:
    """
    Selects the OTP delivery provider.
    If PUSHBULLET_API_KEY is configured, uses PushbulletOtpProvider to deliver real SMS.
    Otherwise, falls back to SyntheticOtpProvider in development.
    """
    if settings.PUSHBULLET_API_KEY:
        return PushbulletOtpProvider()

    if settings.ENVIRONMENT.strip().lower() == "development":
        return SyntheticOtpProvider()

    raise RuntimeError(
        "No OTP delivery provider is configured for this environment. Set "
        "PUSHBULLET_API_KEY (or run with ENVIRONMENT=development for the synthetic "
        "provider)."
    )

