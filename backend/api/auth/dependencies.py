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

logger = logging.getLogger(__name__)

# role_type values that are allowed to authenticate as "staff" at all. Anything else
# (victim, witness, family) is a survivor-side identity, never a staff identity, even
# if it somehow held a valid Supabase Auth token.
STAFF_ROLES = {"counsellor", "district_admin", "state_admin", "national_admin", "super_admin"}


class CurrentStaffUser:
    """The authenticated, role-resolved staff identity for the current request."""

    __slots__ = ("id", "role", "name")

    def __init__(self, id: str, role: str, name: Optional[str] = None):
        self.id = id
        self.role = role
        self.name = name


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
    Verifies the bearer token against Supabase Auth and resolves it to a staff
    identity via the `users` table's `role_type` column.

    Raises 401 for a missing/invalid/expired token (authentication failure).
    Raises 403 for a valid token whose account has no staff role (authorization
    failure — the caller proved who they are, but they aren't staff).
    """
    supabase = await get_supabase()

    try:
        auth_result = await supabase.auth.get_user(token)
    except Exception as e:
        logger.warning(f"Staff token verification failed: {e}")
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = getattr(auth_result, "user", None)
    if user is None or not getattr(user, "id", None):
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    profile_resp = (
        await supabase.table("users").select("id, role_type, name").eq("id", user.id).execute()
    )
    if not profile_resp.data:
        raise HTTPException(status_code=403, detail="No staff profile associated with this account")

    role = profile_resp.data[0].get("role_type")
    if role not in STAFF_ROLES:
        raise HTTPException(status_code=403, detail="This account does not have staff access")

    return CurrentStaffUser(id=user.id, role=role, name=profile_resp.data[0].get("name"))


def require_roles(*allowed_roles: str):
    """
    Dependency factory: restricts an endpoint to the given `role_type` values.

    Usage: `current_user: CurrentStaffUser = Depends(require_roles("counsellor", "super_admin"))`
    """
    allowed = set(allowed_roles)

    async def _checker(current_user: CurrentStaffUser = Depends(get_current_staff_user)) -> CurrentStaffUser:
        if current_user.role not in allowed:
            raise HTTPException(status_code=403, detail="Insufficient role for this endpoint")
        return current_user

    return _checker
