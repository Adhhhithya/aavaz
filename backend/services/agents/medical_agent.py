"""
backend/services/agents/medical_agent.py

Medical / Physical Stabilisation Agent.

Invoked by the Supervisor when the Triage Agent detects physical injuries, 
violence, or medical symptoms. It provides general stabilizing advice (e.g., 
first-aid steps) and recommends seeking immediate professional medical help.

THIS AGENT MUST NOT:
- Diagnose specific conditions based on symptoms.
- Prescribe medication.
- Provide any advice that replaces calling emergency services (108).
"""
from __future__ import annotations

import logging
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_groq import ChatGroq

from config import settings
from models.contracts import ConversationState

logger = logging.getLogger(__name__)

# Basic LangChain Groq client
_llm = ChatGroq(
    api_key=settings.GROQ_API_KEY,
    model_name="llama3-8b-8192",  # Fast model for standard advice
    temperature=0.1
)

MEDICAL_SYSTEM_PROMPT = """You are the Medical Stabilization Agent for the AAVAZ crisis support system.
Your role is to provide immediate, general physical safety and first-aid advice to victims of violence or abuse.

RULES:
1. NEVER diagnose conditions.
2. NEVER prescribe medication.
3. ALWAYS advise them to seek professional medical attention (e.g., calling 108 or going to a hospital) if they describe physical trauma, bleeding, or head injuries.
4. Keep your response brief, calm, and actionable.
5. If the user mentions being hit or injured, provide basic stabilizing advice (e.g., applying pressure to wounds, finding a safe place).

Focus ONLY on the physical/medical aspect of their statement. Another agent will handle legal or emotional support.
"""

async def run(state: ConversationState) -> ConversationState:
    """
    Executes the Medical Agent to provide stabilization advice.
    """
    if not state.transcript:
        return state

    latest_turn = state.transcript[-1]
    
    messages = [
        SystemMessage(content=MEDICAL_SYSTEM_PROMPT),
        HumanMessage(content=latest_turn.transcript)
    ]
    
    try:
        response = await _llm.ainvoke(messages)
        state.medical_advice = str(response.content)
        logger.info("Medical agent provided advice successfully.")
    except Exception as exc:
        logger.error(f"Medical agent failed: {exc}")
        state.medical_advice = "Please seek immediate professional medical attention if you are injured."

    return state
