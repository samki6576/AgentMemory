# AgentMemory — Hybrid Local + Distributed Memory for AI Agents

**Submission for: CockroachDB × AWS Hackathon — Build with Agentic Memory**
**Deadline:** August 18, 2026

> Memory is not an afterthought — it's what makes an agent useful in production.

AgentMemory pairs **MemPalace** (fast, local, zero-cost session memory) with
**CockroachDB** (durable, globally distributed long-term memory), connected via
**CockroachDB's Managed MCP Server**. Short-lived context stays local and free;
anything worth remembering across sessions, users, or regions is written
through to CockroachDB, where it becomes searchable via native distributed
vector indexing. **No Lambda, no API Gateway, no server maintenance required.**

## Why this architecture

Most "agent memory" demos are either (a) a vector DB with no session-layer
speed, or (b) an in-memory buffer that evaporates on restart. Neither
reflects how production agents actually behave:

| Need | Local-only | DB-only | AgentMemory (hybrid) |
|---|---|---|---|
| Sub-ms recall within a session | ✅ | ❌ | ✅ (MemPalace) |
| Survives restarts / multi-user | ❌ | ✅ | ✅ (CockroachDB) |
| Zero-cost hot-path reads | ✅ | ❌ | ✅ |
| Durable, queryable, multi-region | ❌ | ✅ | ✅ |
| Semantic search across all history | partial | ✅ | ✅ |

MemPalace handles the *working set* — the last N turns, decisions, and facts
an agent needs *right now*, at zero API cost via local ChromaDB-backed
semantic search. CockroachDB is the *system of record*: every memory that
should survive a restart, be shared across a user's sessions, or be queried
globally is written through to it, indexed with CockroachDB's native
`VECTOR` type and C-SPANN distributed vector index.

A background sync job reconciles the two: MemPalace memories above a
salience threshold are embedded and upserted into CockroachDB; a new
session can "wake up" pre-loaded with a user's highest-salience long-term
memories instead of starting cold.

## Architecture

Full diagram and write-up: [`docs/architecture.md`](docs/architecture.md).

```
Claude Code / Claude API (Your Agent)
   |
   |-- MemPalace (local, session memory, $0)
   |       mempalaceSearch / mempalaceStore / mempalaceWakeUp
   |       (ChromaDB-backed, zero API cost, instant recall)
   |
   `-- MCP Protocol (direct, no servers) --> CockroachDB Cloud Managed MCP
                                               memories table VECTOR(384)
                                               C-SPANN distributed vector index
                                               sessions + sync_cursor tables
                                               (50M RUs/month free)
```

**Why no Lambda?** CockroachDB's Managed MCP Server lets Claude Code query the database 
directly. Sync jobs can run locally or on a scheduled task. No Lambda cold starts, 
no API Gateway latency, no server infrastructure to maintain.

## CockroachDB tools used

- **CockroachDB Cloud Managed MCP Server** — Claude Code connects directly to 
  your cluster via MCP for schema inspection, vector search, and memory queries 
  (`mcp-config.json`). No Lambda required.
- **CockroachDB Distributed Vector Indexing (C-SPANN)** — the `memories`
  table indexes a 384-dim `VECTOR` column, prefixed by `user_id, status`, so
  every semantic search is scoped to one user and stays fast into the
  millions of rows (`infrastructure/schema.sql`).
- **PostgreSQL Protocol** — direct connection via `psql` for schema management 
  and ad-hoc queries. All tools are standard Postgres-compatible.

## AWS services used

- **Amazon S3 (Optional)** — 5GB free tier for storing logs and memory exports. 
  Minimal setup, not required for core functionality. Use for:
  - Agent behavior logs
  - Memory snapshots for analysis
  - Audit trails
  
**Core system requires only CockroachDB Cloud (free tier).** AWS S3 is entirely optional and used only for logging/archival.

## Project structure

```
cockroachdb-x-aws-hackathon/
├── src/
│   └── mempalace/
│       └── config.yaml           # MemPalace settings (local memory)
├── infrastructure/
│   ├── schema.sql                # CockroachDB DDL, C-SPANN vector index
│   └── terraform/                # Legacy Lambda setup (optional reference)
├── scripts/
│   ├── setup-cockroachdb.ps1     # Initialize CockroachDB schema
│   ├── setup-mempalace.ps1       # Initialize local memory
│   └── test-integration.js       # Verify system setup
├── docs/
│   ├── QUICK-START.md            # 5-minute setup guide
│   ├── MCP-SETUP.md              # Configure Claude Code MCP
│   ├── architecture.md           # Design & rationale
│   ├── skills-used.md            # CockroachDB features applied
│   ├── RESULTS.md                # What works, known limitations
│   └── demo-script.md            # <3 min demo
├── mcp-config.json               # CockroachDB MCP configuration
├── .env.example                  # Configuration template
├── README.md                      # This file
└── LICENSE
```

**No Lambda code, no API Gateway config, no Terraform variables needed.**
All memory operations go directly through MCP to CockroachDB.

## Getting started

**Total setup time: ~5 minutes. No AWS credentials required.**

### Quick Start (5 minutes)

For a complete walkthrough, see [`docs/QUICK-START.md`](docs/QUICK-START.md).

#### 1. Set up CockroachDB (1 min)

- Sign up at https://cockroachlabs.cloud (free, no credit card)
- Create a Serverless (Basic) cluster
- Copy your connection string

```powershell
# Copy .env template
Copy-Item .env.example .env

