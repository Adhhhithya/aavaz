import pytest
from fastapi.testclient import TestClient
from main import app
from api.auth.victim_dependencies import issue_victim_session_token

client = TestClient(app)

def test_profile_endpoints_authenticated(monkeypatch):
    from unittest.mock import AsyncMock, MagicMock
    import services.supabase_client as sc

    fake_supabase = MagicMock()
    
    # Mock users table
    mock_users = MagicMock()
    mock_users.select.return_value.eq.return_value.limit.return_value.execute = AsyncMock(
        return_value=MagicMock(data=[{
            "id": "11111111-1111-1111-1111-111111111111",
            "name": "Rithul Test",
            "phone_number": "+919400000929",
            "preferred_language": "hi",
            "role_type": "victim"
        }])
    )
    mock_users.update.return_value.eq.return_value.execute = AsyncMock(
        return_value=MagicMock(data=[])
    )

    # Mock safety_settings table
    mock_safety = MagicMock()
    mock_safety.select.return_value.eq.return_value.limit.return_value.execute = AsyncMock(
        return_value=MagicMock(data=[{
            "user_id": "11111111-1111-1111-1111-111111111111",
            "trusted_contact_name": "Emergency Person",
            "trusted_contact_phone": "+919876543210"
        }])
    )
    mock_safety.select.return_value.eq.return_value.execute = AsyncMock(
        return_value=MagicMock(data=[{"user_id": "11111111-1111-1111-1111-111111111111"}])
    )
    mock_safety.update.return_value.eq.return_value.execute = AsyncMock(
        return_value=MagicMock(data=[])
    )
    mock_safety.insert.return_value.execute = AsyncMock(
        return_value=MagicMock(data=[])
    )

    def table_router(name):
        if name == "users":
            return mock_users
        elif name == "safety_settings":
            return mock_safety
        return MagicMock()

    fake_supabase.table.side_effect = table_router

    monkeypatch.setattr(sc, "get_supabase", AsyncMock(return_value=fake_supabase))

    user_id = "11111111-1111-1111-1111-111111111111"
    token = issue_victim_session_token(user_id, "+919400000929")

    # 1. GET /profile
    res = client.get("/api/v1/auth/profile", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["user"]["name"] == "Rithul Test"
    assert data["user"]["phone"] == "+919400000929"
    assert data["user"]["emergencyContact"]["name"] == "Emergency Person"
    assert data["user"]["emergencyContact"]["phone"] == "+919876543210"

    # 2. PUT /profile
    update_res = client.put(
        "/api/v1/auth/profile",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Updated Name",
            "preferred_language": "ta",
            "emergencyContact": {
                "name": "New Emergency Contact",
                "phone": "+919999988888"
            }
        }
    )
    assert update_res.status_code == 200
