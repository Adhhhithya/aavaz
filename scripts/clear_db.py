import asyncio
import os
import sys
from dotenv import load_dotenv

# Ensure the backend directory is in the path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))

from services.supabase_client import get_supabase

async def clear_database():
    print("Clearing database...")
    supabase = await get_supabase()
    try:
        # Delete interactions first due to foreign keys
        print("Deleting interactions...")
        await supabase.table('interactions').delete().neq('id', '00000000-0000-0000-0000-000000000000').execute()
        
        print("Deleting cases...")
        await supabase.table('cases').delete().neq('id', '00000000-0000-0000-0000-000000000000').execute()
        
        print("Deleting users...")
        # Be careful not to delete counsellors if they are in the users table, but usually they are separate or role-based.
        # The user said "clear the entire DB". Let's just delete all users.
        await supabase.table('users').delete().neq('id', '00000000-0000-0000-0000-000000000000').execute()
        
        print("Database cleared successfully.")
    except Exception as e:
        print(f"Error clearing database: {e}")

if __name__ == "__main__":
    asyncio.run(clear_database())
