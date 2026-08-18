# 🔗 MCP Server Configuration Guide

This guide explains how to connect Claude Code to CockroachDB via the Model Context Protocol (MCP) Server.

## Overview

CockroachDB provides a **managed MCP Server** that allows Claude Code to:
- Query your database directly via MCP
- Access vector search capabilities
- Read/write to your agent memory system
- No Lambda or API Gateway needed

## Prerequisites

1. **CockroachDB Cloud Account** (free tier)
   - Sign up at https://cockroachlabs.cloud
   - Create a Serverless (Basic) cluster
   - Get your connection string and cluster ID

2. **Claude Code** with MCP support
   - Ensure you have the latest Claude Code extension

3. **Connection String**
   - Format: `postgresql://user:password@cluster.j77.aws-region.cockroachlabs.cloud:26257/defaultdb?sslmode=verify-full`
   - Find this in CockroachDB Cloud → Connect → Connection String

## Setup Steps

### Option 1: Using CockroachDB's Managed MCP Server

CockroachDB provides a managed MCP server endpoint. Configure it in Claude Code:

```bash
# Add the MCP server configuration to Claude Code
claude mcp add cockroachdb-cloud \
  https://mcp-server.cockroachlabs.cloud/mcp \
  --transport http \
  --header "Authorization: Bearer YOUR_TOKEN" \
  --header "Cluster-ID: YOUR_CLUSTER_ID"
```

### Option 2: Using Standard PostgreSQL MCP

If CockroachDB's managed server isn't available, use a standard PostgreSQL MCP server:

```bash
# Configure with your connection string
export COCKROACH_DB_URL="postgresql://user:password@cluster.cockroachlabs.cloud:26257/agent_memory?sslmode=verify-full"

claude mcp add cockroachdb-local \
  node /path/to/mcp-server/index.js \
  --env COCKROACH_DB_URL
```

### Option 3: Manual MCP Server Setup (Advanced)

If you want full control, create a simple Node.js MCP server. See [mcp-server/](../mcp-server/) for an example implementation.

## Configuration File

Edit or create `mcp-config.json` in your workspace root:

```json
{
  "mcpServers": {
    "cockroachdb": {
      "command": "node",
      "args": ["./mcp-server/index.js"],
      "env": {
        "COCKROACH_DB_URL": "postgresql://crock:password@wary-mole-31800.j77.aws-ap-southeast-1.cockroachlabs.cloud:26257/agent_memory?sslmode=verify-full",
        "DEBUG": "cockroach-mcp:*"
      }
    }
  }
}
```

## Testing the MCP Connection

After configuring, test the connection from Claude Code:

### Test 1: Basic Connectivity
```
User: List all tables in the agent_memory database
Claude: [MCP will execute: SELECT tablename FROM pg_tables WHERE schemaname='public']
```

### Test 2: Vector Search
```
User: Search for memories about my project architecture
Claude: [MCP will execute vector search on the memories table]
```

### Test 3: Write Operation
```
User: Remember that I prefer using TypeScript for this project
Claude: [MCP will insert into memories table with a generated embedding]
```

## Environment Variables

Set these in your `.env` file:

```bash
# Required for MCP server
COCKROACH_DB_URL=postgresql://...

# Cluster ID (optional, used for some managed MCP servers)
CLUSTER_ID=248ad6fd-61b5-4a21-b3b8-04d89d9ce240

# Optional: Custom MCP server endpoint
MCP_SERVER_URL=http://localhost:3000
```

## Troubleshooting

### Connection Refused
- Check that CockroachDB cluster is running
- Verify connection string is correct
- Ensure you have network access (might need to add your IP to allowlist)

### Authorization Failed
- Verify username and password in connection string
- Check that the user has proper permissions
- Try connecting with `psql` directly first: `psql $COCKROACH_DB_URL`

### MCP Server Not Found
- Ensure the MCP server is running
- Check that the endpoint URL is correct
- Verify network connectivity to the server

### Vector Search Not Working
- Ensure the `memories` table exists with `VECTOR(384)` column
- Run: `psql $COCKROACH_DB_URL -c "SHOW INDEXES FROM agent_memory.memories;"`
- Verify embeddings are being generated (not NULL)

## Advanced: Using Multiple MCP Servers

You can connect Claude Code to multiple data sources:

```json
{
  "mcpServers": {
    "cockroachdb": {
      "command": "node",
      "args": ["./mcp-server/cockroach.js"]
    },
    "local-files": {
      "command": "node",
      "args": ["./mcp-server/files.js"]
    },
    "github": {
      "command": "node",
      "args": ["./mcp-server/github.js"]
    }
  }
}
```

## Example: Vector Search Query via MCP

Once connected, Claude Code can run vector searches directly:

```sql
-- Get top-5 semantically similar memories for a user
SELECT 
  id, 
  content, 
  summary, 
  tags, 
  created_at,
  1 - (embedding <=> $1) AS similarity
FROM agent_memory.memories
WHERE user_id = 'agent-001' AND status = 'active'
ORDER BY embedding <=> $1
LIMIT 5;
```

Claude Code will:
1. Take your query in natural language
2. Generate an embedding locally (using Xenova/all-MiniLM-L6-v2)
3. Execute the vector search on CockroachDB
4. Return the results

## Next Steps

1. ✅ Set up CockroachDB schema: `.\scripts\setup-cockroachdb.ps1`
2. ✅ Initialize MemPalace: `.\scripts\setup-mempalace.ps1`
3. ✅ Configure MCP connection (this document)
4. ✅ Run integration tests: `node scripts/test-integration.js`
5. 🚀 Start using Claude Code with your agent memory system!

## Resources

- CockroachDB MCP: https://www.cockroachlabs.com/docs/
- Model Context Protocol: https://modelcontextprotocol.io/
- Xenova Embeddings: https://huggingface.co/Xenova/all-MiniLM-L6-v2
- MemPalace: https://github.com/your-repo/mempalace
