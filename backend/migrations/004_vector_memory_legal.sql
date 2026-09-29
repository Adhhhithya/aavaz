-- migration 004: Vector memory & legal RAG tables
-- Run in Supabase SQL Editor after enabling the pgvector extension.
--
-- Prerequisites:
--   CREATE EXTENSION IF NOT EXISTS vector;
--
-- These two tables are deliberately kept SEPARATE:
--   victim_memory   : private per-victim, access-controlled by victim_id
--   legal_documents : public knowledge base, no PII, readable by all services
--
-- Access policy: application-layer, not RLS (consistent with project pattern).
-- All victim_memory queries MUST include a .eq("victim_id", ...) predicate.

-- Enable pgvector (idempotent)
CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------------
-- 1. victim_memory
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS victim_memory (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    victim_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id TEXT NOT NULL,
    memory_type     TEXT NOT NULL CHECK (memory_type IN (
                        'IDENTITY','INCIDENT','EMOTIONAL_STATE','SAFETY_RISK',
                        'PREVIOUS_ACTION','LEGAL_CONTEXT','PREFERENCE','FOLLOW_UP'
                    )),
    content         TEXT NOT NULL,           -- PII-scrubbed summary
    metadata        JSONB DEFAULT '{}',
    embedding       VECTOR(1024),            -- BAAI/bge-m3 output dimension
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_victim_memory_victim_id
    ON victim_memory (victim_id);

CREATE INDEX IF NOT EXISTS idx_victim_memory_type
    ON victim_memory (victim_id, memory_type);

-- IVFFlat index for fast approximate nearest-neighbour search.
-- lists=100 is a reasonable starting point; tune to sqrt(row_count) in prod.
CREATE INDEX IF NOT EXISTS idx_victim_memory_embedding
    ON victim_memory USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- ---------------------------------------------------------------------------
-- 2. legal_documents
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS legal_documents (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source       TEXT NOT NULL,              -- e.g. "MoSJE Schedule I Rule 12(4)"
    title        TEXT NOT NULL,
    category     TEXT NOT NULL CHECK (category IN (
                     'compensation','legal_procedure','welfare_scheme',
                     'legal_rights','emergency_contact','rehabilitation'
                 )),
    jurisdiction TEXT NOT NULL DEFAULT 'IN',
    language     TEXT NOT NULL DEFAULT 'en',
    content      TEXT NOT NULL,
    metadata     JSONB DEFAULT '{}',
    embedding    VECTOR(1024),
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_legal_documents_category
    ON legal_documents (category);

CREATE INDEX IF NOT EXISTS idx_legal_documents_jurisdiction
    ON legal_documents (jurisdiction, category);

CREATE INDEX IF NOT EXISTS idx_legal_documents_embedding
    ON legal_documents USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 50);

-- ---------------------------------------------------------------------------
-- 3. RPC Vector Similarity Functions for RAG
-- ---------------------------------------------------------------------------

-- Match Legal Documents via Cosine Distance
CREATE OR REPLACE FUNCTION match_legal_documents(
    query_embedding VECTOR(1024),
    match_threshold FLOAT DEFAULT 0.28,
    match_count INT DEFAULT 5,
    filter_category TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    title TEXT,
    content TEXT,
    source TEXT,
    category TEXT,
    jurisdiction TEXT,
    language TEXT,
    distance FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ld.id,
        ld.title,
        ld.content,
        ld.source,
        ld.category,
        ld.jurisdiction,
        ld.language,
        (ld.embedding <=> query_embedding)::FLOAT AS distance
    FROM legal_documents ld
    WHERE (filter_category IS NULL OR ld.category = filter_category)
      AND (ld.embedding IS NULL OR (ld.embedding <=> query_embedding) <= match_threshold)
    ORDER BY (ld.embedding <=> query_embedding) ASC
    LIMIT match_count;
END;
$$;

-- Match Victim Memories via Cosine Distance
CREATE OR REPLACE FUNCTION match_victim_memories(
    victim_id_filter UUID,
    query_embedding VECTOR(1024),
    match_threshold FLOAT DEFAULT 0.45,
    match_count INT DEFAULT 8,
    memory_type_filter TEXT[] DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    conversation_id TEXT,
    memory_type TEXT,
    content TEXT,
    metadata JSONB,
    distance FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        vm.id,
        vm.conversation_id,
        vm.memory_type,
        vm.content,
        vm.metadata,
        (vm.embedding <=> query_embedding)::FLOAT AS distance
    FROM victim_memory vm
    WHERE vm.victim_id = victim_id_filter
      AND (memory_type_filter IS NULL OR vm.memory_type = ANY(memory_type_filter))
      AND (vm.embedding IS NULL OR (vm.embedding <=> query_embedding) <= match_threshold)
    ORDER BY (vm.embedding <=> query_embedding) ASC
    LIMIT match_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Enable Realtime Publications
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'cases'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE cases;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sos_events'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE sos_events;
    END IF;
EXCEPTION
    WHEN undefined_object THEN NULL;
END $$;


