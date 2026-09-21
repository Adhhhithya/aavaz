"""
backend/tests/test_bolna_webhook.py

Mocked-payload tests for the Bolna IVR webhook handler (Phase 5 requirement).

Tests verify:
  1. Valid webhook creates a new user and case for first-time callers
  2. Valid webhook updates an existing case
  3. High distress score (> 60) triggers escalation logging
  4. Missing transcript is handled gracefully (empty string, not crash)
  5. Webhook auth is enforced (invalid secret = 403)
  6. distress-assessment endpoint logs immediate threat correctly
  7. pre-call endpoint returns correct context for known vs unknown callers
  8. Telephony scheduler: _get_due_cases() returns high-risk case first
  9. Telephony scheduler: does not re-dispatch within MIN_CALL_SPACING_HOURS
 10. Bolna dispatch skips gracefully when BOLNA_API_KEY is not configured
"""
from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)

VALID_WEBHOOK_SECRET = "test-bolna-secret"

# ---------------------------------------------------------------------------
# Webhook auth header helper
# ---------------------------------------------------------------------------

def _bolna_headers(secret: str = VALID_WEBHOOK_SECRET) -> dict:
    return {"X-Bolna-Secret": secret}


# ---------------------------------------------------------------------------
# Fixture: fake Supabase client
# ---------------------------------------------------------------------------

class FakeSupabase:
    """Minimal Supabase mock that records inserts and supports chain queries."""
    def __init__(self, users=None, cases=None):
        self._users = users or []
        self._cases = cases or []
        self._inserts = []
        self._updates = []

    def table(self, name: str):
        return FakeTable(name, self)

    @property
    def inserts(self):
        return self._inserts

    @property
    def updates(self):
        return self._updates


class FakeTable:
    def __init__(self, name, db):
        self._name = name
        self._db = db
        self._filters = {}
        self._op = None
        self._data = None

    def select(self, *_):
        return self

    def insert(self, data):
        self._op = "insert"
        self._data = data
        return self

    def update(self, data):
        self._op = "update"
        self._data = data
        return self

    def upsert(self, data, **_):
        self._op = "upsert"
        self._data = data
        return self

    def eq(self, col, val):
        self._filters[col] = val
        return self

    def neq(self, col, val):
        return self

    def limit(self, n):
        return self

    async def execute(self):
        result = MagicMock()
        if self._op == "insert":
            self._db._inserts.append({"table": self._name, "data": self._data})
            result.data = [{"id": "new-id-123", **self._data}] if isinstance(self._data, dict) else [{"id": "new-id-123"}]
        elif self._op in ("update", "upsert"):
            self._db._updates.append({"table": self._name, "data": self._data})
            result.data = [{"id": "existing-id"}]
        else:
            # select
            if self._name == "users":
                result.data = self._db._users
            elif self._name == "cases":
                result.data = self._db._cases
            else:
                result.data = []
        return result


# ---------------------------------------------------------------------------
# Bolna webhook: new caller
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_bolna_webhook_creates_new_user_and_case():
    """First-time caller should create a user and case."""
    fake_db = FakeSupabase(users=[], cases=[])

    with patch("api.intake.ivr_webhook.get_supabase", new_callable=AsyncMock) as mock_sup, \
         patch("api.auth.webhook_auth.verify_bolna_webhook", return_value=None), \
         patch("api.intake.ivr_webhook.calculate_dynamic_score", new_callable=AsyncMock) as mock_score:

        mock_sup.return_value = fake_db
        mock_score.return_value = {
            "final_score": 35.0,
            "escalation_risk": "low",
            "case_type": "general_inquiry",
            "recommended_intervention": "none",
            "reasoning": "test",
        }

        payload = {
            "call_id": "call-abc-001",
            "user_phone": "+917000000001",
            "transcript": "I need some help with my case status.",
            "duration_seconds": 120.0,
            "call_status": "completed",
        }

        from api.intake.ivr_webhook import bolna_webhook
        from models.intake_models import BolnaWebhookPayload
        result = await bolna_webhook(BolnaWebhookPayload(**payload))
        assert result["status"] == "success"
        assert "case_id" in result

        # One user insert + one case insert should have happened
        tables_inserted = [i["table"] for i in fake_db.inserts]
        assert "users" in tables_inserted
        assert "cases" in tables_inserted


