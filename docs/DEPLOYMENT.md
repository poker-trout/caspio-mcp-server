# Deploying Caspio MCP Server (Remote)

This guide explains how to deploy the Caspio MCP Server as a remote service that anyone can connect to using Claude, ChatGPT, or other MCP-compatible clients.

## Architecture

```
┌─────────────────┐     ┌─────────────────────┐     ┌─────────────────┐
│  Claude/ChatGPT │────▶│  Caspio MCP Server  │────▶│  Caspio API     │
│  (MCP Client)   │◀────│  (Your Server)      │◀────│  (User Account) │
└─────────────────┘     └─────────────────────┘     └─────────────────┘
                              │
                              ▼
                        OAuth Flow:
                        User enters their
                        Caspio credentials
```

## Quick Deploy Options

### Option 1: Railway (Recommended - Free tier available)

1. **Fork this repository to GitHub**

2. **Go to [Railway.app](https://railway.app)**

3. **Create new project → Deploy from GitHub repo**

4. **Set environment variables:**
   ```
   PORT=3000
   BASE_URL=https://your-app.railway.app
   ```

5. **Your MCP server is live!**
   - URL: `https://your-app.railway.app/mcp`

### Option 2: Render (Free tier available)

1. **Go to [Render.com](https://render.com)**

2. **Create new Web Service → Connect your repo**

3. **Configure:**
   - Build Command: `npm install && npm run build`
   - Start Command: `npm run start:remote`
   - Environment Variables:
     ```
     PORT=3000
     BASE_URL=https://your-app.onrender.com
     ```

4. **Your MCP server is live!**
   - URL: `https://your-app.onrender.com/mcp`

### Option 3: Fly.io

1. **Install Fly CLI:**
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. **Login and launch:**
   ```bash
   fly auth login
   fly launch
   ```

3. **Set environment:**
   ```bash
   fly secrets set BASE_URL=https://your-app.fly.dev
   ```

4. **Deploy:**
   ```bash
   fly deploy
   ```

### Option 4: Docker (Any cloud provider)

1. **Build the image:**
   ```bash
   docker build -t caspio-mcp-server .
   ```

2. **Run locally for testing:**
   ```bash
   docker run -p 3000:3000 -e BASE_URL=http://localhost:3000 caspio-mcp-server
   ```

3. **Push to registry and deploy:**
   ```bash
   # For Docker Hub
   docker tag caspio-mcp-server yourusername/caspio-mcp-server
   docker push yourusername/caspio-mcp-server

   # Deploy to your cloud provider (AWS ECS, Google Cloud Run, Azure Container Apps, etc.)
   ```

### Option 5: Google Cloud Run

1. **Build and push:**
   ```bash
   gcloud builds submit --tag gcr.io/YOUR_PROJECT/caspio-mcp-server
   ```

2. **Deploy:**
   ```bash
   gcloud run deploy caspio-mcp-server \
     --image gcr.io/YOUR_PROJECT/caspio-mcp-server \
     --platform managed \
     --allow-unauthenticated \
     --set-env-vars BASE_URL=https://caspio-mcp-server-xxxxx.run.app
   ```

### Option 6: AWS (Elastic Beanstalk or ECS)

**Elastic Beanstalk:**
```bash
# Install EB CLI
pip install awsebcli

# Initialize and deploy
eb init -p node.js caspio-mcp-server
eb create production
eb setenv BASE_URL=https://your-app.elasticbeanstalk.com
```

### Option 7: Heroku

1. **Create `Procfile`:**
   ```
   web: npm run start:remote
   ```

2. **Deploy:**
   ```bash
   heroku create caspio-mcp-server
   heroku config:set BASE_URL=https://caspio-mcp-server.herokuapp.com
   git push heroku main
   ```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Port to listen on (default: 3000) |
| `HOST` | No | Host to bind to (default: 0.0.0.0) |
| `BASE_URL` | Yes | Public URL of your server (e.g., `https://caspio.yourserver.com`) |

### Important: BASE_URL

The `BASE_URL` must be set to the public URL where your server is accessible. This is used for:
- OAuth redirect URLs
- Discovery metadata
- Self-referential links

**Examples:**
- Railway: `https://your-app.up.railway.app`
- Render: `https://your-app.onrender.com`
- Custom domain: `https://caspio-mcp.yourdomain.com`

## Connecting from Claude/ChatGPT

### Claude Desktop/Web

1. Go to **Settings** → **Connectors**
2. Click **Add custom connector**
3. Fill in:
   - **Name:** `Caspio`
   - **Remote MCP server URL:** `https://your-server.com/mcp`
4. Click **Add**
5. When prompted, enter your Caspio API credentials

### ChatGPT (When MCP support is available)

1. Go to **Settings** → **Integrations**
2. Add MCP Server
3. Enter URL: `https://your-server.com/mcp`
4. Authenticate with your Caspio credentials

### Other MCP Clients

Any MCP-compatible client can connect using:
- **MCP Endpoint:** `https://your-server.com/mcp`
- **OAuth Metadata:** `https://your-server.com/.well-known/oauth-protected-resource`

## Security Considerations

### 1. Use HTTPS

Always deploy behind HTTPS. Most cloud providers (Railway, Render, Fly.io) provide this automatically.

### 2. No Credentials Stored Server-Side

The server does NOT store user Caspio credentials permanently. They are:
- Entered by the user during OAuth flow
- Stored in encrypted session tokens
- Automatically expire after 24 hours

### 3. Per-User Sessions

Each user's Caspio credentials are isolated to their session. Users can only access their own Caspio data.

### 4. Token Security

- Access tokens expire in 24 hours
- Refresh tokens are supported
- All tokens are randomly generated (256-bit)

## Production Checklist

- [ ] HTTPS enabled
- [ ] `BASE_URL` set correctly
- [ ] Health checks configured
- [ ] Monitoring/logging enabled
- [ ] Error tracking (e.g., Sentry) configured
- [ ] Rate limiting (optional, for public deployment)

## Scaling

The server is stateless-friendly. For high availability:

1. **Use Redis for session storage** (instead of in-memory)
2. **Deploy multiple instances** behind a load balancer
3. **Enable sticky sessions** or shared session store

## Custom Domain

To use a custom domain like `caspio-mcp.yourdomain.com`:

1. Add CNAME record pointing to your cloud provider
2. Configure SSL certificate (most providers do this automatically)
3. Update `BASE_URL` environment variable

## Troubleshooting

### "Connection refused"
- Check `PORT` and `HOST` environment variables
- Ensure firewall allows inbound traffic

### "OAuth error: invalid redirect"
- Verify `BASE_URL` matches your actual public URL
- Check for trailing slashes

### "Cannot connect to Caspio"
- User may have entered wrong credentials
- Caspio API profile may not have proper permissions
- Rate limiting from Caspio

### "Session expired"
- Tokens expire after 24 hours
- User needs to reconnect

## Monitoring

### Health Check Endpoint

```
GET /health
Response: { "status": "ok", "version": "1.0.0" }
```

### Logging

The server logs to stdout. Configure your cloud provider to capture these logs.

## Support

For issues:
- Check Caspio API status
- Verify MCP client compatibility
- Open an issue on GitHub
