"""
backend/tests/test_rag_retrieval.py

Tests for Phase 2: BGE-M3 embedding service and RAG retrieval.

Tests use the MockEmbeddingProvider (no actual model download) to verify:
  1. Embedding provider protocol is implemented correctly
  2. Mock vectors are deterministic (same text -> same vector)
  3. Mock vectors are unit-normalised (required for cosine similarity)
  4. get_embedder() returns mock when force_mock=True
  5. Confidence gate enforcement (RAG retriever returns empty on low similarity)
"""
import math
import pytest

from services.embedding_service import (
    get_embedder,
    MockEmbeddingProvider,
    EMBEDDING_DIM,
)


# ---------------------------------------------------------------------------
# Embedding provider tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_mock_provider_returns_correct_dimension():
    provider = MockEmbeddingProvider()
    vectors = await provider.embed(["test text"])
    assert len(vectors) == 1
    assert len(vectors[0]) == EMBEDDING_DIM


@pytest.mark.asyncio
async def test_mock_provider_is_deterministic():
    """Same input must always produce the same vector."""
    provider = MockEmbeddingProvider()
    v1 = await provider.embed(["victim compensation amount"])
    v2 = await provider.embed(["victim compensation amount"])
    assert v1 == v2


@pytest.mark.asyncio
async def test_mock_provider_different_texts_produce_different_vectors():
    provider = MockEmbeddingProvider()
    v1 = await provider.embed(["help me please"])
    v2 = await provider.embed(["legal rights for SC/ST victims"])
    assert v1 != v2


@pytest.mark.asyncio
async def test_mock_provider_is_unit_normalised():
    """Vectors must have L2 norm = 1.0 (required for cosine similarity in pgvector)."""
    provider = MockEmbeddingProvider()
    texts = ["I need help", "what is the compensation amount", "danger"]
    vectors = await provider.embed(texts)
    for vec in vectors:
        norm = math.sqrt(sum(x * x for x in vec))
        assert abs(norm - 1.0) < 1e-5, f"Vector norm is {norm}, expected 1.0"


@pytest.mark.asyncio
async def test_mock_provider_handles_empty_input():
    provider = MockEmbeddingProvider()
    vectors = await provider.embed([])
    assert vectors == []


@pytest.mark.asyncio
async def test_mock_provider_handles_multiple_texts():
    provider = MockEmbeddingProvider()
    texts = ["text one", "text two", "text three"]
    vectors = await provider.embed(texts)
    assert len(vectors) == 3
    assert all(len(v) == EMBEDDING_DIM for v in vectors)


def test_get_embedder_with_force_mock_returns_mock():
    import services.embedding_service as em
    em._provider = None  # reset cache
    provider = get_embedder(force_mock=True)
    assert isinstance(provider, MockEmbeddingProvider)
    em._provider = None  # clean up


def test_embedding_provider_dimension_property():
    provider = MockEmbeddingProvider()
    assert provider.dimension == EMBEDDING_DIM


# ---------------------------------------------------------------------------
# Memory type correctness
# ---------------------------------------------------------------------------

def test_memory_types_cover_all_required_categories():
    """Ensure all 8 required memory types are present in the enum."""
    from models.contracts import MemoryType
    required = {
        "IDENTITY", "INCIDENT", "EMOTIONAL_STATE", "SAFETY_RISK",
        "PREVIOUS_ACTION", "LEGAL_CONTEXT", "PREFERENCE", "FOLLOW_UP"
    }
    defined = {m.value for m in MemoryType}
    assert required.issubset(defined), f"Missing memory types: {required - defined}"


# ---------------------------------------------------------------------------
# Legal confidence gate - unit test without DB
# ---------------------------------------------------------------------------

def test_legal_confidence_gate_value():
    """Confidence gate must be >= 0.70 to prevent low-quality legal retrieval."""
    from services.rag_retriever import LEGAL_CONFIDENCE_GATE
    assert LEGAL_CONFIDENCE_GATE >= 0.70, (
        f"Legal confidence gate {LEGAL_CONFIDENCE_GATE} is below minimum 0.70"
    )


def test_memory_confidence_gate_value():
    from services.rag_retriever import MEMORY_CONFIDENCE_GATE
    assert 0.40 <= MEMORY_CONFIDENCE_GATE <= 0.80


# ---------------------------------------------------------------------------
# LegalDoc contract
# ---------------------------------------------------------------------------

def test_legal_doc_similarity_must_be_in_range():
    from models.contracts import LegalDoc
    import pytest
    with pytest.raises(Exception):
        LegalDoc(
            document_id="x", title="t", content="c",
            source="s", category="c", similarity=1.5,  # out of range
        )


def test_legal_doc_valid():
    from models.contracts import LegalDoc
    doc = LegalDoc(
        document_id="abc",
        title="Compensation Schedule",
        content="Section 12(4)...",
        source="SC/ST PoA Rules 1995",
        category="compensation",
        similarity=0.87,
    )
    assert doc.similarity == 0.87
    assert doc.jurisdiction == "IN"
    assert doc.language == "en"


# ---------------------------------------------------------------------------
# Legal Context Injection Validation (S7)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_legal_context_injected_into_empathy_prompt():
    """Verify that retrieved legal documents are injected into the Empathy system prompt."""
    from services.agents import empathy_agent
    from models.contracts import ConversationState, Turn
    from services.agents.supervisor import new_conversation

    state = new_conversation(victim_id="v1")
    state.transcript.append(Turn(
        conversation_id=state.conversation_id,
        turn_id="t1",
        speaker="user",
        transcript="What is Section 85 of BNS?"
    ))

    # Simulate retrieved legal context
    from models.contracts import LegalDoc
    state.retrieved_legal_context = [
        LegalDoc(
            document_id="bns_85",
            title="BNS Section 85",
            content="Husband or relative of husband of a woman subjecting her to cruelty...",
            source="Bharatiya Nyaya Sanhita",
            category="criminal_law",
            similarity=0.98
        )
    ]

    from unittest.mock import AsyncMock, patch

    # Mock the Groq client inside empathy_agent
    with patch("services.agents.empathy_agent._groq.chat.completions.create", new_callable=AsyncMock) as mock_groq:
        class MockChoice:
            class MockMessage:
                content = "According to Section 85 of BNS..."
            message = MockMessage()
        
        class MockResponse:
            choices = [MockChoice()]
            class MockUsage:
                total_tokens = 100
            usage = MockUsage()

        mock_groq.return_value = MockResponse()

        state, response_text = await empathy_agent.run(state)

        # Ensure the LLM was called
        mock_groq.assert_called_once()
        
        # Verify the legal string was injected into the system prompt block
        messages_sent = mock_groq.call_args.kwargs['messages']
        system_prompt = messages_sent[0]['content']
        
        assert "Husband or relative of husband of a woman subjecting her to cruelty" in system_prompt
