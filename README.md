**AgentMemory** is a hybrid memory system for AI agents that combines fast local session memory with durable, globally distributed long-term memory. It was submitted for the **CockroachDB × AWS Hackathon** (Build with Agentic Memory).

---

## Core Concept

Most agent memory demos are either a vector DB with no session-layer speed, or an in-memory buffer that evaporates on restart. AgentMemory solves both by pairing **MemPalace** (local, zero-cost session memory) with **CockroachDB** (durable, globally distributed long-term memory).

| Need | Local-only | DB-only | AgentMemory |
|---|---|---|---|
| Sub-ms recall within a session | ✅ | ❌ | ✅ (MemPalace) |
| Survives restarts / multi-user | ❌ | ✅ | ✅ (CockroachDB) |
| Zero-cost hot-path reads | ✅ | ❌ | ✅ |
| Durable, queryable, multi-region | ❌ | ✅ | ✅ |
| Semantic search across all history | partial | ✅ | ✅ |

**MemPalace** handles the working set — recent turns, decisions, and facts an agent needs *right now*, via local ChromaDB-backed semantic search at zero API cost. **CockroachDB** is the system of record: memories above a salience threshold are embedded and upserted into CockroachDB, indexed with its native `VECTOR` type and C-SPANN distributed vector index. A new session can "wake up" pre-loaded with a user's highest-salience long-term memories instead of starting cold.

---

## Architecture

```
Claude Code / Claude API (Your Agent)
  |
  |-- MemPalace (local, session memory, $0)
  |     mempalaceSearch / mempalaceStore / mempalaceWakeUp
  |     (ChromaDB-backed, zero API cost, instant recall)
  |
  `-- MCP Protocol (direct, no servers) --> CockroachDB Cloud
        Managed MCP
        memories table VECTOR(384)
        C-SPANN distributed vector index
        sessions + sync_cursor tables
        (50M RUs/month free)
```

**Why no Lambda?** CockroachDB's Managed MCP Server lets Claude Code query the database directly. Sync jobs can run locally or on a scheduled task. No Lambda cold starts, no API Gateway latency, no server infrastructure to maintain.

---

## CockroachDB Tools Used

- **CockroachDB Cloud Managed MCP Server** — Claude Code connects directly to the cluster via MCP for schema inspection, vector search, and memory queries (`mcp-config.json`).
- **Distributed Vector Indexing (C-SPANN)** — the `memories` table indexes a 384-dim `VECTOR` column, prefixed by `user_id, status`, so every semantic search is scoped to one user and stays fast into the millions of rows (`infrastructure/schema.sql`).
- **PostgreSQL Protocol** — direct connection via `psql` for schema management and ad-hoc queries.

---

## AWS Services Used

- **Amazon S3 (Optional)** — 5GB free tier for storing logs and memory exports. Used for agent behavior logs, memory snapshots for analysis, and audit trails. **The core system requires only CockroachDB Cloud (free tier)**; S3 is entirely optional.

---

## Project Structure

```
cockroachdb-x-aws-hackathon/
├── src/
│   └── mempalace/
│       └── config.yaml          # MemPalace settings
├── infrastructure/
│   ├── schema.sql               # CockroachDB DDL, C-SPANN vector index
│   └── terraform/               # Legacy Lambda setup (optional reference)
├── scripts/
│   ├── setup-cockroachdb.ps1    # Initialize CockroachDB schema
│   ├── setup-mempalace.ps1      # Initialize local memory
│   └── test-integration.js      # Verify system setup
├── docs/
│   ├── QUICK-START.md           # 5-minute setup guide
│   ├── MCP-SETUP.md             # Configure Claude Code MCP
│   ├── architecture.md          # Design & rationale
│   ├── skills-used.md           # CockroachDB features applied
│   ├── RESULTS.md               # What works, known limitations
│   └── demo-script.md           # <3 min demo
├── mcp-config.json              # CockroachDB MCP configuration
├── .env.example                 # Configuration template
├── README.md
└── LICENSE
```

**No Lambda code, no API Gateway config, no Terraform variables needed.** All memory operations go directly through MCP to CockroachDB.

---

## Getting Started (~5 minutes, no AWS credentials required)

1. **Set up CockroachDB (1 min)** — Sign up at https://cockroachlabs.cloud (free, no credit card), create a Serverless (Basic) cluster, copy the connection string, and paste it into `.env` as `COCKROACH_DB_URL`.
2. **Initialize Database Schema (2 min)** — Run `.\scripts\setup-cockroachdb.ps1` or `psql $env:COCKROACH_DB_URL < infrastructure/schema.sql`.
3. **Initialize MemPalace (1 min)** — `pip install mempalace` then `.\scripts\setup-mempalace.ps1`.
4. **Test Everything (1 min)** — `npm install` (if needed) then `node scripts/test-integration.js`. Expected output: `✅ All tests passed! Your system is ready.`
5. **Connect Claude Code via MCP** — See `docs/MCP-SETUP.md` for configuring Claude Code to use CockroachDB via MCP.

---

## Judging Criteria Addressed

- **Agentic Memory Design** — CockroachDB is the durability and multi-user boundary for memory, with MemPalace handling the ephemeral fast path. MCP integration lets Claude Code access both seamlessly.
- **Technical Implementation** — Vector index prefixed by `user_id, status` per CockroachDB's multi-tenancy guidance; embeddings generated locally ($0, no external API); direct PostgreSQL protocol with connection pooling.
- **Real-World Impact** — Solves cross-session, cross-device memory loss without forcing every read through a network round trip.
- **Production Readiness** — Parameterized SQL, connection pooling, idempotent writes, structured logging, MCP protocol for safe queries; leverages CockroachDB's built-in redundancy and failover.
- **Creativity & Originality** — Local/global split using MCP, plus a wake-up path that lets a new session start warm instead of cold.
- **AWS Requirement** — Optional S3 integration for archiving and exporting memory snapshots without changing core logic.

---

## Known Limitations

- CockroachDB's current vector index only accelerates queries that constrain **every prefix column** (here, `user_id` and `status`).
- The free-tier connection limit caps Lambda concurrency without RDS Proxy-style pooling in front of it.

---

## License

MIT — see `LICENSE`.
