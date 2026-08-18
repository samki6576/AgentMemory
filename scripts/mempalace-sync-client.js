#!/usr/bin/env node
// ============================================================================
// Reads memories out of a local MemPalace store and POSTs the high-salience
// ones to the `sync` Lambda so they become durable, cross-session, queryable
// rows in CockroachDB.
//
// MemPalace itself is local-only by design (zero API cost) -- this script is
// the bridge from local storage to the network-facing sync endpoint. Run it
// on a schedule (cron, launchd, etc.) or trigger it manually after a session.
//
// Usage:
//   AGENT_MEMORY_API_URL=https://xxxx.execute-api.us-east-1.amazonaws.com \
//   MEMPALACE_USER_ID=u1 \
//   node scripts/mempalace-sync-client.js
// ============================================================================
'use strict';

const { execFileSync } = require('node:child_process');

const API_URL = process.env.AGENT_MEMORY_API_URL;
const USER_ID = process.env.MEMPALACE_USER_ID;
const SESSION_ID = process.env.MEMPALACE_SESSION_ID || `session-${Date.now()}`;

if (!API_URL || !USER_ID) {
  console.error('AGENT_MEMORY_API_URL and MEMPALACE_USER_ID are required.');
  process.exit(1);
}

/**
 * Shells out to the MemPalace CLI to dump memories as JSON. Kept as a thin
 * wrapper so this script has one clear seam to replace with a direct
 * MemPalace SDK call if/when one is available.
 */
function readLocalMemories() {
  const raw = execFileSync('mempalace', ['export', '--format', 'json'], {
    encoding: 'utf8',
  });
  const parsed = JSON.parse(raw);
  return (parsed.memories || []).map((m) => ({
    id: m.id,
    content: m.content,
    tags: m.tags || [],
    salience: m.salience ?? 0.5,
  }));
}

async function main() {
  const memories = readLocalMemories();
  if (memories.length === 0) {
    console.log('No local memories to sync.');
    return;
  }

  const response = await fetch(`${API_URL}/sync`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ user_id: USER_ID, session_id: SESSION_ID, memories }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Sync request failed (${response.status}): ${text}`);
  }

  const result = await response.json();
  console.log(`Synced ${result.synced} memories to CockroachDB (${result.skipped} below salience threshold).`);
}

main().catch((err) => {
  console.error('mempalace-sync-client failed:', err.message);
  process.exit(1);
});
