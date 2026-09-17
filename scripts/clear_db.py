import asyncio
import os
import sys
from dotenv import load_dotenv

# Ensure the backend directory is in the path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))

from config import settings
from services.supabase_client import get_supabase


class ProductionGuardError(RuntimeError):
    """Raised when a destructive dev-only utility is invoked outside a dev environment."""


def assert_dev_environment() -> None:
    """
    Refuses to proceed unless ENVIRONMENT is explicitly "development".

    This is the only thing standing between this script and a production database
    once someone runs it, so it is checked before any Supabase call is made, not
    just documented as a convention. There is deliberately no way to override this
    with a flag — the fix for "I need to reset a database" is to point ENVIRONMENT
    (and SUPABASE_URL) at a dev project, never to bypass the guard.
    """
    if settings.ENVIRONMENT.strip().lower() != "development":
        raise ProductionGuardError(
            f"Refusing to run: ENVIRONMENT={settings.ENVIRONMENT!r}, not 'development'. "
            "This script permanently deletes all interactions/cases/users rows and must "
            "never run against a non-development database."
        )


async def clear_database():
    assert_dev_environment()
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
