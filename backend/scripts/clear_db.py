"""
backend/scripts/clear_db.py

Completely clears all user, case, interaction, telephony, audit, and tracking
data from the Supabase database while keeping the table structure intact.

Usage:
    python scripts/clear_db.py
    python scripts/clear_db.py --keep-legal  (preserves legal_documents RAG index)
"""
from __future__ import annotations

import asyncio
import argparse
import logging
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import settings
from services.supabase_client import get_supabase

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# Child-first deletion order to respect foreign key constraints
TABLES_TO_CLEAR = [
    "break_glass_grants",
    "milestones",
    "tasks",
    "referrals",
    "staff_audit_log",
    "staff",
    "scheduled_calls",
    "victim_memory",
    "interactions",
    "sos_events",
    "case_updates",
    "cases",
    "safety_settings",
    "victim_profiles",
    "consents",
    "otp_codes",
    "counsellors",
    "users",
]

class ProductionGuardError(RuntimeError):
    """Raised when a destructive dev-only utility is invoked outside a dev environment."""


def assert_dev_environment() -> None:
    """
    Refuses to proceed unless ENVIRONMENT is explicitly "development".
    """
    env = getattr(settings, "ENVIRONMENT", "").strip().lower()
    if env != "development":
        raise ProductionGuardError(
            f"Refusing to run: ENVIRONMENT={settings.ENVIRONMENT!r}, not 'development'. "
            "This script permanently deletes all interactions/cases/users rows and must "
            "never run against a non-development database."
        )


async def clear_database(keep_legal: bool = False) -> None:
    assert_dev_environment()
    supabase = await get_supabase()

    logger.info("Starting database cleanup on %s...", settings.SUPABASE_URL)

    tables = list(TABLES_TO_CLEAR)
    if not keep_legal:
        tables.append("legal_documents")

    for table_name in tables:
        try:
            # Delete all rows where id is not a dummy nil uuid (deletes everything)
            # For tables where PK is user_id or id
            if table_name in ("victim_profiles", "safety_settings"):
                resp = await supabase.table(table_name).delete().neq("user_id", "00000000-0000-0000-0000-000000000000").execute()
            else:
                resp = await supabase.table(table_name).delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
            logger.info("Cleared table: %s", table_name)
        except Exception as e:
            logger.warning("Could not clear %s (table might not exist yet or empty): %s", table_name, e)

    # Re-insert the deterministic genesis hash for the staff audit chain head
    try:
        await supabase.table("staff_audit_chain_head").upsert({
            "id": 1,
            "tip_hash": "f60ab132aafb26848316d3e8ad3395d0dc40d7a93049d4d84a4145cc01e79171"
        }).execute()
        logger.info("Reset staff_audit_chain_head to genesis hash.")
    except Exception as e:
        logger.debug("Chain head reset skipped: %s", e)

    logger.info("Database completely cleared of all data.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Clear all data from Supabase database.")
    parser.add_argument("--keep-legal", action="store_true", help="Do not clear legal_documents RAG table")
    args = parser.parse_args()

    asyncio.run(clear_database(keep_legal=args.keep_legal))
