from supabase import create_async_client, AsyncClient
from config import settings
import logging

logger = logging.getLogger(__name__)

async def get_supabase() -> AsyncClient:
    """Returns an async Supabase client."""
    try:
        supabase: AsyncClient = await create_async_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
        return supabase
    except Exception as e:
        logger.error(f"Failed to initialize Supabase async client: {e}")
        raise e
