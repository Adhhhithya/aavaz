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

from typing import Optional
from fastapi import Header, HTTPException, Request

from config import settings

logger = logging.getLogger(__name__)


def _is_dev() -> bool:
    return settings.ENVIRONMENT.strip().lower() == "development"


async def verify_bolna_webhook(
    request: Request,
    x_webhook_secret: Optional[str] = Header(default=None, alias="X-Webhook-Secret"),
    x_bolna_signature: Optional[str] = Header(default=None, alias="X-Bolna-Signature"),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
) -> None:
    secret = settings.BOLNA_WEBHOOK_SECRET
    provided = (
        x_webhook_secret
        or x_bolna_signature
        or (authorization.replace("Bearer ", "").strip() if authorization else None)
        or request.query_params.get("secret")
    )

    if not secret:
        logger.error("BOLNA_WEBHOOK_SECRET is not configured!")
        raise HTTPException(
            status_code=503,
            detail="Bolna webhook is not configured for this environment",
        )

    if not provided or not hmac.compare_digest(provided, secret):
        logger.warning("Bolna webhook rejected: Invalid signature.")
        raise HTTPException(status_code=401, detail="Invalid webhook credentials")


async def verify_pushbullet_webhook(
    request: Request,
    x_webhook_secret: Optional[str] = Header(default=None, alias="X-Webhook-Secret"),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
) -> None:
    secret = settings.PUSHBULLET_WEBHOOK_SECRET
    provided = (
        x_webhook_secret
        or (authorization.replace("Bearer ", "").strip() if authorization else None)
        or request.query_params.get("secret")
    )

    if not secret:
        logger.error("PUSHBULLET_WEBHOOK_SECRET is not configured!")
        raise HTTPException(
            status_code=503,
            detail="Pushbullet webhook is not configured for this environment",
        )

    if not provided or not hmac.compare_digest(provided, secret):
        logger.warning("Pushbullet webhook rejected: Invalid signature.")
        raise HTTPException(status_code=401, detail="Invalid webhook credentials")
