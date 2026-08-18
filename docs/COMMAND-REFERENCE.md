# 🚀 Quick Reference - Common Commands

This is a quick reference guide for the most common setup and testing commands.

## Initial Setup (One-Time)

```powershell
# 1. Copy configuration template
Copy-Item .env.example .env

# 2. Edit .env and add your CockroachDB connection string
code .env

# 3. Install Node.js dependencies
npm install

# 4. Install MCP server dependencies
cd mcp-server
npm install
cd ..

# 5. Install MemPalace (Python)
pip install mempalace

# 6. Initialize CockroachDB schema
.\scripts\setup-cockroachdb.ps1

# 7. Initialize MemPalace
.\scripts\setup-mempalace.ps1

# 8. Run integration tests
node scripts/test-integration.js
```

## Verification Commands

```powershell
# Check CockroachDB connection
psql $env:COCKROACH_DB_URL -c "SELECT version();"

# Check database schema
psql $env:COCKROACH_DB_URL -c "\dt agent_memory.*"

# Count memories stored
psql $env:COCKROACH_DB_URL -c "SELECT COUNT(*) FROM agent_memory.memories;"

# Check MemPalace status
mempalace status

# Run all integration tests
node scripts/test-integration.js
```

## Development Commands

```powershell
# Start MCP server (for local testing)
$env:DEBUG = "cockroach-mcp:*"
node mcp-server/index.js

# Query memories for a user
psql $env:COCKROACH_DB_URL -c "
  SELECT id, content, summary, salience 
  FROM agent_memory.memories 
  WHERE user_id = 'your-user-id' 
  LIMIT 10;
"

# Test vector search directly
psql $env:COCKROACH_DB_URL -c "
  SELECT id, content, 1 - (embedding <=> '[0.5, 0.5, ...]') AS similarity
  FROM agent_memory.memories 
  WHERE user_id = 'your-user-id' AND status = 'active'
  ORDER BY embedding <=> '[0.5, 0.5, ...]'
  LIMIT 5;
"

# Export all memories for a user
psql $env:COCKROACH_DB_URL -c "
  COPY (SELECT * FROM agent_memory.memories WHERE user_id = 'your-user-id')
  TO STDOUT 
  WITH (FORMAT CSV, HEADER);
" > memories-export.csv
```

## Troubleshooting Commands

```powershell
# Set connection string manually if .env not loading
$env:COCKROACH_DB_URL = "postgresql://user:pass@cluster..."

# Check if psql is installed
Get-Command psql

# Check if Node.js is installed
node --version
npm --version

# Check if Python is installed
python --version
pip --version

# Check if MemPalace is installed
mempalace --version

# Test specific component
node scripts/test-integration.js

# View recent errors
$env:DEBUG = "*"
node scripts/test-integration.js 2>&1 | Select-String "error|ERROR|failed|FAILED"

# Clear all test data (CAUTION!)
psql $env:COCKROACH_DB_URL -c "DELETE FROM agent_memory.memories;"
```

## Database Inspection Commands

```powershell
# List all tables
psql $env:COCKROACH_DB_URL -c "\dt agent_memory.*"

# Describe memories table
psql $env:COCKROACH_DB_URL -c "\d agent_memory.memories"

# List all indexes
psql $env:COCKROACH_DB_URL -c "SELECT indexname FROM pg_indexes WHERE schemaname='agent_memory';"

# Check vector index details
psql $env:COCKROACH_DB_URL -c "SELECT * FROM pg_indexes WHERE schemaname='agent_memory' AND indexname LIKE '%embedding%';"

# Get table size
psql $env:COCKROACH_DB_URL -c "SELECT pg_size_pretty(pg_total_relation_size('agent_memory.memories'));"

# Find slow queries (if slow)
psql $env:COCKROACH_DB_URL -c "SET application_name = 'cli'; SHOW application_name;"
```

## AWS S3 Commands (Optional)

```powershell
# Configure AWS credentials (one-time)
aws configure

# List S3 buckets
aws s3 ls

# List objects in bucket
aws s3 ls s3://your-bucket-name --recursive --human-readable --summarize

# Upload a file
aws s3 cp local-file.json s3://your-bucket-name/exports/

# Download a file
aws s3 cp s3://your-bucket-name/exports/file.json ./

# Delete a file
aws s3 rm s3://your-bucket-name/exports/file.json

# Sync entire directory
aws s3 sync ./local-dir s3://your-bucket-name/backups/
```

## Environment Variable Management

```powershell
# Set temporarily (current session only)
$env:COCKROACH_DB_URL = "postgresql://..."

# Set permanently (for all future sessions)
[Environment]::SetEnvironmentVariable("COCKROACH_DB_URL", "postgresql://...", [EnvironmentVariableTarget]::User)

# View all custom environment variables
Get-ChildItem env: | Where-Object { $_.Name -like "*COCKROACH*" -or $_.Name -like "*MEMPALACE*" -or $_.Name -like "*AWS*" }

# Load .env file into current session
if (Test-Path .env) {
  Get-Content .env | ForEach-Object {
    if ($_ -match "^\s*([^=]+)=(.+)$") {
      [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2])
    }
  }
}
```

