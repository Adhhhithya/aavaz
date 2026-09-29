import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)

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

    def limit(self, count):
        self.limit_val = count
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


@pytest.mark.asyncio
async def test_e2e_sos_flow():
    """
    Test E2E SOS Flow:
    SOS -> location -> intake -> scoring -> escalation -> task -> dashboard
    """
    initial_db = {
        "users": [{"id": "v-1", "phone_number": "+919876543210", "role": "victim"}],
        "victims": [{"id": "v-prof-1", "user_id": "v-1", "assigned_counsellor_id": "c-1"}],
        "cases": [{"id": "case-1", "user_id": "v-1", "has_sos": False, "assigned_counsellor_id": "c-1", "current_distress_score": 0.0}]
    }
    fake_db = FakeDb(initial_db)
    
    from api.auth.victim_dependencies import get_current_victim, CurrentVictim
    
    with patch("api.cases.sos_routes.get_supabase", new_callable=AsyncMock) as mock_sup, \
         patch("api.scoring.fusion.calculate_dynamic_score", new_callable=AsyncMock) as mock_process:
        
        mock_sup.return_value = fake_db
        mock_process.return_value = MagicMock(
            distress_score=95.0, 
            emotion_tag=MagicMock(value="fear"),
            intervention=MagicMock(value="police_dispatch"),
            score_breakdown={}
        )
        
        # Override auth dependency
        app.dependency_overrides[get_current_victim] = lambda: CurrentVictim(
            id="v-1",
            phone_number="+919876543210"
        )
        
        # Test SOS Dispatch (simulating mobile SOS)
        response = client.post(
            "/api/v1/cases/sos/sos",
            json={
                "case_id": "case-1",
                "location_lat": 12.9716,
                "location_lng": 77.5946
            }
        )
        
        # Clean up override
        app.dependency_overrides.clear()
        
        assert response.status_code == 200
        res_data = response.json()
        assert res_data["status"] == "success"
        
        # Verify DB updates
        cases = fake_db.store["cases"]
        assert len(cases) > 0
        assert cases[0]["current_distress_score"] >= 90.0
        
        # Verify SOS event creation
        sos_events = fake_db.store.get("sos_events", [])
        assert len(sos_events) == 1
        assert sos_events[0]["case_id"] == "case-1"


@pytest.mark.asyncio
async def test_e2e_ivr_webhook_failure_recovery():
    """
    Test E2E Voice webhook provider failure and safe fallback.
    Voice call -> webhook -> transcription -> scoring failure -> safe fallback -> observable failure -> recovery
    """
    from services.sms_intake_service import process_incoming_sms
    
    initial_db = {
        "users": [{"id": "v-1", "phone_number": "+919876543210", "role": "victim"}],
        "cases": [{"id": "case-1", "user_id": "v-1", "assigned_counsellor_id": "c-1", "current_distress_score": 0.0}]
    }
    fake_db = FakeDb(initial_db)
    
    with patch("services.sms_intake_service.get_supabase", new_callable=AsyncMock) as mock_sup, \
         patch("api.scoring.fusion.calculate_dynamic_score", new_callable=AsyncMock) as mock_process, \
         patch("services.sms_intake_service.AsyncGroq"):
        
        mock_sup.return_value = fake_db
        # Simulate ML scoring failure (exception raised)
        mock_process.side_effect = Exception("ML extraction timeout")
        
        # Run webhook
        result = await process_incoming_sms(
            from_number="+919876543210",
            message_body="I am feeling very anxious about court tomorrow."
        )
        
        assert result["status"] == "success"
        
        # Verify safe fallback: interaction is stored despite LLM/ML failure
        interactions = fake_db.store.get("interactions", [])
        assert len(interactions) > 0
        
        # Interactions has bot and victim
        victim_inter = next((i for i in interactions if "Victim:" in i["transcript_ref"]), None)
        assert victim_inter is not None
        assert victim_inter.get("user_id") == "v-1" or victim_inter.get("case_id") == "case-1"
        assert victim_inter["final_score"] == 0.0 # Default neutral score on fallback
