# Astra Agent AI — Technical Decisions

## ADR-001: TypeScript Monorepo

**Status:** Accepted  
**Date:** 2026-10-20

**Context:** Need a shared codebase for CLI, Web, and Agent Core.

**Decision:** Use TypeScript with a monorepo structure using npm workspaces. Three packages:
- `@astra/core` — Agent runtime, providers, tools, memory
- `@astra/cli` — Terminal interface
- `@astra/web` — Web application (frontend + API server)

**Rationale:** Type safety across boundaries, single language for all components, npm workspaces are lightweight and native.

---

## ADR-002: Fastify for API Server

**Status:** Accepted  
**Date:** 2026-10-20

**Context:** Need a performant HTTP server with WebSocket support and schema validation.

**Decision:** Use Fastify with `@fastify/websocket` for the API and streaming layer.

**Rationale:** Faster than Express, built-in schema validation, good plugin architecture, native WebSocket support.

---

## ADR-003: SQLite for Initial Persistence

**Status:** Accepted  
**Date:** 2026-10-20

**Context:** Need persistence for conversations, tasks, memory, and configuration.

**Decision:** Use SQLite via `better-sqlite3` for the initial implementation. PostgreSQL support can be added later through a database abstraction.

**Rationale:** Zero configuration, embedded, works for CLI and single-user web mode, no external service dependency. Sufficient for the initial product.

---

## ADR-004: React + Vite + Tailwind for Web Frontend

**Status:** Accepted  
**Date:** 2026-10-20

**Context:** Need a responsive, polished web workspace.

**Decision:** React 18 with TypeScript, Vite for build/dev, Tailwind CSS for styling.

**Rationale:** Mature ecosystem, good DX with Vite, Tailwind enables rapid design system creation with consistent tokens.

---

## ADR-005: Zod for Runtime Validation

**Status:** Accepted  
**Date:** 2026-10-20

**Context:** Need schema validation at system boundaries (API, tool inputs, config).

**Decision:** Use Zod for all runtime validation with TypeScript type inference.

**Rationale:** Excellent TypeScript integration, composable schemas, good error messages, widely adopted.

---

## ADR-006: Provider Adapter Pattern

**Status:** Accepted  
**Date:** 2026-10-20

**Context:** Must support multiple model providers without coupling core logic to any one SDK.

**Decision:** Implement a `ModelProvider` interface with separate adapters per provider. Core agent logic depends only on the interface, never on provider-specific SDKs.

**Rationale:** Enables model switching, cost optimization, fallback chains, and local model support without modifying core logic.

---

## ADR-007: Tool Permission Model

**Status:** Accepted  
**Date:** 2026-10-20

**Context:** Agent tools can perform filesystem writes, command execution, and network requests. Must prevent unauthorized actions.

**Decision:** Every tool declares required permissions. A permission engine evaluates permissions before execution. High-risk operations require explicit user approval. Approvals can be cached per session.

**Rationale:** Defense in depth. Prevents prompt injection from triggering destructive actions. User remains in control of sensitive operations.

---

## ADR-008: Bounded Agent Loop

**Status:** Accepted  
**Date:** 2026-10-20

**Context:** Unbounded agent loops can waste tokens, time, and resources.

**Decision:** Enforce configurable limits: max iterations (default 25), max execution time (default 5 min), max token budget (default 100k), max tool calls (default 50). Agent must check limits between iterations.

**Rationale:** Prevents runaway execution, controls costs, ensures user responsiveness.

---

## ADR-009: Streaming Architecture

**Status:** Accepted  
**Date:** 2026-10-20

**Context:** Both CLI and Web need real-time streaming of model responses and tool activity.

**Decision:** Use AsyncIterable/AsyncGenerator throughout the agent core. Web uses WebSocket for streaming. CLI reads the same async stream directly.

**Rationale:** Unified streaming interface, works for both interfaces, natural backpressure handling.

---

## ADR-010: Ink for CLI TUI

**Status:** Accepted  
**Date:** 2026-10-20

**Context:** CLI needs interactive UI with streaming, markdown, status indicators.

**Decision:** Use Ink (React for CLI) for the interactive TUI, Commander.js for command parsing.

**Rationale:** React-like component model for terminal UI, good integration with streaming, composable.