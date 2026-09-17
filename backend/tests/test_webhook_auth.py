"""
Tests for the interim shared-secret webhook verification
(api/auth/webhook_auth.py) applied to the Bolna IVR and Pushbullet SMS webhook
routers.

Per docs/AAVAZ_IMPLEMENTATION_AUDIT.md: neither provider's real signature scheme
is known/available in this repo, so this tests the generic shared-secret
mechanism actually implemented, not a vendor-specific signature (which would be
fabricated and is explicitly out of scope).
"""

import pytest
from fastapi.testclient import TestClient

from main import app as real_app


@pytest.fixture
def client():
    return TestClient(real_app)


IVR_PAYLOAD = {
    "call_id": "c1",
    "user_phone": "+919999999999",
    "transcript": "hello",
    "duration_seconds": 5,
    "call_status": "completed",
}

SMS_PAYLOAD = {
    "from_number": "+919999999999",
    "message_body": "hi",
    "timestamp": "2026-01-01T00:00:00Z",
}


def test_ivr_webhook_allowed_without_secret_in_development(client, monkeypatch):
    from config import settings

    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "BOLNA_WEBHOOK_SECRET", "")

    response = client.post("/api/v1/intake/ivr/webhook", json=IVR_PAYLOAD)
    # Passes the AUTH layer in dev with no secret configured (may still 200 or
    # error downstream depending on Supabase availability — that's not what's
    # under test here; a 401/503 here would mean the auth layer itself blocked it).
    assert response.status_code not in (401, 503)


def test_ivr_webhook_rejected_without_secret_outside_development(client, monkeypatch):
    from config import settings

    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "BOLNA_WEBHOOK_SECRET", "")

    response = client.post("/api/v1/intake/ivr/webhook", json=IVR_PAYLOAD)
    assert response.status_code == 503


def test_ivr_webhook_rejects_wrong_secret(client, monkeypatch):
    from config import settings

    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "BOLNA_WEBHOOK_SECRET", "correct-secret")

    response = client.post(
        "/api/v1/intake/ivr/webhook",
        json=IVR_PAYLOAD,
        headers={"X-Webhook-Secret": "wrong-secret"},
    )
    assert response.status_code == 401


def test_ivr_webhook_rejects_missing_header_when_secret_configured(client, monkeypatch):
    from config import settings

    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "BOLNA_WEBHOOK_SECRET", "correct-secret")

    response = client.post("/api/v1/intake/ivr/webhook", json=IVR_PAYLOAD)
    assert response.status_code == 401


def test_ivr_webhook_accepts_correct_secret(client, monkeypatch):
    from config import settings

    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "BOLNA_WEBHOOK_SECRET", "correct-secret")

    response = client.post(
        "/api/v1/intake/ivr/webhook",
        json=IVR_PAYLOAD,
        headers={"X-Webhook-Secret": "correct-secret"},
    )
    assert response.status_code not in (401, 503)


def test_ivr_distress_assessment_and_precall_also_protected(client, monkeypatch):
    """The secret dependency is applied at the router level, so it must cover
    every route on it, not just /webhook."""
    from config import settings

    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "BOLNA_WEBHOOK_SECRET", "correct-secret")

    r1 = client.post(
        "/api/v1/intake/ivr/distress-assessment",
        json={
            "caller_identity": "x",
            "estimated_distress_score": 1,
            "immediate_threat_detected": False,
            "summary_notes": "n",
        },
    )
    assert r1.status_code == 401

    r2 = client.post("/api/v1/intake/ivr/pre-call", json={"call_id": "c", "user_phone": "+91123"})
    assert r2.status_code == 401


def test_sms_webhook_rejected_without_secret_outside_development(client, monkeypatch):
    from config import settings

    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "PUSHBULLET_WEBHOOK_SECRET", "")

    response = client.post("/api/v1/intake/sms/webhook", json=SMS_PAYLOAD)
    assert response.status_code == 503


def test_sms_webhook_rejects_wrong_secret(client, monkeypatch):
    from config import settings

    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "PUSHBULLET_WEBHOOK_SECRET", "correct-secret")

    response = client.post(
        "/api/v1/intake/sms/webhook",
        json=SMS_PAYLOAD,
        headers={"X-Webhook-Secret": "nope"},
    )
    assert response.status_code == 401


def test_sms_webhook_accepts_correct_secret(client, monkeypatch):
    from config import settings

    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "PUSHBULLET_WEBHOOK_SECRET", "correct-secret")

    response = client.post(
        "/api/v1/intake/sms/webhook",
        json=SMS_PAYLOAD,
        headers={"X-Webhook-Secret": "correct-secret"},
    )
    assert response.status_code not in (401, 503)


def test_secret_comparison_is_constant_time():
    import inspect

    from api.auth import webhook_auth

    source = inspect.getsource(webhook_auth)
    assert "hmac.compare_digest" in source
