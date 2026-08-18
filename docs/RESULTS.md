# Results

## What works

- **Write path**: `POST /memories` embeds content locally (no external API
  call) and durably stores it in CockroachDB in well under a second on a
  warm Lambda.
- **Search path**: `POST /search` returns cosine-similarity-ranked results
  scoped to one user via the C-SPANN vector index.
- **Sync path**: idempotent upsert from MemPalace's local store into
  CockroachDB, safe to retry, runs both on a 15-minute EventBridge schedule
  and on demand via `scripts/mempalace-sync-client.js`.
- **Dev-time MCP integration**: Claude Code can query the live cluster
  directly through the CockroachDB Cloud Managed MCP Server for schema
  inspection and debugging without leaving the editor.
- **Zero-cost embeddings**: `Xenova/all-MiniLM-L6-v2` runs entirely inside
  the Lambda runtime via `@xenova/transformers` (ONNX, CPU-only) — no
  OpenAI/Cohere/etc. API key, no per-call cost, no external dependency to
  go down.

## Known limitations

- **Cold starts**: the first invocation of each Lambda after a period of
  inactivity pays the cost of loading the embedding model (~1-2s). A
  provisioned-concurrency configuration would remove this for a
  latency-sensitive deployment; left out here to stay inside the free tier.
- **Eventual consistency between MemPalace and CockroachDB**: local
  memories are only as durable as the last successful sync. This is a
  deliberate trade-off (see `docs/architecture.md`), not a bug, but it means
  this system is not appropriate for anything that must never be lost
  (e.g., financial transactions).
- **Vector index prefix constraint**: CockroachDB's vector index only
  accelerates a query when every prefix column (`user_id`, `status`) is
  constrained to a specific value. A cross-user search (e.g., "find similar
  memories across all users") would fall back to a full scan by design —
  out of scope for this app, but worth flagging for anyone extending it.
- **Connection pool sizing**: `PG_POOL_MAX=3` per Lambda instance keeps the
  demo comfortably inside CockroachDB Serverless's free-tier connection
  budget under light load. A production deployment with sustained high
  concurrency would need connection pooling in front of Lambda (e.g., RDS
  Proxy-equivalent, or CockroachDB's own connection pooling mode) rather
  than relying on per-instance pool reuse alone.
- **No automated eval yet** for recall quality (precision/recall of
  `/search` against a labeled memory set) — the 96.6% recall figure cited
  for MemPalace's local search is from MemPalace's own benchmarks, not
  independently re-measured for this integration.

## Pre-launch checklist for anyone extending this

- [ ] Run `EXPLAIN` on the production `/search` query against a
      representative data volume and confirm the planner selects the vector
      index (see `docs/skills-used.md`).
- [ ] Set CloudWatch alarms on Lambda error rate and CockroachDB connection
      pool exhaustion.
- [ ] Rotate the `app_writer` SQL user's password and re-deploy the
      Secrets Manager secret version.
- [ ] Load-test the `sync` path with a realistic MemPalace export size to
      confirm the 30s Lambda timeout is sufficient.
