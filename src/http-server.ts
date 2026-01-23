/**
 * Remote HTTP MCP Server for Caspio
 *
 * This implements a Streamable HTTP transport MCP server with OAuth 2.1 support,
 * allowing users to connect via Claude, ChatGPT, and other MCP clients using
 * their own Caspio credentials.
 */

import http from 'http';
import { URL, URLSearchParams } from 'url';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { CaspioClient } from './caspio-client.js';

// ==================== Types ====================

interface OAuthSession {
  caspioBaseUrl: string;
  caspioClientId: string;
  caspioClientSecret: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  createdAt: number;
}

interface PendingAuth {
  codeChallenge: string;
  codeChallengeMethod: string;
  redirectUri: string;
  state: string;
  caspioBaseUrl?: string;
  caspioClientId?: string;
  caspioClientSecret?: string;
  createdAt: number;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, any>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

// ==================== Configuration ====================

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

// BASE_URL must be set for production deployments
// Railway provides RAILWAY_PUBLIC_DOMAIN automatically
const RAILWAY_URL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : null;
const BASE_URL = process.env.BASE_URL || RAILWAY_URL || `http://localhost:${PORT}`;

// Session persistence file path
// Use RAILWAY_VOLUME_MOUNT_PATH if available (Railway persistent volume)
// Otherwise fall back to local data directory
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.DATA_DIR || './data';
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

// Log configuration on startup
console.log(`[Config] PORT=${PORT}, BASE_URL=${BASE_URL}, DATA_DIR=${DATA_DIR}`);

// In-memory storage (sessions are persisted to file)
const sessions = new Map<string, OAuthSession>();
const pendingAuths = new Map<string, PendingAuth>();
const authCodes = new Map<string, { sessionId: string; expiresAt: number }>();

// ==================== Session Persistence ====================

/**
 * Ensure data directory exists
 */
function ensureDataDir(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      console.log(`[Sessions] Created data directory: ${DATA_DIR}`);
    }
  } catch (err) {
    console.error(`[Sessions] Failed to create data directory: ${err}`);
  }
}

/**
 * Load sessions from file on startup
 */
function loadSessions(): void {
  try {
    ensureDataDir();
    if (fs.existsSync(SESSIONS_FILE)) {
      const data = fs.readFileSync(SESSIONS_FILE, 'utf-8');
      const parsed = JSON.parse(data) as Record<string, OAuthSession>;
      const now = Date.now();
      let loaded = 0;
      let expired = 0;

      for (const [key, session] of Object.entries(parsed)) {
        // Only load non-expired sessions
        if (session.expiresAt > now) {
          sessions.set(key, session);
          loaded++;
        } else {
          expired++;
        }
      }
      console.log(`[Sessions] Loaded ${loaded} sessions from file (${expired} expired sessions skipped)`);
    } else {
      console.log('[Sessions] No existing sessions file found, starting fresh');
    }
  } catch (err) {
    console.error(`[Sessions] Failed to load sessions: ${err}`);
  }
}

/**
 * Save sessions to file
 */
function saveSessions(): void {
  try {
    ensureDataDir();
    const data: Record<string, OAuthSession> = {};
    for (const [key, session] of sessions) {
      data[key] = session;
    }
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(data, null, 2));
    console.log(`[Sessions] Saved ${sessions.size} sessions to file`);
  } catch (err) {
    console.error(`[Sessions] Failed to save sessions: ${err}`);
  }
}

/**
 * Add or update a session (and persist to file)
 */
function setSession(sessionId: string, session: OAuthSession): void {
  sessions.set(sessionId, session);
  saveSessions();
}

/**
 * Delete a session (and persist to file)
 */
function deleteSession(sessionId: string): boolean {
  const result = sessions.delete(sessionId);
  if (result) {
    saveSessions();
  }
  return result;
}

// Load sessions on startup
loadSessions();

// Cleanup old sessions periodically
setInterval(() => {
  const now = Date.now();
  let sessionsDeleted = 0;
  for (const [key, session] of sessions) {
    if (session.expiresAt < now) {
      sessions.delete(key);
      sessionsDeleted++;
    }
  }
  // Save if any sessions were deleted
  if (sessionsDeleted > 0) {
    saveSessions();
  }
  for (const [key, pending] of pendingAuths) {
    if (pending.createdAt + 600000 < now) { // 10 min expiry
      pendingAuths.delete(key);
    }
  }
  for (const [key, code] of authCodes) {
    if (code.expiresAt < now) {
      authCodes.delete(key);
    }
  }
}, 60000);

// ==================== Utility Functions ====================

function generateId(): string {
  return crypto.randomBytes(32).toString('hex');
}

function parseBasicAuth(header: string): { clientId: string; clientSecret: string } | null {
  if (!header.startsWith('Basic ')) return null;
  const decoded = Buffer.from(header.slice(6), 'base64').toString();
  const [clientId, clientSecret] = decoded.split(':');
  if (!clientId) return null;
  return { clientId, clientSecret: clientSecret || '' };
}

