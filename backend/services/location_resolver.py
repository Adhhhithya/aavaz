import logging
import httpx
from typing import Tuple, Optional

logger = logging.getLogger(__name__)

async def resolve_location(lat: Optional[float], lng: Optional[float]) -> Tuple[Optional[str], Optional[str]]:
    """
    Reverse geocodes latitude/longitude into district and state using OpenStreetMap Nominatim.
    Falls back gracefully if network is unavailable.
    """
    if lat is None or lng is None:
        return None, None

    logger.info("Resolving location coordinates: lat=%s, lng=%s", lat, lng)
    
    try:
        url = f"https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lng}&format=json&addressdetails=1"
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.get(url, headers={"User-Agent": "Aavaz-Distress-Platform/1.0"})
            if resp.status_code == 200:
                data = resp.json()
                address = data.get("address", {})
                district = (
                    address.get("state_district")
                    or address.get("district")
                    or address.get("county")
                    or address.get("city")
                    or "Unknown District"
                )
                state = address.get("state") or "Unknown State"
                if district.endswith(" District"):
                    district = district[:-9]
                logger.info("Resolved coordinates (%s, %s) -> district=%s, state=%s", lat, lng, district, state)
                return district, state
    except Exception as exc:
        logger.warning("Geocoding service unavailable (%s), defaulting to coordinate fallback", exc)

    return "Unknown District", "Unknown State"

