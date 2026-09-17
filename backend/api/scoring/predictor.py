import asyncio
import logging
from typing import List

logger = logging.getLogger(__name__)

async def predict_escalation(recent_scores: List[float]) -> dict:
    """
    Predicts if a case is on a trajectory to require SOS/intervention.
    """
    logger.info("Running escalation prediction")
    
    if len(recent_scores) < 3:
        return {"risk_level": "Low", "prediction_notes": "Insufficient data for prediction"}
        
    # Simple trend analysis: if the last 3 scores are strictly increasing and the latest is > 60
    s1, s2, s3 = recent_scores[-3:]
    
    if s3 > s2 > s1 and s3 > 60.0:
        return {
            "risk_level": "High", 
            "prediction_notes": "Rapid sequential distress growth detected. High risk of crisis."
        }
    elif s3 > 75.0:
        return {
            "risk_level": "High",
            "prediction_notes": "Sustained high distress."
        }
        
    return {"risk_level": "Low", "prediction_notes": "Stable trajectory"}
