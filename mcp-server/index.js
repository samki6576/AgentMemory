#!/usr/bin/env node
/**
 * ============================================================================
 * Simple MCP Server for CockroachDB
 * ============================================================================
 * 
 * Provides a Model Context Protocol (MCP) interface to CockroachDB for Claude Code.
 * 
 * Features:
 * - Direct SQL query execution
 * - Vector search on agent memories
 * - Memory CRUD operations
 * - Safe parameterized queries
 * 
 * Usage:
 *   DEBUG=cockroach-mcp:* node mcp-server/index.js
 * 
 * Environment Variables:
 *   COCKROACH_DB_URL - PostgreSQL connection string
 *   DEBUG - Set to "cockroach-mcp:*" for debug output
 */

const { Pool } = require('pg');
const debug = require('debug')('cockroach-mcp');

if (!process.env.COCKROACH_DB_URL) {
  console.error('ERROR: COCKROACH_DB_URL environment variable is not set');
  console.error('Please set it to your CockroachDB connection string');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.COCKROACH_DB_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

/**
 * MCP Tool Handlers
 */

// Tool: query - Execute a SQL query
async function handleQuery(params) {
  const { sql, params: queryParams = [] } = params;
  
  debug('Executing query:', sql, 'with params:', queryParams);
  
  try {
    const result = await pool.query(sql, queryParams);
    return {
      success: true,
      rows: result.rows,
      rowCount: result.rowCount,
    };
  } catch (error) {
    debug('Query error:', error);
    return {
      success: false,
      error: error.message,
      code: error.code,
    };
  }
}

// Tool: searchMemories - Vector search for semantically similar memories
async function handleSearchMemories(params) {
  const { userId, embedding, topK = 5, minSimilarity = 0.35 } = params;
  
  if (!userId || !embedding || embedding.length !== 384) {
    return {
      success: false,
      error: 'userId and 384-dimensional embedding vector are required',
    };
  }
  
  const sql = `
    SELECT 
      id, 
      content, 
      summary, 
      tags, 
      salience,
      created_at,
      1 - (embedding <=> $1::vector) AS similarity
    FROM agent_memory.memories
    WHERE user_id = $2 AND status = 'active'
    ORDER BY embedding <=> $1::vector
    LIMIT $3
  `;
  
  try {
    const result = await pool.query(sql, [
      JSON.stringify(embedding),
      userId,
      topK,
    ]);
    
    const memories = result.rows.filter(row => row.similarity >= minSimilarity);
    
    return {
      success: true,
      memories: memories,
      count: memories.length,
    };
  } catch (error) {
    debug('Search error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Tool: storeMemory - Store a new memory
async function handleStoreMemory(params) {
  const { 
    userId, 
    sessionId, 
    content, 
    embedding, 
    summary = null, 
    tags = [], 
    salience = 0.5,
    mempalaceId = null,
  } = params;
  
  if (!userId || !sessionId || !content || !embedding || embedding.length !== 384) {
    return {
      success: false,
      error: 'userId, sessionId, content, and 384-dimensional embedding are required',
    };
  }
  
  const sql = `
    INSERT INTO agent_memory.memories 
    (user_id, session_id, content, embedding, summary, tags, salience, mempalace_id, status)
    VALUES ($1, $2, $3, $4::vector, $5, $6, $7, $8, 'active')
    ON CONFLICT (user_id, mempalace_id) WHERE mempalace_id IS NOT NULL
    DO UPDATE SET 
      content = $3,
      embedding = $4::vector,
      summary = $5,
      tags = $6,
      salience = $7,
      updated_at = now()
    RETURNING id, created_at
  `;
  
  try {
    const result = await pool.query(sql, [
      userId,
      sessionId,
      content,
      JSON.stringify(embedding),
      summary,
      tags,
      salience,
      mempalaceId,
    ]);
    
    return {
      success: true,
      id: result.rows[0].id,
      created_at: result.rows[0].created_at,
    };
  } catch (error) {
    debug('Store error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Tool: listMemories - List memories for a user
async function handleListMemories(params) {
  const { userId, limit = 20, offset = 0, status = 'active' } = params;
  
  if (!userId) {
    return {
      success: false,
      error: 'userId is required',
    };
  }
  
  const sql = `
    SELECT 
      id, 
      content, 
      summary, 
      tags, 
      salience,
      created_at,
      updated_at
    FROM agent_memory.memories
    WHERE user_id = $1 AND status = $2
    ORDER BY created_at DESC
    LIMIT $3 OFFSET $4
  `;
  
  try {
    const result = await pool.query(sql, [userId, status, limit, offset]);
    
    return {
      success: true,
      memories: result.rows,
      count: result.rows.length,
    };
  } catch (error) {
    debug('List error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Tool: getMemory - Get a specific memory by ID
async function handleGetMemory(params) {
  const { id } = params;
  
  if (!id) {
    return {
      success: false,
      error: 'id is required',
    };
  }
  
  const sql = `
    SELECT *
    FROM agent_memory.memories
    WHERE id = $1
  `;
  
  try {
    const result = await pool.query(sql, [id]);
    
    if (result.rows.length === 0) {
      return {
        success: false,
        error: 'Memory not found',
      };
    }
    
    return {
      success: true,
      memory: result.rows[0],
    };
  } catch (error) {
    debug('Get error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Tool: deleteMemory - Delete/archive a memory
async function handleDeleteMemory(params) {
  const { id, hard = false } = params;
  
  if (!id) {
    return {
      success: false,
      error: 'id is required',
    };
  }
  
  const sql = hard
    ? 'DELETE FROM agent_memory.memories WHERE id = $1'
    : `UPDATE agent_memory.memories SET status = 'deleted', updated_at = now() WHERE id = $1`;
  
  try {
    await pool.query(sql, [id]);
    
    return {
      success: true,
      deleted: true,
    };
  } catch (error) {
    debug('Delete error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Tool: getStats - Get memory stats for a user
async function handleGetStats(params) {
  const { userId } = params;
  
  if (!userId) {
    return {
      success: false,
      error: 'userId is required',
    };
  }
  
  const sql = `
    SELECT 
      COUNT(*) as total_memories,
      COUNT(CASE WHEN status = 'active' THEN 1 END) as active_memories,
      COUNT(CASE WHEN status = 'archived' THEN 1 END) as archived_memories,
      ROUND(AVG(salience)::numeric, 2) as avg_salience,
      ROUND(MAX(salience)::numeric, 2) as max_salience,
      COUNT(DISTINCT tags[1]) as unique_tags
    FROM agent_memory.memories
    WHERE user_id = $1
  `;
  
  try {
    const result = await pool.query(sql, [userId]);
    
    return {
      success: true,
      stats: result.rows[0],
    };
  } catch (error) {
    debug('Stats error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * MCP Tool Definitions
 */

const tools = [
  {
    name: 'query',
    description: 'Execute a SQL query against CockroachDB. Use parameterized queries to avoid SQL injection.',
    inputSchema: {
      type: 'object',
      properties: {
        sql: {
          type: 'string',
          description: 'SQL query with $1, $2, etc. for parameters',
        },
        params: {
          type: 'array',
          description: 'Query parameters',
        },
      },
      required: ['sql'],
    },
  },
  {
    name: 'searchMemories',
    description: 'Vector search for semantically similar memories for a user',
    inputSchema: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: 'User ID to search memories for',
        },
        embedding: {
          type: 'array',
          description: '384-dimensional embedding vector',
        },
        topK: {
          type: 'number',
          description: 'Number of results to return (default: 5)',
        },
        minSimilarity: {
          type: 'number',
          description: 'Minimum similarity score (0-1, default: 0.35)',
        },
      },
      required: ['userId', 'embedding'],
    },
  },
  {
    name: 'storeMemory',
    description: 'Store a new memory or update an existing one',
    inputSchema: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: 'User ID',
        },
        sessionId: {
          type: 'string',
          description: 'Session ID',
        },
        content: {
          type: 'string',
          description: 'Memory content',
        },
        embedding: {
          type: 'array',
          description: '384-dimensional embedding vector',
        },
        summary: {
          type: 'string',
          description: 'Brief summary (optional)',
        },
        tags: {
          type: 'array',
          description: 'Tags for categorization',
        },
        salience: {
          type: 'number',
          description: 'Importance score 0-1 (default: 0.5)',
        },
        mempalaceId: {
          type: 'string',
          description: 'MemPalace local ID for idempotent syncing',
        },
      },
      required: ['userId', 'sessionId', 'content', 'embedding'],
    },
  },
  {
    name: 'listMemories',
    description: 'List memories for a user',
    inputSchema: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: 'User ID',
        },
        limit: {
          type: 'number',
          description: 'Number of results (default: 20)',
        },
        offset: {
          type: 'number',
          description: 'Pagination offset (default: 0)',
        },
        status: {
          type: 'string',
          enum: ['active', 'archived', 'deleted'],
          description: 'Filter by status (default: active)',
        },
      },
      required: ['userId'],
    },
  },
  {
    name: 'getMemory',
    description: 'Get a specific memory by ID',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Memory ID (UUID)',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'deleteMemory',
    description: 'Soft-delete or hard-delete a memory',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Memory ID (UUID)',
        },
        hard: {
          type: 'boolean',
          description: 'If true, permanently delete; if false, just mark as deleted (default: false)',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'getStats',
    description: 'Get memory statistics for a user',
    inputSchema: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: 'User ID',
        },
      },
      required: ['userId'],
    },
  },
];

/**
 * MCP Server Initialization
 * 
 * This is a simple stdio-based MCP server. In production, you might use
 * an existing MCP SDK, but this demonstrates the protocol directly.
 */

async function handleToolCall(toolName, params) {
  debug(`Tool called: ${toolName}`, params);
  
  switch (toolName) {
    case 'query':
      return await handleQuery(params);
    case 'searchMemories':
      return await handleSearchMemories(params);
    case 'storeMemory':
      return await handleStoreMemory(params);
    case 'listMemories':
      return await handleListMemories(params);
    case 'getMemory':
      return await handleGetMemory(params);
    case 'deleteMemory':
      return await handleDeleteMemory(params);
    case 'getStats':
      return await handleGetStats(params);
    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
}

/**
 * MCP Server Startup
 */

console.error('[MCP Server] Starting CockroachDB MCP Server');
console.error('[MCP Server] Using:', process.env.COCKROACH_DB_URL.split('@')[1] || 'localhost');

// Test connection
pool.query('SELECT version()')
  .then((result) => {
    console.error('[MCP Server] Connected to:', result.rows[0].version.split(',')[0]);
    console.error('[MCP Server] Ready. Waiting for messages...');
  })
  .catch((error) => {
    console.error('[MCP Server] Connection failed:', error.message);
    process.exit(1);
  });

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

const server = new Server(
  {
    name: "cockroachdb-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: tools,
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const result = await handleToolCall(request.params.name, request.params.arguments);
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    isError: !result.success,
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[MCP Server] Ready and listening on stdio...');
}

main().catch(error => {
  console.error("Server error:", error);
  process.exit(1);
});

module.exports = {
  pool,
  tools,
  handleToolCall,
};