function sendJson(res: http.ServerResponse, status: number, data: any): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(JSON.stringify(data));
}

function sendHtml(res: http.ServerResponse, status: number, html: string): void {
  res.writeHead(status, {
    'Content-Type': 'text/html',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(html);
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => resolve(body));
  });
}

function verifyCodeChallenge(verifier: string, challenge: string, method: string): boolean {
  if (method === 'plain') {
    return verifier === challenge;
  } else if (method === 'S256') {
    const hash = crypto.createHash('sha256').update(verifier).digest('base64url');
    return hash === challenge;
  }
  return false;
}

// ==================== OAuth Endpoints ====================

/**
 * OAuth Protected Resource Metadata
 * Required by MCP spec - tells clients how to authenticate
 */
function handleProtectedResourceMetadata(res: http.ServerResponse): void {
  sendJson(res, 200, {
    resource: BASE_URL,
    authorization_servers: [`${BASE_URL}`],
    scopes_supported: ['caspio:read', 'caspio:write', 'caspio:admin'],
    bearer_methods_supported: ['header'],
    resource_documentation: 'https://github.com/your-repo/caspio-mcp-server',
  });
}

/**
 * OAuth Authorization Server Metadata
 * Required by MCP spec - tells clients about OAuth endpoints
 */
function handleAuthServerMetadata(res: http.ServerResponse): void {
  sendJson(res, 200, {
    issuer: BASE_URL,
    authorization_endpoint: `${BASE_URL}/oauth/authorize`,
    token_endpoint: `${BASE_URL}/oauth/token`,
    registration_endpoint: `${BASE_URL}/oauth/register`,
    scopes_supported: ['caspio:read', 'caspio:write', 'caspio:admin'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'],
    code_challenge_methods_supported: ['S256', 'plain'],
    service_documentation: 'https://github.com/your-repo/caspio-mcp-server',
  });
}

/**
 * Dynamic Client Registration
 * Allows MCP clients to register themselves
 */
async function handleClientRegistration(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readBody(req);
  let data: any;
  try {
    data = JSON.parse(body);
  } catch {
    sendJson(res, 400, { error: 'invalid_request', error_description: 'Invalid JSON' });
    return;
  }

  // For simplicity, we accept any client and generate credentials
  const clientId = generateId();
  const clientSecret = generateId();

  sendJson(res, 201, {
    client_id: clientId,
    client_secret: clientSecret,
    client_name: data.client_name || 'MCP Client',
    redirect_uris: data.redirect_uris || [],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: data.token_endpoint_auth_method || 'client_secret_basic',
  });
}

/**
 * Authorization Endpoint
 * Shows UI for user to enter Caspio credentials
 */
function handleAuthorize(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = new URL(req.url || '/', BASE_URL);
  const params = url.searchParams;

  const responseType = params.get('response_type');
  const clientId = params.get('client_id');
  const redirectUri = params.get('redirect_uri');
  const state = params.get('state');
  const codeChallenge = params.get('code_challenge');
  const codeChallengeMethod = params.get('code_challenge_method') || 'plain';

  if (responseType !== 'code') {
    sendJson(res, 400, { error: 'unsupported_response_type' });
    return;
  }

  if (!redirectUri) {
    sendJson(res, 400, { error: 'invalid_request', error_description: 'redirect_uri required' });
    return;
  }

  // Store pending authorization
  const authId = generateId();
  pendingAuths.set(authId, {
    codeChallenge: codeChallenge || '',
    codeChallengeMethod,
    redirectUri,
    state: state || '',
    createdAt: Date.now(),
  });

  // Render authorization page where user enters Caspio credentials
  const html = getAuthorizationPageHtml(authId, clientId || '', redirectUri, state || '');
  sendHtml(res, 200, html);
}

/**
 * Handle authorization form submission
 */
async function handleAuthorizeSubmit(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readBody(req);
  const params = new URLSearchParams(body);

  const authId = params.get('auth_id');
  const caspioBaseUrl = params.get('caspio_base_url')?.replace(/\/$/, '');
  const caspioClientId = params.get('caspio_client_id');
  const caspioClientSecret = params.get('caspio_client_secret');

  if (!authId || !pendingAuths.has(authId)) {
    sendJson(res, 400, { error: 'invalid_request', error_description: 'Invalid or expired authorization' });
    return;
  }

  if (!caspioBaseUrl || !caspioClientId || !caspioClientSecret) {
    sendHtml(res, 400, getAuthorizationPageHtml(authId, '', '', '', 'Please fill in all fields'));
    return;
  }

  // Test connection to Caspio
  try {
    const client = new CaspioClient({
      baseUrl: caspioBaseUrl,
      clientId: caspioClientId,
      clientSecret: caspioClientSecret,
    });

    const connected = await client.testConnection();
    if (!connected) {
      sendHtml(res, 400, getAuthorizationPageHtml(authId, '', '', '', 'Failed to connect to Caspio. Please check your credentials.'));
      return;
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    sendHtml(res, 400, getAuthorizationPageHtml(authId, '', '', '', `Connection failed: ${errorMsg}`));
    return;
  }

  const pending = pendingAuths.get(authId)!;
  pending.caspioBaseUrl = caspioBaseUrl;
  pending.caspioClientId = caspioClientId;
  pending.caspioClientSecret = caspioClientSecret;

  // Generate authorization code
  const code = generateId();
  const sessionId = generateId();

  // Create session (persisted to file)
  setSession(sessionId, {
    caspioBaseUrl,
    caspioClientId,
    caspioClientSecret,
    accessToken: '', // Will be set on token exchange
    refreshToken: '',
    expiresAt: Date.now() + 86400000, // 24 hours
    createdAt: Date.now(),
  });

  // Store code -> session mapping
  authCodes.set(code, {
    sessionId,
    expiresAt: Date.now() + 600000, // 10 minutes
  });

  // Redirect back to client
  const redirectUrl = new URL(pending.redirectUri);
  redirectUrl.searchParams.set('code', code);
  if (pending.state) {
    redirectUrl.searchParams.set('state', pending.state);
  }

  pendingAuths.delete(authId);

  res.writeHead(302, { Location: redirectUrl.toString() });
  res.end();
}

/**
 * Token Endpoint
 * Exchange authorization code for access token
 */
async function handleToken(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readBody(req);
  const params = new URLSearchParams(body);

  const grantType = params.get('grant_type');

  if (grantType === 'authorization_code') {
    const code = params.get('code');
    const codeVerifier = params.get('code_verifier');

    if (!code || !authCodes.has(code)) {
      sendJson(res, 400, { error: 'invalid_grant', error_description: 'Invalid or expired code' });
      return;
    }

    const codeData = authCodes.get(code)!;
    if (codeData.expiresAt < Date.now()) {
      authCodes.delete(code);
      sendJson(res, 400, { error: 'invalid_grant', error_description: 'Code expired' });
      return;
    }

    const session = sessions.get(codeData.sessionId);
    if (!session) {
      sendJson(res, 400, { error: 'invalid_grant', error_description: 'Session not found' });
      return;
    }

    // Generate tokens
    const accessToken = generateId();
    const refreshToken = generateId();

    session.accessToken = accessToken;
    session.refreshToken = refreshToken;
    session.expiresAt = Date.now() + 86400000; // 24 hours

    // Persist updated session to file
    setSession(codeData.sessionId, session);

    // Clean up code
    authCodes.delete(code);

    sendJson(res, 200, {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 86400,
      refresh_token: refreshToken,
      scope: 'caspio:read caspio:write caspio:admin',
    });

  } else if (grantType === 'refresh_token') {
    const refreshToken = params.get('refresh_token');

    if (!refreshToken) {
      sendJson(res, 400, { error: 'invalid_request', error_description: 'refresh_token required' });
      return;
    }

    // Find session with this refresh token
    let foundSession: OAuthSession | null = null;
    let foundSessionId: string | null = null;
    for (const [id, session] of sessions) {
      if (session.refreshToken === refreshToken) {
        foundSession = session;
        foundSessionId = id;
        break;
      }
    }

    if (!foundSession || !foundSessionId) {
      sendJson(res, 400, { error: 'invalid_grant', error_description: 'Invalid refresh token' });
      return;
    }

    // Generate new tokens
    const newAccessToken = generateId();
    const newRefreshToken = generateId();

    foundSession.accessToken = newAccessToken;
    foundSession.refreshToken = newRefreshToken;
    foundSession.expiresAt = Date.now() + 86400000;

    // Persist updated session to file
    setSession(foundSessionId, foundSession);

    sendJson(res, 200, {
      access_token: newAccessToken,
      token_type: 'Bearer',
      expires_in: 86400,
      refresh_token: newRefreshToken,
      scope: 'caspio:read caspio:write caspio:admin',
    });

  } else {
    sendJson(res, 400, { error: 'unsupported_grant_type' });
  }
}

// ==================== MCP Protocol Handler ====================

function getSessionFromRequest(req: http.IncomingMessage): OAuthSession | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7);
  for (const session of sessions.values()) {
    if (session.accessToken === token) {
      return session;
    }
  }
  return null;
}

