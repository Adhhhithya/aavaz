"""
Victim identity/session dependencies (S2).

Victims are not provisioned as Supabase Auth users in this pass (see
docs/AAVAZ_IMPLEMENTATION_AUDIT.md for why — no live SMS-provider credentials to
configure Supabase's own phone-auth flow, and victims otherwise only have a
`users` row, not a Supabase Auth account). Instead, after real OTP verification
(services/otp_service.py) this module issues a self-signed, short-lived JWT
(HS256, our own secret — NOT a Supabase token) that later requests present as a
bearer token to prove victim identity.

Two distinct token types exist, deliberately kept separate so a phone-ownership
proof can never be replayed as a full victim session or vice versa:

- "phone_verified": proves the holder just completed OTP verification for a given
  phone number, but does not yet correspond to a `users` row. Used only to call
  POST /api/v1/intake/app/register.
- "victim": a full victim session, scoped to one `users.id`. Used on every other
  victim-facing endpoint.

This intentionally mirrors the shape of api/auth/dependencies.py (the S1 staff
authorization module) without merging into it — staff identity is Supabase-backed
and remote-verified; victim identity is self-issued and locally verified. They are
different trust mechanisms, not different roles of the same one.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, Request

from api.auth.dependencies import CurrentStaffUser, get_bearer_token, get_current_staff_user
from config import settings
from services.supabase_client import get_supabase

logger = logging.getLogger(__name__)

_ALGORITHM = "HS256"
_PHONE_VERIFIED_PURPOSE = "phone_verified"
_VICTIM_PURPOSE = "victim"


def _victim_secret() -> str:
    if settings.VICTIM_SESSION_SECRET:
        return settings.VICTIM_SESSION_SECRET
    if settings.ENVIRONMENT.strip().lower() == "development":
        return "dev-only-insecure-victim-session-secret-do-not-use-in-production"
    raise RuntimeError(
        "VICTIM_SESSION_SECRET is not configured. Refusing to issue/verify victim "
        "session tokens with no secret outside a development environment."
    )


class CurrentVictim:
    __slots__ = ("id", "phone_number")

    def __init__(self, id: str, phone_number: str):
        self.id = id
        self.phone_number = phone_number


# ---- Token issuance ----------------------------------------------------------

def issue_phone_verified_token(phone_number: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "purpose": _PHONE_VERIFIED_PURPOSE,
        "phone_number": phone_number,
        "iat": now,
        "exp": now + timedelta(seconds=settings.PHONE_VERIFIED_TOKEN_TTL_SECONDS),
    }
    return jwt.encode(payload, _victim_secret(), algorithm=_ALGORITHM)


def issue_victim_session_token(victim_id: str, phone_number: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "purpose": _VICTIM_PURPOSE,
        "sub": victim_id,
        "phone_number": phone_number,
        "iat": now,
        "exp": now + timedelta(seconds=settings.VICTIM_SESSION_TTL_SECONDS),
    }
    return jwt.encode(payload, _victim_secret(), algorithm=_ALGORITHM)


# ---- Token verification -------------------------------------------------------

def _decode(token: str) -> Optional[dict]:
    """Returns the decoded claims, or None if the token isn't one of ours at all
    (wrong signature/algorithm/shape) — deliberately swallows the exception here
    so callers can distinguish "not our token" from "our token but invalid" only
    where they need to; every victim-facing dependency below treats both the same
    (401), so there is no information leak either way."""
    try:
        return jwt.decode(token, _victim_secret(), algorithms=[_ALGORITHM])
    except jwt.PyJWTError:
        return None


async def get_phone_verified_number(token: str = Depends(get_bearer_token)) -> str:
    """Dependency for POST /api/v1/intake/app/register: proves the caller just
    completed OTP verification for the phone number it returns."""
    claims = _decode(token)
    if not claims or claims.get("purpose") != _PHONE_VERIFIED_PURPOSE:
        raise HTTPException(status_code=401, detail="Invalid or expired phone verification")
    phone_number = claims.get("phone_number")
    if not phone_number:
        raise HTTPException(status_code=401, detail="Invalid or expired phone verification")
    return phone_number


async def get_current_victim(token: str = Depends(get_bearer_token)) -> CurrentVictim:
    """Dependency for every victim-facing endpoint except registration itself."""
    claims = _decode(token)
    if not claims or claims.get("purpose") != _VICTIM_PURPOSE or not claims.get("sub"):
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return CurrentVictim(id=claims["sub"], phone_number=claims.get("phone_number", ""))


# ---- Combined staff-or-victim access (for the one dual-consumer endpoint) -----

class CaseAccessPrincipal:
    """Discriminated result of get_case_access_principal: exactly one of
    `.staff` / `.victim` is set."""

    __slots__ = ("staff", "victim")

    def __init__(self, staff: Optional[CurrentStaffUser] = None, victim: Optional[CurrentVictim] = None):
        self.staff = staff
        self.victim = victim


async def get_case_access_principal(request: Request, token: str = Depends(get_bearer_token)) -> CaseAccessPrincipal:
    """
    Used only by GET /api/v1/cases/{case_id}/progress, which both the counsellor
    dashboard and the victim's own mobile dashboard call. Tries to resolve the
    bearer token as a victim session first (cheap, local, no network call); if
    that fails, falls back to Supabase staff verification (S1's mechanism, which
    does make a network call). A forged/garbage token fails both and is rejected
    with 401, same as either path alone.

    NOTE on testability: `get_current_staff_user` is invoked directly here
    (not as a `Depends(...)` parameter of this function) because FastAPI has no
    native "try dependency A, else dependency B" construct — declaring it as a
    normal Depends() would make FastAPI resolve it unconditionally, defeating
    the fallback. A direct Python call bypasses FastAPI's own dependency-
    resolution walk, which is also what `app.dependency_overrides` hooks into —
    so a direct call would silently ignore any override set on
    `get_current_staff_user` in tests. The lookup below reads
    `request.app.dependency_overrides` manually to preserve override behavior;
    in production this dict is empty, so it's identical to calling the real
    function.
    """
    claims = _decode(token)
    if claims and claims.get("purpose") == _VICTIM_PURPOSE and claims.get("sub"):
        return CaseAccessPrincipal(victim=CurrentVictim(id=claims["sub"], phone_number=claims.get("phone_number", "")))

    staff_dependency = request.app.dependency_overrides.get(get_current_staff_user, get_current_staff_user)
    staff_user = await staff_dependency(token=token)
    return CaseAccessPrincipal(staff=staff_user)


async def resolve_victim_by_phone(phone_number: str) -> Optional[dict]:
    """Looks up an existing victim's full `users` row by phone number. Used when
    issuing a session for a phone that already has a users row (login, not
    registration) — returns None for a phone with no row yet."""
    supabase = await get_supabase()
    resp = await supabase.table("users").select("*").eq("phone_number", phone_number).limit(1).execute()
    if resp.data:
        return resp.data[0]
    return None
