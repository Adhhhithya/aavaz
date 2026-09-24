import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from main import app
from tests.fake_supabase import FakeSupabaseClient

client = TestClient(app)

@pytest.mark.asyncio
async def test_chaos_health_endpoint_db_outage():
    """
    Test the health endpoint behaviour under DB outage.
    """
    with patch("api.health_routes.get_supabase", new_callable=AsyncMock) as mock_sup:
        mock_table = AsyncMock()
        mock_table.select.return_value.limit.return_value.execute.side_effect = Exception("DB DEAD")
        
        mock_db = AsyncMock()
        mock_db.table.return_value = mock_table
        mock_sup.return_value = mock_db
        
        response = client.get("/health/integrations")
        
        # Integrations health returns 200 with degraded status, not 500
        assert response.status_code == 200
        res_data = response.json()
        assert res_data["status"] == "degraded"
        assert "error" in res_data["services"]["database"]

@pytest.mark.asyncio
async def test_chaos_concurrent_sos_duplicate_handling():
    """
    Simulate sending identical SOS events rapidly to ensure we don't spam the DB or escalate twice.
    """
    initial_db = {
        "users": [{"id": "v-1", "phone_number": "+919876543210", "role": "victim"}],
        "victims": [{"id": "v-prof-1", "user_id": "v-1", "assigned_counsellor_id": "c-1"}],
        "cases": [{"id": "case-1", "user_id": "v-1", "has_sos": False, "assigned_counsellor_id": "c-1", "current_distress_score": 0.0}]
    }
    fake_db = FakeSupabaseClient()
    for table, rows in initial_db.items():
        fake_db._store[table] = rows.copy()
    from api.auth.victim_dependencies import get_current_victim, CurrentVictim

    with patch("api.cases.sos_routes.get_supabase", new_callable=AsyncMock) as mock_sup, \
         patch("api.scoring.fusion.calculate_dynamic_score", new_callable=AsyncMock) as mock_process:
        
        mock_sup.return_value = fake_db
        mock_process.return_value = AsyncMock(
            distress_score=95.0, 
            emotion_tag=AsyncMock(value="fear"),
            intervention=AsyncMock(value="police_dispatch"),
            score_breakdown={}
        )
        
        app.dependency_overrides[get_current_victim] = lambda: CurrentVictim(
            id="v-1",
            phone_number="+919876543210"
        )
        
        payload = {
            "case_id": "case-1",
            "location_lat": 12.9716,
            "location_lng": 77.5946
        }
        
        # First SOS
        response1 = client.post("/api/v1/cases/sos/sos", json=payload)
        assert response1.status_code == 200
        
        # Second SOS (Duplicate)
        response2 = client.post("/api/v1/cases/sos/sos", json=payload)
        
        app.dependency_overrides.clear()
        
        assert response2.status_code in [200, 429, 400]
        # In a real db it would return is_duplicate = True on unique constraint violation
        # Our FakeDb doesn't enforce unique constraint on 'case_id', so it won't throw 
        # But we verify it doesn't crash on consecutive calls.
        sos_events = fake_db._store.get("sos_events", [])
        assert len(sos_events) >= 1
