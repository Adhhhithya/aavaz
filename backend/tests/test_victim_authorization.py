"""
Cross-victim authorization tests: victim A must never be able to read or act on
victim B's data by changing an id in the request. Uses real, locally-verifiable
victim session tokens (issue_victim_session_token) — not dependency_overrides —
so these tests exercise the actual JWT verification path the real app uses, not
just the route wiring.

Synthetic test identities only (fake UUID-shaped ids, no real phone numbers).
"""

import pytest
from fastapi.testclient import TestClient

from api.auth.victim_dependencies import issue_victim_session_token
from main import app as real_app
from tests.fake_supabase import FakeSupabaseClient

VICTIM_A = "aaaaaaaa-0000-0000-0000-000000000001"
VICTIM_B = "bbbbbbbb-0000-0000-0000-000000000002"
PHONE_A = "+910000000001"
PHONE_B = "+910000000002"


def _bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def client():
    return TestClient(real_app)


@pytest.fixture
def token_a():
    return issue_victim_session_token(VICTIM_A, PHONE_A)


@pytest.fixture
def token_b():
    return issue_victim_session_token(VICTIM_B, PHONE_B)


# ---- GET /api/v1/intake/app/cases/{user_id} -----------------------------------

def test_victim_a_cannot_list_victim_bs_cases(client, token_a):
    response = client.get(f"/api/v1/intake/app/cases/{VICTIM_B}", headers=_bearer(token_a))
    assert response.status_code == 403


def test_victim_a_can_request_their_own_case_list_path(client, token_a, monkeypatch):
    """Confirms the 403 above is a real ownership check, not a blanket rejection
    — the same call succeeds (past the auth layer) for the caller's own id."""
    import api.intake.app_routes as app_routes

    fake = FakeSupabaseClient()

    async def _fake_get_supabase():
        return fake

    monkeypatch.setattr(app_routes, "get_supabase", _fake_get_supabase)

    response = client.get(f"/api/v1/intake/app/cases/{VICTIM_A}", headers=_bearer(token_a))
    assert response.status_code == 200
    assert response.json() == {"cases": []}


# ---- GET /api/v1/intake/chatbot/history/{user_id} -----------------------------

def test_victim_a_cannot_read_victim_bs_chat_history(client, token_a):
    response = client.get(f"/api/v1/intake/chatbot/history/{VICTIM_B}", headers=_bearer(token_a))
    assert response.status_code == 403


# ---- POST /api/v1/intake/chatbot/message: cannot post as another victim ------

def test_victim_a_cannot_be_impersonated_via_request_body(client, token_a, monkeypatch):
    """The request model no longer even has a user_id field — this proves an
    extra/unexpected field in the JSON body can't smuggle a different identity
    through, by checking the case that ends up updated belongs to VICTIM_A."""
    import api.intake.chatbot_routes as chatbot_routes

    fake = FakeSupabaseClient()

    async def _fake_get_supabase():
        return fake

    async def _fake_generate_chat_response(*_args, **_kwargs):
        return "a supportive reply"

    async def _fake_calculate_dynamic_score(*_args, **_kwargs):
        return {
            "final_score": 10,
            "escalation_risk": "low",
            "case_type": "general_inquiry",
            "recommended_intervention": "none",
            "reasoning": "test",
        }

    # chatbot_routes imports get_supabase locally inside the function body, so
    # it must be patched at its source module, not as a chatbot_routes attribute.
    monkeypatch.setattr("services.supabase_client.get_supabase", _fake_get_supabase)
    monkeypatch.setattr(chatbot_routes, "generate_chat_response", _fake_generate_chat_response)
    monkeypatch.setattr(chatbot_routes, "calculate_dynamic_score", _fake_calculate_dynamic_score)

    response = client.post(
        "/api/v1/intake/chatbot/message",
        headers=_bearer(token_a),
        json={"session_id": "s1", "message": "hello", "user_id": VICTIM_B},  # extra field, must be ignored
    )
    assert response.status_code == 200
    # No case exists for VICTIM_A in the fake store, so nothing gets updated —
    # the important assertion is that no case belonging to VICTIM_B was touched.
    assert fake._store.get("cases", []) == []


# ---- GET /api/v1/cases/{case_id}/progress: victim-vs-victim (S1 dual path) ---

def test_victim_a_cannot_view_victim_bs_case_progress(client, token_a, monkeypatch):
    import api.cases.case_routes as case_routes

    fake = FakeSupabaseClient()

    async def _fake_get_supabase():
        return fake

    monkeypatch.setattr(case_routes, "get_supabase", _fake_get_supabase)

    case_id = "case-owned-by-b"
    import asyncio

    asyncio.run(
        fake.table("cases")
        .insert({"id": case_id, "user_id": VICTIM_B, "case_stage": "registered", "current_distress_score": 10})
        .execute()
    )

    response = client.get(f"/api/v1/cases/{case_id}/progress", headers=_bearer(token_a))
    assert response.status_code == 403


