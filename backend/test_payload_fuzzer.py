import json
from fastapi.testclient import TestClient
from main import app
from api.auth.webhook_auth import verify_bolna_webhook, verify_pushbullet_webhook
from api.auth.victim_dependencies import get_current_victim
from api.auth.victim_dependencies import CurrentVictim

client = TestClient(app)

async def mock_verify_bolna():
    pass

async def mock_verify_pushbullet():
    pass

async def mock_verify_victim():
    return CurrentVictim(id="test_user", phone_number="+917000000000")

app.dependency_overrides[verify_bolna_webhook] = mock_verify_bolna
app.dependency_overrides[verify_pushbullet_webhook] = mock_verify_pushbullet
app.dependency_overrides[get_current_victim] = mock_verify_victim

def fuzz_bolna_webhook():
    print("Testing Bolna Webhook...")
    path = "/api/v1/intake/ivr/webhook"
    
    payloads = [
        # Valid-looking but fake
        {"call_id": "call_123", "event": "call.completed", "transcript": "help me", "duration_seconds": 12, "call_status": "completed", "user_phone": "+917000000000"},
        # Malformed
        {"invalid": "data"},
        # Empty
        {},
        # Wrong types
        {"call_id": 123, "event": 456, "transcript": ["array"]}
    ]
    
    for idx, p in enumerate(payloads):
        res = client.post(path, json=p)
        if res.status_code >= 500:
            print(f"CRASH: Bolna Webhook Payload {idx} => {res.status_code} {res.text}")
        else:
            print(f"PASS: Bolna Webhook Payload {idx} => {res.status_code}")

def fuzz_pushbullet_webhook():
    print("Testing Pushbullet Webhook...")
    path = "/api/v1/intake/sms/webhook"
    
    payloads = [
        # Valid-looking
        {"type": "push", "push": {"type": "sms_changed", "source_device_iden": "dev123", "notifications": [{"title": "Sender", "body": "help"}]}},
        # Malformed
        {"push": "not-an-object"},
        # Empty
        {},
        # Wrong types
        {"type": 123, "push": 456}
    ]
    
    for idx, p in enumerate(payloads):
        res = client.post(path, json=p)
        if res.status_code >= 500:
            print(f"CRASH: Pushbullet Webhook Payload {idx} => {res.status_code} {res.text}")
        else:
            print(f"PASS: Pushbullet Webhook Payload {idx} => {res.status_code}")

def fuzz_groq_sarvam_endpoints():
    print("Testing Voice Context / LLM Endpoints...")
    # Chatbot message triggers Groq/Sarvam internally
    path = "/api/v1/intake/chatbot/message"
    
    payloads = [
        # Valid-looking
        {"message": "I need help", "session_id": "ses_123"},
        # Malformed
        {"message": None, "session_id": 123},
        # Empty
        {},
        # Wrong types
        {"message": {"dict": "value"}}
    ]
    for idx, p in enumerate(payloads):
        res = client.post(path, json=p)
        if res.status_code >= 500:
            print(f"CRASH: Chatbot LLM Payload {idx} => {res.status_code} {res.text}")
        else:
            print(f"PASS: Chatbot LLM Payload {idx} => {res.status_code}")

if __name__ == "__main__":
    fuzz_bolna_webhook()
    fuzz_pushbullet_webhook()
    fuzz_groq_sarvam_endpoints()
