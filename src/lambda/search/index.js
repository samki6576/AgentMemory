// POST /search
// Semantic search over a user's active memories using CockroachDB's
// C-SPANN distributed vector index (cosine distance).
'use strict';

const { queryWithRetry, getEmbedding } = require('./db');

function badRequest(message) {
  return { statusCode: 400, body: JSON.stringify({ error: message }) };
}

exports.handler = async (event) => {
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return badRequest('Request body must be valid JSON.');
  }

  const { user_id, query, limit = 5 } = body;

  if (!user_id || !query) {
    return badRequest('user_id and query are required.');
  }
  const safeLimit = Math.min(Math.max(Number(limit) || 5, 1), 25);

  try {
    const queryEmbedding = await getEmbedding(query);

    // WHERE clause constrains both prefix columns (user_id, status) of the
    // vector index, so CockroachDB uses the C-SPANN index instead of a
    // full scan -- see infrastructure/schema.sql.
    const result = await queryWithRetry(
      `SELECT id, content, summary, tags, created_at,
              1 - (embedding <=> $1) AS similarity
       FROM memories
       WHERE user_id = $2 AND status = 'active'
       ORDER BY embedding <=> $1
       LIMIT $3`,
      [JSON.stringify(queryEmbedding), user_id, safeLimit]
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ results: result.rows, total: result.rowCount }),
    };
  } catch (err) {
    console.error('search failed', { message: err.message, code: err.code });
    return { statusCode: 502, body: JSON.stringify({ error: 'Search failed.' }) };
  }
};
