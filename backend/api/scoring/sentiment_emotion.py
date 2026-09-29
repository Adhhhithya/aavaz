import asyncio
import logging
import json
from services.llm_parser import client, MODEL_NAME

logger = logging.getLogger(__name__)

async def analyze_sentiment_and_emotion(transcript: str, language: str = 'en') -> dict:
    """
    LLM-prompted emotion classification + sentiment scoring.
    Replaces the MVP keyword mock with true LLM inference.
    """
    if not transcript or not transcript.strip():
        return {
            "sentiment_score": 0.0,
            "emotion_tag": "neutral",
            "notes": "No transcript available for analysis"
        }
        
    logger.info(f"Running LLM sentiment and emotion analysis on transcript length {len(transcript)}")
    
    prompt = f"""
    Analyze the following transcript from a caller to a support helpline.
    Respond ONLY with a raw JSON object (no markdown, no backticks) with exactly these keys:
    - "sentiment_score": A float between 0.0 and 100.0 measuring caller distress (where 100.0 is severe crisis/panic/threat, 70-95 is high distress/fear, and 0.0 is completely calm/safe).
    - "emotion_tag": One of ["fear", "anger", "sadness", "hopelessness", "neutral"].
    - "notes": A brief 1-sentence reasoning for the score and tag.

    Transcript:
    "{transcript}"
    """
    
    try:
        response = await client.chat.completions.create(
            model=MODEL_NAME,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
        )
        
        content = response.choices[0].message.content.strip()
        # Clean up any potential markdown code blocks
        if content.startswith("```json"):
            content = content[7:]
        if content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
            
        parsed = json.loads(content.strip())
        
        # Validate emotion_tag
        valid_tags = ["fear", "anger", "sadness", "hopelessness", "neutral"]
        emotion_tag = str(parsed.get("emotion_tag", "neutral")).lower()
        if emotion_tag not in valid_tags:
            emotion_tag = "neutral"
            
        return {
            "sentiment_score": float(parsed.get("sentiment_score", 50.0)),
            "emotion_tag": emotion_tag,
            "notes": str(parsed.get("notes", "LLM analysis complete"))
        }
    except Exception as e:
        logger.error(f"Error during LLM sentiment analysis: {e}")
        # Graceful degradation
        transcript_lower = transcript.lower()
        if any(word in transcript_lower for word in ["help", "scared", "threat", "kill"]):
            return {"sentiment_score": 90.0, "emotion_tag": "fear", "notes": "Degraded to heuristic: Fear indicators"}
        return {
            "sentiment_score": 40.0,
            "emotion_tag": "neutral",
            "notes": "LLM failed, degraded to neutral baseline."
        }
