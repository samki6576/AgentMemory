# CockroachDB Agent Skills applied

Patterns pulled from the CockroachDB Agent Skills Repo
(`github.com/cockroachlabs/cockroachdb-skills`) and where each shows up in
this codebase.

## Retry backoff/jitter for database operations

CockroachDB can return a `40001` ("restart transaction") serializability
error under contention, which is expected and retryable-by-design in a
distributed SQL database — not a bug to be routed around, but a signal to
retry the statement.

Applied in [`src/lambda/db.js`](../src/lambda/db.js) — `queryWithRetry`
catches `err.code === '40001'`, retries up to 3 times with capped
exponential backoff plus random jitter (to avoid retry storms across
concurrent Lambda invocations), and re-throws anything else immediately.
Used by every read/write in the `write` and `search` Lambdas.

## Idempotent session counters (adapted: idempotent upserts)

The skill's underlying pattern — make retried writes safe by keying them to
a stable, externally-known identifier instead of relying on "only run this
once" — is applied to the MemPalace→CockroachDB sync path.

Applied in [`src/lambda/sync/index.js`](../src/lambda/sync/index.js): each
synced memory is upserted against a unique `(user_id, mempalace_id)` index
(see `infrastructure/schema.sql`), so if a sync request is retried after a
timeout or partial failure, re-running it updates the same row instead of
creating a duplicate. A `sync_cursor` table records the last successfully
synced MemPalace id per user for observability.

## Statistics-aware index validation

Before relying on the C-SPANN vector index in production, the recommended
check is confirming the planner is actually choosing it (not falling back to
a full scan) for the app's real query shape:

```sql
EXPLAIN SELECT id, content, 1 - (embedding <=> $1) AS similarity
FROM memories
WHERE user_id = $2 AND status = 'active'
ORDER BY embedding <=> $1
LIMIT 5;
-- expect: "vector search" in the plan, not "index join" / full scan
```

This is documented as a required pre-launch check in
[`docs/RESULTS.md`](RESULTS.md) rather than baked into a script, since it
needs to run against a table with representative data volume to be
meaningful.

## Privilege hardening

`infrastructure/ccloud-bootstrap.sh` never uses the cluster's root user for
the application: it provisions a dedicated `app_writer` SQL user and grants
it `SELECT, INSERT, UPDATE, DELETE` only on the specific tables the Lambdas
touch (`memories`, `sessions`, `sync_cursor`) — no `DROP`, no schema-level
grants, no access to any other database on the cluster.