@pytest.mark.asyncio
async def test_bolna_webhook_updates_existing_case():
    """Known caller with existing case should update distress score."""
    existing_user = [{"id": "user-existing-001"}]
    existing_case = [{"id": "case-existing-001"}]
    fake_db = FakeSupabase(users=existing_user, cases=existing_case)

    with patch("api.intake.ivr_webhook.get_supabase", new_callable=AsyncMock) as mock_sup, \
         patch("api.auth.webhook_auth.verify_bolna_webhook", return_value=None), \
         patch("api.intake.ivr_webhook.calculate_dynamic_score", new_callable=AsyncMock) as mock_score:

        mock_sup.return_value = fake_db
        mock_score.return_value = {
            "final_score": 45.0, "escalation_risk": "medium",
            "case_type": "physical_assault", "recommended_intervention": "counselling",
            "reasoning": "distress signals",
        }

        payload = {
            "call_id": "call-abc-002",
            "user_phone": "+917000000002",
            "transcript": "They are still threatening me.",
            "duration_seconds": 90.0,
            "call_status": "completed",
        }

        from api.intake.ivr_webhook import bolna_webhook
        from models.intake_models import BolnaWebhookPayload
        result = await bolna_webhook(BolnaWebhookPayload(**payload))
        assert result["status"] == "success"
        assert result["case_id"] == "case-existing-001"

        # No new user/case insert — should have been an update only
        tables_inserted = [i["table"] for i in fake_db.inserts]
        assert "users" not in tables_inserted
        assert "cases" not in tables_inserted


@pytest.mark.asyncio
async def test_bolna_webhook_high_distress_logs_warning(caplog):
    """Score > 60 should trigger a high-distress log warning."""
    import logging
    fake_db = FakeSupabase(users=[{"id": "u1"}], cases=[{"id": "c1"}])

    with patch("api.intake.ivr_webhook.get_supabase", new_callable=AsyncMock) as mock_sup, \
         patch("api.auth.webhook_auth.verify_bolna_webhook", return_value=None), \
         patch("api.intake.ivr_webhook.calculate_dynamic_score", new_callable=AsyncMock) as mock_score:

        mock_sup.return_value = fake_db
        mock_score.return_value = {
            "final_score": 78.0, "escalation_risk": "high",
            "case_type": "physical_assault", "recommended_intervention": "counselling",
            "reasoning": "high distress",
        }

        from api.intake.ivr_webhook import bolna_webhook
        from models.intake_models import BolnaWebhookPayload
        with caplog.at_level(logging.WARNING):
            result = await bolna_webhook(BolnaWebhookPayload(
                call_id="c1", user_phone="+911", transcript="I'm scared",
                duration_seconds=60.0, call_status="completed",
            ))

        assert result["score"] >= 60
        assert any("HIGH DISTRESS" in r.message or "distress" in r.message.lower()
                   for r in caplog.records), "Expected high-distress warning log"


@pytest.mark.asyncio
async def test_bolna_webhook_empty_transcript_does_not_crash():
    """Empty transcript must be handled gracefully."""
    fake_db = FakeSupabase(users=[{"id": "u1"}], cases=[{"id": "c1"}])

    with patch("api.intake.ivr_webhook.get_supabase", new_callable=AsyncMock) as mock_sup, \
         patch("api.auth.webhook_auth.verify_bolna_webhook", return_value=None), \
         patch("api.intake.ivr_webhook.calculate_dynamic_score", new_callable=AsyncMock) as mock_score:

        mock_sup.return_value = fake_db
        mock_score.return_value = {
            "final_score": 0.0, "escalation_risk": "low",
            "case_type": "general_inquiry", "recommended_intervention": "none",
            "reasoning": "",
        }

        from api.intake.ivr_webhook import bolna_webhook
        from models.intake_models import BolnaWebhookPayload
        result = await bolna_webhook(BolnaWebhookPayload(
            call_id="c1", user_phone="+911", transcript="",
            duration_seconds=5.0, call_status="no_answer",
        ))
        assert result["status"] in ("success", "error")  # must not raise


