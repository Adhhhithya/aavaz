"""
Tests for victim session/identity issuance and verification
(api/auth/victim_dependencies.py).
"""

import pytest
from fastapi import HTTPException

from api.auth import victim_dependencies as vd


@pytest.fixture(autouse=True)
def _dev_secret(monkeypatch):
    monkeypatch.setattr(vd.settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(vd.settings, "VICTIM_SESSION_SECRET", "")


# ---- Successful OTP verification establishes victim identity -----------------

async def test_victim_session_token_resolves_to_the_issuing_victim_id():
    token = vd.issue_victim_session_token("victim-123", "+919999999999")
    victim = await vd.get_current_victim(token=token)
    assert victim.id == "victim-123"
    assert victim.phone_number == "+919999999999"


async def test_phone_verified_token_resolves_to_the_verified_phone_only():
    token = vd.issue_phone_verified_token("+919999999999")
    phone = await vd.get_phone_verified_number(token=token)
    assert phone == "+919999999999"


# ---- Identity is resolved server-side, not accepted from client parameters ----

async def test_phone_verified_token_cannot_be_used_as_a_victim_session():
    """A token proving phone ownership must not grant full victim access —
    that would let registration-in-progress bypass identity binding entirely."""
    token = vd.issue_phone_verified_token("+919999999999")
    with pytest.raises(HTTPException) as exc_info:
        await vd.get_current_victim(token=token)
    assert exc_info.value.status_code == 401


async def test_victim_session_token_cannot_be_used_as_phone_verified():
    """The reverse direction must also be rejected — a full session must not
    be replayable against the registration-only endpoint."""
    token = vd.issue_victim_session_token("victim-123", "+919999999999")
    with pytest.raises(HTTPException) as exc_info:
        await vd.get_phone_verified_number(token=token)
    assert exc_info.value.status_code == 401


async def test_garbage_token_is_rejected_as_victim_session():
    with pytest.raises(HTTPException) as exc_info:
        await vd.get_current_victim(token="not-a-real-jwt")
    assert exc_info.value.status_code == 401


async def test_token_signed_with_a_different_secret_is_rejected():
    import jwt as pyjwt

    forged = pyjwt.encode(
        {"purpose": "victim", "sub": "victim-attacker-controlled", "exp": 9999999999},
        "some-other-secret",
        algorithm="HS256",
    )
    with pytest.raises(HTTPException) as exc_info:
        await vd.get_current_victim(token=forged)
    assert exc_info.value.status_code == 401


async def test_expired_victim_session_is_rejected():
    import jwt as pyjwt
    from datetime import datetime, timedelta, timezone

    expired_payload = {
        "purpose": "victim",
        "sub": "victim-123",
        "phone_number": "+919999999999",
        "iat": datetime.now(timezone.utc) - timedelta(hours=2),
        "exp": datetime.now(timezone.utc) - timedelta(hours=1),
    }
    token = pyjwt.encode(expired_payload, vd._victim_secret(), algorithm="HS256")
    with pytest.raises(HTTPException) as exc_info:
        await vd.get_current_victim(token=token)
    assert exc_info.value.status_code == 401


# ---- resolve_victim_by_phone (login vs. registration branch) -----------------

async def test_resolve_victim_by_phone_finds_existing_user(monkeypatch):
    from tests.fake_supabase import FakeSupabaseClient

    client = FakeSupabaseClient()
    await client.table("users").insert({"id": "victim-abc", "phone_number": "+919999999999"}).execute()

    async def _fake_get_supabase():
        return client

    monkeypatch.setattr(vd, "get_supabase", _fake_get_supabase)

    user = await vd.resolve_victim_by_phone("+919999999999")
    assert user["id"] == "victim-abc"


async def test_resolve_victim_by_phone_returns_none_for_unknown_phone(monkeypatch):
    from tests.fake_supabase import FakeSupabaseClient

    client = FakeSupabaseClient()

    async def _fake_get_supabase():
        return client

    monkeypatch.setattr(vd, "get_supabase", _fake_get_supabase)

    user = await vd.resolve_victim_by_phone("+910000000000")
    assert user is None
