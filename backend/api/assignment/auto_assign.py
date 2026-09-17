from services.supabase_client import get_supabase
import logging

logger = logging.getLogger(__name__)

async def assign_counsellor(district: str, language: str) -> str:
    """
    Finds the best counsellor in the given district matching the language,
    prioritizing those with the lowest current caseload.
    Returns the UUID of the assigned counsellor, or None if none found.
    """
    supabase = await get_supabase()
    
    try:
        # We fetch all counsellors in the district to filter by language array in memory 
        # (Supabase RPC is better, but this works for MVP)
        response = await supabase.table("counsellors")\
            .select("id, languages, current_caseload")\
            .eq("district", district)\
            .order("current_caseload")\
            .execute()
            
        counsellors = response.data
        if not counsellors:
            return None
            
        # Filter by language support
        for c in counsellors:
            if language in c.get("languages", []):
                # Update caseload
                await supabase.table("counsellors")\
                    .update({"current_caseload": c["current_caseload"] + 1})\
                    .eq("id", c["id"])\
                    .execute()
                return c["id"]
                
        # If no language match, just assign to the one with lowest caseload in district
        best_fallback = counsellors[0]
        await supabase.table("counsellors")\
            .update({"current_caseload": best_fallback["current_caseload"] + 1})\
            .eq("id", best_fallback["id"])\
            .execute()
        return best_fallback["id"]

    except Exception as e:
        logger.error(f"Error in auto-assignment: {e}")
        return None
