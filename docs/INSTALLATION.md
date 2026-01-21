# Caspio MCP Server - Complete Installation Guide for macOS

This guide provides step-by-step instructions for installing and configuring the Caspio MCP Server on macOS.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installing Node.js](#installing-nodejs)
3. [Setting Up the Server](#setting-up-the-server)
4. [Configuring Caspio API Access](#configuring-caspio-api-access)
5. [Configuring Claude Desktop](#configuring-claude-desktop)
6. [Testing the Installation](#testing-the-installation)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before you begin, ensure you have:

- macOS 10.15 (Catalina) or later
- Administrator access to your Mac
- A Caspio account with Web Services API access (Professional plan or higher)
- Claude Desktop application installed

---

## Installing Node.js

The MCP server requires Node.js version 18 or higher.

### Option 1: Using Homebrew (Recommended)

1. **Install Homebrew** (if not already installed):

   Open Terminal (`Cmd + Space`, type "Terminal", press Enter) and run:

   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```

   Follow the on-screen instructions to complete the installation.

2. **Install Node.js**:

   ```bash
   brew install node
   ```

3. **Verify installation**:

   ```bash
   node --version
   npm --version
   ```

   You should see version numbers for both (Node.js should be 18.x or higher).

### Option 2: Direct Download

1. Visit [nodejs.org](https://nodejs.org/)
2. Download the macOS installer (LTS version recommended)
3. Run the installer and follow the prompts
4. Restart Terminal and verify with `node --version`

---

## Setting Up the Server

### Step 1: Create a Projects Directory

```bash
# Create a directory for your projects (if it doesn't exist)
mkdir -p ~/Projects

# Navigate to the directory
cd ~/Projects
```

### Step 2: Create the Server Directory

```bash
# Create the server directory
mkdir caspio-mcp-server
cd caspio-mcp-server
```

### Step 3: Initialize the Project

Create `package.json`:

```bash
cat > package.json << 'EOF'
{
  "name": "caspio-mcp-server",
  "version": "1.0.0",
  "description": "MCP Server for Caspio Database",
  "main": "dist/index.js",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx src/index.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "tsx": "^4.7.0",
    "typescript": "^5.3.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
EOF
```

Create `tsconfig.json`:

```bash
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
EOF
```

### Step 4: Create Source Directory

```bash
mkdir -p src
```

### Step 5: Copy Source Files

Copy `caspio-client.ts` and `index.ts` to the `src` directory. These files contain the server implementation.

### Step 6: Install Dependencies

```bash
npm install
```

This will download and install all required packages.

### Step 7: Build the Server

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist` directory.

---

## Configuring Caspio API Access

### Step 1: Log into Caspio

1. Go to your Caspio account at `https://[your-account].caspio.com`
2. Log in with your credentials

### Step 2: Navigate to Web Services API

1. Click **Account** in the top navigation
2. Click **Web Services API** in the sidebar

### Step 3: Create a New API Profile

1. Click **New Profile**
2. Fill in the details:
   - **Profile Name**: `MCP Server` (or any descriptive name)
   - **Description**: `API access for MCP Server integration`

### Step 4: Configure Permissions

Under **Profile Settings**, configure:

- **Enable access to all objects**: Check this to access all tables and views
  - Or selectively choose specific tables/views
- **Profile can create objects**: Check if you need to create tables via the API

### Step 5: Save and Note Credentials

After saving, you'll see:

- **Token Endpoint URL**: e.g., `https://c1abc123.caspio.com/oauth/token`
- **Client ID**: e.g., `abc123def456789...`
- **Client Secret**: e.g., `xyz789secret123...`

**Important**:
- Copy these values immediately - the Client Secret is only shown once
- Extract your **Base URL** from the Token Endpoint (e.g., `https://c1abc123.caspio.com`)

---

## Configuring Claude Desktop

### Step 1: Locate the Configuration File

Open Terminal and run:

```bash
# Create the directory if it doesn't exist
mkdir -p ~/Library/Application\ Support/Claude

# Open the configuration file (creates it if it doesn't exist)
nano ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

### Step 2: Add the MCP Server Configuration

If the file is empty or doesn't exist, add:

```json
{
  "mcpServers": {
    "caspio": {
      "command": "node",
      "args": ["/Users/YOUR_USERNAME/Projects/caspio-mcp-server/dist/index.js"],
      "env": {
        "CASPIO_BASE_URL": "https://c1abc123.caspio.com",
        "CASPIO_CLIENT_ID": "your-client-id-here",
        "CASPIO_CLIENT_SECRET": "your-client-secret-here"
      }
    }
  }
}
```

If the file already has content, add the `caspio` section inside `mcpServers`:

```json
{
  "mcpServers": {
    "existing-server": { ... },
    "caspio": {
      "command": "node",
      "args": ["/Users/YOUR_USERNAME/Projects/caspio-mcp-server/dist/index.js"],
      "env": {
        "CASPIO_BASE_URL": "https://c1abc123.caspio.com",
        "CASPIO_CLIENT_ID": "your-client-id-here",
        "CASPIO_CLIENT_SECRET": "your-client-secret-here"
      }
    }
  }
}
```

### Step 3: Update the Values

Replace:
- `YOUR_USERNAME` with your macOS username (find it with `whoami`)
- `c1abc123` with your Caspio subdomain
- `your-client-id-here` with your actual Client ID
- `your-client-secret-here` with your actual Client Secret

### Step 4: Save and Exit

In nano:
1. Press `Ctrl + O` to save
2. Press `Enter` to confirm
3. Press `Ctrl + X` to exit

### Step 5: Restart Claude Desktop

1. Quit Claude Desktop completely (`Cmd + Q`)
2. Reopen Claude Desktop

---

## Testing the Installation

### Method 1: Test in Claude Desktop

1. Open Claude Desktop
2. Start a new conversation
3. Ask: "Can you test the Caspio connection?"

If configured correctly, Claude will use the `caspio_test_connection` tool and confirm the connection.

### Method 2: Test from Terminal

```bash
# Set environment variables
export CASPIO_BASE_URL="https://c1abc123.caspio.com"
export CASPIO_CLIENT_ID="your-client-id"
export CASPIO_CLIENT_SECRET="your-client-secret"

# Navigate to the server directory
cd ~/Projects/caspio-mcp-server

# Run the server
npm start
```

You should see: `Caspio MCP Server running on stdio`

Press `Ctrl + C` to stop.

### Method 3: Using MCP Inspector

```bash
# Navigate to the server directory
cd ~/Projects/caspio-mcp-server

# Set environment variables
export CASPIO_BASE_URL="https://c1abc123.caspio.com"
export CASPIO_CLIENT_ID="your-client-id"
export CASPIO_CLIENT_SECRET="your-client-secret"

# Run the inspector
npx @modelcontextprotocol/inspector node dist/index.js
```

This opens a web interface where you can test all tools interactively.

---

## Troubleshooting

### Error: "Cannot find module"

**Solution**: Rebuild the project

```bash
cd ~/Projects/caspio-mcp-server
rm -rf node_modules dist
npm install
npm run build
```

### Error: "Missing required environment variables"

**Solution**: Check your Claude Desktop configuration

1. Open the config file:
   ```bash
   cat ~/Library/Application\ Support/Claude/claude_desktop_config.json
   ```
2. Verify all three environment variables are present and correct
3. Ensure there are no typos in the JSON

### Error: "Authentication failed"

**Solution**: Verify your Caspio credentials

1. Log into Caspio and navigate to Web Services API
2. Check that the profile is enabled
3. Verify Client ID and Secret match exactly
4. Regenerate the Client Secret if needed

### Error: "ENOENT: no such file or directory"

**Solution**: Check the path in your Claude Desktop config

1. Run `pwd` in Terminal while in the server directory to get the full path
2. Update the path in `claude_desktop_config.json`
3. Restart Claude Desktop

### Claude Desktop doesn't show the Caspio tools

**Solution**: Check the configuration file syntax

1. Validate your JSON at [jsonlint.com](https://jsonlint.com/)
2. Ensure there are no trailing commas
3. Restart Claude Desktop after any changes

### Server works in Terminal but not in Claude Desktop

**Solution**: Check the Node.js path

1. Find your Node.js path: `which node`
2. Use the full path in your config:
   ```json
   "command": "/usr/local/bin/node"
   ```

---

## Quick Reference

### File Locations

| File | Location |
|------|----------|
| Server source | `~/Projects/caspio-mcp-server/src/` |
| Compiled server | `~/Projects/caspio-mcp-server/dist/` |
| Claude Desktop config | `~/Library/Application Support/Claude/claude_desktop_config.json` |

### Common Commands

```bash
# Build the server
npm run build

# Start the server
npm start

# Run in development mode
npm run dev

# Test with MCP Inspector
npx @modelcontextprotocol/inspector node dist/index.js
```

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `CASPIO_BASE_URL` | Your Caspio base URL | `https://c1abc123.caspio.com` |
| `CASPIO_CLIENT_ID` | API profile Client ID | `abc123def456` |
| `CASPIO_CLIENT_SECRET` | API profile Client Secret | `xyz789secret` |

---

## Next Steps

Once installation is complete:

1. Read the [Usage Examples](USAGE.md) for common operations
2. Review the [API Reference](API_REFERENCE.md) for all available tools
3. Check the main [README](../README.md) for advanced configuration

If you encounter issues not covered here, please open an issue on the project repository.
