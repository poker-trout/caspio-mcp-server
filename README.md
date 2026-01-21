# Caspio MCP Server

A Model Context Protocol (MCP) server that connects AI agents (Claude, ChatGPT, etc.) to Caspio databases. Users connect with their own Caspio API credentials through a standard OAuth flow.

## Features

- **Remote Server** - Deploy once, anyone can connect with their Caspio account
- **OAuth Authentication** - Users enter credentials in Claude/ChatGPT's built-in UI
- **Multi-tenant** - Each user's data is isolated to their session
- **Full Caspio Access** - Tables, views, records, files, tasks, and more
- **Works Everywhere** - Claude, ChatGPT, and any MCP-compatible client

## Quick Start

### For Users (Connecting to an existing server)

1. In Claude or ChatGPT, go to **Settings** → **Connectors**
2. Click **Add custom connector**
3. Enter:
   - **Name:** `Caspio`
   - **URL:** `https://your-server-url.com/mcp`
4. When prompted, enter your Caspio API credentials:
   - Base URL (e.g., `https://c1abc123.caspio.com`)
   - Client ID
   - Client Secret
5. Start chatting! Ask: *"What tables do I have in Caspio?"*

### For Developers (Deploying your own server)

#### Deploy to Cloud (Recommended)

**Railway (one-click):**
1. Fork this repo
2. Go to [Railway.app](https://railway.app)
3. Deploy from GitHub
4. Set `BASE_URL` to your Railway URL

**Other options:** Render, Fly.io, Google Cloud Run, AWS - see [Deployment Guide](docs/DEPLOYMENT.md)

#### Run Locally (Testing)

```bash
# Clone and install
git clone https://github.com/your-repo/caspio-mcp-server
cd caspio-mcp-server
npm install

# Build
npm run build

# Run remote HTTP server
BASE_URL=http://localhost:3000 npm run start:remote
```

Server runs at `http://localhost:3000/mcp`

## How It Works

```
┌─────────────────┐     ┌─────────────────────┐     ┌─────────────────┐
│  Claude/ChatGPT │────▶│  Caspio MCP Server  │────▶│  Caspio API     │
│                 │◀────│  (Your deployment)  │◀────│  (User's acct)  │
└─────────────────┘     └─────────────────────┘     └─────────────────┘
```

1. User adds the MCP server URL in Claude/ChatGPT
2. OAuth flow prompts for Caspio credentials
3. Server validates credentials with Caspio
4. User can now interact with their Caspio data through AI

## Available Tools

| Tool | Description |
|------|-------------|
| `caspio_list_tables` | List all tables |
| `caspio_get_table_schema` | Get table structure |
| `caspio_get_records` | Query records with filtering |
| `caspio_create_record` | Create a record |
| `caspio_update_records` | Update matching records |
| `caspio_delete_records` | Delete records (requires confirmation) |
| `caspio_list_views` | List all views |
| `caspio_get_view_records` | Query view data |
| `caspio_test_connection` | Test connectivity |
| `caspio_get_account_summary` | Account overview |

## Example Conversations

**User:** "Show me all customers from California"

**AI:** Uses `caspio_get_records` with `where: "State='CA'"` and returns the results.

---

**User:** "Add a new product: Widget Pro, $99.99"

**AI:** Uses `caspio_create_record` to insert the record.

---

**User:** "What's the structure of the Orders table?"

**AI:** Uses `caspio_get_table_schema` to show field names and types.

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | 3000 | Server port |
| `HOST` | No | 0.0.0.0 | Bind address |
| `BASE_URL` | Yes | - | Public URL (e.g., `https://myserver.com`) |

### Getting Caspio API Credentials

1. Log into your Caspio account
2. Go to **Account** → **Web Services API**
3. Create a new profile (or use existing)
4. Enable appropriate permissions
5. Copy the **Client ID** and **Client Secret**
6. Note your **Base URL** from the Token Endpoint

## Two Server Modes

### 1. Remote HTTP Server (Recommended)

For deployment - users connect via OAuth:

```bash
npm run start:remote
```

### 2. Local Stdio Server

For Claude Desktop local config (single user):

```bash
npm run start
```

Configure in `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "caspio": {
      "command": "node",
      "args": ["/path/to/dist/index.js"],
      "env": {
        "CASPIO_BASE_URL": "https://c1abc123.caspio.com",
        "CASPIO_CLIENT_ID": "your-client-id",
        "CASPIO_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

## Security

- **No server-side credential storage** - Credentials are kept in encrypted session tokens
- **24-hour token expiry** - Sessions automatically expire
- **Per-user isolation** - Users can only access their own Caspio data
- **HTTPS required** - Always deploy behind HTTPS in production

## Project Structure

```
caspio-mcp-server/
├── src/
│   ├── index.ts           # Local stdio server
│   ├── http-server.ts     # Remote HTTP server with OAuth
│   └── caspio-client.ts   # Caspio API client
├── docs/
│   ├── DEPLOYMENT.md      # Cloud deployment guide
│   ├── USAGE.md           # Usage examples
│   └── API_REFERENCE.md   # Full API docs
├── Dockerfile
├── docker-compose.yml
└── package.json
```

## Documentation

- [Deployment Guide](docs/DEPLOYMENT.md) - Deploy to Railway, Render, Fly.io, etc.
- [Usage Examples](docs/USAGE.md) - Common queries and operations
- [API Reference](docs/API_REFERENCE.md) - All tools and parameters

## License

MIT

## Links

- [Caspio API Documentation](https://howto.caspio.com/web-services-api/)
- [MCP Specification](https://modelcontextprotocol.io/)
- [Claude Connectors](https://docs.anthropic.com/en/docs/claude-connectors)
