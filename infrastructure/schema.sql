-- ============================================================================
-- AgentMemory schema -- CockroachDB Serverless
-- Long-term, durable system of record for agent memory.
-- Embeddings are 384-dim (Xenova/all-MiniLM-L6-v2, generated locally, $0 cost).
-- ============================================================================

CREATE DATABASE IF NOT EXISTS agent_memory;
SET DATABASE = agent_memory;

-- ----------------------------------------------------------------------------
-- memories: one row per durable fact/decision/preference an agent has learned.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS memories (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    content     TEXT NOT NULL,
    embedding   VECTOR(384) NOT NULL,
    summary     TEXT,
    tags        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    salience    FLOAT NOT NULL DEFAULT 0.5,
    status      TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'archived', 'deleted')),
    source      TEXT NOT NULL DEFAULT 'lambda'
                    CHECK (source IN ('lambda', 'mempalace_sync')),
    -- MemPalace's own local memory id, set only for rows written by the
    -- sync path. Used as an idempotency key so re-running sync after a
    -- partial failure updates in place instead of duplicating rows.
    mempalace_id TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotency key for the sync path: one CockroachDB row per
-- (user_id, mempalace_id) pair.
CREATE UNIQUE INDEX IF NOT EXISTS memories_mempalace_sync_idx
    ON memories (user_id, mempalace_id) WHERE mempalace_id IS NOT NULL;

-- Distributed vector index (C-SPANN), prefixed by user_id + status so every
-- search is scoped to one user's active memories. This is required both for
-- performance (a vector index is only used when every prefix column is
-- constrained to a specific value) and for tenant isolation.
-- vector_cosine_ops matches the sentence-embedding model's training objective.
CREATE VECTOR INDEX IF NOT EXISTS memories_embedding_idx
    ON memories (user_id, status, embedding vector_cosine_ops);

-- Supporting indexes for non-vector access patterns.
CREATE INDEX IF NOT EXISTS memories_session_idx
    ON memories (session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS memories_user_salience_idx
    ON memories (user_id, salience DESC) WHERE status = 'active';

-- ----------------------------------------------------------------------------
-- sessions: lightweight session/state tracking, one row per agent session.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      TEXT NOT NULL,
    session_data JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id, updated_at DESC);

-- ----------------------------------------------------------------------------
-- sync_cursor: idempotency bookkeeping for the MemPalace -> CockroachDB sync
-- job, so re-running sync after a partial failure never double-writes.
-- Pattern from the CockroachDB Agent Skills repo ("idempotent session
-- counters") -- see docs/skills-used.md.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_cursor (
    user_id           TEXT PRIMARY KEY,
    last_synced_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_mempalace_id TEXT
);

-- ----------------------------------------------------------------------------
-- Example query: top-5 semantically nearest active memories for a user.
--
-- SELECT id, content, summary, tags, created_at,
--        1 - (embedding <=> $1) AS similarity
-- FROM memories
-- WHERE user_id = $2 AND status = 'active'
-- ORDER BY embedding <=> $1
-- LIMIT 5;
-- ----------------------------------------------------------------------------
