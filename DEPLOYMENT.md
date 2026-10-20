# Astra deployment

## Local production-like run

```bash
npm install
npm run build --workspaces
ASTRA_API_KEY=... ASTRA_MODEL=auto/best-coding-fast npm run start --workspace=@astra/api
npm run preview --workspace=@astra/web
```

The API listens on `8787`; Vite preview serves the built web app. Configure a reverse proxy so `/api` and `/ws` reach the API.

## Docker Compose

```bash
cp .env.example .env
# Set ASTRA_API_KEY and ASTRA_BASE_URL in .env
# Keep secrets out of source control
docker compose up --build -d
```

- Web: `http://localhost:8080`
- API health: `http://localhost:8787/health`

## Chrome release

A website can be opened in Chrome at any public HTTPS domain. To release Astra publicly:

1. Provision a server or managed container host.
2. Set `ASTRA_API_KEY`, `ASTRA_MODEL`, and `ASTRA_BASE_URL` as server-side secrets.
3. Run `docker compose up --build -d`.
4. Put HTTPS TLS termination in front of port `8080` and proxy WebSocket upgrades.
5. Restrict CORS to the deployed origin instead of `origin: true`.
6. Add authentication and rate limiting before exposing the API publicly.
7. Never put model API keys in the web bundle or client-side environment.

A public domain, cloud account, DNS record, and credentials are required for the final hosted release; this repository includes the production container boundary but cannot create those external resources automatically.
