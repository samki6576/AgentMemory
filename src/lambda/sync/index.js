// Scheduled (or on-demand) sync: MemPalace local memories -> CockroachDB.
//
// Invoked by scripts/mempalace-sync-client.js, which reads the local
// MemPalace store and POSTs a batch of {id, content, salience, tags}
// records here. This Lambda does NOT talk to the local filesystem --
// MemPalace is local-only by design, so the client-side script is what
// bridges local storage to this network-facing function.
'use strict';

const { getPool, queryWithRetry, getEmbedding } = require('./db');

const SALIENCE_THRESHOLD = Number(process.env.SYNC_SALIENCE_THRESHOLD || 0.6);

exports.handler = async (event) => {
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body.' }) };
  }

  const { user_id, session_id, memories = [] } = body;
  if (!user_id || !Array.isArray(memories)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'user_id and memories[] are required.' }),
    };
  }

  const toSync = memories.filter((m) => (m.salience ?? 0) >= SALIENCE_THRESHOLD);
  if (toSync.length === 0) {
    return { statusCode: 200, body: JSON.stringify({ synced: 0, skipped: memories.length }) };
  }

  const pool = await getPool();
  const client = await pool.connect();
  let synced = 0;

  try {
    await client.query('BEGIN');

    for (const m of toSync) {
      const embedding = await getEmbedding(m.content);
      const summary = m.content.length > 200 ? `${m.content.slice(0, 200)}...` : m.content;

      // ON CONFLICT keyed by the (user_id, mempalace_id) unique index keeps
      // this idempotent: re-syncing the same MemPalace memory after a
      // partial failure updates the existing row instead of duplicating it.
      // (Agent Skills pattern: "idempotent session counters".)
      await client.query(
        `INSERT INTO memories (user_id, session_id, content, embedding, summary, tags, salience, source, mempalace_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'mempalace_sync', $8)
         ON CONFLICT (user_id, mempalace_id) WHERE mempalace_id IS NOT NULL DO UPDATE SET
           content = EXCLUDED.content,
           embedding = EXCLUDED.embedding,
           summary = EXCLUDED.summary,
           salience = EXCLUDED.salience,
           updated_at = now()`,
        [user_id, session_id || 'unknown', m.content, JSON.stringify(embedding), summary, m.tags || [], m.salience, m.id]
      );
      synced += 1;
    }

    await client.query(
      `INSERT INTO sync_cursor (user_id, last_synced_at, last_mempalace_id)
       VALUES ($1, now(), $2)
       ON CONFLICT (user_id) DO UPDATE SET
         last_synced_at = now(), last_mempalace_id = EXCLUDED.last_mempalace_id`,
      [user_id, toSync[toSync.length - 1].id]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('sync failed', { message: err.message, code: err.code });
    return { statusCode: 502, body: JSON.stringify({ error: 'Sync failed, rolled back.' }) };
  } finally {
    client.release();
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ synced, skipped: memories.length - toSync.length }),
  };
};

/**
 * Companion "wake up" query: given a user_id, return their highest-salience
 * long-term memories so a fresh MemPalace session can start warm instead of
 * cold. Exposed here for reuse/testing; not wired to a route in this MVP.
 */
async function wakeUp(user_id, limit = 20) {
  const result = await queryWithRetry(
    `SELECT content, summary, tags, salience
     FROM memories
     WHERE user_id = $1 AND status = 'active'
     ORDER BY salience DESC, created_at DESC
     LIMIT $2`,
    [user_id, limit]
  );
  return result.rows;
}

module.exports.wakeUp = wakeUp;