async function handleMcpRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readBody(req);

  // Log incoming requests for debugging
  console.log(`[MCP] ${req.method} /mcp - Body length: ${body.length}`);

  // Handle empty body (some clients send empty POST to check endpoint)
  if (!body || body.trim() === '') {
    console.log('[MCP] Empty body received, returning server info');
    sendJson(res, 200, {
      jsonrpc: '2.0',
      id: null,
      result: {
        name: 'caspio-mcp-server',
        version: '1.0.0',
        protocolVersion: '2024-11-05',
      },
    });
    return;
  }

  let rpcRequest: JsonRpcRequest;
  try {
    rpcRequest = JSON.parse(body);
  } catch (parseError) {
    console.error('[MCP] JSON parse error:', parseError, 'Body:', body.substring(0, 200));
    sendJson(res, 400, {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error: Invalid JSON' },
    });
    return;
  }

  console.log(`[MCP] Method: ${rpcRequest.method}, ID: ${rpcRequest.id}`);

  // Allow certain methods without authentication for quick responses
  // This enables MCP clients to discover available tools before auth
  const unauthenticatedMethods = ['initialize', 'tools/list', 'notifications/initialized', 'resources/list', 'resources/read'];

  if (unauthenticatedMethods.includes(rpcRequest.method)) {
    try {
      const result = await handleMcpMethodUnauthenticated(rpcRequest);
      sendJson(res, 200, {
        jsonrpc: '2.0',
        id: rpcRequest.id,
        result,
      });
    } catch (error) {
      sendJson(res, 200, {
        jsonrpc: '2.0',
        id: rpcRequest.id,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Internal error',
        },
      });
    }
    return;
  }

  // All other methods require authentication
  const session = getSessionFromRequest(req);
  if (!session) {
    res.writeHead(401, {
      'WWW-Authenticate': `Bearer resource_metadata="${BASE_URL}/.well-known/oauth-protected-resource"`,
      'Content-Type': 'application/json',
    });
    res.end(JSON.stringify({ error: 'unauthorized' }));
    return;
  }

  // Create Caspio client for this session
  const caspioClient = new CaspioClient({
    baseUrl: session.caspioBaseUrl,
    clientId: session.caspioClientId,
    clientSecret: session.caspioClientSecret,
  });

  try {
    const result = await handleMcpMethodAuthenticated(rpcRequest, caspioClient);
    sendJson(res, 200, {
      jsonrpc: '2.0',
      id: rpcRequest.id,
      result,
    });
  } catch (error) {
    sendJson(res, 200, {
      jsonrpc: '2.0',
      id: rpcRequest.id,
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : 'Internal error',
      },
    });
  }
}

