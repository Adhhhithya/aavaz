"""
Inbound provider webhook verification (Bolna IVR, Pushbullet SMS).

IMPORTANT — read before assuming this is "real" provider security: neither
Bolna's nor Pushbullet's actual webhook signing/authentication mechanism is
documented or configured anywhere in this repository, and no credentials were
available to look one up against a live account while writing this. This module
deliberately does NOT invent a vendor-specific HMAC/signature scheme and claim it
is Bolna's or Pushbullet's — that would be worse than the gap it replaces, since
it would look secure without actually matching what either provider sends.

What this implements instead is a generic, explicit shared-secret header check:
the operator configures BOLNA_WEBHOOK_SECRET / PUSHBULLET_WEBHOOK_SECRET, and the
provider (or, until real provider support is confirmed, an intermediary/relay
configured by the operator) must send that exact value in the corresponding
header. This is an interim measure, not a replacement for real provider signature
verification — replace it once Bolna/Pushbullet's actual mechanism and
credentials are available. See docs/AAVAZ_IMPLEMENTATION_AUDIT.md.

Fail-safe behavior:
- If a secret IS configured: the header must match it exactly (constant-time
  compare), in every environment. No match -> 401.
- If NO secret is configured:
    - ENVIRONMENT=="development": the request is allowed through, with a loud
      warning logged, so local demos/tests don't require fabricating a secret.
    - any other environment: the request is rejected with 503 (distinguishable
      from "wrong secret" (401) so an operator immediately sees this is a
      deployment-configuration problem, not a credential problem) — this
      deliberately does not fail open in anything that looks like production.
"""

import hmac
import logging

from fastapi import Header, HTTPException

from config import settings

logger = logging.getLogger(__name__)


def _is_dev() -> bool:
    return settings.ENVIRONMENT.strip().lower() == "development"


async def _verify(secret: str, provided: str, provider_name: str) -> None:
    if secret:
        if not provided or not hmac.compare_digest(provided, secret):
            raise HTTPException(status_code=401, detail="Invalid webhook credentials")
        return

    if _is_dev():
        logger.warning(
            "%s webhook secret is not configured; allowing request because "
            "ENVIRONMENT=development. This MUST be configured before production use.",
            provider_name,
        )
        return

    raise HTTPException(
        status_code=503,
        detail=f"{provider_name} webhook is not configured for this environment",
    )


async def verify_bolna_webhook(x_webhook_secret: str = Header(default="", alias="X-Webhook-Secret")) -> None:
    await _verify(settings.BOLNA_WEBHOOK_SECRET, x_webhook_secret, "Bolna")


async def verify_pushbullet_webhook(x_webhook_secret: str = Header(default="", alias="X-Webhook-Secret")) -> None:
    await _verify(settings.PUSHBULLET_WEBHOOK_SECRET, x_webhook_secret, "Pushbullet")