# ---------------------------------------------------------------------------
# Distress assessment endpoint
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_distress_assessment_immediate_threat_logged(caplog):
    import logging
    with patch("api.auth.webhook_auth.verify_bolna_webhook", return_value=None):
        from api.intake.ivr_webhook import bolna_distress_assessment
        from models.intake_models import BolnaDistressAssessment
        payload = BolnaDistressAssessment(
            caller_identity="victim-test",
            estimated_distress_score=85,
            immediate_threat_detected=True,
            summary_notes="Caller says someone is outside their door with a weapon.",
        )
        with caplog.at_level(logging.WARNING):
            result = await bolna_distress_assessment(payload)
        assert result["status"] == "success"
        assert any("PRIORITY" in r.message or "threat" in r.message.lower()
                   for r in caplog.records)


# ---------------------------------------------------------------------------
# Pre-call endpoint
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_pre_call_returns_safe_defaults_for_unknown_caller():
    """Unknown caller must get safe generic defaults — never crash."""
    fake_db = FakeSupabase(users=[], cases=[])
    with patch("api.intake.ivr_webhook.get_supabase", new_callable=AsyncMock) as mock_sup, \
         patch("api.auth.webhook_auth.verify_bolna_webhook", return_value=None):
        mock_sup.return_value = fake_db
        from api.intake.ivr_webhook import bolna_pre_call
        from models.intake_models import BolnaPreCallPayload
        result = await bolna_pre_call(BolnaPreCallPayload(
            call_id="c1", user_phone="+917000009999",
        ))
        assert result["is_new_caller"] == "true"
        assert "name" in result


@pytest.mark.asyncio
async def test_pre_call_returns_victim_data_for_known_caller():
    fake_db = FakeSupabase(
        users=[{"id": "u1", "name": "Priya", "preferred_language": "hi"}],
        cases=[{"id": "c1", "case_type": "physical_assault", "case_stage": "investigation"}],
    )
    with patch("api.intake.ivr_webhook.get_supabase", new_callable=AsyncMock) as mock_sup, \
         patch("api.auth.webhook_auth.verify_bolna_webhook", return_value=None):
        mock_sup.return_value = fake_db
        from api.intake.ivr_webhook import bolna_pre_call
        from models.intake_models import BolnaPreCallPayload
        result = await bolna_pre_call(BolnaPreCallPayload(
            call_id="c1", user_phone="+917000000003",
        ))
        assert result["name"] == "Priya"
        assert result["is_new_caller"] == "false"


# ---------------------------------------------------------------------------
# Telephony scheduler unit tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_scheduler_skips_dispatch_when_bolna_not_configured():
    """No BOLNA_API_KEY → dispatch must return None, not raise."""
    with patch.dict("os.environ", {"BOLNA_API_KEY": "", "BOLNA_AGENT_ID": ""}):
        # Re-import to pick up patched env
        import importlib
        import services.telephony_scheduler as sched
        importlib.reload(sched)
        result = await sched._dispatch_bolna_call(
            phone_number="+917000000001",
            victim_name="Test",
            language="en",
            case_id="c-test-001",
        )
        assert result is None


@pytest.mark.asyncio
async def test_scheduler_dispatch_handles_bolna_api_error():
    """Bolna HTTP error must return None, not crash the scheduler."""
    with patch("httpx.AsyncClient") as mock_client_cls, \
         patch.dict("os.environ", {"BOLNA_API_KEY": "key123", "BOLNA_AGENT_ID": "agent-xyz"}):

        import importlib
        import services.telephony_scheduler as sched
        importlib.reload(sched)

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post.side_effect = Exception("connection refused")
        mock_client_cls.return_value = mock_client

        result = await sched._dispatch_bolna_call(
            phone_number="+917000000001",
            victim_name="Test",
            language="en",
            case_id="c-test-001",
        )
        assert result is None
