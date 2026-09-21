"""
backend/services/agents/triage_agent.py

Triage / Crisis Agent.

The first agent called for every user turn. Its sole job is to classify
the immediate safety situation and decide routing.

OUTPUT CONTRACT:
  Returns a TriageResult. The Supervisor reads this to decide:
    - CRITICAL / immediate_danger=True  -> Crisis path (SOS + Escalation Agent)
    - HIGH / requires_escalation=True   -> Empathy + Escalation Agent
    - MEDIUM / LOW                      -> Empathy + Legal RAG as needed

THIS AGENT MUST NOT:
  - Diagnose mental illness
  - Make legal determinations
  - Fabricate emergency services or numbers
  - Promise confidentiality beyond actual system capabilities
  - Independently trigger SOS or DB actions (Supervisor does that)

APPROACH:
  1. Fast rule-based pass: scan transcript for explicit danger keywords.
     This is deterministic and does not require an LLM call.
  2. LLM classification pass (when rule-based score is MEDIUM): ask the LLM
     to reason about intent with a narrow, structured prompt.
  3. Return TriageResult with reason_codes for XAI.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Optional

from groq import AsyncGroq

from config import settings
from models.contracts import ConversationState, RiskLevel, TriageResult

logger = logging.getLogger(__name__)

_groq = AsyncGroq(api_key=settings.GROQ_API_KEY)
_LLM_MODEL = "llama-3.3-70b-versatile"  # fast model for triage

# ---------------------------------------------------------------------------
# Rule-based crisis keyword sets (multilingual, common transliterations)
# ---------------------------------------------------------------------------
_IMMEDIATE_DANGER = frozenset([
    # English
    "kill me", "killing me", "going to kill", "will kill",
    "threat to kill", "threatened to kill", "murder me", "about to kill", "weapon pointed",
    "gun pointed", "knife at", "being beaten", "being attacked",
    "on fire", "burning house", "trapped",
    # Hindi transliterations
    "maar denge", "jaan se maar", "hatyara", "maar diya",
    "maar rahe hain", "maar dalenge",
    # Tamil transliterations
    "konnu", "konrutuvargal", "konrupoduvargal",
])

_SELF_HARM = frozenset([
    "end my life", "kill myself", "want to die", "suicide", "suicidal",
    "self harm", "cut myself", "overdose", "no reason to live",
    "mar jaunga", "marna chahta", "khud ko maar",
    "uyirodu poi vida", "saavukiren",
])

_WITNESS_INTIMIDATION = frozenset([
    "following me", "being followed", "watching my house", "threatening to testify",
    "dont testify", "withdraw case", "drop the case or else",
    "stalking me", "intimidating me", "threatened not to appear",
    "threatened if", "testify",
    "case wapas lo", "gawahi mat do",
])

_GENERAL_DISTRESS = frozenset([
    "help", "help me", "scared", "afraid", "fear", "danger",
    "dar laga", "dar lag raha", "madad karo",
    "bayam", "udavi", "pavam",
])


_MEDICAL_EMERGENCY = frozenset([
    "hit me", "beating me", "bleeding", "broken arm", "ambulance",
    "injured", "hospital", "chot lagi", "khoon", "adithargal", "ratham"
])

def _rule_based_triage(transcript: str) -> tuple[RiskLevel, list[str], bool, bool, bool, bool]:
    """
    Fast, deterministic keyword scan.
    Returns: (risk_level, reason_codes, immediate_danger, self_harm, witness_intimidation, medical_emergency)
    """
    text = transcript.lower()
    codes: list[str] = []
    immediate = any(kw in text for kw in _IMMEDIATE_DANGER)
    self_harm = any(kw in text for kw in _SELF_HARM)
    intimidation = any(kw in text for kw in _WITNESS_INTIMIDATION)
    medical = any(kw in text for kw in _MEDICAL_EMERGENCY)
    distress = any(kw in text for kw in _GENERAL_DISTRESS)

    if immediate:
        codes.append("EXPLICIT_PHYSICAL_DANGER")
        return RiskLevel.CRITICAL, codes, True, self_harm, intimidation, medical
    if self_harm:
        codes.append("SELF_HARM_SIGNAL")
        return RiskLevel.CRITICAL, codes, immediate, True, intimidation, medical
    if intimidation:
        codes.append("WITNESS_INTIMIDATION_SIGNAL")
        return RiskLevel.HIGH, codes, immediate, self_harm, True, medical
    if distress or medical:
        if medical: codes.append("MEDICAL_EMERGENCY_SIGNAL")
        if distress: codes.append("GENERAL_DISTRESS_SIGNAL")
        return RiskLevel.MEDIUM, codes, immediate, self_harm, intimidation, medical

    return RiskLevel.LOW, codes, immediate, self_harm, intimidation, medical


async def _llm_triage(
    transcript: str,
    conversation_history: str,
) -> dict:
    """
    Structured LLM triage for MEDIUM-risk cases where rule-based pass is
    insufficient. Returns a parsed JSON dict matching TriageResult fields.
    """
    prompt = f"""You are a crisis safety triage system for an atrocity victim support service in India.
