import asyncio
import logging

logger = logging.getLogger(__name__)

async def calculate_engagement_score(missed_checkins: int, total_checkins: int, last_interaction_days_ago: int) -> dict:
    """
    Calculates disengagement risk. 
    High score = high disengagement (bad).
    """
    logger.info(f"Calculating engagement score for missed: {missed_checkins}/{total_checkins}")
    
    score = 0.0
    notes = "Active engagement"
    
    if total_checkins > 0:
        miss_rate = missed_checkins / total_checkins
        if miss_rate > 0.5:
            score += 50.0
            notes = "High miss rate on check-ins"
        elif miss_rate > 0.2:
            score += 25.0
            notes = "Moderate miss rate"
            
    if last_interaction_days_ago > 14:
        score += 40.0
        notes += "; Prolonged silence (>14 days)"
    elif last_interaction_days_ago > 7:
        score += 20.0
        notes += "; No contact in last week"
        
    return {
        "engagement_score": min(score, 100.0),
        "notes": notes
    }
