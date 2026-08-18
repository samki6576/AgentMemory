#!/usr/bin/env node
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.COCKROACH_DB_URL });

async function check() {
  const client = await pool.connect();
  
  try {
    console.log('\n=== Current Database ===');
    const dbResult = await client.query("SELECT current_database();");
    console.log('Database:', dbResult.rows[0].current_database);
    
    console.log('\n=== Schemas ===');
    const schemas = await client.query(
      "SELECT schema_name FROM information_schema.schemata ORDER BY schema_name;"
    );
    schemas.rows.forEach(r => console.log(' -', r.schema_name));
    
    console.log('\n=== All Tables ===');
    const tables = await client.query(
      "SELECT table_schema, table_name FROM information_schema.tables ORDER BY table_schema, table_name;"
    );
    tables.rows.forEach(r => console.log(' -', r.table_schema + '.' + r.table_name));
    
    console.log('\n=== Indexes ===');
    const indexes = await client.query(
      "SELECT schemaname, tablename, indexname FROM pg_indexes ORDER BY schemaname, tablename;"
    );
    if (indexes.rows.length === 0) {
      console.log(' (none)');
    } else {
      indexes.rows.forEach(r => console.log(' -', r.schemaname + '.' + r.tablename + ' -> ' + r.indexname));
    }
    
  } finally {
    client.release();
    await pool.end();
  }
}

check().catch(console.error);
