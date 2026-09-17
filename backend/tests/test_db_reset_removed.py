"""
Regression tests proving the destructive, previously-unauthenticated /db/reset
endpoint cannot be invoked through the running application, in either form it
could take:

1. As an HTTP route — it must not exist at all (not "exist but require auth").
2. As the development-only CLI replacement (scripts/clear_db.py) — it must refuse
   to run unless ENVIRONMENT is explicitly "development", and must refuse BEFORE
   ever touching the database.
"""

import importlib
import os
import sys

import pytest
from fastapi.testclient import TestClient

from main import app as real_app

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_SCRIPTS_DIR = os.path.join(_REPO_ROOT, "scripts")
if _SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, _SCRIPTS_DIR)


@pytest.fixture
def client():
    return TestClient(real_app)


# ---- 1. HTTP surface ---------------------------------------------------------

def test_db_reset_route_does_not_exist(client):
    response = client.post("/api/v1/dashboards/superadmin/db/reset")
    assert response.status_code == 404


def test_no_route_anywhere_in_the_app_resets_the_database():
    """
    Belt-and-braces: walk every registered route path in the real app and confirm
    none of them look like a database-reset endpoint. This protects against the
    same capability being reintroduced under a different path later.
    """
    suspicious_paths = [
        route.path
        for route in real_app.routes
        if hasattr(route, "path") and ("reset" in route.path.lower() or "wipe" in route.path.lower())
    ]
    assert suspicious_paths == [], f"Found suspicious destructive-looking route(s): {suspicious_paths}"


# ---- 2. Development-only CLI replacement ------------------------------------

@pytest.fixture
def clear_db_module(monkeypatch):
    """
    Imports scripts/clear_db.py fresh for each test so ENVIRONMENT patches don't
    leak between tests (the module reads settings.ENVIRONMENT at call time, not
    import time, but re-importing keeps this test file self-contained either way).
    """
    if "clear_db" in sys.modules:
        del sys.modules["clear_db"]
    module = importlib.import_module("clear_db")
    return module


def test_guard_allows_development_environment(clear_db_module, monkeypatch):
    monkeypatch.setattr(clear_db_module.settings, "ENVIRONMENT", "development")
    clear_db_module.assert_dev_environment()  # must not raise


def test_guard_blocks_production_environment(clear_db_module, monkeypatch):
    monkeypatch.setattr(clear_db_module.settings, "ENVIRONMENT", "production")
    with pytest.raises(clear_db_module.ProductionGuardError):
        clear_db_module.assert_dev_environment()


def test_guard_blocks_unset_or_unexpected_environment_values(clear_db_module, monkeypatch):
    for bad_value in ("staging", "prod", "", "Production"):
        monkeypatch.setattr(clear_db_module.settings, "ENVIRONMENT", bad_value)
        with pytest.raises(clear_db_module.ProductionGuardError):
            clear_db_module.assert_dev_environment()


async def test_clear_database_never_touches_supabase_when_guard_blocks(clear_db_module, monkeypatch):
    """
    Proves the guard runs BEFORE any database access: if get_supabase were ever
    called while ENVIRONMENT="production", this test would fail with the
    sentinel AssertionError below instead of the expected ProductionGuardError.
    """
    monkeypatch.setattr(clear_db_module.settings, "ENVIRONMENT", "production")

    async def _must_not_be_called():
        raise AssertionError("get_supabase() was called despite the production guard")

    monkeypatch.setattr(clear_db_module, "get_supabase", _must_not_be_called)

    with pytest.raises(clear_db_module.ProductionGuardError):
        await clear_db_module.clear_database()
