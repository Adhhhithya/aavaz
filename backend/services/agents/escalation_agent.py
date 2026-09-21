"""
backend/services/agents/escalation_agent.py

Escalation Agent.

Triggered when the Triage Agent classifies a turn as HIGH or CRITICAL.
Responsibilities:
  1. Create an escalation record in the database
  2. Create an urgent task for the assigned counsellor (via core-api tasks table)
  3. If break-glass conditions are met, flag for break-glass access
  4. Return a structured EscalationState for the Supervisor

PRIVACY CONTRACT:
  - The escalation summary sent to counsellors is PII-free: it describes
    risk signals and emotion context, NOT the transcript verbatim.
  - Full transcript access goes through the core-api break-glass mechanism
    and is logged separately.

IDEMPOTENCY:
  - Checks for an existing open escalation for this conversation before
    creating a new one. Does not spam counsellors with duplicate alerts
    within the same session.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from models.contracts import (
    ConversationState,
    EscalationState,
    EscalationStatus,
    RiskLevel,
)
from services.supabase_client import get_supabase
from services.pushbullet_service import send_push_notification

logger = logging.getLogger(__name__)

# How to notify counsellors - currently via Supabase tasks table (core-api owned).
# In Phase 5, this will also trigger Bolna/Pushbullet SMS.
_TASKS_TABLE = "tasks"


def _build_pii_free_summary(state: ConversationState) -> str:
    """
    Build a PII-free escalation summary from the triage and distress results.
    NO raw transcript, NO names, NO phone numbers.
    """
    parts = []

    if state.triage:
        parts.append(f"Risk Level: {state.triage.risk_level.value}")
        if state.triage.immediate_danger:
            parts.append("⚠ Immediate physical danger reported")
        if state.triage.self_harm_signal:
            parts.append("⚠ Self-harm signals detected")
        if state.triage.witness_intimidation_signal:
            parts.append("⚠ Witness intimidation signals detected")
        if state.triage.reason_codes:
            parts.append(f"Signals: {', '.join(state.triage.reason_codes)}")

    if state.distress:
        parts.append(f"Distress Score: {state.distress.distress_score:.0f}/100")
        parts.append(f"Emotion: {state.distress.emotion_tag.value}")
        if state.distress.signals:
            parts.append(f"Acoustic/NLP signals: {', '.join(state.distress.signals[:3])}")

    parts.append(f"Channel: {state.channel}")
    parts.append(f"Language: {state.language}")
    parts.append(f"Conversation ID: {state.conversation_id}")

    return "\n".join(parts)


async def _create_counsellor_task(
    case_id: str,
    conversation_id: str,
    escalation_id: str,
    severity: RiskLevel,
    summary: str,
) -> Optional[str]:
    """
    Insert an urgent task into the tasks table (core-api owned).
    Returns the task ID on success, None on failure.
    """
    try:
        supabase = await get_supabase()
        task = {
            "id": str(uuid.uuid4()),
            "case_id": case_id,
            "task_type": "crisis_escalation",
            "status": "open",
            "priority": "critical" if severity == RiskLevel.CRITICAL else "high",
            "title": f"[{severity.value}] Crisis escalation — immediate counsellor action required",
            "description": summary,
            "metadata": {
                "conversation_id": conversation_id,
                "escalation_id": escalation_id,
                "auto_generated": True,
                "source": "escalation_agent",
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        resp = await supabase.table(_TASKS_TABLE).insert(task).execute()
        if resp.data:
            task_id = resp.data[0]["id"]
            logger.info("Created counsellor task %s for escalation %s", task_id, escalation_id)
            return task_id
    except Exception as exc:
        logger.error("Failed to create counsellor task: %s", exc)
    return None


async def _has_open_escalation(conversation_id: str) -> bool:
    """Check if there is already an open escalation for this conversation."""
    try:
        supabase = await get_supabase()
        resp = await supabase.table("escalations") \
            .select("id") \
            .eq("conversation_id", conversation_id) \
            .neq("status", EscalationStatus.RESOLVED.value) \
            .limit(1) \
            .execute()
        return bool(resp.data)
    except Exception:
        return False  # assume no open escalation on failure — safer to create a new one


async def run(state: ConversationState) -> ConversationState:
    """
    Run the Escalation Agent. Creates a counsellor task and escalation record
    when the triage result requires escalation.

    Does nothing if:
      - No triage result or requires_escalation=False
      - An open escalation already exists for this conversation
    """
    if not state.triage or not state.triage.requires_escalation:
        return state

    if not state.case_id:
        logger.warning("Escalation agent: no case_id in state, cannot escalate")
        return state

    # Idempotency: don't create duplicate escalations in the same session
    if state.escalation and state.escalation.status != EscalationStatus.RESOLVED:
        logger.debug("Escalation already open for conversation %s", state.conversation_id)
        return state

    if await _has_open_escalation(state.conversation_id):
        logger.debug("Existing open escalation found for conversation %s", state.conversation_id)
        return state

    severity = state.triage.risk_level
    victim_id = state.victim_id or "unknown"
    escalation_id = str(uuid.uuid4())
    summary = _build_pii_free_summary(state)

    # Recommended action based on severity and signals
    if state.triage.immediate_danger:
        recommended_action = "contact_victim_immediately_and_dispatch_police"
    elif state.triage.self_harm_signal:
        recommended_action = "call_victim_and_arrange_mental_health_support"
    elif state.triage.witness_intimidation_signal:
        recommended_action = "arrange_witness_protection_review"
    else:
        recommended_action = "call_victim_for_welfare_check"

    # Create counsellor task
    task_id = await _create_counsellor_task(
        case_id=state.case_id,
        conversation_id=state.conversation_id,
        escalation_id=escalation_id,
        severity=severity,
        summary=summary,
    )

    # Persist escalation record
    try:
        supabase = await get_supabase()
        await supabase.table("escalations").insert({
            "id": escalation_id,
            "case_id": state.case_id,
            "conversation_id": state.conversation_id,
            "victim_id": victim_id,
            "severity": severity.value,
            "reason": "; ".join(state.triage.reason_codes),
            "summary": summary,
            "recommended_action": recommended_action,
            "status": EscalationStatus.PENDING.value,
            "counsellor_task_id": task_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception as exc:
        logger.error("Failed to persist escalation record: %s", exc)
        # Still set state.escalation so the Empathy Agent knows to acknowledge it

    state.escalation = EscalationState(
        escalation_id=escalation_id,
        severity=severity,
        reason="; ".join(state.triage.reason_codes),
        summary=summary,
        victim_id=victim_id,
        case_id=state.case_id,
        recommended_action=recommended_action,
        status=EscalationStatus.PENDING,
        counsellor_task_id=task_id,
    )

    logger.info(
        "Escalation %s created: severity=%s action=%s task=%s",
        escalation_id, severity.value, recommended_action, task_id,
    )
    return state
