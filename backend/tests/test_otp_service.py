"""
Tests for the real OTP generation/hashing/verification/rate-limiting logic in
services/otp_service.py. These exercise the actual module code against an
in-memory fake Supabase store (tests/fake_supabase.py) — not a rewritten copy of
the logic — so a bug in the real hashing/expiry/attempt-counting would actually
be caught here.
"""

from datetime import datetime, timedelta, timezone

import pytest

from services import otp_providers, otp_service
from tests.fake_supabase import FakeSupabaseClient


class RecordingOtpProvider:
    """Test double capturing the code that would have been sent, without
    actually dispatching anything. Deliberately separate from
    SyntheticOtpProvider (that one is real production code gated to dev-only;
    this one only exists in tests, so a test needing "the code that was sent"
    doesn't have to scrape log output)."""

    def __init__(self):
        self.sent = []

    async def send_otp(self, phone_number, code, channel="sms"):
        self.sent.append({"phone_number": phone_number, "code": code, "channel": channel})


@pytest.fixture
def fake_db(monkeypatch):
    client = FakeSupabaseClient()

    async def _get_fake_supabase():
        return client

    monkeypatch.setattr(otp_service, "get_supabase", _get_fake_supabase)
    return client


@pytest.fixture
def recording_provider(monkeypatch):
    provider = RecordingOtpProvider()
    monkeypatch.setattr(otp_service, "get_otp_provider", lambda: provider)
    return provider


@pytest.fixture(autouse=True)
def _dev_pepper(monkeypatch):
    # Deterministic, test-only pepper so hashing is exercised for real without
    # requiring OTP_PEPPER to be set in the test environment.
    monkeypatch.setattr(otp_service.settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(otp_service.settings, "OTP_PEPPER", "")


PHONE = "+919999999999"


async def _request_and_capture_code(fake_db, recording_provider, phone=PHONE) -> str:
    await otp_service.request_otp(phone, ip_address="203.0.113.5")
    assert len(recording_provider.sent) == 1
    return recording_provider.sent[-1]["code"]


# ---- Core generation properties -----------------------------------------------

def test_generate_code_is_six_digits_by_default():
    for _ in range(20):
        code = otp_service.generate_code()
        assert len(code) == 6
        assert code.isdigit()


def test_generate_code_uses_cryptographic_randomness(monkeypatch):
    """Not a statistical randomness test — just confirms secrets.randbelow is
    the actual source, not the non-cryptographic `random` module."""
    import inspect

    source = inspect.getsource(otp_service.generate_code)
    assert "secrets.randbelow" in source
    assert "random.randint" not in source and "random.choice" not in source


# ---- Valid / invalid / expired / reuse ----------------------------------------

async def test_valid_otp_succeeds(fake_db, recording_provider):
    code = await _request_and_capture_code(fake_db, recording_provider)
    await otp_service.verify_otp(PHONE, code)  # must not raise


async def test_invalid_otp_fails(fake_db, recording_provider):
    await _request_and_capture_code(fake_db, recording_provider)
    with pytest.raises(otp_service.InvalidOtpError):
        await otp_service.verify_otp(PHONE, "000000")


async def test_expired_otp_fails(fake_db, recording_provider):
    code = await _request_and_capture_code(fake_db, recording_provider)
    # Force the stored row into the past.
    row = fake_db._store["otp_codes"][-1]
    row["expires_at"] = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()

    with pytest.raises(otp_service.ExpiredOtpError):
        await otp_service.verify_otp(PHONE, code)


async def test_otp_cannot_be_reused(fake_db, recording_provider):
    code = await _request_and_capture_code(fake_db, recording_provider)
    await otp_service.verify_otp(PHONE, code)  # first use succeeds

    with pytest.raises(otp_service.InvalidOtpError):
        await otp_service.verify_otp(PHONE, code)  # replay is rejected


async def test_fourth_attempt_fails_after_three_wrong_attempts(fake_db, recording_provider):
    await _request_and_capture_code(fake_db, recording_provider)

    for _ in range(3):
        with pytest.raises(otp_service.InvalidOtpError):
            await otp_service.verify_otp(PHONE, "000000")

    # Even the CORRECT code must now be rejected — the attempt budget is spent.
    row = fake_db._store["otp_codes"][-1]
    assert row["attempts"] == 3
    correct_code = recording_provider.sent[-1]["code"]
    with pytest.raises(otp_service.InvalidOtpError):
        await otp_service.verify_otp(PHONE, correct_code)


async def test_no_pending_otp_is_rejected(fake_db, recording_provider):
    with pytest.raises(otp_service.InvalidOtpError):
        await otp_service.verify_otp("+911234567890", "123456")


# ---- Rate limiting -------------------------------------------------------------

async def test_phone_rate_limit_is_enforced(fake_db, recording_provider, monkeypatch):
    monkeypatch.setattr(otp_service.settings, "OTP_RATE_LIMIT_PER_PHONE", 2)

    await otp_service.request_otp(PHONE, ip_address="10.0.0.1")
    await otp_service.request_otp(PHONE, ip_address="10.0.0.2")  # different IP, same phone

    with pytest.raises(otp_service.RateLimitedError):
        await otp_service.request_otp(PHONE, ip_address="10.0.0.3")


async def test_ip_rate_limit_is_enforced_across_different_phones(fake_db, recording_provider, monkeypatch):
    monkeypatch.setattr(otp_service.settings, "OTP_RATE_LIMIT_PER_IP", 2)

    await otp_service.request_otp("+911111111111", ip_address="203.0.113.9")
    await otp_service.request_otp("+912222222222", ip_address="203.0.113.9")

    with pytest.raises(otp_service.RateLimitedError):
        await otp_service.request_otp("+913333333333", ip_address="203.0.113.9")


async def test_rate_limit_window_expiry_allows_new_requests(fake_db, recording_provider, monkeypatch):
    monkeypatch.setattr(otp_service.settings, "OTP_RATE_LIMIT_PER_PHONE", 1)
    await otp_service.request_otp(PHONE, ip_address="10.0.0.1")

    # Simulate the existing request having happened outside the rate-limit window.
    row = fake_db._store["otp_codes"][-1]
    row["created_at"] = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()

    await otp_service.request_otp(PHONE, ip_address="10.0.0.1")  # must not raise


# ---- No plaintext storage / no plaintext exposure -----------------------------

async def test_plaintext_code_is_never_persisted(fake_db, recording_provider):
    code = await _request_and_capture_code(fake_db, recording_provider)
    row = fake_db._store["otp_codes"][-1]

    assert code not in str(row)
    assert "code" not in row  # only code_hash + salt are stored
    assert row["code_hash"] != code


async def test_request_otp_return_value_never_contains_the_code(fake_db, recording_provider):
    result = await otp_service.request_otp(PHONE, ip_address="10.0.0.1")
    assert result is None  # nothing to leak — the function returns nothing at all


async def test_verification_uses_constant_time_comparison():
    import inspect

    source = inspect.getsource(otp_service.verify_otp)
    assert "hmac.compare_digest" in source
