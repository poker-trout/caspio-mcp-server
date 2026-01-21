# Quick Start Guide

Get the Caspio MCP Server running in 5 minutes.

## Step 1: Install Dependencies

```bash
cd caspio-mcp-server
npm install
```

## Step 2: Build

```bash
npm run build
```

## Step 3: Get Your Caspio Credentials

1. Log into Caspio
2. Go to **Account** → **Web Services API**
3. Create a new profile or use an existing one
4. Note down:
   - Token Endpoint URL → extract the base URL (e.g., `https://c1abc123.caspio.com`)
   - Client ID
   - Client Secret

## Step 4: Configure Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "caspio": {
      "command": "node",
      "args": ["/FULL/PATH/TO/caspio-mcp-server/dist/index.js"],
      "env": {
        "CASPIO_BASE_URL": "https://c1abc123.caspio.com",
        "CASPIO_CLIENT_ID": "your-client-id",
        "CASPIO_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

## Step 5: Restart Claude Desktop

Quit and reopen Claude Desktop.

## Step 6: Test

Ask Claude: "Test the Caspio connection"

---

## Common First Commands

```
"What tables do I have in Caspio?"
"Show me the schema of the Customers table"
"Get the first 10 records from Orders"
"Give me an overview of my Caspio account"
```

## Need Help?

- [Full Installation Guide](INSTALLATION.md)
- [Usage Examples](USAGE.md)
- [API Reference](API_REFERENCE.md)