// Tool definitions with proper JSON Schema (compatible with ChatGPT, Gemini, Claude, etc.)
function getToolDefinitions() {
  // Reusable schema definitions
  const columnSchema = {
    type: 'object',
    properties: {
      Name: { type: 'string', description: 'Column name' },
      Type: { type: 'string', description: 'Data type (e.g., STRING, NUMBER, BOOLEAN, DATE/TIME, etc.)' },
      Unique: { type: 'boolean', description: 'Whether values must be unique' },
      Description: { type: 'string', description: 'Column description' },
      Length: { type: 'integer', description: 'Maximum length for string fields' },
    },
    required: ['Name', 'Type'],
    additionalProperties: true,
  };

  const fieldSchema = {
    type: 'object',
    properties: {
      Name: { type: 'string', description: 'Field name' },
      Type: { type: 'string', description: 'Data type (e.g., STRING, NUMBER, BOOLEAN, DATE/TIME, etc.)' },
      Unique: { type: 'boolean', description: 'Whether values must be unique' },
      Description: { type: 'string', description: 'Field description' },
      Length: { type: 'integer', description: 'Maximum length for string fields' },
    },
    required: ['Name', 'Type'],
    additionalProperties: true,
  };

  const recordSchema = {
    type: 'object',
    description: 'Key-value pairs where keys are field names and values are field values',
    additionalProperties: true,
  };

  return [
    // Tables
    {
      name: 'caspio_list_tables',
      description: 'List all tables in the Caspio account',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: 'caspio_get_table_schema',
      description: 'Get the schema/definition of a specific table including all field definitions',
      inputSchema: {
        type: 'object',
        properties: {
          tableName: { type: 'string', description: 'Name of the table' },
        },
        required: ['tableName'],
        additionalProperties: false,
      },
    },
    {
      name: 'caspio_create_table',
      description: 'Create a new table in Caspio',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name for the new table' },
          columns: {
            type: 'array',
            description: 'Array of column definitions',
            items: columnSchema,
            minItems: 1,
          },
          note: { type: 'string', description: 'Optional description/note for the table' },
        },
        required: ['name', 'columns'],
        additionalProperties: false,
      },
    },
    {
      name: 'caspio_delete_table',
      description: 'Delete a table from Caspio (USE WITH CAUTION - this action is irreversible)',
      inputSchema: {
        type: 'object',
        properties: {
          tableName: { type: 'string', description: 'Name of the table to delete' },
          confirm: { type: 'boolean', description: 'Must be true to confirm deletion' },
        },
        required: ['tableName', 'confirm'],
        additionalProperties: false,
      },
    },
    {
      name: 'caspio_add_field',
      description: 'Add a new field/column to an existing table',
      inputSchema: {
        type: 'object',
        properties: {
          tableName: { type: 'string', description: 'Name of the table' },
          field: fieldSchema,
        },
        required: ['tableName', 'field'],
        additionalProperties: false,
      },
    },
    {
      name: 'caspio_delete_field',
      description: 'Delete a field/column from a table (USE WITH CAUTION - this action is irreversible)',
      inputSchema: {
        type: 'object',
        properties: {
          tableName: { type: 'string', description: 'Name of the table' },
          fieldName: { type: 'string', description: 'Name of the field to delete' },
          confirm: { type: 'boolean', description: 'Must be true to confirm deletion' },
        },
        required: ['tableName', 'fieldName', 'confirm'],
        additionalProperties: false,
      },
    },

    // Records
    {
      name: 'caspio_get_records',
      description: 'Get records from a table with optional filtering, sorting, and pagination',
      inputSchema: {
        type: 'object',
        properties: {
          tableName: { type: 'string', description: 'Name of the table' },
          select: { type: 'string', description: 'Comma-separated list of fields to return' },
          where: { type: 'string', description: 'Filter condition (e.g., "Status=\'Active\' AND Age>21")' },
          orderBy: { type: 'string', description: 'Sort order (e.g., "LastName ASC, FirstName DESC")' },
          groupBy: { type: 'string', description: 'Group by fields' },
          limit: { type: 'integer', description: 'Maximum number of records to return' },
          pageNumber: { type: 'integer', description: 'Page number for pagination (1-based)' },
          pageSize: { type: 'integer', description: 'Number of records per page' },
        },
        required: ['tableName'],
        additionalProperties: false,
      },
    },
    {
      name: 'caspio_create_record',
      description: 'Create a new record in a table',
      inputSchema: {
        type: 'object',
        properties: {
          tableName: { type: 'string', description: 'Name of the table' },
          record: recordSchema,
        },
        required: ['tableName', 'record'],
        additionalProperties: false,
      },
    },
    {
      name: 'caspio_create_records',
      description: 'Create multiple records in a table at once (batch insert)',
      inputSchema: {
        type: 'object',
        properties: {
          tableName: { type: 'string', description: 'Name of the table' },
          records: {
            type: 'array',
            description: 'Array of records to create',
            items: recordSchema,
            minItems: 1,
          },
        },
        required: ['tableName', 'records'],
        additionalProperties: false,
      },
    },
    {
      name: 'caspio_update_records',
      description: 'Update records matching a WHERE clause',
      inputSchema: {
        type: 'object',
        properties: {
          tableName: { type: 'string', description: 'Name of the table' },
          updates: {
            type: 'object',
            description: 'Key-value pairs of fields to update',
            additionalProperties: true,
          },
          where: { type: 'string', description: 'Filter condition to match records (e.g., "ID=123")' },
        },
        required: ['tableName', 'updates', 'where'],
        additionalProperties: false,
      },
    },
    {
      name: 'caspio_delete_records',
      description: 'Delete records matching a WHERE clause (USE WITH CAUTION - this action is irreversible)',
      inputSchema: {
        type: 'object',
        properties: {
          tableName: { type: 'string', description: 'Name of the table' },
          where: { type: 'string', description: 'Filter condition to match records (e.g., "Status=\'Inactive\'")' },
          confirm: { type: 'boolean', description: 'Must be true to confirm deletion' },
        },
        required: ['tableName', 'where', 'confirm'],
        additionalProperties: false,
      },
    },

    // Views
    {
      name: 'caspio_list_views',
      description: 'List all views in the Caspio account',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: 'caspio_get_view_schema',
      description: 'Get the schema/definition of a specific view',
      inputSchema: {
        type: 'object',
        properties: {
          viewName: { type: 'string', description: 'Name of the view' },
        },
        required: ['viewName'],
        additionalProperties: false,
      },
    },
    {
      name: 'caspio_get_view_records',
      description: 'Get records from a view with optional filtering and sorting',
      inputSchema: {
        type: 'object',
        properties: {
          viewName: { type: 'string', description: 'Name of the view' },
          select: { type: 'string', description: 'Comma-separated list of fields to return' },
          where: { type: 'string', description: 'Filter condition' },
          orderBy: { type: 'string', description: 'Sort order' },
          limit: { type: 'integer', description: 'Maximum number of records to return' },
          pageNumber: { type: 'integer', description: 'Page number for pagination (1-based)' },
          pageSize: { type: 'integer', description: 'Number of records per page' },
        },
        required: ['viewName'],
        additionalProperties: false,
      },
    },

    // Applications
    {
      name: 'caspio_list_applications',
      description: 'List all applications in the Caspio account',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: 'caspio_get_application',
      description: 'Get details of a specific application',
      inputSchema: {
        type: 'object',
        properties: {
          appName: { type: 'string', description: 'Name of the application' },
        },
        required: ['appName'],
        additionalProperties: false,
      },
    },

    // Files
    {
      name: 'caspio_list_files',
      description: 'List files in a folder',
      inputSchema: {
        type: 'object',
        properties: {
          folderPath: { type: 'string', description: 'Path to the folder (default: root folder "/")' },
        },
        additionalProperties: false,
      },
    },
    {
      name: 'caspio_get_file_metadata',
      description: 'Get metadata for a specific file',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Path to the file' },
        },
        required: ['filePath'],
        additionalProperties: false,
      },
    },
    {
      name: 'caspio_delete_file',
      description: 'Delete a file (USE WITH CAUTION - this action is irreversible)',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Path to the file' },
          confirm: { type: 'boolean', description: 'Must be true to confirm deletion' },
        },
        required: ['filePath', 'confirm'],
        additionalProperties: false,
      },
    },

    // Tasks
    {
      name: 'caspio_list_tasks',
      description: 'List all scheduled tasks',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: 'caspio_get_task',
      description: 'Get details of a specific scheduled task',
      inputSchema: {
        type: 'object',
        properties: {
          taskName: { type: 'string', description: 'Name of the task' },
        },
        required: ['taskName'],
        additionalProperties: false,
      },
    },
    {
      name: 'caspio_run_task',
      description: 'Manually run a scheduled task',
      inputSchema: {
        type: 'object',
        properties: {
          taskName: { type: 'string', description: 'Name of the task to run' },
        },
        required: ['taskName'],
        additionalProperties: false,
      },
    },

    // Utility
    {
      name: 'caspio_test_connection',
      description: 'Test the connection to Caspio API',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: 'caspio_get_account_summary',
      description: 'Get a summary of the Caspio account including tables, views, and applications',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  ];
}

