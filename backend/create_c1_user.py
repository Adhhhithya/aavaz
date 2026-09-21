import asyncio
import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

supabase: Client = create_client(url, key)

async def main():
    email = "c1@sih.gov.in"
    password = "qwertyuiop"
    
    print(f"Creating or updating user {email}...")
    
    try:
        # Check if user exists by trying to list users (or directly create and catch exception)
        # Auth admin API does not have a simple "get user by email" without listing.
        # We can just list all users and find it.
        users_resp = supabase.auth.admin.list_users()
        existing_user = next((u for u in users_resp if u.email == email), None)
        
        user_id = None
        if existing_user:
            print("User already exists. Updating password...")
            user_id = existing_user.id
            supabase.auth.admin.update_user_by_id(user_id, {"password": password})
        else:
            print("Creating new user...")
            res = supabase.auth.admin.create_user({
                "email": email,
                "password": password,
                "email_confirm": True
            })
            user_id = res.user.id
        
        print(f"User ID: {user_id}")
        
        # Insert into counsellors table
        print("Upserting into counsellors table...")
        supabase.table("counsellors").upsert({
            "id": user_id,
            "name": "Counsellor C1",
            "district": "New Delhi",
            "languages": ["hi", "en"],
            "current_caseload": 0
        }).execute()
        
        print("\nSuccess! You can now log in as:")
        print("Username: c1")
        print(f"Password: {password}")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
