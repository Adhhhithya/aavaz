"""
backend/tests/test_pushbullet_sms.py

Tests for Pushbullet SMS sender, listener logic, and inbound SMS intake service.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import json

from services.pushbullet_service import (
    send_sms,
    get_sms_device_iden,
    fetch_latest_sms_threads,
    PushbulletSMSListener,
    _mask_phone
)
from services.sms_intake_service import process_incoming_sms, mask_phone
from services.otp_providers import PushbulletOtpProvider, OtpDeliveryError


def test_mask_phone():
    assert mask_phone("+919876543210") == "+91****210"
    assert mask_phone("123") == "****"
    assert mask_phone("") == "****"


@pytest.mark.asyncio
async def test_get_sms_device_iden_from_api(monkeypatch):
    monkeypatch.setattr("services.pushbullet_service.settings.PUSHBULLET_TARGET_DEVICE_IDEN", "")
    with patch("services.pushbullet_service._cached_device_iden", None), \
         patch("httpx.AsyncClient.get") as mock_get:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "devices": [
                {"iden": "dev_inactive", "active": False, "has_sms": True},
                {"iden": "dev_no_sms", "active": True, "has_sms": False},
                {"iden": "dev_sms_target", "active": True, "has_sms": True, "nickname": "Test Phone"},
            ]
        }
        mock_get.return_value = mock_resp

        iden = await get_sms_device_iden(api_key="test_key")
        assert iden == "dev_sms_target"



@pytest.mark.asyncio
async def test_send_sms_success():
    with patch("services.pushbullet_service.get_sms_device_iden", return_value="target_device_123"), \
         patch("httpx.AsyncClient.post") as mock_post:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.raise_for_status.return_value = None
        mock_post.return_value = mock_resp

        result = await send_sms(
            phone_number="+919876543210",
            message="Your OTP is 123456",
            api_key="test_key"
        )
        assert result is True

        # Verify payload sent to /v2/texts
        call_kwargs = mock_post.call_args[1]
        payload = call_kwargs["json"]
        assert payload["data"]["target_device_iden"] == "target_device_123"
        assert payload["data"]["addresses"] == ["+919876543210"]
        assert payload["data"]["message"] == "Your OTP is 123456"


@pytest.mark.asyncio
async def test_send_sms_no_device_returns_false():
    with patch("services.pushbullet_service.get_sms_device_iden", return_value=None):
        result = await send_sms(
            phone_number="+919876543210",
            message="Test message",
            api_key="test_key"
        )
        assert result is False


@pytest.mark.asyncio
async def test_pushbullet_otp_provider_success():
    provider = PushbulletOtpProvider()
    with patch("services.pushbullet_service.send_sms", new_callable=AsyncMock) as mock_send:
        mock_send.return_value = True
        await provider.send_otp(phone_number="+919876543210", code="654321", channel="sms")
        mock_send.assert_awaited_once()
        assert "654321" in mock_send.call_args[1]["message"]


@pytest.mark.asyncio
async def test_pushbullet_otp_provider_failure_raises():
    provider = PushbulletOtpProvider()
    with patch("services.pushbullet_service.send_sms", new_callable=AsyncMock) as mock_send:
        mock_send.return_value = False
        with pytest.raises(OtpDeliveryError):
            await provider.send_otp(phone_number="+919876543210", code="654321", channel="sms")


@pytest.mark.asyncio
async def test_listener_deduplication():
    callback = AsyncMock()
    listener = PushbulletSMSListener(api_key="test_key", callback=callback)

    sample_threads = [
        {
            "id": "1",
            "recipients": [{"address": "+919876543210"}],
            "latest": {
                "id": "msg_001",
                "direction": "incoming",
                "body": "Hello support",
                "timestamp": 1234567890
            }
        }
    ]

    with patch("services.pushbullet_service.fetch_latest_sms_threads", return_value=sample_threads):
        # 1. On init, seen messages are seeded
        await listener._init_seen_messages()
        assert "msg_001" in listener._seen_message_ids

        # Checking threads now does NOT trigger callback because it is already seen
        await listener._check_threads_for_new_sms()
        callback.assert_not_awaited()

        # 2. Add a new incoming message
        new_threads = [
            {
                "id": "1",
                "recipients": [{"address": "+919876543210"}],
                "latest": {
                    "id": "msg_002",
                    "direction": "incoming",
                    "body": "Second message",
                    "timestamp": 1234567891
                }
            }
        ]
        with patch("services.pushbullet_service.fetch_latest_sms_threads", return_value=new_threads):
            await listener._check_threads_for_new_sms()
            callback.assert_awaited_once_with("+919876543210", "Second message", "1234567891")
            assert "msg_002" in listener._seen_message_ids


@pytest.mark.asyncio
async def test_process_incoming_sms_creates_case_and_replies():
    fake_user = [{"id": "user-uuid-123", "name": "Citizen (3210)", "preferred_language": "en", "location_district": None}]

    fake_query = MagicMock()
    fake_query.execute = AsyncMock(return_value=MagicMock(data=fake_user))
    fake_query.eq.return_value = fake_query
    fake_query.neq.return_value = fake_query
    fake_query.limit.return_value = fake_query

    empty_query = MagicMock()
    empty_query.execute = AsyncMock(return_value=MagicMock(data=[]))
    empty_query.eq.return_value = empty_query
    empty_query.neq.return_value = empty_query
    empty_query.limit.return_value = empty_query

    case_query = MagicMock()
    case_query.execute = AsyncMock(return_value=MagicMock(data=[{"id": "case-uuid-456"}]))
    case_query.eq.return_value = case_query
    case_query.neq.return_value = case_query
    case_query.limit.return_value = case_query

    mock_table = MagicMock()
    def table_side_effect(name):
        mock_t = MagicMock()
        if name == "users":
            mock_t.select.return_value = empty_query
            mock_t.insert.return_value = fake_query
            mock_t.update.return_value = fake_query
        elif name == "cases":
            mock_t.select.return_value = empty_query
            mock_t.insert.return_value = case_query
        elif name == "interactions":
            mock_t.insert.return_value = fake_query
        return mock_t

    mock_supabase = MagicMock()
    mock_supabase.table.side_effect = table_side_effect

    with patch("services.sms_intake_service.get_supabase", new_callable=AsyncMock) as mock_get_sup, \
         patch("services.sms_intake_service.send_sms", new_callable=AsyncMock) as mock_send_sms:
        mock_get_sup.return_value = mock_supabase
        mock_send_sms.return_value = True

        result = await process_incoming_sms(
            from_number="+919876543210",
            message_body="Hello, I need help"
        )

        assert result["status"] == "success"
        assert "reply" in result
        assert result["case_id"] == "case-uuid-456"
        mock_send_sms.assert_awaited_once()
