# ✅ Setup Verification Checklist

Use this checklist to verify your agent memory system is fully set up and ready to use.

**Estimated time: 15 minutes**

## Phase 1: Environment Setup

- [ ] **CockroachDB Cloud Account Created**
  - Go to: https://cockroachlabs.cloud
  - Sign up (free, no credit card required)
  - Create a Serverless (Basic) cluster
  - Note cluster region and cluster ID

- [ ] **PostgreSQL Client Installed**
  - Windows: `choco install postgresql` or download from https://www.postgresql.org/download/
  - Linux: `sudo apt-get install postgresql-client`
  - Mac: `brew install postgresql`
  - Verify: `psql --version` should output version number

- [ ] **Python 3.8+ Installed**
  - Check: `python --version` should be ≥ 3.8
  - If not, install from https://www.python.org/downloads/

- [ ] **Node.js 18+ Installed**
  - Check: `node --version` should be ≥ 18
  - Check: `npm --version` should be ≥ 9
  - If not, install from https://nodejs.org/

- [ ] **Project Dependencies Installed**
  ```powershell
  cd d:\cockroachdb-x-aws-hackathon\cockroachdb-x-aws-hackathon
  npm install
  ```

## Phase 2: CockroachDB Configuration

- [ ] **Connection String Retrieved**
  - Log into CockroachDB Cloud
  - Click your cluster → "Connect"
  - Copy the SQL connection string (starts with `postgresql://`)
  - It should look like: `postgresql://user:pass@cluster.j77.aws-region.cockroachlabs.cloud:26257/defaultdb?sslmode=verify-full`

- [ ] **.env File Created**
  ```powershell
  # Copy template
  Copy-Item .env.example .env
  
  # Edit .env
  code .env
  ```

- [ ] **COCKROACH_DB_URL Added to .env**
  - Open `.env` in your editor
  - Find the line: `COCKROACH_DB_URL=postgresql://...`
  - Replace the example with your actual connection string from CockroachDB
  - Save file

- [ ] **Connection Test Successful**
  ```powershell
  # Test connectivity with psql
  psql $env:COCKROACH_DB_URL -c "SELECT version();"
  ```
  - Should print: `CockroachDB vX.X.X on linux/amd64`
  - If fails: Check connection string, verify cluster is running

## Phase 3: Database Schema

- [ ] **CockroachDB Schema Initialized**
  ```powershell
  # Run the setup script
  .\scripts\setup-cockroachdb.ps1
  ```
  - Should print: `✅ CockroachDB schema initialized successfully!`

- [ ] **Tables Created Verified**
  ```powershell
  psql $env:COCKROACH_DB_URL -c "\dt agent_memory.*"
  ```
  - Should show: `memories`, `sessions`, `sync_cursor` tables
  - If missing: Re-run `.\scripts\setup-cockroachdb.ps1`

- [ ] **Vector Column Exists**
  ```powershell
  psql $env:COCKROACH_DB_URL -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='agent_memory' AND table_name='memories' AND column_name='embedding';"
  ```
  - Should show: `embedding` column with type `USER-DEFINED` (vector)
  - If missing: Schema creation failed, check error logs

- [ ] **Vector Index Created**
  ```powershell
  psql $env:COCKROACH_DB_URL -c "SELECT indexname FROM pg_indexes WHERE schemaname='agent_memory';"
  ```
  - Should include: `memories_embedding_idx`
  - This enables fast semantic search

## Phase 4: MemPalace Setup

- [ ] **MemPalace Installed**
  ```powershell
  pip install mempalace
  mempalace --version
  ```
  - Should print version number (e.g., "MemPalace 3.7.0")

- [ ] **MemPalace Initialized**
  ```powershell
  .\scripts\setup-mempalace.ps1
  ```
  - Should print: `✅ MemPalace initialized at: ...`

- [ ] **MemPalace Storage Directory Exists**
  ```powershell
  # Default location:
  Test-Path $env:USERPROFILE\.mempalace\agent-memory
  ```
  - Should return: `True`
  - Or check custom location: `$env:MEMPALACE_HOME`

- [ ] **MemPalace Can Be Queried**
  ```powershell
  mempalace status
  ```
  - Should show: Palace status, memory count, etc.

## Phase 5: Integration Testing

- [ ] **All Tests Pass**
  ```powershell
  node scripts/test-integration.js
  ```
  - Expected output:
    ```
    ✅ PASS - environment
    ✅ PASS - cockroachdb
    ✅ PASS - mempalace
    ✅ PASS - mempalaceInit
    
    Total: 4/4 passed
    ✅ All tests passed! Your system is ready.
    ```

- [ ] **No Test Failures**
  - If any test fails (❌), check the detailed error message
  - Common issues:
    - `COCKROACH_DB_URL not set` → Run: `code .env` and verify variable
    - `psql not found` → Install PostgreSQL client
    - `MemPalace not found` → Run: `pip install mempalace`
    - `Connection refused` → Ensure CockroachDB cluster is running

## Phase 6: MCP Configuration (Claude Code Integration)

- [ ] **MCP Config File Reviewed**
  - Open: `mcp-config.json`
  - Check that `COCKROACH_DB_URL` references your `.env` variable
  - Or has your actual connection string

- [ ] **MCP Server Dependencies Installed**
  ```powershell
  # Install dependencies for MCP server
  cd mcp-server
  npm install
  cd ..
  ```

- [ ] **MCP Server Tested (Optional)**
  ```powershell
  # Start the server (Ctrl+C to stop)
  node mcp-server/index.js
  ```
  - Should print: `[MCP Server] Connected to: CockroachDB...`
  - If error: Check connection string and dependencies

