def get_intervention_recommendation(final_score: float, emotion_tag: str, case_stage: str) -> str:
    """
    Rules-based engine to recommend interventions based on score thresholds and emotion tags.
    """
    if final_score >= 85:
        return "Immediate Escalation / SOS Override"
    elif final_score >= 70:
        if emotion_tag == "fear":
            return "Witness Protection Review"
        elif emotion_tag == "hopelessness":
            return "Urgent Psychiatric Counsellor Dispatch"
        return "Priority Case Review"
    elif final_score >= 50:
        if case_stage == "trial" and emotion_tag == "fear":
            return "Pre-Trial Stress Counseling"
        return "Standard Weekly Check-in"
    else:
        return "Routine Monitoring"
