// POST /memories
// Embeds a piece of content locally and writes it to CockroachDB as a
// durable, searchable memory.
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

  const { user_id, session_id, content, tags = [], salience = 0.5 } = body;

  if (!user_id || !session_id || !content) {
    return badRequest('user_id, session_id, and content are required.');
  }
  if (typeof content !== 'string' || content.length > 8000) {
    return badRequest('content must be a string under 8000 characters.');
  }

  try {
    const embedding = await getEmbedding(content);
    const summary = content.length > 200 ? `${content.slice(0, 200)}...` : content;

    const result = await queryWithRetry(
      `INSERT INTO memories (user_id, session_id, content, embedding, summary, tags, salience)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, created_at`,
      [user_id, session_id, content, JSON.stringify(embedding), summary, tags, salience]
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        id: result.rows[0].id,
        created_at: result.rows[0].created_at,
        status: 'stored',
      }),
    };
  } catch (err) {
    console.error('write failed', { message: err.message, code: err.code });
    return { statusCode: 502, body: JSON.stringify({ error: 'Failed to store memory.' }) };
  }
};
