# Demo video script (target: under 3 minutes)

## 0:00-0:20 — The problem
"Agents forget everything the moment a session ends. Vector-DB-only memory
is durable but slow and costly on every turn. Local-only memory is fast but
disappears on restart. AgentMemory is a hybrid: MemPalace for the fast,
free, local working set, and CockroachDB as the durable system of record."

*(Show the architecture diagram from `docs/architecture.md`.)*

## 0:20-0:50 — Local memory, live
- Open a terminal, run a short Claude Code session.
- Show `mempalaceStore` saving a preference mid-conversation, and
  `mempalaceSearch` recalling it instantly, no network call.
- Narrate: "Zero cost, sub-millisecond, and it works offline."

## 0:50-1:30 — Writing to CockroachDB
- `curl -X POST $API_URL/memories` with a real preference.
- Switch to the CockroachDB Cloud console (or the MCP-connected Claude Code
  session) and run:
  ```sql
  SELECT id, content, tags, salience, created_at FROM memories ORDER BY created_at DESC LIMIT 3;
  ```
- Narrate: "That write went through API Gateway, an AWS Lambda that embeds
  the content locally with a small ONNX model — no external embedding API —
  and lands in CockroachDB with a native VECTOR column."

## 1:30-2:10 — Searching at scale
- `curl -X POST $API_URL/search` with a semantically related but
  differently-worded query.
- Show the ranked results with similarity scores.
- Run `EXPLAIN` on the same query live to show the C-SPANN vector index
  being used, not a full scan.
- Narrate: "The index is prefixed by user_id and status, so this stays fast
  as it scales to millions of memories across many users, without ever
  mixing one user's data into another's search."

## 2:10-2:40 — The sync loop
- Run `scripts/mempalace-sync-client.js` to show local MemPalace memories
  getting promoted into CockroachDB.
- Re-run it a second time to show the idempotent upsert — no duplicate rows.
- Narrate: "Anything above the salience threshold gets promoted from local
  to durable. Re-running sync is always safe."

## 2:40-3:00 — Close
- Quick cut back to the architecture diagram.
- "MemPalace owns recency. CockroachDB owns durability. Together, that's
  what makes an agent's memory actually production-ready." — end on repo
  URL and license.
