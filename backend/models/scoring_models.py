from pydantic import BaseModel
from typing import Dict

class ComponentScore(BaseModel):
    weight: float
    contribution: float
    notes: str

class ScoreBreakdown(BaseModel):
    acoustic: ComponentScore
    sentiment: ComponentScore
    engagement: ComponentScore
    history: ComponentScore

class ScoringResult(BaseModel):
    final_score: float
    score_breakdown: ScoreBreakdown
    emotion_tag: str
    intervention_recommended: str
