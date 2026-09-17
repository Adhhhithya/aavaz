from fastapi import APIRouter, HTTPException
from services.supabase_client import get_supabase
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/tables/{table_name}")
async def get_table_data(table_name: str):
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
async def delete_table_row(table_name: str, row_id: str):
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
async def insert_table_row(table_name: str, payload: dict):
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

@router.post("/db/reset")
async def reset_database():
    """
    Super Admin endpoint to clear all data.
    """
    supabase = await get_supabase()
    try:
        # Delete interactions first due to foreign keys
        await supabase.table("interactions").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
        await supabase.table("cases").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
        await supabase.table("users").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
        return {"status": "success", "message": "Database reset completed"}
    except Exception as e:
        logger.error(f"Error resetting DB: {e}")
        raise HTTPException(status_code=500, detail=str(e))
