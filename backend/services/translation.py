import asyncio
import logging

logger = logging.getLogger(__name__)

async def translate_text(text: str, source_lang: str, target_lang: str = "en") -> str:
    """
    Simulates Bhashini / IndicTrans2 translation.
    Returns the English text for downstream sentiment analysis if needed.
    """
    logger.info(f"Translating from {source_lang} to {target_lang}")
    await asyncio.sleep(0.1) # Simulate API call
    
    if source_lang == "hi" and "gussa" in text.lower():
        return text.lower().replace("gussa", "angry")
    elif source_lang == "hi" and "dar" in text.lower():
        return text.lower().replace("dar", "fear")
        
    # For MVP mock, just return original text if we don't have a specific mock rule
    return text
