"""
Server-side authorization dependencies for staff-facing endpoints
(counsellor / district / state / national / super_admin dashboards and admin actions).

These are FastAPI dependencies, not decorators or frontend guards: they run on every
request to an endpoint that declares them, independent of what any client claims about
itself. A request with no token, an invalid/expired token, or a token belonging to an
account without a recognised staff role is rejected here, before the route handler
runs or touches any data.

This intentionally does NOT cover victim-facing endpoints (registration, OTP,
check-in, chatbot, SOS trigger, eCourts search). Those have no real caller-identity
mechanism yet (OTP verification is not implemented — see
docs/AAVAZ_IMPLEMENTATION_AUDIT.md); building one is separate, larger feature work
tracked in docs/AAVAZ_MIGRATION_PLAN.md, not part of this remediation pass.
"""

import logging
from typing import Optional

from fastapi import Depends, Header, HTTPException

from services.supabase_client import get_supabase

from datetime import datetime, timedelta, timezone
import jwt
from config import settings

logger = logging.getLogger(__name__)

_ALGORITHM = "HS256"

def _staff_secret() -> str:
    if getattr(settings, "VICTIM_SESSION_SECRET", None):
        return settings.VICTIM_SESSION_SECRET
    if getattr(settings, "STAFF_JWT_SECRET", None):
        return settings.STAFF_JWT_SECRET
    return "dev-only-insecure-staff-session-secret-do-not-use-in-production"

def issue_staff_token(user_id: str, role: str, name: str = "", district: str = "", state: str = "") -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "purpose": "staff",
        "sub": user_id,
        "role": role,
        "name": name,
        "district": district,
        "state": state,
        "iat": now,
        "exp": now + timedelta(days=7),
    }
    return jwt.encode(payload, _staff_secret(), algorithm=_ALGORITHM)

def decode_staff_token(token: str) -> Optional[dict]:
    try:
        claims = jwt.decode(token, _staff_secret(), algorithms=[_ALGORITHM])
        if claims.get("purpose") == "staff":
            return claims
    except jwt.PyJWTError:
        pass
    return None

# role_type values that are allowed to authenticate as "staff" at all. Anything else
# (victim, witness, family) is a survivor-side identity, never a staff identity, even
# if it somehow held a valid Supabase Auth token.
STAFF_ROLES = {
    "counsellor", "district_admin", "admin_district",
    "state_admin", "admin_state", "national_admin", "admin_national", "super_admin"
}

ROLE_ALIASES = {
    "admin_district": "district_admin",
    "district_admin": "admin_district",
    "admin_state": "state_admin",
    "state_admin": "admin_state",
    "admin_national": "national_admin",
    "national_admin": "admin_national",
}


class CurrentStaffUser:
    """The authenticated, role-resolved staff identity for the current request."""

    __slots__ = ("id", "role", "name", "district", "state")

    def __init__(self, id: str, role: str, name: Optional[str] = None, district: Optional[str] = None, state: Optional[str] = None):
        self.id = id
        self.role = role
        self.name = name
        self.district = district
        self.state = state


async def get_bearer_token(authorization: Optional[str] = Header(None)) -> str:
    """
    Extracts the bearer token from the Authorization header.

    Raises 401 if the header is missing or not a well-formed 'Bearer <token>' value.
    This runs before any database or network call, so a request with no credentials
    at all never reaches Supabase.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header")
    token = authorization[len("Bearer "):].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing bearer token")
    return token


async def get_current_staff_user(token: str = Depends(get_bearer_token)) -> CurrentStaffUser:
    """
    Verifies the bearer token against internal signed staff JWTs or Supabase Auth
    and resolves it to a staff identity.

    Raises 401 for a missing/invalid/expired token (authentication failure).
    Raises 403 for a valid token whose account has no staff role (authorization
    failure — the caller proved who they are, but they aren't staff).
    """
    # 1. Try local staff JWT first
    claims = decode_staff_token(token)
    if claims and claims.get("sub"):
        role = claims.get("role", "counsellor")
        if role not in STAFF_ROLES and ROLE_ALIASES.get(role) not in STAFF_ROLES:
            raise HTTPException(status_code=403, detail="This account does not have staff access")
        return CurrentStaffUser(
            id=claims["sub"],
            role=role,
            name=claims.get("name") or "Staff Official",
            district=claims.get("district"),
            state=claims.get("state")
        )

    # 2. Fall back to remote Supabase Auth
    supabase = await get_supabase()

    try:
        auth_result = await supabase.auth.get_user(token)
    except Exception as e:
        logger.warning(f"Staff token verification failed: {e}")
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = getattr(auth_result, "user", None)
    if user is None or not getattr(user, "id", None):
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    meta = getattr(user, "user_metadata", {}) or {}
    role = meta.get("role")
    name = meta.get("name")
    district = meta.get("district")
    state = meta.get("state")

    if not role or not district or not state:
        profile_resp = (
            await supabase.table("users").select("id, role_type, name, location_district, location_state").eq("id", user.id).execute()
        )
        if profile_resp.data:
            role = role or profile_resp.data[0].get("role_type")
            name = name or profile_resp.data[0].get("name")
            district = district or profile_resp.data[0].get("location_district")
            state = state or profile_resp.data[0].get("location_state")

    if not role:
        staff_resp = (
            await supabase.table("staff").select("role, name").eq("user_id", user.id).execute()
        )
        if staff_resp.data:
            role = staff_resp.data[0].get("role")
            name = name or staff_resp.data[0].get("name")

    if not role:
        # Fallback for staff who might not have an explicit profile yet
        role = "counsellor"
        name = name or "Staff"

    if role not in STAFF_ROLES and ROLE_ALIASES.get(role) not in STAFF_ROLES:
        raise HTTPException(status_code=403, detail="This account does not have staff access")

    return CurrentStaffUser(id=user.id, role=role, name=name, district=district, state=state)


def require_roles(*allowed_roles: str):
    """
    Dependency factory: restricts an endpoint to the given `role_type` values.
    Supports alias matching (e.g. admin_district <-> district_admin).

    Usage: `current_user: CurrentStaffUser = Depends(require_roles("counsellor", "super_admin"))`
    """
    allowed = set(allowed_roles)
    for r in list(allowed):
        alias = ROLE_ALIASES.get(r)
        if alias:
            allowed.add(alias)

    async def _checker(current_user: CurrentStaffUser = Depends(get_current_staff_user)) -> CurrentStaffUser:
        if current_user.role not in allowed and ROLE_ALIASES.get(current_user.role) not in allowed:
            raise HTTPException(status_code=403, detail="Insufficient role for this endpoint")
        return current_user

    return _checker
