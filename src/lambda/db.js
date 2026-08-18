// Shared CockroachDB connection pool and local-embedding helper, imported by
// the write/, search/, and sync/ Lambda handlers.
//
// NOTE: this file is copied into each Lambda's build directory by
// infrastructure/package-lambdas.sh, since each function is packaged and
// deployed independently (keeps cold-start size small and avoids a shared
// Lambda Layer for this small amount of code).
'use strict';

const { Pool } = require('pg');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

let pool = null;
let cachedConnectionString = null;

/**
 * Resolve the CockroachDB connection string. Prefers Secrets Manager
 * (referenced by ARN via COCKROACH_DB_SECRET_ARN, set by Terraform) so the
 * credential never appears as a plain Lambda environment variable value.
 * Falls back to COCKROACH_DB_URL directly for local/offline testing.
 */
async function resolveConnectionString() {
  if (cachedConnectionString) return cachedConnectionString;

  if (process.env.COCKROACH_DB_SECRET_ARN) {
    const client = new SecretsManagerClient({});
    const { SecretString } = await client.send(
      new GetSecretValueCommand({ SecretId: process.env.COCKROACH_DB_SECRET_ARN })
    );
    cachedConnectionString = SecretString;
  } else {
    cachedConnectionString = process.env.COCKROACH_DB_URL;
  }

  if (!cachedConnectionString) {
    throw new Error('No CockroachDB connection string available (set COCKROACH_DB_SECRET_ARN or COCKROACH_DB_URL).');
  }
  return cachedConnectionString;
}

/**
 * Lazily-initialized pooled connection to CockroachDB Serverless.
 * Reused across warm Lambda invocations to avoid reconnect overhead.
 */
async function getPool() {
  if (!pool) {
    const connectionString = await resolveConnectionString();
    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: true },
      max: Number(process.env.PG_POOL_MAX || 3), // Lambda concurrency is per-instance; keep this small
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return pool;
}

/**
 * Run a query with retry + jittered backoff for CockroachDB's transient
 * "restart transaction" (40001) errors under contention.
 * Pattern adapted from the CockroachDB Agent Skills repo -- see
 * docs/skills-used.md ("Retry backoff/jitter for database operations").
 */
async function queryWithRetry(text, params, { retries = 3 } = {}) {
  const client = await getPool();
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await client.query(text, params);
    } catch (err) {
      const isRetryable = err && err.code === '40001';
      attempt += 1;
      if (!isRetryable || attempt > retries) throw err;
      const backoffMs = Math.min(1000, 2 ** attempt * 50) + Math.random() * 50;
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
}

let extractor = null;

/**
 * Generate a 384-dim sentence embedding locally with a small ONNX model.
 * Zero API calls, zero external cost, no key management.
 */
async function getEmbedding(text) {
  if (!extractor) {
    const { pipeline } = await import('@xenova/transformers');
    extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  const result = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(result.data);
}

module.exports = { getPool, queryWithRetry, getEmbedding };