## Performance Monitoring

```powershell
# Monitor memory growth over time
psql $env:COCKROACH_DB_URL -c "
  SELECT 
    DATE_TRUNC('day', created_at) AS day,
    COUNT(*) AS memories_added,
    COUNT(DISTINCT user_id) AS unique_users
  FROM agent_memory.memories
  GROUP BY 1
  ORDER BY 1 DESC
  LIMIT 30;
"

# Analyze memory salience distribution
psql $env:COCKROACH_DB_URL -c "
  SELECT 
    ROUND(salience::numeric, 1) AS salience,
    COUNT(*) AS count,
    ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM agent_memory.memories), 1) AS percentage
  FROM agent_memory.memories
  WHERE status = 'active'
  GROUP BY 1
  ORDER BY 1 DESC;
"

# Find most active users
psql $env:COCKROACH_DB_URL -c "
  SELECT 
    user_id,
    COUNT(*) AS memories,
    COUNT(DISTINCT session_id) AS sessions,
    MAX(created_at) AS last_active
  FROM agent_memory.memories
  GROUP BY 1
  ORDER BY 2 DESC
  LIMIT 10;
"

# Check vector index efficiency
psql $env:COCKROACH_DB_URL -c "
  ANALYZE agent_memory.memories;
  EXPLAIN SELECT * FROM agent_memory.memories 
  WHERE user_id = 'test' AND status = 'active'
  ORDER BY embedding <=> '[...]'::vector
  LIMIT 5;
"
```

## Deployment Commands

```powershell
# Package Lambda functions (legacy, if using Lambda)
cd infrastructure
bash package-lambdas.sh
cd terraform

# Initialize Terraform (legacy, if using Lambda)
terraform init

# Plan Terraform changes (legacy)
terraform plan -var="cockroach_db_url=$env:COCKROACH_DB_URL"

# Apply Terraform (legacy)
terraform apply -auto-approve
```

## Clean Up & Reset

```powershell
# Delete all memories for testing
psql $env:COCKROACH_DB_URL -c "DELETE FROM agent_memory.memories;"

# Delete all sessions
psql $env:COCKROACH_DB_URL -c "DELETE FROM agent_memory.sessions;"

# Reset sync cursors
psql $env:COCKROACH_DB_URL -c "DELETE FROM agent_memory.sync_cursor;"

# Reset entire database (CAUTION!)
psql $env:COCKROACH_DB_URL -c "DROP DATABASE agent_memory;"
.\scripts\setup-cockroachdb.ps1

# Clear MemPalace local storage
Remove-Item ~/.mempalace/agent-memory -Recurse -Force
.\scripts\setup-mempalace.ps1
```

## Useful Tips & Tricks

```powershell
# Load environment variables from .env before running commands
$env | ForEach-Object {
  if ($_.Name -eq "COCKROACH_DB_URL") { $env:COCKROACH_DB_URL = $_.Value }
}

# Create a helper function for quick queries
function Query-CockroachDB($sql) {
  psql $env:COCKROACH_DB_URL -c $sql
}

# Test connection and memory count in one command
Write-Host "Testing connection..."
psql $env:COCKROACH_DB_URL -c "
  SELECT version() as version;
  SELECT COUNT(*) as total_memories FROM agent_memory.memories;
"

# Export and pretty-print all memories
psql $env:COCKROACH_DB_URL -c "
  SELECT json_agg(row_to_json(t))
  FROM (
    SELECT * FROM agent_memory.memories ORDER BY created_at DESC LIMIT 10
  ) t;
" | ConvertFrom-Json | ConvertTo-Json

# Monitor real-time memory additions (if supported)
while ($true) {
  Clear-Host
  Write-Host "Memory Count: $(psql $env:COCKROACH_DB_URL -tc "SELECT COUNT(*) FROM agent_memory.memories;")"
  Start-Sleep -Seconds 5
}
```

## File Management

```powershell
# Backup your .env (never commit this!)
Copy-Item .env .env.backup

# View entire .env file
Get-Content .env

# Check what's in mcp-config.json
Get-Content mcp-config.json | ConvertFrom-Json | ConvertTo-Json

# List all setup scripts
Get-ChildItem scripts/*.ps1

# Check project structure
tree /F /L 2
```

## Helpful Resources

- **CockroachDB CLI**: `cockroach sql --help`
- **PostgreSQL psql**: `psql --help`
- **mempalace**: `mempalace --help`
- **AWS CLI**: `aws --help`

---

**Pro Tip**: Save this file for quick reference during development!
