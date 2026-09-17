import asyncio
import os
import sys
from datetime import datetime

# Ensure the backend directory is in the path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))

from services.supabase_client import get_supabase

async def create_staff():
    print("Seeding staff accounts...")
    supabase = await get_supabase()
    
    # Check if super admin already exists to prevent duplicates
    resp = await supabase.table("users").select("id").eq("name", "rit").execute()
    if resp.data:
        print("Staff accounts already exist.")
        return

    staff_users = [
        {
            "id": "10000000-0000-0000-0000-000000000001",
            "name": "rit",
            "role_type": "super_admin",
            "phone_number": "+910000000001",
            "created_at": datetime.utcnow().isoformat()
        },
        {
            "id": "10000000-0000-0000-0000-000000000002",
            "name": "admin_state",
            "role_type": "state_admin",
            "phone_number": "+910000000002",
            "created_at": datetime.utcnow().isoformat()
        },
        {
            "id": "10000000-0000-0000-0000-000000000003",
            "name": "admin_national",
            "role_type": "national_admin",
            "phone_number": "+910000000003",
            "created_at": datetime.utcnow().isoformat()
        },
        {
            "id": "10000000-0000-0000-0000-000000000004",
            "name": "district_pune",
            "role_type": "district_admin",
            "phone_number": "+910000000004",
            "created_at": datetime.utcnow().isoformat()
        },
        {
            "id": "10000000-0000-0000-0000-000000000005",
            "name": "counsellor_1",
            "role_type": "counsellor",
            "phone_number": "+910000000005",
            "created_at": datetime.utcnow().isoformat()
        }
    ]
    
    try:
        await supabase.table("users").insert(staff_users).execute()
        print("Successfully seeded staff accounts.")
    except Exception as e:
        print(f"Error seeding staff accounts: {e}")

if __name__ == "__main__":
    asyncio.run(create_staff())
