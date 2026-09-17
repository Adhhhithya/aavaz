import asyncio
import logging
from datetime import datetime, timezone
from services.supabase_client import get_supabase

logger = logging.getLogger(__name__)

async def check_and_escalate_sos():
    """
    Background job that runs periodically to check for unresolved SOS events
    that were triggered more than 30 minutes ago.
    """
    logger.info("Starting SOS escalation engine...")
    supabase = await get_supabase()
    
    while True:
        try:
            # Query unresolved SOS events
            response = await supabase.table("sos_events").select("*").eq("resolved", False).eq("escalated", False).execute()
            events = response.data
            
            now = datetime.now(timezone.utc)
            
            for event in events:
                triggered_at = datetime.fromisoformat(event["triggered_at"].replace("Z", "+00:00"))
                delta_minutes = (now - triggered_at).total_seconds() / 60.0
                
                if delta_minutes >= 30.0:
                    logger.warning(f"SOS Event {event['id']} unresolved for {delta_minutes:.1f} mins. Escalating to District!")
                    
                    # Update row to escalated
                    await supabase.table("sos_events").update({
                        "escalated": True,
                        "escalated_at": now.isoformat()
                    }).eq("id", event["id"]).execute()
                    
                    # In a full production system, trigger SMS/Push to District Officer here
                    
        except Exception as e:
            logger.error(f"Error in escalation engine loop: {e}")
            # If it's a network error, sleep longer to avoid log spam
            await asyncio.sleep(30)
            continue
            
        # Poll every 10 seconds for the sake of the hackathon demo
        await asyncio.sleep(10)
