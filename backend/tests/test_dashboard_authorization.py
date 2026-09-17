"""
Endpoint-level regression tests proving authorization is enforced server-side on
dashboard/admin/superadmin/counsellor-consumed endpoints, not merely assumed from a
frontend route guard.

Two layers are tested:

1. Against the REAL application (`from main import app`) with no mocking: a request
   with no Authorization header must be rejected before any business logic or
   Supabase call runs. This is checked directly against the actual mounted routes,
   so it proves the dependency is really wired into the app, not just that the
   dependency function works in isolation.

2. Against a small isolated test app that mounts the real `require_roles`
   dependency on dummy routes: this proves the full accept/reject decision (401 vs
   403 vs 200) without needing a live Supabase project, since the real endpoints'
   business logic (table reads/writes) would otherwise require one.
"""

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from api.auth.dependencies import CurrentStaffUser, get_current_staff_user, require_roles
from main import app as real_app


# ---- Layer 1: real app, no credentials at all -------------------------------

# A representative sample covering every router touched by this remediation pass.
PROTECTED_ENDPOINTS_NO_BODY = [
    ("GET", "/api/v1/dashboards/superadmin/tables/users"),
    ("GET", "/api/v1/dashboards/district/SomeDistrict/stats"),
    ("GET", "/api/v1/dashboards/district/SomeDistrict/cases"),
    ("GET", "/api/v1/dashboards/district/SomeDistrict/sos"),
    ("GET", "/api/v1/dashboards/district/SomeDistrict/counsellors"),
    ("GET", "/api/v1/dashboards/state/stats"),
    ("GET", "/api/v1/dashboards/national/stats"),
    ("GET", "/api/v1/dashboards/counsellor/queue/11111111-1111-1111-1111-111111111111"),
    ("GET", "/api/v1/dashboards/counsellor/case/11111111-1111-1111-1111-111111111111"),
    ("GET", "/api/v1/cases/11111111-1111-1111-1111-111111111111/progress"),
    ("GET", "/api/v1/cases/11111111-1111-1111-1111-111111111111/report"),
]


@pytest.fixture
def client():
    # Not entered as a context manager: this deliberately skips the app's
    # startup/shutdown lifespan events (which would otherwise start the SOS
    # escalation background loop and try to reach a real Supabase project).
    return TestClient(real_app)


@pytest.mark.parametrize("method,path", PROTECTED_ENDPOINTS_NO_BODY)
def test_unauthenticated_request_is_rejected(client, method, path):
    response = client.request(method, path)
    assert response.status_code == 401, f"{method} {path} should reject an unauthenticated request"


def test_unauthenticated_stage_update_is_rejected(client):
    response = client.post(
        "/api/v1/cases/11111111-1111-1111-1111-111111111111/stage",
        json={"new_stage": "closed", "update_source": "manual", "notes": "test"},
    )
    assert response.status_code == 401


def test_db_reset_route_no_longer_exists(client):
    response = client.post("/api/v1/dashboards/superadmin/db/reset")
    assert response.status_code == 404


def test_superadmin_write_endpoints_reject_unauthenticated(client):
    assert client.delete("/api/v1/dashboards/superadmin/tables/users/some-id").status_code == 401
    assert client.post("/api/v1/dashboards/superadmin/tables/users", json={}).status_code == 401


# ---- Layer 1b: real app, valid-but-insufficient role ------------------------
# These reach the dependency's role check but never the route's business logic
# (the rejection happens before the handler body runs), so no Supabase call
# occurs and no mocking is needed.

def test_authenticated_wrong_role_rejected_on_superadmin_endpoint(client):
    counsellor = CurrentStaffUser(id="staff-1", role="counsellor", name="Test Counsellor")
    real_app.dependency_overrides[get_current_staff_user] = lambda: counsellor
    try:
        response = client.get("/api/v1/dashboards/superadmin/tables/users")
        assert response.status_code == 403
    finally:
        real_app.dependency_overrides.clear()


def test_authenticated_wrong_role_rejected_on_national_dashboard(client):
    district_admin = CurrentStaffUser(id="staff-2", role="district_admin", name="Test District Admin")
    real_app.dependency_overrides[get_current_staff_user] = lambda: district_admin
    try:
        response = client.get("/api/v1/dashboards/national/stats")
        assert response.status_code == 403
    finally:
        real_app.dependency_overrides.clear()


def test_counsellor_cannot_view_another_counsellors_queue(client):
    counsellor = CurrentStaffUser(id="staff-self", role="counsellor", name="Self")
    real_app.dependency_overrides[get_current_staff_user] = lambda: counsellor
    try:
        response = client.get("/api/v1/dashboards/counsellor/queue/staff-someone-else")
        assert response.status_code == 403
    finally:
        real_app.dependency_overrides.clear()


# ---- Layer 2: isolated test app, full accept/reject matrix ------------------

def _build_isolated_authz_test_app() -> FastAPI:
    """
    Mounts the real `require_roles` dependency on trivial dummy routes, so the
    authorization decision (401 / 403 / 200) can be tested in full without any
    endpoint's business logic requiring a live Supabase connection.
    """
    test_app = FastAPI()

    @test_app.get("/staff-only")
    async def staff_only(
        current_user: CurrentStaffUser = Depends(require_roles("counsellor", "super_admin")),
    ):
        return {"ok": True, "role": current_user.role}

    @test_app.get("/super-admin-only")
    async def super_admin_only(
        current_user: CurrentStaffUser = Depends(require_roles("super_admin")),
    ):
        return {"ok": True, "role": current_user.role}

    return test_app


@pytest.fixture
def isolated_client():
    app = _build_isolated_authz_test_app()
    return app, TestClient(app)


def test_isolated_no_header_rejected(isolated_client):
    _, client = isolated_client
    response = client.get("/staff-only")
    assert response.status_code == 401


def test_isolated_insufficient_role_rejected(isolated_client):
    app, client = isolated_client
    app.dependency_overrides[get_current_staff_user] = lambda: CurrentStaffUser(
        id="u1", role="counsellor"
    )
    try:
        response = client.get("/super-admin-only")
        assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_isolated_authorized_role_can_access(isolated_client):
    app, client = isolated_client
    app.dependency_overrides[get_current_staff_user] = lambda: CurrentStaffUser(
        id="u1", role="super_admin"
    )
    try:
        response = client.get("/super-admin-only")
        assert response.status_code == 200
        assert response.json() == {"ok": True, "role": "super_admin"}
    finally:
        app.dependency_overrides.clear()


def test_isolated_authorized_counsellor_can_access_staff_only(isolated_client):
    app, client = isolated_client
    app.dependency_overrides[get_current_staff_user] = lambda: CurrentStaffUser(
        id="u1", role="counsellor"
    )
    try:
        response = client.get("/staff-only")
        assert response.status_code == 200
    finally:
        app.dependency_overrides.clear()
