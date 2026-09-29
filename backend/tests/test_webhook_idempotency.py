import pytest
from unittest.mock import AsyncMock, patch
from models.intake_models import BolnaWebhookPayload
from api.intake.ivr_webhook import bolna_webhook

class MockDuplicateSupabase:
    def table(self, name: str):
        return self
        
    def insert(self, data):
        return self
        
    async def execute(self):
        # Simulate Postgres unique constraint violation for webhook_events
        raise Exception("duplicate key value violates unique constraint 'webhook_events_provider_external_event_id_key' (23505)")

@pytest.mark.asyncio
async def test_bolna_webhook_idempotency_returns_ok():
    """Duplicate webhook payload should be caught by DB constraint and returned gracefully as 'Already processed'."""
    
    with patch("api.intake.ivr_webhook.get_supabase", new_callable=AsyncMock) as mock_sup, \
         patch("api.auth.webhook_auth.verify_bolna_webhook", return_value=None):
         
        mock_sup.return_value = MockDuplicateSupabase()
        
        payload = BolnaWebhookPayload(
            call_id="call-duplicate-123",
            user_phone="+917000000001",
            transcript="I need help",
            duration_seconds=120.0,
            call_status="completed",
        )
        
        result = await bolna_webhook(payload)
        
        assert result["status"] == "ok"
        assert result["message"] == "Already processed"
