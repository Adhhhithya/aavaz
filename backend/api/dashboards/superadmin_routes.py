from fastapi import APIRouter, Depends, HTTPException
from services.supabase_client import get_supabase
from api.auth.dependencies import CurrentStaffUser, require_roles
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

# Generic table CRUD is inherently high-risk (arbitrary insert/delete on domain
# tables); restrict to super_admin only, never a broader role set.
_SUPER_ADMIN_ONLY = require_roles("super_admin")

# NOTE: the destructive full-database-reset endpoint that used to live here
# (`POST /db/reset` — deleted interactions/cases/users unconditionally, with no
# auth at all) has been removed from the HTTP surface entirely, not merely gated.
# See scripts/clear_db.py for the development-only replacement, which now refuses
# to run outside ENVIRONMENT=development and is not reachable over HTTP at all.


@router.get("/tables/{table_name}")
async def get_table_data(
    table_name: str,
    current_user: CurrentStaffUser = Depends(_SUPER_ADMIN_ONLY),
):
    """
    Super Admin endpoint to fetch all rows for a given table.
    """
    supabase = await get_supabase()
    allowed_tables = ['users', 'cases', 'interactions', 'counsellors', 'sos_events', 'case_updates']

    if table_name not in allowed_tables:
        raise HTTPException(status_code=400, detail="Invalid table name")

    try:
        resp = await supabase.table(table_name).select("*").order("id", desc=True).limit(100).execute()
        return {"data": resp.data}
    except Exception as e:
        logger.error(f"Error fetching table {table_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/tables/{table_name}/{row_id}")
async def delete_table_row(
    table_name: str,
    row_id: str,
    current_user: CurrentStaffUser = Depends(_SUPER_ADMIN_ONLY),
):
    """
    Super Admin endpoint to delete a specific row.
    """
    supabase = await get_supabase()
    allowed_tables = ['users', 'cases', 'interactions', 'counsellors', 'sos_events', 'case_updates']

    if table_name not in allowed_tables:
        raise HTTPException(status_code=400, detail="Invalid table name")

    try:
        await supabase.table(table_name).delete().eq("id", row_id).execute()
        return {"status": "success", "message": f"Deleted row {row_id} from {table_name}"}
    except Exception as e:
        logger.error(f"Error deleting row from {table_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/tables/{table_name}")
async def insert_table_row(
    table_name: str,
    payload: dict,
    current_user: CurrentStaffUser = Depends(_SUPER_ADMIN_ONLY),
):
    """
    Super Admin endpoint to insert a new row.
    """
    supabase = await get_supabase()
    allowed_tables = ['users', 'cases', 'interactions', 'counsellors', 'sos_events', 'case_updates']

    if table_name not in allowed_tables:
        raise HTTPException(status_code=400, detail="Invalid table name")

    try:
        resp = await supabase.table(table_name).insert(payload).execute()
        return {"status": "success", "data": resp.data}
    except Exception as e:
        logger.error(f"Error inserting row into {table_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
