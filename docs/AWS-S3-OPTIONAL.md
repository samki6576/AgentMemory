# ☁️ Optional: AWS S3 Setup for Memory Exports & Logs

This is **optional** and not required for the core agent memory system to work.

If you want to meet the AWS hackathon requirement and store logs/exports, you can use Amazon S3 
(5GB free tier, no credit card required).

## Why S3?

- **Logging**: Store agent behavior logs and memory activity logs
- **Backups**: Export memory snapshots for analysis
- **Audit Trail**: Keep historical records of agent decisions
- **Integration**: Easy to share results and demos

## Setup (5 minutes)

### Step 1: Create an S3 Bucket

1. Log in to [AWS Console](https://console.aws.amazon.com)
2. Search for "S3" → Click "Create bucket"
3. Bucket name: `agent-memory-logs-your-username` (must be globally unique)
4. Region: **us-east-1** (default, free tier)
5. Block all public access: ✅ (keep checked)
6. Click "Create bucket"

### Step 2: Create IAM User for S3 Access

1. Go to **IAM** → **Users** → **Create user**
2. User name: `agent-memory-app`
3. Click "Next"
4. Click "Attach policies directly"
5. Search for `AmazonS3FullAccess` → Check it
6. Click "Next" → "Create user"

### Step 3: Create Access Keys

1. Click on the new user `agent-memory-app`
2. Go to **Security credentials** tab
3. Click "Create access key"
4. Choose "Application running outside AWS"
5. Click "Next" → "Create access key"
6. **SAVE YOUR ACCESS KEY ID AND SECRET ACCESS KEY**
   - This is the only time you'll see them!
   - Click "Download .csv file" to save them securely

### Step 4: Configure Your .env File

Add to `.env`:

```bash
# AWS S3 Configuration
AWS_ACCESS_KEY_ID=your-access-key-id-here
AWS_SECRET_ACCESS_KEY=your-secret-access-key-here
AWS_REGION=us-east-1
AWS_S3_LOGS_BUCKET=agent-memory-logs-your-username
```

**Alternative: Use AWS CLI Credentials** (More secure for production)

```bash
# Configure AWS CLI (one-time setup)
aws configure

# Then add to .env:
AWS_REGION=us-east-1
AWS_S3_LOGS_BUCKET=agent-memory-logs-your-username

# .env will use credentials from ~/.aws/credentials automatically
```

### Step 5: Test S3 Connection

```powershell
# Install AWS SDK if needed
npm install aws-sdk

# Create test-s3.js
@"
const AWS = require('aws-sdk');

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const params = {
  Bucket: process.env.AWS_S3_LOGS_BUCKET,
  Key: 'test/setup-verification.txt',
  Body: new Date().toISOString(),
};

s3.putObject(params, (err, data) => {
  if (err) {
    console.error('❌ S3 upload failed:', err.message);
    process.exit(1);
  }
  console.log('✅ S3 upload successful!');
  console.log('📍 File stored at: s3://' + params.Bucket + '/' + params.Key);
});
"@ | Out-File test-s3.js

# Run the test
node test-s3.js
```

## Using S3 for Memory Exports

### Export Memories to S3

```powershell
# Create export script
@"
const AWS = require('aws-sdk');
const { Pool } = require('pg');

const s3 = new AWS.S3();
const pool = new Pool({ connectionString: process.env.COCKROACH_DB_URL });

async function exportMemories(userId) {
  const result = await pool.query(
    'SELECT * FROM agent_memory.memories WHERE user_id = \$1 ORDER BY created_at DESC',
    [userId]
  );
  
  const key = `exports/${userId}/memories-${new Date().toISOString().slice(0,10)}.json`;
  
  await s3.putObject({
    Bucket: process.env.AWS_S3_LOGS_BUCKET,
    Key: key,
    Body: JSON.stringify(result.rows, null, 2),
    ContentType: 'application/json',
  }).promise();
  
  console.log('✅ Exported', result.rows.length, 'memories to:', key);
  process.exit(0);
}

exportMemories('user-123');
"@ | Out-File export-memories.js

# Run it
node export-memories.js
```

### Stream Agent Logs to S3

```powershell
# Simple log uploader
@"
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');

const s3 = new AWS.S3();

async function uploadLogs(logDir) {
  const files = fs.readdirSync(logDir);
  
  for (const file of files) {
    if (!file.endsWith('.log')) continue;
    
    const filePath = path.join(logDir, file);
    const key = `logs/${new Date().toISOString().slice(0,10)}/${file}`;
    
    const body = fs.readFileSync(filePath);
    
    await s3.putObject({
      Bucket: process.env.AWS_S3_LOGS_BUCKET,
      Key: key,
      Body: body,
      ContentType: 'text/plain',
    }).promise();
    
    console.log('✅ Uploaded:', key);
  }
}

uploadLogs('./logs');
"@ | Out-File upload-logs.js
```

## Monitoring S3 Usage

### Check Bucket Size

```powershell
# View objects in bucket
aws s3 ls s3://your-bucket-name --recursive --human-readable --summarize

# Example output:
# 2026-08-15 12:34:56   1.2 KB exports/user-123/memories-2026-08-15.json
# 2026-08-15 12:35:00   512 B  logs/2026-08-15/agent.log
# Total Size: 1.7 KB
```

### Set Up S3 Lifecycle Policy (Optional)

Automatically delete old logs after 90 days:

```json
{
  "Rules": [
    {
      "Id": "DeleteOldLogs",
      "Status": "Enabled",
      "Prefix": "logs/",
      "Expiration": {
        "Days": 90
      }
    }
  ]
}
```

**To apply via AWS CLI:**
```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket agent-memory-logs-your-username \
  --lifecycle-configuration file://lifecycle.json
```

## Security Best Practices

| Practice | Why | Implementation |
|----------|-----|---|
| Use IAM User | Don't use root AWS account | Created separate `agent-memory-app` user |
| Limit S3 permissions | Principle of least privilege | Only `AmazonS3FullAccess` to one bucket |
| Rotate access keys | Prevent key compromise | Change quarterly via IAM console |
| Enable versioning | Recover from accidents | `aws s3api put-bucket-versioning` |
| Enable logging | Audit S3 access | S3 → Bucket → Logging (optional) |
| Encrypt data | Protect sensitive info | S3 default encryption (SSE-S3) |

## Troubleshooting

### "Access Denied" Error

```powershell
# Check that:
1. Access Key ID and Secret are correct
2. User has AmazonS3FullAccess policy attached
3. IAM user is not new (might take a minute to propagate)

# Verify your credentials:
$env:AWS_ACCESS_KEY_ID = "your-key"
$env:AWS_SECRET_ACCESS_KEY = "your-secret"
aws s3 ls  # Should list your buckets
```

### Bucket Name Already Taken

S3 bucket names must be globally unique. If you get "bucket already exists":

```powershell
# Try a different name with timestamp
$bucketName = "agent-memory-logs-$(Get-Date -Format 'yyyyMMddHHmmss')"
Write-Host "Use bucket name: $bucketName"
```

### Credentials Not Working

```powershell
# Option 1: Use AWS CLI credentials (more secure)
aws configure  # One-time setup

# Option 2: Use environment variables directly
$env:AWS_ACCESS_KEY_ID = "AKIA..."
$env:AWS_SECRET_ACCESS_KEY = "wJa..."

# Option 3: Use credential file
# ~/.aws/credentials (auto-loaded by AWS SDK)
```

## Cost Estimate

For this hackathon project, you'll likely stay well within free tier:

| Service | Free Tier | Your Usage | Cost |
|---------|-----------|-----------|------|
| S3 Storage | 5 GB | ~10-100 MB | **$0** |
| S3 Requests | 20,000 requests | ~100-1000 | **$0** |
| Data Transfer | 100 GB/month | ~1-10 MB | **$0** |

**Total monthly cost: $0** (free tier covers everything)

## Next Steps

1. ✅ Create S3 bucket
2. ✅ Create IAM user and get credentials
3. ✅ Add credentials to `.env`
4. ✅ Test S3 connection
5. ✅ (Optional) Set up memory exports/logging
6. 🎉 You now have AWS S3 integration for the hackathon!

## Submission Notes

In your README, mention:

```markdown
## AWS Integration

This project uses **Amazon S3** (free tier, 5GB) for:
- Agent behavior logs and audit trail
- Memory snapshots and exports
- Demo artifacts and recordings

No charges incurred (within free tier).
```

---

**That's it!** You now have optional AWS S3 integration while keeping the core 
agent memory system simple and serverless.
