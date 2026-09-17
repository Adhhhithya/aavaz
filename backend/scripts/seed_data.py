import asyncio
from supabase import create_client, Client
from datetime import datetime, timedelta
import os
import sys

from config import settings

SUPABASE_URL = settings.SUPABASE_URL
SUPABASE_KEY = settings.SUPABASE_SERVICE_ROLE_KEY

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

async def seed_data():
    print("Clearing existing data (except users if you want)...")
    try:
        supabase.table("sos_events").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
        supabase.table("interactions").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
        supabase.table("case_updates").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
        supabase.table("cases").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
        supabase.table("users").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
    except Exception as e:
        print(f"Error clearing data: {e}")

    print("Inserting Users...")
    users = [
        {"id": "33333333-3333-3333-3333-333333333333", "name": "Amit Sharma", "role_type": "victim", "preferred_language": "hi", "phone_number": "+919876543210", "location_state": "State A", "location_district": "Mock District", "created_at": datetime.utcnow().isoformat()},
        {"id": "44444444-4444-4444-4444-444444444444", "name": "Priya Patel", "role_type": "victim", "preferred_language": "hi", "phone_number": "+919876543211", "location_state": "State A", "location_district": "Mock District", "created_at": datetime.utcnow().isoformat()},
        {"id": "55555555-5555-5555-5555-555555555555", "name": "Rahul Singh", "role_type": "victim", "preferred_language": "hi", "phone_number": "+919876543212", "location_state": "State B", "location_district": "Other District", "created_at": datetime.utcnow().isoformat()}
    ]
    supabase.table("users").insert(users).execute()

    print("Inserting Counsellors...")
    counsellors = [
        {"id": "11111111-1111-1111-1111-111111111111", "name": "Dr. Priya M.", "district": "Mock District", "languages": ["hi", "en"], "current_caseload": 2}
    ]
    try:
        supabase.table("counsellors").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
    except:
        pass
    supabase.table("counsellors").insert(counsellors).execute()

    print("Inserting Cases...")
    cases = [
        {
            "id": "22222222-2222-2222-2222-222222222222",
            "user_id": "33333333-3333-3333-3333-333333333333",
            "case_type": "Assault",
            "case_stage": "investigation",
            "assigned_counsellor_id": "11111111-1111-1111-1111-111111111111",
            "current_distress_score": 82,
            "created_at": (datetime.utcnow() - timedelta(days=10)).isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        },
        {
            "id": "66666666-6666-6666-6666-666666666666",
            "user_id": "44444444-4444-4444-4444-444444444444",
            "case_type": "Harassment",
            "case_stage": "registered",
            "assigned_counsellor_id": "11111111-1111-1111-1111-111111111111",
            "current_distress_score": 65,
            "created_at": (datetime.utcnow() - timedelta(days=5)).isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        },
        {
            "id": "77777777-7777-7777-7777-777777777777",
            "user_id": "55555555-5555-5555-5555-555555555555",
            "case_type": "Assault",
            "case_stage": "trial",
            "assigned_counsellor_id": None,
            "current_distress_score": 45,
            "created_at": (datetime.utcnow() - timedelta(days=30)).isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        }
    ]
    supabase.table("cases").insert(cases).execute()

    print("Inserting Interactions...")
    interactions = [
        {
            "id": "88888888-8888-8888-8888-888888888888",
            "case_id": "22222222-2222-2222-2222-222222222222",
            "channel": "app",
            "timestamp": (datetime.utcnow() - timedelta(days=8)).isoformat(),
            "transcript": "Routine check-in.",
            "emotion_tag": "neutral",
            "final_score": 40,
            "score_breakdown": {"acoustic": {"contribution": 0}, "sentiment": {"contribution": 20}, "engagement": {"contribution": 10}, "history": {"contribution": 10}}
        },
        {
            "id": "99999999-9999-9999-9999-999999999999",
            "case_id": "22222222-2222-2222-2222-222222222222",
            "channel": "app",
            "timestamp": (datetime.utcnow() - timedelta(days=4)).isoformat(),
            "transcript": "User expressed anxiety.",
            "emotion_tag": "anxiety",
            "final_score": 65,
            "score_breakdown": {"acoustic": {"contribution": 0}, "sentiment": {"contribution": 35}, "engagement": {"contribution": 20}, "history": {"contribution": 10}}
        },
        {
            "id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            "case_id": "22222222-2222-2222-2222-222222222222",
            "channel": "ivr",
            "timestamp": (datetime.utcnow() - timedelta(hours=2)).isoformat(),
            "transcript": "User sounds very scared on IVR.",
            "emotion_tag": "fear",
            "final_score": 82,
            "score_breakdown": {"acoustic": {"contribution": 40}, "sentiment": {"contribution": 20}, "engagement": {"contribution": 12}, "history": {"contribution": 10}}
        }
    ]
    supabase.table("interactions").insert(interactions).execute()

    print("Inserting SOS Events...")
    sos_events = [
        {
            "id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
            "case_id": "22222222-2222-2222-2222-222222222222",
            "triggered_at": (datetime.utcnow() - timedelta(minutes=15)).isoformat(),
            "location_lat": 28.6139,
            "location_lng": 77.2090,
            "escalated": False,
            "resolved": False
        }
    ]
    supabase.table("sos_events").insert(sos_events).execute()

    print("Database seeding completed.")

if __name__ == "__main__":
    asyncio.run(seed_data())
