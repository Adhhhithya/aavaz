import json
import logging
from config import settings
from groq import AsyncGroq

logger = logging.getLogger(__name__)

async def parse_unstructured_case_data(cnr: str, raw_data: dict) -> dict:
    """
    Uses an LLM (Groq) to parse and enrich unstructured or incomplete case data
    from the eCourts API into a structured JSON object.

    This function must only transform data that actually came back from the eCourts
    API for the given CNR. It must never inject facts (judges, statute sections,
    transfer history, or anything else) that did not come from that response — see
    docs/AAVAZ_IMPLEMENTATION_AUDIT.md and docs/AAVAZ_MIGRATION_PLAN.md for why a
    prior version of this function hardcoded fabricated legal facts for one specific
    real-looking CNR and why that was removed outright, with no replacement fixture
    of any kind here. A synthetic demo case, if one is needed, belongs in test
    fixtures (see backend/tests/), never in this parsing path.
    """
    if not settings.GROQ_API_KEY:
        logger.warning("GROQ_API_KEY not set. Skipping LLM parsing.")
        return raw_data

    try:
        client = AsyncGroq(api_key=settings.GROQ_API_KEY)
        
        prompt = f"""
        You are an expert legal AI assistant. We fetched raw case data for CNR: {cnr} from the eCourts API.
        However, the data is incomplete or has unstructured text (e.g., caseType="UNKNOWN", actsAndSections is a string instead of an array).
        
        Please intelligently parse, reconstruct, and enrich this case data.
        Use your knowledge base to infer or correct the case type, format the acts and sections as a clean array, 
        and ensure all arrays (like judges, petitioners, respondents, advocates) are properly formatted without gibberish.
        
        CRITICAL RULES:
        1. `actsAndSections` MUST be a flat array of strings. You MUST extract ALL acts mentioned in `caseTypeSub` (e.g., if it mentions multiple acts, include ALL of them). Example format: ["<Act name> <year> - Section <number>", "<Other act name> - Section <number>"]. DO NOT return it as an array of objects. Only include acts/sections that actually appear in this case's own data — never invent one.
        2. `caseType`: If `caseType` is "UNKNOWN" but `caseTypeRaw` has a meaningful value (like "CBI"), normalize and set `caseType` to that value (e.g. "CBI").
        3. Do NOT overwrite or remove any existing valid fields like `earlierCourtDetails` or corrected `judges` lists.
        4. Generate a new field `detailed_case_update` (string). This MUST be a comprehensive, multi-paragraph summary of the case based on all available data (parties, acts, orders, timelines). Write it like a professional legal executive brief highlighting the trajectory and current status.
        5. You MUST explicitly extract `nextHearingDate` (as YYYY-MM-DD or "Not Scheduled"), `currentStatus` (or `caseStatus`), and `recentOutcome` (from the most recent order/hearing) into the root of the JSON object.
        
        Return the exact same schema structure, but with the fields enriched and cleaned.
        
        Raw Data:
        {json.dumps(raw_data, indent=2)}
        """

        response = await client.chat.completions.create(
            model='openai/gpt-oss-120b',
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )
        
        refined_data = json.loads(response.choices[0].message.content)
        logger.info(f"Successfully refined case data for {cnr} using Groq.")
        
        # Merge refined data over the raw data to ensure no keys are completely lost
        merged_data = {**raw_data, **refined_data}
        return merged_data
        
    except Exception as e:
        logger.error(f"Error during LLM parsing: {e}")
        return raw_data  # Fallback to deterministically corrected raw data if parsing fails