## Phase 7: Manual Integration Tests (Optional)

- [ ] **Test 1: Store a Memory**
  ```powershell
  # Create a test embedding (dummy 384-dim vector)
  $embedding = @(0.5) * 384
  
  # Store to CockroachDB directly
  psql $env:COCKROACH_DB_URL -c @"
  INSERT INTO agent_memory.memories 
  (user_id, session_id, content, embedding, summary, tags, salience)
  VALUES ('test-user', 'test-session', 'Test memory', ARRAY[$(0.5)]::vector, 'Test', ARRAY['test'], 0.5);
  "@
  ```
  - Should complete without error

- [ ] **Test 2: Query Memories**
  ```powershell
  psql $env:COCKROACH_DB_URL -c "SELECT COUNT(*) FROM agent_memory.memories WHERE user_id='test-user';"
  ```
  - Should show: `count = 1` (or more if you added multiple)

- [ ] **Test 3: Clean Up Test Data**
  ```powershell
  psql $env:COCKROACH_DB_URL -c "DELETE FROM agent_memory.memories WHERE user_id='test-user';"
  ```

## Phase 8: Optional AWS S3 Setup

- [ ] **AWS S3 Bucket Created** (Optional)
  - See: [docs/AWS-S3-OPTIONAL.md](AWS-S3-OPTIONAL.md)
  - Create S3 bucket: `agent-memory-logs-your-username`
  - Create IAM user: `agent-memory-app`
  - Get access keys

- [ ] **AWS Credentials Added to .env** (Optional)
  ```bash
  AWS_ACCESS_KEY_ID=AKIA...
  AWS_SECRET_ACCESS_KEY=wJa...
  AWS_REGION=us-east-1
  AWS_S3_LOGS_BUCKET=agent-memory-logs-your-username
  ```

- [ ] **S3 Connection Tested** (Optional)
  ```powershell
  # Test S3 access
  aws s3 ls
  ```
  - Should list your S3 buckets (if AWS CLI configured)

## Phase 9: Claude Code Connection

- [ ] **Claude Code Extension Installed**
  - Open VS Code
  - Extensions → Search "GitHub Copilot Chat"
  - Click Install

- [ ] **MCP Configuration Loaded**
  - Close and reopen VS Code
  - Check Extension output for MCP connection messages

- [ ] **First Memory Created via Claude Code**
  - In Claude Code chat:
    ```
    User: Please remember that I prefer TypeScript for this project.
    Claude: I'll remember that for you and store it in the memory system.
    ```
  - Check if stored:
    ```powershell
    psql $env:COCKROACH_DB_URL -c "SELECT COUNT(*) FROM agent_memory.memories;"
    ```
  - Count should increase

## Phase 10: Final Verification

- [ ] **Can Query Memories via Claude Code**
  - Ask Claude: "What do you remember about my preferences?"
  - Claude should query CockroachDB and respond with stored memories

- [ ] **Vector Search Works**
  - Ask Claude: "Search for memories about TypeScript"
  - Claude should use semantic search to find related memories

- [ ] **Memory Syncs to CockroachDB**
  - Create a memory in MemPalace (local)
  - Wait up to 15 minutes (or manually trigger sync)
  - Verify it appears in CockroachDB:
    ```powershell
    psql $env:COCKROACH_DB_URL -c "SELECT COUNT(*) FROM agent_memory.memories WHERE status='active';"
    ```

## Troubleshooting Reference

| Problem | Symptom | Solution |
|---------|---------|----------|
| Connection refused | `psql` fails to connect | Verify COCKROACH_DB_URL is correct; check cluster is running |
| psql not found | "command not found" | Install PostgreSQL client (see Phase 1) |
| MemPalace not found | "command not found" | Install: `pip install mempalace` |
| .env not loaded | `$env:COCKROACH_DB_URL` is empty | Manually set: `$env:COCKROACH_DB_URL='...'` |
| Tests fail | "FAIL" in test output | Run individual tests to identify exact issue (see docs) |
| MCP connection fails | Claude Code doesn't see memory | Check `mcp-config.json` has correct COCKROACH_DB_URL |
| Vector search slow | Queries take >1s | Verify vector index was created; check for large dataset |

## Success Criteria

You're ready when ALL of the following are true:

✅ All 10 phases have checkmarks  
✅ `node scripts/test-integration.js` outputs all green checkmarks  
✅ `psql $env:COCKROACH_DB_URL -c "SELECT COUNT(*) FROM agent_memory.memories;"` works  
✅ MemPalace status command works  
✅ Claude Code connects and can query memories via MCP  

## Next Steps

Once setup is complete:

1. **Read Architecture**: [docs/architecture.md](architecture.md)
2. **Learn MCP Details**: [docs/MCP-SETUP.md](MCP-SETUP.md)
3. **Build Your Agent**: Start using Claude Code with agent memory
4. **Explore Advanced Features**: Vector search, multi-user memory, etc.
5. **(Optional) Add AWS S3**: [docs/AWS-S3-OPTIONAL.md](AWS-S3-OPTIONAL.md)

## Getting Help

- **CockroachDB Docs**: https://www.cockroachlabs.com/docs/
- **MemPalace Issues**: Check GitHub repo
- **MCP Protocol**: https://modelcontextprotocol.io/
- **This Project**: See README.md and other docs/

---

**🎉 Congratulations!** Your agent memory system is now fully operational. 

Time to build something amazing! 🚀
