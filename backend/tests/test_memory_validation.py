"""
backend/tests/test_memory_validation.py

Integration tests for Phase 2: Memory Retrieval & Context Injection (S7).

Verifies that retrieved memories are properly appended to the Empathy Agent's
LLM context window so it can "remember" the conversation history.
"""
import pytest
from unittest.mock import AsyncMock, patch
from models.contracts import ConversationState, Turn, MemoryChunk, MemoryType
from services.agents.supervisor import new_conversation

@pytest.mark.asyncio
async def test_memory_injected_into_empathy_prompt():
    """Verify that memories retrieved by the RAG engine are injected into the Empathy system prompt."""
    from services.agents import empathy_agent

    state = new_conversation(victim_id="v1")
    state.transcript.append(Turn(
        conversation_id=state.conversation_id,
        turn_id="t1",
        speaker="user",
        transcript="I have a court hearing tomorrow."
    ))

    # Simulate retrieved memory
    state.memories = [
        MemoryChunk(
            id="mem1",
            victim_id="v1",
            conversation_id="old_conv",
            memory_type=MemoryType.INCIDENT,
            content="Victim stated their hearing is at District Court 4.",
            similarity_score=0.95
        )
    ]

    # Mock the Groq client inside empathy_agent
    with patch("services.agents.empathy_agent._groq.chat.completions.create", new_callable=AsyncMock) as mock_groq:
        class MockChoice:
            class MockMessage:
                content = "Good luck at District Court 4 tomorrow."
            message = MockMessage()
        
        class MockResponse:
            choices = [MockChoice()]
            class MockUsage:
                total_tokens = 50
            usage = MockUsage()

        mock_groq.return_value = MockResponse()

        state, response_text = await empathy_agent.run(state)

        # Ensure the LLM was called
        mock_groq.assert_called_once()
        
        # Verify the memory string was injected into the system prompt block
        messages_sent = mock_groq.call_args.kwargs['messages']
        system_prompt = messages_sent[0]['content']
        
        assert "Victim stated their hearing is at District Court 4." in system_prompt
