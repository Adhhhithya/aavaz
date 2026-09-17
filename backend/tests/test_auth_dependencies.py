"""
Unit tests for the staff authorization primitives in api/auth/dependencies.py.

These exercise get_bearer_token and require_roles directly as plain async
functions (no HTTP layer, no Supabase network call), which is enough to cover
their actual decision logic deterministically and fast.
"""

import pytest
from fastapi import HTTPException

from api.auth.dependencies import CurrentStaffUser, get_bearer_token, require_roles


# ---- get_bearer_token -------------------------------------------------------

async def test_missing_authorization_header_is_rejected():
    with pytest.raises(HTTPException) as exc_info:
        await get_bearer_token(authorization=None)
    assert exc_info.value.status_code == 401


async def test_malformed_authorization_header_is_rejected():
    # Missing the "Bearer " scheme prefix entirely.
    with pytest.raises(HTTPException) as exc_info:
        await get_bearer_token(authorization="some-raw-token-without-scheme")
    assert exc_info.value.status_code == 401


async def test_empty_bearer_token_is_rejected():
    with pytest.raises(HTTPException) as exc_info:
        await get_bearer_token(authorization="Bearer    ")
    assert exc_info.value.status_code == 401


async def test_well_formed_bearer_header_returns_the_token():
    token = await get_bearer_token(authorization="Bearer abc.def.ghi")
    assert token == "abc.def.ghi"


# ---- require_roles -----------------------------------------------------------

async def test_require_roles_rejects_insufficient_role():
    checker = require_roles("super_admin")
    counsellor = CurrentStaffUser(id="staff-1", role="counsellor", name="Test Counsellor")

    with pytest.raises(HTTPException) as exc_info:
        await checker(current_user=counsellor)
    assert exc_info.value.status_code == 403


async def test_require_roles_rejects_non_staff_role():
    # Defence in depth: even if get_current_staff_user somehow returned a
    # non-staff role_type, require_roles must still reject it.
    checker = require_roles("counsellor", "super_admin")
    victim_shaped_user = CurrentStaffUser(id="victim-1", role="victim", name=None)

    with pytest.raises(HTTPException) as exc_info:
        await checker(current_user=victim_shaped_user)
    assert exc_info.value.status_code == 403


async def test_require_roles_allows_matching_role():
    checker = require_roles("counsellor", "super_admin")
    counsellor = CurrentStaffUser(id="staff-1", role="counsellor", name="Test Counsellor")

    result = await checker(current_user=counsellor)
    assert result is counsellor


async def test_require_roles_allows_any_of_multiple_roles():
    checker = require_roles("district_admin", "state_admin", "national_admin", "super_admin")
    for role in ("district_admin", "state_admin", "national_admin", "super_admin"):
        user = CurrentStaffUser(id="staff-x", role=role)
        result = await checker(current_user=user)
        assert result.role == role
