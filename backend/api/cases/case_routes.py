from fastapi import APIRouter, Depends, HTTPException
from services.supabase_client import get_supabase
from api.auth.victim_dependencies import CaseAccessPrincipal, get_case_access_principal
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/{case_id}/progress")
async def get_case_progress(
    case_id: str,
    principal: CaseAccessPrincipal = Depends(get_case_access_principal),
):
    """
    Returns current stage, score, interactions, and trend for a case.

    S1 made this staff-only as a deliberate, documented tradeoff, since no real
    victim identity mechanism existed yet and the endpoint previously had no
    authorization at all (an IDOR — any case's full interaction history/scores
    were readable by anyone who knew or guessed its UUID). S2 introduces real
    victim sessions, so this now accepts EITHER a staff principal (with the
    existing counsellor-must-own-the-case check from S1) OR the victim who owns
    the case — see api/auth/victim_dependencies.py:get_case_access_principal.
    A victim presenting someone else's case_id is rejected with 403, same as a
    counsellor presenting a case they're not assigned to.
    """
    supabase = await get_supabase()
    try:
        case_resp = await supabase.table("cases").select("*").eq("id", case_id).single().execute()

        if principal.staff is not None:
            if principal.staff.role == "counsellor" and case_resp.data.get("assigned_counsellor_id") != principal.staff.id:
                raise HTTPException(status_code=403, detail="This case is not assigned to you")
        else:
            if case_resp.data.get("user_id") != principal.victim.id:
                raise HTTPException(status_code=403, detail="This is not your case")

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
        
        # Assigned clinician lookup
        assigned_clinician_name = None
        assigned_clinician_role = None
        assigned_counsellor_id = case_resp.data.get("assigned_counsellor_id")
        if assigned_counsellor_id:
            try:
                co_resp = await supabase.table("counsellors").select("name, role").eq("id", assigned_counsellor_id).single().execute()
                if co_resp.data:
                    assigned_clinician_name = co_resp.data.get("name")
                    assigned_clinician_role = co_resp.data.get("role") or "Counsellor"
            except Exception as e:
                logger.debug(f"Could not fetch counsellor details: {e}")

        # Case milestones
        milestones_list = []
        try:
            m_resp = await supabase.table("milestones").select("*").eq("case_id", case_id).order("created_at").execute()
            for m in (m_resp.data or []):
                milestones_list.append({
                    "id": m.get("id"),
                    "label": m.get("label") or m.get("type", "").replace("_", " ").title(),
                    "icon": m.get("icon") or "check",
                    "date": m.get("met_at") or m.get("due_at") or m.get("created_at"),
                    "description": m.get("description"),
                    "active": bool(m.get("is_active", False)),
                    "upcoming": m.get("met_at") is None,
                })
        except Exception as e:
            logger.debug(f"Could not load milestones: {e}")

        # Biomarkers from latest score breakdown
        acoustic_shimmer = None
        nlp_valence = None
        heart_rate = None
        if interactions:
            latest_breakdown = interactions[0].get("score_breakdown", {})
            if isinstance(latest_breakdown, dict):
                ac = latest_breakdown.get("acoustic", {})
                if isinstance(ac, dict):
                    if "shimmer" in ac and ac["shimmer"] is not None:
                        acoustic_shimmer = f"{round(float(ac['shimmer']) * 100, 1)}%" if isinstance(ac["shimmer"], (int, float)) else str(ac["shimmer"])
                    elif ac.get("available") and ac.get("raw_value") is not None:
                        acoustic_shimmer = f"{round(float(ac['raw_value']), 1)}%"
                sent = latest_breakdown.get("sentiment", {})
                if isinstance(sent, dict):
                    if "valence" in sent and sent["valence"] is not None:
                        nlp_valence = f"{round(float(sent['valence']), 2)}" if isinstance(sent["valence"], (int, float)) else str(sent["valence"])
                    elif sent.get("available") and sent.get("raw_value") is not None:
                        nlp_valence = f"{round(float(sent['raw_value']) / 100, 2)}"
                if "heart_rate" in latest_breakdown and latest_breakdown["heart_rate"] is not None:
                    heart_rate = latest_breakdown["heart_rate"]

        return {
            "currentStage": case_resp.data["case_stage"],
            "latestScore": case_resp.data["current_distress_score"],
            "scoreExplanation": score_explanation,
            "interactions": interactions,
            "trend": trend,
            "assigned_clinician_name": assigned_clinician_name,
            "assigned_clinician_role": assigned_clinician_role,
            "milestones": milestones_list,
            "acoustic_shimmer": acoustic_shimmer,
            "nlp_valence": nlp_valence,
            "heart_rate": heart_rate,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching case progress: {e}")
        raise HTTPException(status_code=500, detail=str(e))
