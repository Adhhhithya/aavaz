import pytest
from models.contracts import ConversationState
from services.agents.supervisor import new_conversation

def test_conversation_state_null_safety():
    """Ensure ConversationState coerces None values to robust defaults."""
    state = ConversationState(
        conversation_id="test_conv",
        submitter_role=None,
        language=None,
        channel=None,
        history_score=None,
    )
    assert state.submitter_role == "victim"
    assert state.language == "en"
    assert state.channel == "chat"
    assert state.history_score == 0.0

def test_new_conversation_null_safety():
    """Ensure new_conversation helper handles None arguments safely."""
    state = new_conversation(
        victim_id="vic_123",
        case_id=None,
        language=None,
        channel=None,
        submitter_role=None,
        history_score=None,
    )
    assert state.submitter_role == "victim"
    assert state.language == "en"
    assert state.channel == "chat"
    assert state.history_score == 0.0
