"""
Real OTP issuance and verification, backed by the `otp_codes` table
(see backend/migrations/0002_otp_codes.sql).

Security properties:
- Codes are never stored or logged in plaintext — only an HMAC-SHA256 hash
  (per-code random salt + a server-side pepper) is persisted.
- Verification compares hashes with hmac.compare_digest (constant-time).
- Phone numbers are hashed (HMAC-SHA256 + pepper) for the lookup key in THIS
  table only — this does not change how `users.phone_number` itself is stored
  (see docs/AAVAZ_IMPLEMENTATION_AUDIT.md for why that's a separate, deferred
  migration, not part of this one).
- Rate limiting is enforced per phone and per IP over a rolling window.
- A code can be consumed exactly once and has a hard attempt cap.
"""

import hashlib
import hmac
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from config import settings
from services.otp_providers import get_otp_provider
from services.supabase_client import get_supabase

logger = logging.getLogger(__name__)


class OtpError(Exception):
    """Base class for OTP flow errors. Instances must never carry the code itself."""


class RateLimitedError(OtpError):
    pass


class InvalidOtpError(OtpError):
    pass


class ExpiredOtpError(OtpError):
    pass


def _pepper() -> str:
    if settings.OTP_PEPPER:
        return settings.OTP_PEPPER
    if settings.ENVIRONMENT.strip().lower() == "development":
        return "dev-only-insecure-otp-pepper-do-not-use-in-production"
    raise RuntimeError(
        "OTP_PEPPER is not configured. Refusing to hash OTP secrets with no pepper "
        "outside a development environment."
    )


def hash_phone(value: str) -> str:
    """Deterministic HMAC-SHA256 of a phone number (or IP address) for use as an
    otp_codes lookup/rate-limit key only."""
    return hmac.new(_pepper().encode(), value.strip().encode(), hashlib.sha256).hexdigest()


def _hash_code(code: str, salt: str) -> str:
    return hmac.new(_pepper().encode(), f"{salt}:{code}".encode(), hashlib.sha256).hexdigest()


def generate_code(length: Optional[int] = None) -> str:
    """Cryptographically-random, zero-padded numeric code (secrets.randbelow, not
    the `random` module)."""
    length = length or settings.OTP_LENGTH
    return f"{secrets.randbelow(10 ** length):0{length}d}"


async def _count_recent(supabase, column: str, value: str, window_seconds: int) -> int:
    since = (datetime.now(timezone.utc) - timedelta(seconds=window_seconds)).isoformat()
    resp = (
        await supabase.table("otp_codes")
        .select("id")
        .eq(column, value)
        .gte("created_at", since)
        .execute()
    )
    return len(resp.data or [])


async def request_otp(phone_number: str, ip_address: Optional[str] = None, purpose: str = "login") -> None:
    """
    Generates, hashes, stores, and dispatches an OTP.

    Raises RateLimitedError if this phone or IP has requested too many codes
    recently. Never returns, logs, or persists the plaintext code beyond the
    single call to the delivery provider.
    """
    supabase = await get_supabase()
    phone_hash = hash_phone(phone_number)
    ip_hash = hash_phone(ip_address) if ip_address else None

    if await _count_recent(
        supabase, "phone_hash", phone_hash, settings.OTP_RATE_LIMIT_WINDOW_SECONDS
    ) >= settings.OTP_RATE_LIMIT_PER_PHONE:
        raise RateLimitedError("Too many OTP requests for this phone number")

    if ip_hash and await _count_recent(
        supabase, "ip_hash", ip_hash, settings.OTP_RATE_LIMIT_WINDOW_SECONDS
    ) >= settings.OTP_RATE_LIMIT_PER_IP:
        raise RateLimitedError("Too many OTP requests from this network")

    code = generate_code()
    salt = secrets.token_hex(16)
    code_hash = _hash_code(code, salt)
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=settings.OTP_TTL_SECONDS)

    await supabase.table("otp_codes").insert(
        {
            "phone_hash": phone_hash,
            "code_hash": code_hash,
            "salt": salt,
            "purpose": purpose,
            "ip_hash": ip_hash,
            "attempts": 0,
            "max_attempts": settings.OTP_MAX_ATTEMPTS,
            "expires_at": expires_at.isoformat(),
        }
    ).execute()

    provider = get_otp_provider()
    await provider.send_otp(phone_number=phone_number, code=code, channel="sms")
    # `code` and `salt` go out of scope here. Only their hash is ever persisted.


async def verify_otp(phone_number: str, submitted_code: str, purpose: str = "login") -> None:
    """
    Verifies `submitted_code` against the most recent unconsumed OTP issued for
    this phone/purpose.

    Raises ExpiredOtpError or InvalidOtpError on failure (never reveals which,
    to callers, beyond that class distinction — see api/auth/auth_routes.py for
    how these map to a single generic HTTP response). On success, marks the row
    consumed so it cannot be replayed.
    """
    supabase = await get_supabase()
    phone_hash = hash_phone(phone_number)

    resp = (
        await supabase.table("otp_codes")
        .select("*")
        .eq("phone_hash", phone_hash)
        .eq("purpose", purpose)
        .is_("consumed_at", "null")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if not resp.data:
        raise InvalidOtpError("No pending OTP for this phone number")

    row = resp.data[0]
    now = datetime.now(timezone.utc)
    expires_at = datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00"))

    if now > expires_at:
        raise ExpiredOtpError("OTP has expired")

    if row["attempts"] >= row["max_attempts"]:
        raise InvalidOtpError("Maximum verification attempts exceeded")

    expected_hash = _hash_code(submitted_code, row["salt"])
    if not hmac.compare_digest(expected_hash, row["code_hash"]):
        await supabase.table("otp_codes").update({"attempts": row["attempts"] + 1}).eq("id", row["id"]).execute()
        raise InvalidOtpError("Incorrect code")

    await supabase.table("otp_codes").update({"consumed_at": now.isoformat()}).eq("id", row["id"]).execute()