// Handle methods that don't require authentication
async function handleMcpMethodUnauthenticated(request: JsonRpcRequest): Promise<any> {
  const { method } = request;

  switch (method) {
    case 'initialize':
      return {
        protocolVersion: '2024-11-05',
        serverInfo: {
          name: 'caspio-mcp-server',
          version: '1.0.0',
        },
        capabilities: {
          tools: {},
          // Resources disabled - use tools instead for better performance
          // resources: {},
        },
      };

    case 'notifications/initialized':
      return {};

    case 'tools/list':
      return {
        tools: getToolDefinitions(),
      };

    case 'resources/list':
      // Return empty list - resources are not used, use tools instead
      return { resources: [] };

    case 'resources/read':
      // Resources not available - use tools instead
      throw new Error('Resources not available. Use caspio_get_table_schema or caspio_get_view_schema tools instead.');

    default:
      throw new Error(`Method ${method} requires authentication`);
  }
}

// Handle methods that require authentication
async function handleMcpMethodAuthenticated(request: JsonRpcRequest, client: CaspioClient): Promise<any> {
  const { method, params = {} } = request;

  switch (method) {
    case 'tools/call':
      return await executeTool(params.name, params.arguments || {}, client);

    case 'resources/list':
      try {
        const tables = await client.listTables();
        const views = await client.listViews();
        return {
          resources: [
            ...tables.map(t => ({ uri: `caspio://tables/${t}/schema`, name: `Table: ${t}`, mimeType: 'application/json' })),
            ...views.map(v => ({ uri: `caspio://views/${v}/schema`, name: `View: ${v}`, mimeType: 'application/json' })),
          ],
        };
      } catch {
        return { resources: [] };
      }

    case 'resources/read':
      const uri = params.uri as string;
      const tableMatch = uri.match(/^caspio:\/\/tables\/([^/]+)\/schema$/);
      const viewMatch = uri.match(/^caspio:\/\/views\/([^/]+)\/schema$/);

      if (tableMatch) {
        const schema = await client.getTableDefinition(decodeURIComponent(tableMatch[1]));
        return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(schema, null, 2) }] };
      }
      if (viewMatch) {
        const schema = await client.getViewDefinition(decodeURIComponent(viewMatch[1]));
        return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(schema, null, 2) }] };
      }
      throw new Error(`Unknown resource: ${uri}`);

    default:
      throw new Error(`Unknown method: ${method}`);
  }
}