# Edit .env and paste your CockroachDB connection string as COCKROACH_DB_URL
code .env
```

#### 2. Initialize Database Schema (2 min)

```powershell
# Windows/PowerShell:
.\scripts\setup-cockroachdb.ps1

# Or manually with psql:
psql $env:COCKROACH_DB_URL < infrastructure/schema.sql
```

#### 3. Initialize MemPalace (1 min)

```powershell
# Install if needed
pip install mempalace

# Set up local memory
.\scripts\setup-mempalace.ps1
```

#### 4. Test Everything (1 min)

```powershell
# Verify integration
npm install  # if needed
node scripts/test-integration.js
```

Expected output:
```
✅ All tests passed! Your system is ready.
```

#### 5. Connect Claude Code (via MCP)

See [`docs/MCP-SETUP.md`](docs/MCP-SETUP.md) for configuring Claude Code to 
use CockroachDB via MCP. One-time setup, then all memories are automatically 
stored and searchable.

## Judging criteria — how this submission addresses them

- **Agentic Memory Design** — CockroachDB isn't a bolted-on vector store; it
  is the durability and multi-user boundary for memory, with MemPalace
  handling the ephemeral fast path. The MCP server integration lets Claude
  Code access both seamlessly. See `docs/architecture.md`.
  
- **Technical Implementation** — the vector index is prefixed by `user_id,
  status` per CockroachDB's own multi-tenancy guidance, embeddings are
  generated locally (no external API dependency, no key management, $0),
  and the system uses direct PostgreSQL protocol connections with 
  connection pooling.
  
- **Real-World Impact** — solves cross-session, cross-device memory loss
  without forcing every read through a network round trip. Agents retain
  context across restarts and multi-user scenarios at zero per-query cost.
  
- **Production Readiness** — parameterized SQL, connection pooling, idempotent
  writes, structured logging, MCP protocol for safe queries. Leverages 
  CockroachDB's built-in redundancy and automatic failover.
  
- **Creativity & Originality** — the local/global split using MCP, plus a 
  wake-up path that lets a new session start warm instead of cold. Direct 
  database access via MCP removes Lambda complexity while maintaining safety 
  and performance.
  
- **AWS Requirement** — while the core system uses CockroachDB, optional 
  S3 integration provides a clean way to archive and export memory snapshots, 
  and can be added without changing core logic.

## Known limitations

See [`docs/RESULTS.md`](docs/RESULTS.md) — most notably, CockroachDB's
current vector index only accelerates queries that constrain every prefix
column (here, `user_id` and `status`), and the free-tier connection limit
caps Lambda concurrency without RDS Proxy-style pooling in front of it.

## License

MIT — see [`LICENSE`](LICENSE).
#   A g e n t M e m o r y  
 #   A g e n t M e m o r y  
 