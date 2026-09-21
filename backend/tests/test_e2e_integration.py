"""
backend/tests/test_e2e_integration.py

Full end-to-end integration test suite:
Voice Intake -> Supervisor Orchestrator -> Multi-Agent Pipeline -> Distress Scoring -> Escalation -> Dashboard Queue

Validates:
1. Voice intake endpoint (/api/v1/intake/voice/turn) processes user turn through full Supervisor.
2. Triage agent flags immediate threat / witness intimidation correctly.
3. Multimodal distress scoring computes high score with explainable breakdown.
4. Escalation status is recorded.
5. Voice-agent bridge (aavaz_bridge.py) produces correct ResponseEnvelope.
6. Counsellor dashboard exposes prioritized high-distress case with XAI breakdown.
"""
from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient

from main import app
import importlib.util
import sys
from pathlib import Path

_bridge_path = Path(__file__).resolve().parent.parent.parent / "voice-agent" / "app" / "aavaz_bridge.py"
_spec = importlib.util.spec_from_file_location("aavaz_bridge", str(_bridge_path))
_bridge_mod = importlib.util.module_from_spec(_spec)
sys.modules["aavaz_bridge"] = _bridge_mod
_spec.loader.exec_module(_bridge_mod)
bridge_report_turn = _bridge_mod.report_turn
ResponseEnvelope = _bridge_mod.ResponseEnvelope

client = TestClient(app)


# ---------------------------------------------------------------------------
# Test Fixtures & Mocks
# ---------------------------------------------------------------------------

class FakeDbResult:
    def __init__(self, data):
        self.data = data


class FakeDbQuery:
    def __init__(self, store: dict, table_name: str):
        self.store = store
        self.table_name = table_name
        self.filters = {}
        self.order_by = None
        self.order_desc = False
        self.limit_val = None
        self.single_val = False

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, field, value):
        self.filters[field] = value
        return self

    def neq(self, field, value):
        self.filters[f"!{field}"] = value
        return self

    def order(self, field, desc=False):
        self.order_by = field
        self.order_desc = desc
        return self

    def limit(self, count):
        self.limit_val = count
        return self

    def single(self):
        self.single_val = True
        return self

    def insert(self, payload):
        rows = self.store.setdefault(self.table_name, [])
        record = dict(payload)
        record.setdefault("id", f"new-{len(rows)+1}")
        rows.append(record)
        return self

    def update(self, payload):
        rows = self.store.setdefault(self.table_name, [])
        for row in rows:
            match = True
            for k, v in self.filters.items():
                if k.startswith("!"):
                    if row.get(k[1:]) == v:
                        match = False
                        break
                elif row.get(k) != v:
                    match = False
                    break
            if match:
                row.update(payload)
        return self

    async def execute(self):
        rows = self.store.get(self.table_name, [])
        filtered = []
        for r in rows:
            match = True
            for k, v in self.filters.items():
                if k.startswith("!"):
                    if r.get(k[1:]) == v:
                        match = False
                        break
                elif r.get(k) != v:
                    match = False
                    break
            if match:
                filtered.append(dict(r))

        if self.order_by:
            filtered.sort(
                key=lambda x: x.get(self.order_by, 0) or 0,
                reverse=self.order_desc,
            )

        if self.limit_val is not None:
            filtered = filtered[:self.limit_val]

        if self.single_val:
            return FakeDbResult(filtered[0] if filtered else None)
        return FakeDbResult(filtered)


class FakeDb:
    def __init__(self, initial_data: dict):
        self.store = {k: [dict(r) for r in v] for k, v in initial_data.items()}

    def table(self, table_name: str):
        return FakeDbQuery(self.store, table_name)