async function executeTool(name: string, args: Record<string, any>, client: CaspioClient): Promise<any> {
  let result: any;

  switch (name) {
    // Tables
    case 'caspio_list_tables':
      result = { tables: await client.listTables() };
      break;
    case 'caspio_get_table_schema':
      result = await client.getTableDefinition(args.tableName);
      break;
    case 'caspio_create_table':
      await client.createTable({
        Name: args.name,
        Note: args.note,
        Columns: args.columns,
      });
      result = { success: true, message: `Table '${args.name}' created successfully` };
      break;
    case 'caspio_delete_table':
      if (!args.confirm) throw new Error('Deletion not confirmed. Set confirm=true to proceed.');
      await client.deleteTable(args.tableName);
      result = { success: true, message: `Table '${args.tableName}' deleted` };
      break;
    case 'caspio_add_field':
      await client.addField(args.tableName, args.field);
      result = { success: true, message: `Field added to '${args.tableName}'` };
      break;
    case 'caspio_delete_field':
      if (!args.confirm) throw new Error('Deletion not confirmed. Set confirm=true to proceed.');
      await client.deleteField(args.tableName, args.fieldName);
      result = { success: true, message: `Field '${args.fieldName}' deleted from '${args.tableName}'` };
      break;

    // Records
    case 'caspio_get_records':
      const records = await client.getRecords(args.tableName, {
        where: args.where,
        orderBy: args.orderBy,
        limit: args.limit,
        pageNumber: args.pageNumber,
        pageSize: args.pageSize,
        select: args.select,
        groupBy: args.groupBy,
      });
      result = { records, count: records.length };
      break;
    case 'caspio_create_record':
      result = { success: true, record: await client.createRecord(args.tableName, args.record) };
      break;
    case 'caspio_create_records':
      const createdRecords = await client.createRecords(args.tableName, args.records);
      result = { success: true, records: createdRecords, count: createdRecords.length };
      break;
    case 'caspio_update_records':
      result = { success: true, recordsAffected: await client.updateRecords(args.tableName, args.updates, args.where) };
      break;
    case 'caspio_delete_records':
      if (!args.confirm) throw new Error('Deletion not confirmed. Set confirm=true to proceed.');
      result = { success: true, recordsDeleted: await client.deleteRecords(args.tableName, args.where) };
      break;

    // Views
    case 'caspio_list_views':
      result = { views: await client.listViews() };
      break;
    case 'caspio_get_view_schema':
      result = await client.getViewDefinition(args.viewName);
      break;
    case 'caspio_get_view_records':
      const viewRecords = await client.getViewRecords(args.viewName, {
        where: args.where,
        orderBy: args.orderBy,
        limit: args.limit,
        pageNumber: args.pageNumber,
        pageSize: args.pageSize,
        select: args.select,
      });
      result = { records: viewRecords, count: viewRecords.length };
      break;

    // Applications
    case 'caspio_list_applications':
      result = { applications: await client.listApplications() };
      break;
    case 'caspio_get_application':
      result = await client.getApplication(args.appName);
      break;

    // Files
    case 'caspio_list_files':
      result = { files: await client.listFiles(args.folderPath || '/') };
      break;
    case 'caspio_get_file_metadata':
      result = await client.getFileMetadata(args.filePath);
      break;
    case 'caspio_delete_file':
      if (!args.confirm) throw new Error('Deletion not confirmed. Set confirm=true to proceed.');
      await client.deleteFile(args.filePath);
      result = { success: true, message: `File '${args.filePath}' deleted` };
      break;

    // Tasks
    case 'caspio_list_tasks':
      result = { tasks: await client.listTasks() };
      break;
    case 'caspio_get_task':
      result = await client.getTask(args.taskName);
      break;
    case 'caspio_run_task':
      await client.runTask(args.taskName);
      result = { success: true, message: `Task '${args.taskName}' has been triggered` };
      break;

    // Utility
    case 'caspio_test_connection':
      result = { connected: await client.testConnection(), message: 'Connection successful' };
      break;
    case 'caspio_get_account_summary':
      result = await client.getAccountSummary();
      break;

    default:
      throw new Error(`Unknown tool: ${name}`);
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}

// ==================== HTML Templates ====================

function getAuthorizationPageHtml(authId: string, clientId: string, redirectUri: string, state: string, error?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Connect to Caspio</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      padding: 40px;
      max-width: 450px;
      width: 100%;
    }
    .logo { text-align: center; margin-bottom: 24px; }
    .logo h1 { color: #1a1a2e; font-size: 24px; margin-bottom: 8px; }
    .logo p { color: #666; font-size: 14px; }
    .error {
      background: #fee2e2;
      border: 1px solid #fecaca;
      color: #dc2626;
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 20px;
      font-size: 14px;
    }
    .form-group { margin-bottom: 20px; }
    label { display: block; margin-bottom: 6px; font-weight: 500; color: #333; font-size: 14px; }
    .hint { font-size: 12px; color: #666; margin-top: 4px; }
    input[type="text"], input[type="password"] {
      width: 100%;
      padding: 12px;
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      font-size: 14px;
      transition: border-color 0.2s;
    }
    input:focus { outline: none; border-color: #3b82f6; }
    .btn {
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .btn:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(59,130,246,0.4); }
    .help { margin-top: 24px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
    .help h3 { font-size: 13px; color: #333; margin-bottom: 10px; }
    .help ol { padding-left: 18px; color: #666; font-size: 12px; line-height: 1.7; }
    .help a { color: #3b82f6; }
    .security { margin-top: 20px; padding: 12px; background: #f0fdf4; border-radius: 8px; font-size: 12px; color: #166534; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <h1>🗄️ Connect to Caspio</h1>
      <p>Enter your Caspio API credentials to connect</p>
    </div>

    ${error ? `<div class="error">${error}</div>` : ''}

    <form method="POST" action="/oauth/authorize/submit">
      <input type="hidden" name="auth_id" value="${authId}">

      <div class="form-group">
        <label for="caspio_base_url">Caspio Base URL</label>
        <input type="text" id="caspio_base_url" name="caspio_base_url"
               placeholder="https://c1abc123.caspio.com" required>
      </div>

      <div class="form-group">
        <label for="caspio_client_id">Client ID</label>
        <input type="text" id="caspio_client_id" name="caspio_client_id"
               placeholder="Your Caspio API Client ID" required>
      </div>

      <div class="form-group">
        <label for="caspio_client_secret">Client Secret</label>
        <input type="password" id="caspio_client_secret" name="caspio_client_secret"
               placeholder="Your Caspio API Client Secret" required>
      </div>

      <button type="submit" class="btn">Connect to Caspio</button>
    </form>

    <div class="security">
      🔒 Your credentials are encrypted and only used to connect to your Caspio account. They are never shared.
    </div>

    <div class="help">
      <h3>How to get your credentials:</h3>
      <ol>
        <li>Log into <a href="https://www.caspio.com" target="_blank">Caspio</a></li>
        <li>Go to Account → Web Services API</li>
        <li>Create or select an API profile</li>
        <li>Copy the Client ID and Client Secret</li>
      </ol>
    </div>
  </div>
</body>
</html>`;
}

// ==================== Main Server ====================

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', BASE_URL);
  const method = req.method || 'GET';

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return;
  }

  try {
    // OAuth Discovery Endpoints
    if (url.pathname === '/.well-known/oauth-protected-resource') {
      handleProtectedResourceMetadata(res);
      return;
    }

    if (url.pathname === '/.well-known/oauth-authorization-server' ||
        url.pathname === '/.well-known/openid-configuration') {
      handleAuthServerMetadata(res);
      return;
    }

    // OAuth Endpoints
    if (url.pathname === '/oauth/register' && method === 'POST') {
      await handleClientRegistration(req, res);
      return;
    }

    if (url.pathname === '/oauth/authorize' && method === 'GET') {
      handleAuthorize(req, res);
      return;
    }

    if (url.pathname === '/oauth/authorize/submit' && method === 'POST') {
      await handleAuthorizeSubmit(req, res);
      return;
    }

    if (url.pathname === '/oauth/token' && method === 'POST') {
      await handleToken(req, res);
      return;
    }

    // MCP Endpoint (Streamable HTTP)
    if (url.pathname === '/mcp') {
      if (method === 'POST') {
        await handleMcpRequest(req, res);
        return;
      }
      if (method === 'GET') {
        // Return server capabilities for GET requests (some clients probe this way)
        sendJson(res, 200, {
          name: 'caspio-mcp-server',
          version: '1.0.0',
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
            resources: {},
          },
        });
        return;
      }
    }

    // Health check
    if (url.pathname === '/health') {
      sendJson(res, 200, { status: 'ok', version: '1.0.0' });
      return;
    }

    // Root - show info
    if (url.pathname === '/') {
      sendHtml(res, 200, `<!DOCTYPE html>
<html>
<head><title>Caspio MCP Server</title></head>
<body style="font-family: sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
  <h1>🗄️ Caspio MCP Server</h1>
  <p>This is a Model Context Protocol server for Caspio databases.</p>
  <h2>Connect with Claude or ChatGPT:</h2>
  <ol>
    <li>Add a custom connector</li>
    <li>Enter this URL: <code>${BASE_URL}/mcp</code></li>
    <li>You'll be prompted to enter your Caspio credentials</li>
  </ol>
  <h2>Endpoints:</h2>
  <ul>
    <li><code>/mcp</code> - MCP endpoint</li>
    <li><code>/.well-known/oauth-protected-resource</code> - OAuth metadata</li>
    <li><code>/health</code> - Health check</li>
  </ul>
</body>
</html>`);
      return;
    }

    // 404
    sendJson(res, 404, { error: 'not_found' });

  } catch (error) {
    console.error('Server error:', error);
    sendJson(res, 500, { error: 'internal_error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`
🗄️  Caspio MCP Server (Remote)

   Server running at: ${BASE_URL}
   MCP Endpoint:      ${BASE_URL}/mcp

   To connect from Claude or ChatGPT:
   1. Add a custom connector
   2. Name: Caspio
   3. URL: ${BASE_URL}/mcp
   4. Enter your Caspio credentials when prompted
`);
});

export { server };