Analyze the following message from a victim or witness of a serious crime and classify their safety status.

Conversation context (last 3 turns):
{conversation_history}

Current message: "{transcript}"

Respond ONLY with this exact JSON (no explanation, no markdown):
{{
  "risk_level": "LOW|MEDIUM|HIGH|CRITICAL",
  "immediate_danger": true|false,
  "self_harm_signal": true|false,
  "witness_intimidation_signal": true|false,
  "requires_medical": true|false,
  "intent": "GENERAL_SUPPORT|LEGAL_HELP|EMOTIONAL_SUPPORT|EMERGENCY|INFORMATION|MEDICAL_HELP",
  "requires_escalation": true|false,
  "reason_codes": ["CODE1", "CODE2"],
  "confidence": 0.0-1.0
}}

Rules:
- CRITICAL only if the person is in immediate physical danger RIGHT NOW or expressing active self-harm intent.
- HIGH if there is witness intimidation, serious ongoing threat, or recent violence.
- MEDIUM if distressed but not in immediate danger.
- LOW if no safety signals.
- requires_escalation: true if CRITICAL or HIGH.
- reason_codes: short snake_case codes explaining your classification."""

    try:
        response = await _groq.chat.completions.create(
            model=_LLM_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
            max_tokens=300,
        )
        raw = response.choices[0].message.content.strip()
        # Extract JSON even if there is surrounding text
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if match:
            return json.loads(match.group())
    except Exception as exc:
        logger.warning("LLM triage failed: %s — falling back to rule-based result", exc)
    return {}


async def run(state: ConversationState) -> ConversationState:
    """
    Run the Triage Agent on the current conversation state.
    Mutates state.triage and returns the updated state.
    """
    if not state.transcript:
        state.triage = TriageResult(risk_level=RiskLevel.LOW, confidence=1.0)
        return state

    # Get the latest user turn
    user_turns = [t for t in state.transcript if t.speaker == "user"]
    if not user_turns:
        state.triage = TriageResult(risk_level=RiskLevel.LOW, confidence=1.0)
        return state

    latest = user_turns[-1].transcript

    # 1. Rule-based pass
    risk, codes, immediate, self_harm, intimidation, medical = _rule_based_triage(latest)

    # 2. LLM refinement for MEDIUM and LOW cases (save LLM calls on obvious HIGH/CRITICAL)
    llm_result: dict = {}
    if risk in [RiskLevel.MEDIUM, RiskLevel.LOW]:
        # Build brief conversation history for context
        history_lines = []
        for t in state.transcript[-6:]:
            prefix = "Victim" if t.speaker == "user" else "Agent"
            history_lines.append(f"{prefix}: {t.transcript[:120]}")
        history_str = "\n".join(history_lines)

        llm_result = await _llm_triage(latest, history_str)

        if llm_result:
            # Upgrade risk if LLM found something rule-based missed
            llm_risk_str = llm_result.get("risk_level", risk.value)
            try:
                llm_risk = RiskLevel(llm_risk_str)
                if llm_risk.value > risk.value:  # Enum ordering: LOW < MEDIUM < HIGH < CRITICAL
                    risk = llm_risk
            except ValueError:
                pass

            immediate = immediate or bool(llm_result.get("immediate_danger", False))
            self_harm = self_harm or bool(llm_result.get("self_harm_signal", False))
            intimidation = intimidation or bool(llm_result.get("witness_intimidation_signal", False))
            medical = medical or bool(llm_result.get("requires_medical", False))
            codes.extend(llm_result.get("reason_codes", []))

    intent = llm_result.get("intent", "GENERAL_SUPPORT")
    confidence = float(llm_result.get("confidence", 0.85 if not llm_result else 0.5))
    requires_escalation = risk in (RiskLevel.HIGH, RiskLevel.CRITICAL)

    state.triage = TriageResult(
        risk_level=risk,
        immediate_danger=immediate,
        self_harm_signal=self_harm,
        witness_intimidation_signal=intimidation,
        intent=intent,
        requires_escalation=requires_escalation,
        requires_medical=medical,
        reason_codes=list(set(codes)),
        confidence=confidence,
    )

    logger.info(
        "Triage: risk=%s immediate=%s escalate=%s codes=%s",
        risk.value, immediate, requires_escalation, codes,
    )
    return state
