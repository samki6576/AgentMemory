# 🚀 Quick Start - No AWS Lambda Required

This guide walks you through setting up agent memory using **CockroachDB + MemPalace + Claude Code MCP** in 5 minutes.

## ✨ What You Get

- **Fast Local Memory**: MemPalace handles session-level memory (ChromaDB-backed, zero API costs)
- **Durable Global Memory**: CockroachDB stores long-term facts and decisions (50M RUs/month free)
- **Vector Search**: Native VECTOR indexing for semantic retrieval
- **Zero Lambda Overhead**: Direct MCP connection to CockroachDB
- **Production Ready**: Global distribution, automatic failover, vector clustering

## 📋 Prerequisites (5 minutes)

1. **CockroachDB Cloud Account** (free)
   - Go to https://cockroachlabs.cloud
   - Sign up (no credit card required for free tier)
   - Create a "Serverless (Basic)" cluster
   - Note your connection string and cluster ID

2. **Local Tools** (already on your machine)
   - PostgreSQL client (`psql`) - [Install Guide](https://www.postgresql.org/download/)
   - Python 3.8+ (for MemPalace)
   - Node.js 18+ (for integration tests)

## 🛠️ Setup (5 minutes)

### Step 1: Configure Environment Variables (1 min)

Copy the template and fill in your CockroachDB details:

```powershell
# Copy template
Copy-Item .env.example .env

# Edit .env with your connection string
# Open .env and paste your CockroachDB connection string
```

**Where to find your connection string:**
1. Log into CockroachDB Cloud → Your Cluster
2. Click "Connect" → "Connection String" (SQL)
3. Copy the `postgresql://...` URL
4. Paste into `.env` as `COCKROACH_DB_URL`

### Step 2: Initialize CockroachDB Schema (2 min)

```powershell
# Windows PowerShell
.\scripts\setup-cockroachdb.ps1

# Or manually with psql:
psql $env:COCKROACH_DB_URL < infrastructure/schema.sql
```

Verify it worked:
```powershell
psql $env:COCKROACH_DB_URL -c "SELECT COUNT(*) FROM agent_memory.memories;"
# Should return: count = 0
```

### Step 3: Initialize MemPalace (1 min)

```powershell
# Install if not already present
pip install mempalace

# Initialize local palace
.\scripts\setup-mempalace.ps1
```

### Step 4: Run Integration Tests (1 min)

```powershell
# Verify everything works together
npm install  # (if needed)
node scripts/test-integration.js
```

**Expected output:**
```
✅ All tests passed! Your system is ready.
```

## 🔗 Connect Claude Code (5 min)

Once the above is done, connect Claude Code to CockroachDB:

**Option A: Using MCP Configuration (Recommended)**

1. Create or edit `mcp-config.json` in your workspace root:

```json
{
  "mcpServers": {
    "cockroachdb": {
      "command": "node",
      "args": ["./mcp-server/index.js"],
      "env": {
        "COCKROACH_DB_URL": "$COCKROACH_DB_URL"
      }
    }
  }
}
```

2. Reload Claude Code
3. Ask Claude a question: "What memories do I have?"
4. It will query your CockroachDB via MCP!

**Option B: Manual Query**

Ask Claude in your chat:
```
User: Search my memories for anything about "project architecture"

Claude: I'll search your memories via MCP...
[Claude executes vector search on CockroachDB]
```

## 🧪 Try It Out

Once connected, test these commands in Claude Code:

### Test 1: Create a Memory
```
Claude, remember that I prefer using TypeScript for backend services
```

Claude will:
1. Generate an embedding locally (Xenova model)
2. Store it in MemPalace locally
3. Mark it with high salience
4. Eventually sync to CockroachDB

### Test 2: Semantic Search
```
Claude, search my memories for anything about testing or QA
```

Claude will:
1. Generate embedding for "testing or QA"
2. Query CockroachDB vector index
3. Return top-5 semantically similar memories

### Test 3: Filter by Tags
```
Claude, what do I remember about project setup?
```

Claude uses MCP to:
- Query memories tagged with "setup" or "project"
- Return most recent and highest-salience items

## 📊 System Architecture

```
┌─────────────────────────────────────────┐
│        CLAUDE CODE (Your Editor)        │
│     Connects via MCP Server Protocol    │
└──────────────────┬──────────────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
        ▼                     ▼
┌──────────────────┐  ┌──────────────────────────┐
│  MEMPALACE       │  │  COCKROACHDB CLOUD      │
│  (Local)         │  │  (Managed MCP Server)   │
├──────────────────┤  ├──────────────────────────┤
│ • ChromaDB       │  │ • Vector indexing       │
│ • Session mem    │  │ • Long-term storage     │
│ • Zero API cost  │  │ • 50M RUs/month free    │
│ • Fast recall    │  │ • 10GB storage free     │
└──────────────────┘  └──────────────────────────┘
        │                     │
        └─────────────┬───────┘
                      │
          ┌───────────┴──────────┐
          │                      │
          ▼                      ▼
    ┌─────────────┐        ┌──────────┐
    │  .sync()    │        │ API Logs │
    │  (15min)    │        │(Optional │
    │             │        │ AWS S3)  │
    └─────────────┘        └──────────┘
```

## 🎯 How Memory Works

### 1. Session Memory (Local - MemPalace)
- Everything gets saved locally to MemPalace first
- Zero cost, instant access
- Survives within a single chat session
- ChromaDB handles embeddings locally (Xenova/all-MiniLM-L6-v2)

### 2. Long-term Memory (Global - CockroachDB)
- Facts with salience ≥ 0.6 get synced every 15 minutes
- Survives across sessions
- Distributed globally on CockroachDB infrastructure
- Searchable via semantic vector index

### 3. Sync Mechanism
- Runs every 15 minutes (configurable)
- Checks `sync_cursor` to avoid duplicates
- Only syncs high-salience items (configurable threshold)
- Writes to CockroachDB `memories` table

## 📁 Project Structure

```
.
├── .env                      # ← Your config (DO NOT COMMIT)
├── .env.example              # ← Template (commit this)
├── infrastructure/
│   └── schema.sql            # ← Database schema
├── src/
│   └── mempalace/
│       └── config.yaml       # ← MemPalace settings
├── scripts/
│   ├── setup-cockroachdb.ps1 # ← DB initialization
│   ├── setup-mempalace.ps1   # ← Local memory setup
│   └── test-integration.js   # ← Verification tests
├── docs/
│   ├── MCP-SETUP.md         # ← MCP configuration
│   └── QUICK-START.md       # ← This file
└── mcp-config.json          # ← Claude Code MCP config
```

## 🚨 Troubleshooting

### "Connection refused" when running setup
- **Problem**: CockroachDB cluster isn't running
- **Solution**: Log into CockroachDB Cloud and start your cluster

### "psql: command not found"
- **Problem**: PostgreSQL client not installed
- **Solution**: 
  ```powershell
  # On Windows, use Chocolatey:
  choco install postgresql
  
  # Or download from: https://www.postgresql.org/download/windows/
  ```

### "COCKROACH_DB_URL not set"
- **Problem**: Environment variable not configured
- **Solution**:
  ```powershell
  # Verify .env file exists and has your connection string
  Get-Content .env | findstr COCKROACH_DB_URL
  ```

### "MemPalace not found"
- **Problem**: MemPalace not installed
- **Solution**:
  ```powershell
  pip install mempalace
  ```

### Integration tests still failing?
Run with debug output:
```powershell
$env:DEBUG = "cockroach-mcp:*"
node scripts/test-integration.js
```

## 📈 Performance Characteristics

| Operation | Latency | Cost | Notes |
|-----------|---------|------|-------|
| Store in MemPalace | <10ms | $0 | Local ChromaDB write |
| Search MemPalace | <50ms | $0 | Cosine similarity on local DB |
| Sync to CockroachDB | <500ms | <$0.01 | Every 15 minutes, batch writes |
| Vector search CockroachDB | <100ms | <$0.01 | Uses VECTOR index |
| Total per session | ~5MB | <$1/month | Even with 1000s of memories |

## 🔐 Security Notes

- ✅ Connection string uses SSL (verify-full)
- ✅ No credentials in code (stored in .env, git-ignored)
- ✅ CockroachDB isolates by user_id (tenant isolation)
- ✅ Vector indexes scoped by user_id + status
- ✅ Consider using AWS Secrets Manager for production

## 🎓 Next Steps

1. ✅ **Complete Quick Start above**
2. ✅ **Read**: [MCP-SETUP.md](MCP-SETUP.md) for advanced configuration
3. ✅ **Read**: [architecture.md](architecture.md) for system design
4. ✅ **Try**: Build your first agent using agent memory
5. ✅ **Deploy**: Use your CockroachDB instance in production

## 💡 Tips

- **Test vector search**: `SELECT * FROM agent_memory.memories WHERE user_id = 'test' ORDER BY embedding <=> '[...]' LIMIT 5;`
- **Monitor memory growth**: `SELECT COUNT(*), salience FROM agent_memory.memories GROUP BY salience;`
- **Export memories**: `COPY (SELECT * FROM agent_memory.memories) TO STDOUT;`
- **Backup**: CockroachDB handles automatic backups in free tier

## 🆘 Need Help?

- **CockroachDB Docs**: https://www.cockroachlabs.com/docs/
- **MemPalace GitHub**: Check project repo for issues
- **MCP Protocol**: https://modelcontextprotocol.io/
- **This Project README**: See [../README.md](../README.md)

---

**You're ready!** Your agent now has:
- ✅ Fast local memory (MemPalace)
- ✅ Durable global memory (CockroachDB)
- ✅ Semantic vector search
- ✅ Zero Lambda complexity
- ✅ Production-ready architecture

Start using `claude` in your chat. Ask it to remember things. Build something amazing! 🚀
