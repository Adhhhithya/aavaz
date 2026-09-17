import httpx
from config import settings
import logging

logger = logging.getLogger(__name__)

async def fetch_ecourts_case_api(cnr: str) -> dict:
    """
    Fetches the eCourts case data using the official JSON API.
    Returns the first matching result's data object, or raises Exception if not found.
    """
    if not settings.ECOURTS_API_KEY:
        raise Exception("ECOURTS_API_KEY is not configured.")
        
    url = f"https://webapi.ecourtsindia.com/api/partner/case/{cnr}"
    
    headers = {
        "Authorization": f"Bearer {settings.ECOURTS_API_KEY}",
        "Accept": "application/json"
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers, timeout=15.0)
            
        response.raise_for_status()
        data = response.json()
        
        if not data or "data" not in data or "courtCaseData" not in data["data"]:
            raise Exception("Invalid response format from eCourts API")
            
        case_data = data["data"]["courtCaseData"]
        if not case_data:
            raise Exception(f"No case found for CNR: {cnr}")
            
        return case_data
        
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error from eCourts API: {e.response.status_code} - {e.response.text}")
        raise Exception(f"eCourts API error: {e.response.status_code}")
    except httpx.RequestError as e:
        logger.error(f"Network error calling eCourts API: {e}")
        raise Exception("Failed to connect to eCourts API")
    except Exception as e:
        logger.error(f"Error parsing eCourts API response: {e}")
        raise
