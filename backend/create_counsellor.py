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
    password = "password123"
    
    print(f"Creating user {email}...")
    
    try:
        # Create user in Auth
        res = supabase.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": True
        })
        user_id = res.user.id
        print(f"Created Auth User with ID: {user_id}")
        

        
        # Insert into counsellors
        supabase.table("counsellors").upsert({
            "id": user_id,
            "name": "Counsellor 1",
            "district": "New Delhi",
            "languages": ["hi", "en"],
            "current_caseload": 0
        }).execute()
        print("Inserted into public.counsellors")
        
        print("\nSuccess! You can now log in as:")
        print("Username: c1")
        print("Password: password123")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
