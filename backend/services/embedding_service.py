"""
backend/services/embedding_service.py

BGE-M3 embedding provider (BAAI/bge-m3) with a lightweight mock fallback
for local development when the full model cannot be loaded (e.g. no GPU,
CI environment, no disk space).

Embedding dimension: 1024  (bge-m3 dense output)

Usage:
    from services.embedding_service import get_embedder, EmbeddingProvider

    embedder = get_embedder()
    vectors = await embedder.embed(["text one", "text two"])
    # -> list[list[float]], each inner list is length 1024

Why BGE-M3:
  - Multilingual: covers Hindi, Tamil, Malayalam, English (AAVAZ requirement)
  - State-of-the-art on Indian legal document retrieval
  - Single model handles both dense retrieval and re-ranking
  - 1024-d output matches Supabase pgvector column definition

The EmbeddingProvider protocol allows easy swap to OpenAI / Groq / local
alternatives without changing the RAG retriever.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
from typing import Protocol, runtime_checkable

import numpy as np

logger = logging.getLogger(__name__)

EMBEDDING_DIM = 1024
_MOCK_SEED = 42  # reproducible mock vectors keyed to text hash


# ---------------------------------------------------------------------------
# Provider protocol
# ---------------------------------------------------------------------------

@runtime_checkable
class EmbeddingProvider(Protocol):
    async def embed(self, texts: list[str]) -> list[list[float]]:
        """Return one embedding vector per input text."""
        ...

    @property
    def dimension(self) -> int:
        """Embedding output dimension."""
        ...


# ---------------------------------------------------------------------------
# BGE-M3 provider (real)
# ---------------------------------------------------------------------------

class BGEProvider:
    """
    Wraps BAAI/bge-m3 via sentence-transformers.

    The model is loaded once on first call (lazy initialisation) and then
    reused for all subsequent embed() calls. Inference runs in a thread pool
    to avoid blocking the async event loop.
    """

    def __init__(self, model_name: str = "BAAI/bge-m3") -> None:
        self._model_name = model_name
        self._model = None  # loaded lazily

    @property
    def dimension(self) -> int:
        return EMBEDDING_DIM

    def _load(self) -> None:
        if self._model is None:
            from sentence_transformers import SentenceTransformer
            logger.info("Loading embedding model %s (first call)", self._model_name)
            self._model = SentenceTransformer(self._model_name)

    def _encode_sync(self, texts: list[str]) -> list[list[float]]:
        self._load()
        # normalize_embeddings=True gives cosine-comparable unit vectors
        vecs = self._model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
        return [v.tolist() for v in vecs]

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._encode_sync, texts)


# ---------------------------------------------------------------------------
# Mock provider (dev / CI / no-GPU fallback)
# ---------------------------------------------------------------------------

class MockEmbeddingProvider:
    """
    Returns deterministic pseudo-random unit vectors derived from the text
    hash. Used when sentence-transformers is not installed or BGE-M3 cannot
    be loaded. Vectors are reproducible for the same input so that tests
    that rely on exact vector values work offline.

    IMPORTANT: These vectors are NOT semantically meaningful — do not use
    mock embeddings to test retrieval quality, only to test DB round-trips
    and API plumbing.
    """

    @property
    def dimension(self) -> int:
        return EMBEDDING_DIM

    async def embed(self, texts: list[str]) -> list[list[float]]:
        result = []
        for text in texts:
            # Seed RNG from a hash of the text for reproducibility
            seed = int(hashlib.md5(text.encode()).hexdigest(), 16) % (2**31)
            rng = np.random.default_rng(seed)
            vec = rng.standard_normal(EMBEDDING_DIM).astype(np.float32)
            vec /= np.linalg.norm(vec)  # unit normalise
            result.append(vec.tolist())
        return result


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

_provider: EmbeddingProvider | None = None


def get_embedder(force_mock: bool = False) -> EmbeddingProvider:
    """
    Return a cached EmbeddingProvider.

    Resolution order:
      1. MockEmbeddingProvider if force_mock=True
      2. MockEmbeddingProvider if sentence-transformers is not installed
      3. BGEProvider(BAAI/bge-m3)
    """
    global _provider
    if _provider is not None and not force_mock:
        return _provider

    if force_mock:
        _provider = MockEmbeddingProvider()
        logger.info("Using mock embedding provider (forced)")
        return _provider

    try:
        import sentence_transformers  # noqa: F401
        _provider = BGEProvider()
        logger.info("Using BGE-M3 embedding provider")
    except ImportError:
        _provider = MockEmbeddingProvider()
        logger.warning(
            "sentence-transformers not installed; using mock embedding provider. "
            "Install with: pip install sentence-transformers"
        )
    return _provider
