"""
backend/services/agents/empathy_agent.py

Empathy / Active-Listening Agent.

Handles all human-facing conversation turns. Receives the full ConversationState
(including TriageResult and retrieved context) and generates a response using
the grounded AAVAZ system prompt from services/llm_parser.py.

BEHAVIOUR CONTRACT:
  - Trauma-informed: never asks the user to recount or describe the incident.
  - Crisis-aware: if triage.requires_escalation=True, ALWAYS acknowledges the
    distress and instructs the user to use SOS + 112 before anything else.
  - Does NOT override triage safety state even if user tries to change tone.
  - Does NOT fabricate legal schemes, authority names, or helpline numbers.
  - Responds in the user's preferred language (from ConversationState.language).
  - For voice channel: enforces short responses (1-3 sentences).
  - Injects retrieved legal context from state.retrieved_legal_context as
    source-backed, properly cited information (never paraphrased into LLM priors).
  - Injects relevant victim memories from state.memories for personalisation.
"""
from __future__ import annotations

import logging
from typing import Optional

from groq import AsyncGroq

from config import settings
from models.contracts import ConversationState, LegalDoc, MemoryChunk, RiskLevel
from services.llm_parser import build_system_prompt

logger = logging.getLogger(__name__)

_groq = AsyncGroq(api_key=settings.GROQ_API_KEY)
_MODEL = "openai/gpt-oss-120b"   # matches existing llm_parser.py usage
_VOICE_MAX_TOKENS = 150
_CHAT_MAX_TOKENS = 400


def _build_legal_context_block(docs: list[LegalDoc]) -> str:
    """Format retrieved legal documents for injection into the system prompt."""
    if not docs:
        return ""
    lines = ["\n\n---VERIFIED LEGAL CONTEXT (source-backed, cite these)---"]
    for doc in docs[:3]:  # cap at 3 to avoid context overload
        lines.append(
            f"\n[SOURCE: {doc.source} | Confidence: {doc.similarity:.0%}]\n"
            f"Title: {doc.title}\n{doc.content[:600]}"
        )
    lines.append("---END LEGAL CONTEXT---\n")
    lines.append(
        "INSTRUCTION: Use ONLY the above when answering legal/scheme questions. "
        "Do not add legal facts from your own training. "
        "If the above does not answer the question, say you do not have verified "
        "information and tell the user to ask their counsellor."
    )
    return "\n".join(lines)


def _build_memory_block(memories: list[MemoryChunk]) -> str:
    """Format retrieved memories for personalisation injection."""
    if not memories:
        return ""
    lines = ["\n\n---RELEVANT CONTEXT FROM PREVIOUS CONVERSATIONS---"]
    for mem in memories[:5]:
        lines.append(f"- [{mem.memory_type.value}]: {mem.content}")
    lines.append("---END PREVIOUS CONTEXT---")
    return "\n".join(lines)


def _build_crisis_instruction(state: ConversationState) -> str:
    """Inject mandatory crisis response instructions when escalation is needed."""
    if not state.triage or not state.triage.requires_escalation:
        return ""
    lines = [
        "\n\n---CRITICAL SAFETY INSTRUCTION---",
        "The triage system has classified this conversation as HIGH or CRITICAL risk.",
    ]
    if state.triage.immediate_danger:
        lines.append(
            "IMMEDIATE DANGER DETECTED. Your very FIRST sentence MUST instruct the user to "
            "press the SOS button in the app RIGHT NOW and call 112 if they are in physical danger. "
            "Do this before any other response."
        )
    elif state.triage.self_harm_signal:
        lines.append(
            "SELF-HARM SIGNAL DETECTED. Acknowledge their pain first, then clearly tell them "
            "to use the in-app SOS button to reach their counsellor immediately."
        )
    elif state.triage.witness_intimidation_signal:
        lines.append(
            "WITNESS INTIMIDATION DETECTED. Acknowledge the seriousness, tell them their "
            "counsellor is being alerted, and that they can call 112 if in immediate danger."
        )
    lines.append("---END CRISIS INSTRUCTION---")
    return "\n".join(lines)


async def generate_response(state: ConversationState, case_context: Optional[dict] = None) -> str:
    """
    Generate the agent's response for the current turn.

    Returns the response string. Does not mutate state (Supervisor handles
    appending the response turn).
    """
    is_voice = state.channel == "voice"

    # Build enriched system prompt
    base_prompt = build_system_prompt(case_context, voice=is_voice)
    crisis_block = _build_crisis_instruction(state)
    memory_block = _build_memory_block(state.memories)
    legal_block = _build_legal_context_block(state.retrieved_legal_context)

    system_content = base_prompt + crisis_block + memory_block + legal_block

    # Format conversation history for Groq (last 12 turns max)
    messages = [{"role": "system", "content": system_content}]
    history_turns = state.transcript[-12:] if len(state.transcript) > 12 else state.transcript
    for turn in history_turns:
        role = "user" if turn.speaker == "user" else "assistant"
        messages.append({"role": role, "content": turn.transcript})

    max_tokens = _VOICE_MAX_TOKENS if is_voice else _CHAT_MAX_TOKENS

    try:
        response = await _groq.chat.completions.create(
            model=_MODEL,
            messages=messages,
            temperature=0.25,  # low for factual safety; slight warmth for empathy
            max_tokens=max_tokens,
        )
        reply = response.choices[0].message.content.strip()
        logger.info(
            "Empathy agent: channel=%s risk=%s tokens_used=%d",
            state.channel,
            state.triage.risk_level.value if state.triage else "unknown",
            response.usage.total_tokens if response.usage else -1,
        )
        return reply
    except Exception as exc:
        logger.error("Empathy agent LLM call failed: %s", exc)
        # Safe fallback - always acknowledge and direct to SOS
        return (
            "I'm here with you. I'm having a small technical issue right now, "
            "but if you need urgent help please press the SOS button in the app "
            "or call 112."
        )


async def run(state: ConversationState, case_context: Optional[dict] = None) -> tuple[ConversationState, str]:
    """
    Run the Empathy Agent. Returns (updated_state, response_text).
    The Supervisor appends the response as an agent Turn to state.transcript.
    """
    reply = await generate_response(state, case_context)
    return state, reply
