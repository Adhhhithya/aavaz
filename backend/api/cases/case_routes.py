from fastapi import APIRouter, HTTPException
from services.supabase_client import get_supabase
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/{case_id}/progress")
async def get_case_progress(case_id: str):
    """
    Mobile endpoint: Returns current stage, score, interactions, and trend.
    """
    supabase = await get_supabase()
    try:
        case_resp = await supabase.table("cases").select("*").eq("id", case_id).single().execute()
        interactions_resp = await supabase.table("interactions").select("*").eq("case_id", case_id).order("timestamp", desc=True).limit(5).execute()
        
        interactions = interactions_resp.data
        trend = [{"label": i["timestamp"][:10], "score": i["final_score"]} for i in reversed(interactions)]
        
        # Generate plain English explanation from the latest breakdown
        score_explanation = "We are monitoring your well-being."
        if interactions:
            latest_breakdown = interactions[0].get("score_breakdown", {})
            reasons = []
            if "acoustic" in latest_breakdown and latest_breakdown["acoustic"].get("contribution", 0) > 10:
                reasons.append("stress detected in your voice")
            if "sentiment" in latest_breakdown and latest_breakdown["sentiment"].get("contribution", 0) > 10:
                reason = latest_breakdown["sentiment"].get("reason", "concerning words used")
                reasons.append(f"our AI noticed {reason}")
            if "engagement" in latest_breakdown and latest_breakdown["engagement"].get("contribution", 0) > 10:
                reasons.append("recent missed check-ins")
                
            if reasons:
                score_explanation = f"Your support priority is elevated because {', and '.join(reasons)}."
            elif case_resp.data["current_distress_score"] < 40:
                score_explanation = "Your check-ins show you are doing relatively well. Keep it up!"
        
        return {
            "currentStage": case_resp.data["case_stage"],
            "latestScore": case_resp.data["current_distress_score"],
            "scoreExplanation": score_explanation,
            "interactions": interactions,
            "trend": trend
        }
    except Exception as e:
        logger.error(f"Error fetching case progress: {e}")
        raise HTTPException(status_code=500, detail=str(e))
