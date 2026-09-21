"""
backend/tests/test_multi_agent_flow.py

Integration tests for Phase 3: LangGraph Multi-Agent Orchestration (S6).

Tests verify that the LangGraph StateGraph correctly parses Triage flags and 
routes to the appropriate specialist nodes (Medical, Legal, Escalation) before 
converging at Empathy.
"""
from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, patch

from models.contracts import (
    ConversationState,
    RiskLevel,
    TriageResult,
    Turn,
)
from services.agents.supervisor import new_conversation, execute_turn

@pytest.mark.asyncio
async def test_langgraph_routes_to_medical_when_injured():
    """Triage detecting injuries should route to the Medical node."""
    state = new_conversation(victim_id="v1")

    # Mock the underlying agents so we don't hit the real LLM
    with patch("services.agents.supervisor.triage_agent.run", new_callable=AsyncMock) as mock_triage, \
         patch("services.agents.supervisor.medical_agent.run", new_callable=AsyncMock) as mock_medical, \
         patch("services.agents.supervisor.legal_agent.run", new_callable=AsyncMock) as mock_legal, \
         patch("services.agents.supervisor.empathy_agent.run", new_callable=AsyncMock) as mock_empathy:

        async def _mock_triage(s):
            s.triage = TriageResult(
                risk_level=RiskLevel.HIGH,
                requires_medical=True,
                intent="MEDICAL_HELP"
            )
            return s
        mock_triage.side_effect = _mock_triage

        async def _mock_medical(s):
            s.medical_advice = "Please go to the hospital."
            return s
        mock_medical.side_effect = _mock_medical

        async def _mock_empathy(s):
            return s, "I'm so sorry, " + (s.medical_advice or "")
        mock_empathy.side_effect = _mock_empathy

        final_state, response = await execute_turn(state, "He hit me with a stick and my arm is bleeding.")

        mock_triage.assert_called_once()
        mock_medical.assert_called_once()
        mock_legal.assert_not_called()
        mock_empathy.assert_called_once()

        assert "Please go to the hospital." in response


@pytest.mark.asyncio
async def test_langgraph_abusive_husband_scenario():
    """
    Blueprint Scenario: multi-turn simulating an abusive husband context where 
    Triage routes to Legal (threat to take kids), then back to Empathy.
    """
    state = new_conversation(victim_id="v1")

    with patch("services.agents.supervisor.triage_agent.run", new_callable=AsyncMock) as mock_triage, \
         patch("services.agents.supervisor.medical_agent.run", new_callable=AsyncMock) as mock_medical, \
         patch("services.agents.supervisor.legal_agent.run", new_callable=AsyncMock) as mock_legal, \
         patch("services.agents.supervisor.retrieve_victim_memories", new_callable=AsyncMock) as mock_mem, \
         patch("services.agents.supervisor.empathy_agent.run", new_callable=AsyncMock) as mock_empathy:
             
        # Mock Legal routing
        async def _mock_triage(s):
            s.triage = TriageResult(
                risk_level=RiskLevel.MEDIUM,
                intent="LEGAL_HELP",
                witness_intimidation_signal=True
            )
            return s
        mock_triage.side_effect = _mock_triage

        async def _mock_legal(s):
            # Simulate legal context injection
            from models.contracts import LegalDoc
            s.retrieved_legal_context = [LegalDoc(
                document_id="d1", title="Custody Rights", content="A mother cannot be forcibly separated...",
                source="BNS", category="custody", similarity=0.9
            )]
            return s, None
        mock_legal.side_effect = _mock_legal

        async def _mock_empathy(s):
            assert len(s.retrieved_legal_context) > 0
            return s, "Legally, he cannot take the kids."
        mock_empathy.side_effect = _mock_empathy

        mock_mem.return_value = []

        final_state, response = await execute_turn(state, "He is threatening to take the kids away from me if I complain.")

        mock_triage.assert_called_once()
        mock_legal.assert_called_once()
        mock_medical.assert_not_called()
        mock_empathy.assert_called_once()

        assert "Legally" in response
