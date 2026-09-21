"""
backend/services/rag_retriever.py

Semantic retrieval over the two pgvector knowledge bases:

  1. victim_memory       - private per-victim context (emotional history,
                           past actions, follow-up items, etc.)
  2. legal_documents     - public SC/ST Act provisions, compensation tables,
                           welfare scheme eligibility, emergency contacts

ANTI-HALLUCINATION CONTRACT (non-negotiable):
  - Every legal claim returned to an agent MUST come from a retrieved document.
  - If the cosine similarity of the best match is below LEGAL_CONFIDENCE_GATE,
    the retriever returns an empty list rather than a low-confidence document.
  - Agents must surface the source citation alongside any legal fact.
  - The LLM is NEVER allowed to fill gaps with inferred legal information.

Confidence gate:
  LEGAL_CONFIDENCE_GATE = 0.72   (tunable via env var LEGAL_RAG_CONFIDENCE)
  MEMORY_CONFIDENCE_GATE = 0.55  (memories need a lower bar - context > accuracy)
"""
from __future__ import annotations

import logging
import os
from typing import Optional

from models.contracts import LegalDoc, MemoryChunk, MemoryType
from services.embedding_service import get_embedder
from services.supabase_client import get_supabase

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Tunable thresholds
# ---------------------------------------------------------------------------
LEGAL_CONFIDENCE_GATE: float = float(os.getenv("LEGAL_RAG_CONFIDENCE", "0.72"))
MEMORY_CONFIDENCE_GATE: float = float(os.getenv("MEMORY_RAG_CONFIDENCE", "0.55"))
MAX_LEGAL_RESULTS: int = 5
MAX_MEMORY_RESULTS: int = 8


# ---------------------------------------------------------------------------
# Legal document retrieval
# ---------------------------------------------------------------------------

async def retrieve_legal_context(
    query: str,
    category: Optional[str] = None,
    jurisdiction: str = "IN",
    top_k: int = MAX_LEGAL_RESULTS,
) -> list[LegalDoc]:
    """
    Retrieve relevant legal/scheme documents for a victim query.

    Returns an empty list (not an error) when:
      - No documents exceed LEGAL_CONFIDENCE_GATE similarity
      - pgvector extension is not available in Supabase
      - Embedding fails

    The Legal Agent must treat an empty list as "I do not have verified
    information on this" and say so explicitly, rather than synthesising
    an answer from LLM priors.
    """
    embedder = get_embedder()
    try:
        vectors = await embedder.embed([query])
        query_vector = vectors[0]
    except Exception as exc:
        logger.error("Embedding failed for legal query: %s", exc)
    try:
        supabase = await get_supabase()
        params: dict = {
            "query_embedding": query_vector,
            "match_threshold": 1.0 - LEGAL_CONFIDENCE_GATE,  # distance threshold
            "match_count": top_k,
        }
        if category:
            params["filter_category"] = category

        rpc_resp = await supabase.rpc("match_legal_documents", params).execute()

        if not rpc_resp.data:
            return []

        docs: list[LegalDoc] = []
        for row in rpc_resp.data:
            similarity = 1.0 - float(row.get("distance", 1.0))
            if similarity < LEGAL_CONFIDENCE_GATE:
                continue
            docs.append(LegalDoc(
                document_id=str(row["id"]),
                title=row["title"],
                content=row["content"],
                source=row["source"],
                category=row["category"],
                jurisdiction=row.get("jurisdiction", "IN"),
                language=row.get("language", "en"),
                similarity=round(similarity, 4),
                citation=row.get("source"),
            ))

        logger.info(
            "Legal RAG: query=%r returned %d/%d docs above gate=%.2f",
            query[:60], len(docs), top_k, LEGAL_CONFIDENCE_GATE,
        )
        return docs

    except Exception as exc:
        # pgvector RPC not available (local dev without migration): return empty
        logger.warning(
            "Legal RAG RPC failed (%s) - pgvector may not be set up. "
            "Run migrations/004_vector_memory_legal.sql in Supabase.",
            exc,
        )
        return []


# ---------------------------------------------------------------------------
# Victim memory retrieval
# ---------------------------------------------------------------------------

async def retrieve_victim_memories(
    victim_id: str,
    query: str,
    memory_types: Optional[list[MemoryType]] = None,
    top_k: int = MAX_MEMORY_RESULTS,
) -> list[MemoryChunk]:
    """
    Retrieve the most semantically relevant memories for this victim.

    Always filters by victim_id first (security boundary: a victim can only
    retrieve their own memories). The pgvector similarity search then ranks
    within that filtered set.

    Returns an empty list gracefully on any infrastructure failure.
    """
    embedder = get_embedder()
    try:
        vectors = await embedder.embed([query])
        query_vector = vectors[0]
    except Exception as exc:
        logger.error("Embedding failed for memory query: %s", exc)
        return []

    try:
        supabase = await get_supabase()
        params: dict = {
            "victim_id_filter": victim_id,
            "query_embedding": query_vector,
            "match_threshold": 1.0 - MEMORY_CONFIDENCE_GATE,
            "match_count": top_k,
        }
        if memory_types:
            params["memory_type_filter"] = [m.value for m in memory_types]

        rpc_resp = await supabase.rpc("match_victim_memories", params).execute()

        if not rpc_resp.data:
            return []

        chunks: list[MemoryChunk] = []
        for row in rpc_resp.data:
            similarity = 1.0 - float(row.get("distance", 1.0))
            if similarity < MEMORY_CONFIDENCE_GATE:
                continue
            chunks.append(MemoryChunk(
                id=str(row["id"]),
                victim_id=victim_id,
                conversation_id=row.get("conversation_id", ""),
                memory_type=MemoryType(row["memory_type"]),
                content=row["content"],
                metadata=row.get("metadata", {}),
                similarity_score=round(similarity, 4),
            ))

        logger.info(
            "Memory RAG: victim=%s query=%r returned %d memories",
            victim_id[:8], query[:60], len(chunks),
        )
        return chunks

    except Exception as exc:
        logger.warning("Memory RAG RPC failed (%s)", exc)
        return []


# ---------------------------------------------------------------------------
# Memory persistence
# ---------------------------------------------------------------------------

async def store_memory(
    victim_id: str,
    conversation_id: str,
    memory_type: MemoryType,
    content: str,
    metadata: Optional[dict] = None,
) -> bool:
    """
    Embed and persist a single memory chunk.
    Called by the Supervisor after each agent turn when memory-worthy
    content is identified.

    Returns True on success, False on any failure (non-fatal).
    """
    embedder = get_embedder()
    try:
        vectors = await embedder.embed([content])
        embedding = vectors[0]
    except Exception as exc:
        logger.error("Failed to embed memory content: %s", exc)
        return False

    try:
        supabase = await get_supabase()
        await supabase.table("victim_memory").insert({
            "victim_id": victim_id,
            "conversation_id": conversation_id,
            "memory_type": memory_type.value,
            "content": content,
            "metadata": metadata or {},
            "embedding": embedding,
        }).execute()
        return True
    except Exception as exc:
        logger.error("Failed to store memory: %s", exc)
        return False