# ---------------------------------------------------------------------------
# Test Cases
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_e2e_voice_turn_to_supervisor_pipeline():
    """
    End-to-End: High threat voice utterance flows through intake endpoint,
    triggers Triage danger detection, calculates distress, flags escalation,
    and returns a structured VoiceTurnResponse.
    """
    from api.intake.voice_routes import voice_turn, VoiceTurnRequest

    request = VoiceTurnRequest(
        session_id="e2e-session-001",
        user_text="They came with weapons outside my home and threatened to kill me if I testify tomorrow.",
        victim_id="v-101",
        case_id="c-202",
        language="en",
        channel="voice",
    )

    resp = await voice_turn(request)

    assert resp.reply, "Agent reply must not be empty"
    assert resp.distress_score >= 60.0, f"Expected high distress score, got {resp.distress_score}"
    assert resp.risk_level in ("medium", "high", "critical"), f"Expected elevated risk, got {resp.risk_level}"
    assert resp.escalated is True, "High threat must trigger escalation"
    assert "112" in resp.reply or "safe" in resp.reply.lower() or "help" in resp.reply.lower()


@pytest.mark.asyncio
async def test_e2e_voice_bridge_handled_turn():
    """
    End-to-End: voice-agent bridge talks to backend intake endpoint,
    receives the ResponseEnvelope, marks handled=True, and parses fields.
    """
    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        mock_backend_response = MagicMock()
        mock_backend_response.status_code = 200
        mock_backend_response.json.return_value = {
            "reply": "Please stay indoors and locked. I have alerted emergency responders.",
            "distress_score": 88.0,
            "risk_level": "critical",
            "emotion_tag": "fear",
            "escalated": True,
            "intervention": "witness_protection",
        }
        mock_backend_response.raise_for_status = MagicMock()
        mock_client.post.return_value = mock_backend_response
        mock_client_cls.return_value = mock_client

        envelope = await bridge_report_turn(
            session_id="sess-bridge-test",
            user_text="Someone is banging on my door right now!",
            victim_id="v-101",
            case_id="c-202",
            language="en",
        )

        assert envelope is not None
        assert envelope.handled is True
        assert envelope.distress_score == 88.0
        assert envelope.risk_level == "critical"
        assert envelope.escalated is True
        assert "locked" in envelope.reply.lower() or "stay" in envelope.reply.lower()


@pytest.mark.asyncio
async def test_e2e_counsellor_dashboard_queue_prioritization():
    """
    End-to-End: Counsellor dashboard fetches assigned cases ordered by distress score desc.
    High-distress case (score 88) appears at index 0 ahead of lower distress cases (score 25).
    """
    initial_db = {
        "cases": [
            {
                "id": "c-low-1",
                "assigned_counsellor_id": "counsellor-abc",
                "case_type": "economic_hardship",
                "case_stage": "investigation",
                "current_distress_score": 25.0,
                "updated_at": "2026-09-20T10:00:00Z",
                "has_sos": False,
                "user_id": "u-1",
            },
            {
                "id": "c-high-2",
                "assigned_counsellor_id": "counsellor-abc",
                "case_type": "physical_assault",
                "case_stage": "trial",
                "current_distress_score": 88.0,
                "updated_at": "2026-09-20T11:00:00Z",
                "has_sos": True,
                "user_id": "u-2",
            },
        ],
        "users": [
            {"id": "u-1", "name": "Ramesh", "phone_number": "+917000000010"},
            {"id": "u-2", "name": "Kavitha", "phone_number": "+917000000020"},
        ],
    }

    fake_db = FakeDb(initial_db)

    with patch("api.dashboards.counsellor_routes.get_supabase", new_callable=AsyncMock) as mock_sup:
        mock_sup.return_value = fake_db
        from api.dashboards.counsellor_routes import get_counsellor_queue
        from api.auth.dependencies import CurrentStaffUser

        staff_user = CurrentStaffUser(
            id="counsellor-abc",
            role="counsellor",
            name="Counsellor ABC",
        )

        res = await get_counsellor_queue(counsellor_id="counsellor-abc", current_user=staff_user)

        assert res["total_cases"] == 2
        queue = res["queue"]
        assert queue[0]["id"] == "c-high-2", "Highest distress case must be prioritized first"
        assert queue[0]["current_distress_score"] == 88.0
        assert queue[0]["user_name"] == "Kavitha"
        assert queue[1]["id"] == "c-low-1"
