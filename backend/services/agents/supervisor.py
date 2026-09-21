"""
backend/services/agents/supervisor.py

The LangGraph Supervisor Orchestrator.

Owns the single conversation turn loop using a LangGraph StateGraph.
Routes the user's transcript dynamically based on Triage classifications to 
the appropriate specialist agents (Medical, Legal, Escalation) before 
converging at Empathy for the final response.

DESIGN RULES:
  - The Supervisor is the ONLY writer of ConversationState.
  - Agents receive a copy of state and return a mutated copy; they do not hold
    private state and do not call each other directly.
  - The LLM is never the system of record. The DB (via Supabase) owns state.
"""
from __future__ import annotations

import logging
import asyncio
from typing import TypedDict, Any, List
from datetime import datetime, timezone
import uuid

from langgraph.graph import StateGraph, START, END

from models.contracts import (
    ASRResult,
    ConversationState,
    RiskLevel,
    Turn,
    TriageResult
)
from services.agents import triage_agent, empathy_agent, legal_agent, escalation_agent, medical_agent
from services.rag_retriever import retrieve_victim_memories, store_memory
from api.scoring.fusion import calculate_dynamic_score

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# LangGraph Nodes
# ---------------------------------------------------------------------------

async def triage_node(state: dict) -> dict:
    conv_state: ConversationState = state["conversation"]
    try:
        conv_state = await triage_agent.run(conv_state)
    except Exception as exc:
        logger.error("Triage agent failed: %s", exc)
        conv_state.triage = TriageResult(risk_level=RiskLevel.MEDIUM, confidence=0.0)
    return {"conversation": conv_state}

async def medical_node(state: dict) -> dict:
    conv_state: ConversationState = state["conversation"]
    try:
        conv_state = await medical_agent.run(conv_state)
    except Exception as exc:
        logger.error("Medical agent failed: %s", exc)
    return {"conversation": conv_state}

async def legal_and_memory_node(state: dict) -> dict:
    conv_state: ConversationState = state["conversation"]
    try:
        # Run memory and legal concurrently
        async def _run_legal():
            nonlocal conv_state
            conv_state, _ = await legal_agent.run(conv_state)

        async def _run_memory():
            nonlocal conv_state
            if conv_state.victim_id:
                try:
                    last_turn = conv_state.transcript[-1].transcript
                    memories = await retrieve_victim_memories(conv_state.victim_id, last_turn)
                    conv_state.memories = memories
                except Exception as e:
                    logger.error(f"Memory retrieval failed: {e}")

        await asyncio.gather(_run_legal(), _run_memory())
    except Exception as exc:
        logger.error("Legal/Memory node failed: %s", exc)
    return {"conversation": conv_state}

async def escalation_node(state: dict) -> dict:
    conv_state: ConversationState = state["conversation"]
    try:
        conv_state = await escalation_agent.run(conv_state)
    except Exception as exc:
        logger.error("Escalation agent failed: %s", exc)
    return {"conversation": conv_state}

async def score_and_empathy_node(state: dict) -> dict:
    conv_state: ConversationState = state["conversation"]
    
    # Run dynamic scoring (skip audio parsing here, assuming IVR did it, or just do text)
    try:
        last_turn = conv_state.transcript[-1]
        fusion_res = await calculate_dynamic_score(
            transcript=last_turn.transcript,
            language=conv_state.language
        )
        conv_state.distress = fusion_res
    except Exception as exc:
        logger.error(f"Fusion scoring failed in supervisor: {exc}")

    # Empathy synthesizes the final response
    try:
        conv_state, response_text = await empathy_agent.run(conv_state)
    except Exception as exc:
        logger.error("Empathy agent failed: %s", exc)
        response_text = "I'm having trouble processing that right now, but please know I am here to support you."
        
    state["response_text"] = response_text

    # Append agent turn
    agent_turn = Turn(
        conversation_id=conv_state.conversation_id,
        turn_id=f"turn_{conv_state.turn_id}_agent",
        speaker="agent",
        language=conv_state.language,
        transcript=response_text,
    )
    conv_state.transcript.append(agent_turn)

    # Fire and forget memory storage
    if conv_state.victim_id:
        from models.contracts import MemoryType
        asyncio.create_task(store_memory(
            victim_id=conv_state.victim_id,
            conversation_id=conv_state.conversation_id,
            memory_type=MemoryType.FOLLOW_UP,
            content=f"Agent responded: {response_text}"
        ))

    return {"conversation": conv_state, "response_text": response_text}

# ---------------------------------------------------------------------------
# LangGraph Routing Edges
# ---------------------------------------------------------------------------

def triage_router(state: dict) -> List[str]:
    """
    Dynamically route to specialists based on TriageResult.
    Returns a list of nodes to execute in parallel.
    """
    conv_state: ConversationState = state["conversation"]
    triage = conv_state.triage
    
    routes = []
    
    if triage.requires_escalation or triage.immediate_danger:
        return ["escalation"]
    
    if triage.requires_medical:
        return ["medical"]
        
    if triage.intent in ["LEGAL_HELP"] or triage.witness_intimidation_signal:
        return ["legal"]
        
    return ["empathy"]

# ---------------------------------------------------------------------------
# LangGraph Construction
# ---------------------------------------------------------------------------

class GraphState(TypedDict):
    conversation: ConversationState
    response_text: str

workflow = StateGraph(GraphState)

workflow.add_node("triage", triage_node)
workflow.add_node("medical", medical_node)
workflow.add_node("legal", legal_and_memory_node)
workflow.add_node("escalation", escalation_node)
workflow.add_node("empathy", score_and_empathy_node)

workflow.add_edge(START, "triage")

# Conditional fan-out from Triage
workflow.add_conditional_edges(
    "triage",
    triage_router,
    {
        "medical": "medical",
        "legal": "legal",
        "escalation": "escalation",
        "empathy": "empathy"
    }
)

# Fan-in from specialists back to Empathy
workflow.add_edge("medical", "empathy")
workflow.add_edge("legal", "empathy")
workflow.add_edge("escalation", "empathy")
workflow.add_edge("empathy", END)

app = workflow.compile()

# ---------------------------------------------------------------------------
# Public Execution Interface
# ---------------------------------------------------------------------------

def new_conversation(
    victim_id: Optional[str] = None, 
    case_id: Optional[str] = None,
    language: str = "en",
    channel: str = "chat"
) -> ConversationState:
    return ConversationState(
        conversation_id=f"conv_{uuid.uuid4().hex[:12]}",
        victim_id=victim_id,
        case_id=case_id,
        language=language,
        channel=channel,
        turn_id=0,
    )

async def execute_turn(
    state: ConversationState,
    user_text: str,
    audio_url: Optional[str] = None
) -> tuple[ConversationState, str]:
    """
    Main entrypoint. Injects the user turn and runs the LangGraph.
    """
    state.turn_id += 1
    turn_id = f"turn_{state.turn_id}"

    user_turn = Turn(
        conversation_id=state.conversation_id,
        turn_id=turn_id,
        speaker="user",
        language=state.language,
        transcript=user_text,
        audio_url=audio_url,
        created_at=datetime.now(timezone.utc),
    )
    state.transcript.append(user_turn)

    # Trim history
    _MAX_HISTORY = 10
    if len(state.transcript) > _MAX_HISTORY:
        state.transcript = state.transcript[-_MAX_HISTORY:]

    graph_state: GraphState = {"conversation": state, "response_text": ""}
    
    # Run the graph
    result_state = await app.ainvoke(graph_state)
    
    final_conv_state = result_state["conversation"]
    response_text = result_state["response_text"]

    return final_conv_state, response_text
