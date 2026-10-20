# Astra Agent AI

Astra is a shared-runtime AI coding and research workspace with a Claude-inspired web UI and native CLI. It supports provider adapters, bounded agent execution, safe workspace tools, skills, and verification workflows.

## Status

This repository is an active foundation for self-hosted deployment. Mock mode is available without credentials; real model execution requires a server-side provider key.

## Quick start

```bash
git clone https://github.com/astrix-kernel/astra-agent.git
cd astra-agent
npm install
npm run build --workspaces
cp .env.example .env
npm run dev --workspace=@astra/api
# in another terminal
npm run dev --workspace=@astra/web
```

Open `http://localhost:5173`.

CLI:

```bash
node packages/cli/dist/index.js doctor
node packages/cli/dist/index.js chat
node packages/cli/dist/index.js "inspect this project"
```

## Production configuration

Never put model keys in the browser. Configure the API process:

```env
NODE_ENV=production
ASTRA_API_KEY=your-server-side-key
ASTRA_MODEL=auto/best-coding-fast
ASTRA_BASE_URL=https://api.openai.com/v1
ASTRA_WEB_ORIGIN=https://your-domain.example
ASTRA_WORKSPACE_ROOT=/srv/astra/workspaces
ASTRA_RATE_LIMIT=60
```

`ASTRA_WEB_ORIGIN` is required for browser access in production. `ASTRA_WORKSPACE_ROOT` bounds project access. Keep it outside the public web container when possible.

## Docker

```bash
cp .env.example .env
# set secrets in .env
docker compose up --build -d
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for TLS, reverse proxy, DNS, and Chrome-accessible hosting guidance.

## Architecture

- `packages/core`: agent runtime, providers, tools, skills
- `packages/api`: Fastify API and WebSocket streaming
- `packages/web`: React/Vite workspace and marketplace
- `packages/cli`: terminal interface
- `docs`: product, architecture, security, and roadmap documents

## Security

Astra is not a public multi-tenant service by default. Before exposing it to untrusted users, add authentication, per-user workspace isolation, durable database persistence, OAuth secret storage, sandboxed command execution, and production observability. Report security issues privately according to [SECURITY.md](docs/SECURITY.md).
