import pytest
from unittest.mock import AsyncMock, patch
from api.cases.sos_routes import trigger_sos, SOSRequest
from api.auth.victim_dependencies import CurrentVictim
from tests.fake_supabase import FakeSupabaseClient

@pytest.mark.asyncio
async def test_duplicate_sos_spam(monkeypatch):
    """
    Test that spamming the SOS button securely detects duplicate events 
    and handles them gracefully via Postgres 23505 Unique Violation handling.
    """
    # 1. Setup minimal fake client for this specific test
    client = FakeSupabaseClient()
    async def _fake_get_supabase():
        return client

    # We need to simulate the unique constraint logic manually since the fake client
    # is an in-memory dictionary. We will monkeypatch its insert method.
    from tests.fake_supabase import FakeTable
    original_insert = FakeTable.insert

    call_count = 0
    def idempotent_insert(self, payload):
        if self._name == "sos_events":
            nonlocal call_count
            call_count += 1
            if call_count > 1:
                # Simulate Postgres Unique Violation 23505
                raise Exception("duplicate key value violates unique constraint")
        return original_insert(self, payload)

    monkeypatch.setattr(FakeTable, "insert", idempotent_insert)

    # 2. Setup existing case for the victim
    victim_id = "11111111-1111-1111-1111-111111111111"
    case_id = "22222222-2222-2222-2222-222222222222"
    
    client._store["cases"] = [{
        "id": case_id,
        "user_id": victim_id,
        "assigned_counsellor_id": "33333333-3333-3333-3333-333333333333"
    }]

    monkeypatch.setattr("api.cases.sos_routes.get_supabase", _fake_get_supabase)

    # 3. Simulate first valid SOS call
    victim = CurrentVictim(id=victim_id, phone_number="+919999999999")
    req = SOSRequest(case_id=case_id, location_lat=0, location_lng=0)
    
    with patch("api.scoring.fusion.calculate_dynamic_score", new_callable=AsyncMock) as mock_fusion, \
         patch("services.pushbullet_service.send_push_notification", new_callable=AsyncMock) as mock_push:
        
        # Mock fusion result
        mock_fusion.return_value.distress_score = 95
        mock_fusion.return_value.emotion_tag.value = "fear"
        mock_fusion.return_value.intervention.value = "urgent"
        mock_fusion.return_value.score_breakdown = {}
        
        res1 = await trigger_sos(request=req, current_victim=victim)
        
        assert res1["status"] == "success"
        assert res1["is_duplicate"] is False
        assert len(client._store.get("sos_events", [])) == 1

        # 4. Simulate a concurrent spam SOS call
        res2 = await trigger_sos(request=req, current_victim=victim)
        
        # Should gracefully return success but marked as duplicate, returning the same SOS ID
        assert res2["status"] == "success"
        assert res2["is_duplicate"] is True
        assert res2["sos_id"] == res1["sos_id"]
        
        # Still only one SOS event exists
        assert len(client._store.get("sos_events", [])) == 1
