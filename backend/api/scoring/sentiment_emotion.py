import asyncio
import logging

logger = logging.getLogger(__name__)

async def analyze_sentiment_and_emotion(transcript: str, language: str = 'en') -> dict:
    """
    MVP Mock for IndicBERT + LLM emotion classification.
    """
    logger.info(f"Running sentiment and emotion analysis on transcript length {len(transcript)}")
    await asyncio.sleep(0.5) # Simulate LLM API latency
    
    transcript_lower = transcript.lower()
    
    if any(word in transcript_lower for word in ["help", "scared", "threat", "kill", "dar", "bhayam", "payam"]):
        return {
            "sentiment_score": 90.0,
            "emotion_tag": "fear",
            "notes": "Strong fear and threat indicators detected in text"
        }
    elif any(word in transcript_lower for word in ["sad", "hopeless", "give up", "dukh"]):
        return {
            "sentiment_score": 75.0,
            "emotion_tag": "hopelessness",
            "notes": "Depressive language markers present"
        }
    elif any(word in transcript_lower for word in ["angry", "mad", "gussa"]):
        return {
            "sentiment_score": 60.0,
            "emotion_tag": "anger",
            "notes": "High arousal negative sentiment"
        }
        
    return {
        "sentiment_score": 20.0,
        "emotion_tag": "neutral",
        "notes": "No strong distress indicators in text"
    }
