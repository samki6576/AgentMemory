#!/usr/bin/env bash
# ============================================================================
# Provision a CockroachDB Serverless cluster on AWS and apply the schema,
# entirely from the CLI -- no manual console steps. Designed to be runnable
# by a human or by an agent.
#
# Uses: ccloud CLI (Agent-Ready)
# ============================================================================
set -euo pipefail

CLUSTER_NAME="${CLUSTER_NAME:-agent-memory}"
REGION="${REGION:-us-east-1}"
SCHEMA_FILE="$(dirname "$0")/schema.sql"

command -v ccloud >/dev/null 2>&1 || {
  echo "ccloud CLI not found. Install with: brew install cockroachdb/tap/ccloud" >&2
  exit 1
}

echo "==> Authenticating with CockroachDB Cloud"
ccloud auth login

echo "==> Provisioning serverless cluster: ${CLUSTER_NAME} (${REGION}, AWS)"
CLUSTER_JSON=$(ccloud cluster create serverless "${CLUSTER_NAME}" "${REGION}" --cloud AWS -o json)
CLUSTER_ID=$(echo "${CLUSTER_JSON}" | jq -r '.id')

if [ -z "${CLUSTER_ID}" ] || [ "${CLUSTER_ID}" = "null" ]; then
  echo "Cluster creation failed or CLUSTER_ID could not be parsed." >&2
  exit 1
fi

echo "==> Cluster ID: ${CLUSTER_ID}"

echo "==> Creating a SQL user for the app (least-privilege, not root)"
ccloud sql user create app_writer --cluster "${CLUSTER_ID}" --password-stdin <<< "$(openssl rand -base64 24)"

echo "==> Fetching connection string"
CONN_STRING=$(ccloud cluster sql-connection-string "${CLUSTER_ID}" --user app_writer -o json | jq -r '.connectionString')

echo "==> Applying schema from ${SCHEMA_FILE}"
ccloud sql --cluster "${CLUSTER_ID}" --file "${SCHEMA_FILE}"

echo "==> Granting app_writer privileges on agent_memory"
ccloud sql --cluster "${CLUSTER_ID}" --execute "
  GRANT SELECT, INSERT, UPDATE, DELETE ON agent_memory.memories TO app_writer;
  GRANT SELECT, INSERT, UPDATE ON agent_memory.sessions TO app_writer;
  GRANT SELECT, INSERT, UPDATE ON agent_memory.sync_cursor TO app_writer;
"

cat <<EOF

==============================================================================
Cluster ready.

  CLUSTER_ID       = ${CLUSTER_ID}
  COCKROACH_DB_URL = ${CONN_STRING}

Next steps:
  export CLUSTER_ID="${CLUSTER_ID}"
  export COCKROACH_DB_URL="${CONN_STRING}"

  # Wire up the MCP server for Claude Code:
  claude mcp add cockroachdb-cloud https://cockroachlabs.cloud/mcp \\
    --transport http \\
    --header "mcp-cluster-id: \${CLUSTER_ID}"

  # Deploy Lambdas:
  cd infrastructure/terraform && terraform apply -var="cockroach_db_url=\${COCKROACH_DB_URL}"
==============================================================================
EOF
