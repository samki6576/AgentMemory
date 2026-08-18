#!/bin/bash
# ============================================================================
# setup-cockroachdb.sh
# Initialize CockroachDB schema for agent memory system
# Requires: COCKROACH_DB_URL environment variable set
# ============================================================================

set -e

if [ -z "$COCKROACH_DB_URL" ]; then
  echo "❌ COCKROACH_DB_URL environment variable not set"
  echo "   Please set it to your CockroachDB connection string"
  exit 1
fi

echo "📦 Creating CockroachDB schema for agent memory..."

# Execute the schema creation SQL using psql
psql "$COCKROACH_DB_URL" < infrastructure/schema.sql

echo "✅ CockroachDB schema initialized successfully!"
echo ""
echo "📊 Verify setup with:"
echo "   psql \$COCKROACH_DB_URL -c \"SELECT COUNT(*) FROM agent_memory.memories;\""
echo ""
echo "🔍 Test vector search with:"
echo "   psql \$COCKROACH_DB_URL -c \"SELECT * FROM agent_memory.memories LIMIT 1;\""
