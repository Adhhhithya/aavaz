"""
backend/services/agents/legal_agent.py

Legal & Welfare Schemes RAG Agent.

Retrieves verified legal provisions, compensation amounts, and welfare scheme
eligibility from the pgvector knowledge base (legal_documents table).

ANTI-HALLUCINATION CONTRACT (enforced here, not just documented):
  - This agent NEVER synthesises legal facts from LLM priors.
  - Every legal claim in its output MUST come from a retrieved document with
    similarity >= LEGAL_CONFIDENCE_GATE (currently 0.72).
  - If retrieval returns nothing (empty list), the agent returns a structured
    "no verified information" response that the Empathy Agent can voice safely.
  - Source citations are mandatory in every response.

RETURN CONTRACT:
  LegalAgentResult with:
    - retrieved_docs: list[LegalDoc]  (for XAI / audit trail)
    - response_text: str              (Empathy Agent appends this to its answer)
    - has_verified_answer: bool       (False -> Empathy Agent admits uncertainty)
    - source_citations: list[str]     (list of source strings for display)

This agent does NOT talk directly to the user. It produces structured output
that the Supervisor passes to the Empathy Agent for integration into a response.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Optional

from models.contracts import ConversationState, LegalDoc
from services.rag_retriever import retrieve_legal_context

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Output contract
# ---------------------------------------------------------------------------

@dataclass
class LegalAgentResult:
    retrieved_docs: list[LegalDoc] = field(default_factory=list)
    response_text: str = ""
    has_verified_answer: bool = False
    source_citations: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Intent -> category mapping
# ---------------------------------------------------------------------------
_INTENT_TO_CATEGORY: dict[str, Optional[str]] = {
    "COMPENSATION": "compensation",
    "LEGAL_RIGHTS": "legal_rights",
    "LEGAL_PROCEDURE": "legal_procedure",
    "REHABILITATION": "rehabilitation",
    "EMERGENCY_CONTACT": "emergency_contact",
    "WELFARE_SCHEME": "welfare_scheme",
    "LEGAL_HELP": None,  # broad search across all categories
    "GENERAL_SUPPORT": None,
    "INFORMATION": None,
    "EMOTIONAL_SUPPORT": None,
    "EMERGENCY": "emergency_contact",
}

# Keywords that trigger legal retrieval even without explicit intent
_LEGAL_TRIGGER_KEYWORDS = frozenset([
    "compensation", "money", "amount", "how much", "payment",
    "rupees", "paisa", "scheme", "benefit", "rights", "legal",
    "court", "police", "fir", "advocate", "lawyer", "free",
    "muawaza", "hak", "adhikar", "nyay", "vakil",
    "ilaichiyam", "neethi", "vazhakku",
])


def _should_trigger(state: ConversationState) -> bool:
    """
    Decide whether legal retrieval is warranted for this turn.
    True if: intent is legal-related OR user message contains legal keywords.
    """
    if state.triage and state.triage.intent in (
        "LEGAL_HELP", "INFORMATION", "COMPENSATION", "LEGAL_RIGHTS",
        "LEGAL_PROCEDURE", "REHABILITATION",
    ):
        return True

    if state.transcript:
        user_turns = [t for t in state.transcript if t.speaker == "user"]
        if user_turns:
            text = user_turns[-1].transcript.lower()
            if any(kw in text for kw in _LEGAL_TRIGGER_KEYWORDS):
                return True
    return False


def _extract_query(state: ConversationState) -> str:
    """Extract the retrieval query from the latest user message."""
    user_turns = [t for t in state.transcript if t.speaker == "user"]
    if not user_turns:
        return ""
    return user_turns[-1].transcript


def _format_response(docs: list[LegalDoc]) -> tuple[str, list[str]]:
    """
    Format retrieved documents into a response text block and citation list.
    This block is injected into the Empathy Agent's context, not shown raw.
    """
    if not docs:
        return "", []

    parts = []
    citations = []
    for doc in docs[:3]:
        parts.append(
            f"According to {doc.source} ({doc.similarity:.0%} match):\n"
            f"{doc.content[:500]}"
        )
        citations.append(f"{doc.title} — {doc.source}")

    return "\n\n".join(parts), citations


async def run(state: ConversationState) -> tuple[ConversationState, LegalAgentResult]:
    """
    Run the Legal Agent. Retrieves relevant legal context and attaches it to
    state.retrieved_legal_context for the Empathy Agent and Supervisor.

    Returns (updated_state, LegalAgentResult).
    """
    result = LegalAgentResult()

    if not _should_trigger(state):
        logger.debug("Legal agent: no legal intent detected, skipping retrieval")
        return state, result

    query = _extract_query(state)
    if not query:
        return state, result

    # Determine category filter from triage intent
    category: Optional[str] = None
    if state.triage:
        category = _INTENT_TO_CATEGORY.get(state.triage.intent)

    logger.info("Legal agent: retrieving for query=%r category=%s", query[:60], category)

    docs = await retrieve_legal_context(query=query, category=category)

    if not docs:
        result.has_verified_answer = False
        result.response_text = (
            "I do not have verified information about that specific legal provision in "
            "my knowledge base right now. Please ask your assigned counsellor or the "
            "District Legal Services Authority (DLSA) — they can check your actual case file."
        )
        logger.info("Legal agent: no documents above confidence gate")
        return state, result

    response_text, citations = _format_response(docs)

    result.retrieved_docs = docs
    result.has_verified_answer = True
    result.response_text = response_text
    result.source_citations = citations

    # Attach docs to state for Empathy Agent to use
    state.retrieved_legal_context = docs

    logger.info(
        "Legal agent: found %d verified docs, top similarity=%.2f",
        len(docs), docs[0].similarity,
    )
    return state, result