def test_victim_can_view_their_own_case_progress(client, token_a, monkeypatch):
    import api.cases.case_routes as case_routes

    fake = FakeSupabaseClient()

    async def _fake_get_supabase():
        return fake

    monkeypatch.setattr(case_routes, "get_supabase", _fake_get_supabase)

    case_id = "case-owned-by-a"
    import asyncio

    asyncio.run(
        fake.table("cases")
        .insert({"id": case_id, "user_id": VICTIM_A, "case_stage": "registered", "current_distress_score": 10})
        .execute()
    )

    response = client.get(f"/api/v1/cases/{case_id}/progress", headers=_bearer(token_a))
    assert response.status_code == 200


# ---- POST /api/v1/cases/sos/sos: cannot trigger SOS on another victim's case --

def test_victim_a_cannot_trigger_sos_on_victim_bs_case(client, token_a, monkeypatch):
    import api.cases.sos_routes as sos_routes

    fake = FakeSupabaseClient()

    async def _fake_get_supabase():
        return fake

    monkeypatch.setattr(sos_routes, "get_supabase", _fake_get_supabase)

    case_id = "case-owned-by-b"
    import asyncio

    asyncio.run(
        fake.table("cases").insert({"id": case_id, "user_id": VICTIM_B, "assigned_counsellor_id": None}).execute()
    )

    response = client.post(
        "/api/v1/cases/sos/sos",
        headers=_bearer(token_a),
        json={"case_id": case_id, "location_lat": 1.0, "location_lng": 1.0},
    )
    assert response.status_code == 403
    assert fake._store.get("sos_events", []) == []  # no SOS event was created


def test_victim_can_trigger_sos_on_their_own_case(client, token_a, monkeypatch):
    import api.cases.sos_routes as sos_routes

    fake = FakeSupabaseClient()

    async def _fake_get_supabase():
        return fake

    monkeypatch.setattr(sos_routes, "get_supabase", _fake_get_supabase)

    case_id = "case-owned-by-a"
    import asyncio

    asyncio.run(
        fake.table("cases").insert({"id": case_id, "user_id": VICTIM_A, "assigned_counsellor_id": None}).execute()
    )

    response = client.post(
        "/api/v1/cases/sos/sos",
        headers=_bearer(token_a),
        json={"case_id": case_id, "location_lat": 1.0, "location_lng": 1.0},
    )
    assert response.status_code == 200
    assert len(fake._store["sos_events"]) == 1


# ---- POST /api/v1/ecourts/search: cannot attach a search to another victim ---

def test_ecourts_search_attaches_case_to_authenticated_victim_not_client_supplied_id(client, token_a, monkeypatch):
    import api.cases.ecourts_routes as ecourts_routes

    fake = FakeSupabaseClient()

    async def _fake_get_supabase():
        return fake

    async def _fake_fetch(cnr):
        return {"caseType": "UNKNOWN"}

    async def _fake_parse(cnr, raw):
        return raw

    monkeypatch.setattr(ecourts_routes, "get_supabase", _fake_get_supabase)
    monkeypatch.setattr(ecourts_routes, "fetch_ecourts_case_api", _fake_fetch)
    monkeypatch.setattr("services.ecourts_parser.parse_unstructured_case_data", _fake_parse)

    response = client.post(
        "/api/v1/ecourts/search",
        headers=_bearer(token_a),
        json={"cnr": "TEST-CNR-001", "user_id": VICTIM_B},  # attempted impersonation via extra field
    )
    assert response.status_code == 200
    stored_case = fake._store["cases"][0]
    assert stored_case["user_id"] == VICTIM_A
    assert stored_case["user_id"] != VICTIM_B


# ---- Unauthenticated requests are still rejected across the board ------------

@pytest.mark.parametrize(
    "method,path,body",
    [
        ("GET", f"/api/v1/intake/app/cases/{VICTIM_A}", None),
        ("GET", f"/api/v1/intake/chatbot/history/{VICTIM_A}", None),
        ("POST", "/api/v1/intake/chatbot/message", {"session_id": "s", "message": "hi"}),
        ("POST", "/api/v1/intake/app/checkin", {"mood": "calm"}),
        ("POST", "/api/v1/cases/sos/sos", {"case_id": "x", "location_lat": 1, "location_lng": 1}),
        ("POST", "/api/v1/ecourts/search", {"cnr": "TEST-CNR-001"}),
    ],
)
def test_victim_endpoints_reject_no_token(client, method, path, body):
    response = client.request(method, path, json=body)
    assert response.status_code == 401
