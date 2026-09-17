import uuid
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from services.ecourts_scraper import fetch_ecourts_case_api
from services.supabase_client import get_supabase
from api.auth.victim_dependencies import CurrentVictim, get_current_victim

router = APIRouter()
logger = logging.getLogger(__name__)

class CNRSearchRequest(BaseModel):
    cnr: str
    # user_id intentionally removed (S2 — see docs/AAVAZ_IMPLEMENTATION_AUDIT.md
    # §16 "eCourts ownership fix"): this previously accepted an arbitrary
    # client-supplied user_id with no check that it belonged to the caller,
    # letting anyone attach any CNR's data to any victim's account. The
    # authenticated victim's own id is used instead.

@router.post("/search")
async def ecourts_search(
    req: CNRSearchRequest,
    current_victim: CurrentVictim = Depends(get_current_victim),
):
    """
    Automated scrape: directly hits the eCourts JSON API, structures the data,
    and saves it to the database.

    S2: the case created from this search is always attached to the
    authenticated victim (`current_victim.id`), never to a client-supplied id.
    """
    try:
        # Direct API call
        raw_case_data = await fetch_ecourts_case_api(req.cnr)
        
        # Always use Gemini to refine, structure, and clean the raw eCourts data for ALL cases
        from services.ecourts_parser import parse_unstructured_case_data
        case_data = await parse_unstructured_case_data(req.cnr, raw_case_data)
        
        # Handle empty lists correctly
        petitioners = case_data.get('petitioners') or ['Unknown']
        respondents = case_data.get('respondents') or ['Unknown']
        
        # Structure the data properly from the API response
        structured_data = {
            "title": f"{', '.join(petitioners)} vs {', '.join(respondents)}",
            "case_type": case_data.get("caseType", "Unknown"),
            "status": case_data.get("caseStatus", "Unknown"),
            "date_filed": case_data.get("filingDate", "Unknown"),
            "next_hearing": case_data.get("nextHearingDate", "N/A"),
            "court_name": case_data.get("courtCode", "Unknown")
        }
        
        # Save to database
        supabase = await get_supabase()
        case_id = str(uuid.uuid4())
        
        # Insert a new case
        new_case = {
            "id": case_id,
            "user_id": current_victim.id,
            "case_type": structured_data["case_type"],
            "intake_channel": "app",
            "case_stage": "registered", # default or derived from status
            "current_distress_score": 50.0, # default baseline
            "priority_rank": 0,
            "cnr": req.cnr,
            "ecourts_data": case_data
        }
        
        try:
            await supabase.table("cases").insert(new_case).execute()
        except Exception as db_err:
            logger.warning(f"Failed to save case to database (likely invalid user_id): {db_err}")
        
        return {
            "success": True,
            "case_id": case_id,
            "structured_data": structured_data
        }
        
    except Exception as e:
        logger.error(f"Error in ecourts search: {e}")
        error_msg = str(e)
        if "timeout" in error_msg.lower() or " 503 " in error_msg:
            raise HTTPException(status_code=503, detail="eCourts API is temporarily unavailable.")
        if "No case found" in error_msg:
            raise HTTPException(status_code=404, detail="No case found for the provided CNR.")
        if "eCourts API error" in error_msg:
            raise HTTPException(status_code=400, detail=f"eCourts returned an error: {error_msg}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch and parse case data: {error_msg}")
