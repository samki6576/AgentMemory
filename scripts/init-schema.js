#!/usr/bin/env node
/**
 * Initialize CockroachDB Schema
 * Uses Node.js pg module to execute schema.sql
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const dbUrl = process.env.COCKROACH_DB_URL;

if (!dbUrl) {
  console.error('ERROR: COCKROACH_DB_URL not set in .env');
  process.exit(1);
}

const pool = new Pool({ connectionString: dbUrl });

async function initializeSchema() {
  console.log('Initializing CockroachDB schema...');
  
  try {
    // Read schema file
    const schemaPath = path.join(__dirname, '..', 'infrastructure', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Connect and execute
    const client = await pool.connect();
    console.log('✓ Connected to CockroachDB');
    
    // Execute the entire schema as one statement
    try {
      await client.query(schema);
      console.log('✓ Schema executed successfully');
    } catch (err) {
      console.log('Schema execution result:', err.message);
      // Continue - some errors may be expected (IF NOT EXISTS)
    }
    
    // Verify tables were created
    const tablesResult = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
    );
    
    const tables = tablesResult.rows.map(r => r.table_name);
    console.log('\n✓ Tables created:', tables.join(', '));
    
    if (tables.includes('memories') && tables.includes('sessions')) {
      console.log('\n✅ CockroachDB schema initialized successfully!');
    } else {
      console.log('\n⚠️  Some tables may be missing');
    }
    
    client.release();
    
  } catch (error) {
    console.error('❌ Schema initialization failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

initializeSchema();
