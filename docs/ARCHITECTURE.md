# Astra Agent AI — Architecture

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Astra Agent AI                             │
├──────────────────┬──────────────────────────────────┬───────────┤
│   Astra Web     │       Shared Agent Core          │  Astra CLI │
│  (React/TS)     │                                  │  (Node/TS) │
└────────┬─────────┘                                  └─────┬──────┘
         │                                                   │
         └───────────────────┬───────────────────────────────┘
                             ▼
        ┌─────────────────────────────────────┐
        │         API Gateway / RPC           │
        └───────────────────┬─────────────────┘
                            ▼
        ┌─────────────────────────────────────┐
        │          Agent Runtime              │
        │  ┌───────────────────────────────┐  │
        │  │     Orchestration Engine      │  │
        │  │  - Task State Machine         │  │
        │  │  - Planning & Decomposition   │  │
        │  │  - Tool Dispatcher            │  │
        │  │  - Context Manager            │  │
        │  │  - Memory Manager             │  │
        │  └───────────────────────────────┘  │
        └───────────────────┬─────────────────┘
                            ▼
        ┌─────────────────────────────────────┐
        │         Provider Abstraction        │
        │  ┌─────────┐ ┌─────────┐ ┌────────┐ │
        │  │ OpenAI  │ │Anthropic│ │ Local  │ │
        │  └─────────┘ └─────────┘ └────────┘ │
        └───────────────────┬─────────────────┘
                            ▼
        ┌─────────────────────────────────────┐
        │           Tool Registry             │
        │  ┌────────┐ ┌────────┐ ┌──────────┐ │
        │  │Filesys │ │Terminal│ │Code Intel│ │
        │  └────────┘ └────────┘ └──────────┘ │
        │  ┌────────┐ ┌────────┐ ┌──────────┐ │
        │  │Verify  │ │Research│ │ Project  │ │
        │  └────────┘ └────────┘ └──────────┘ │
        └───────────────────┬─────────────────┘
                            ▼
        ┌─────────────────────────────────────┐
        │      Persistence & Observability    │
        │  ┌─────────┐ ┌─────────┐ ┌────────┐ │
        │  │Database │ │  Logs   │ │ Metrics│ │
        │  └─────────┘ └─────────┘ └────────┘ │
        └─────────────────────────────────────┘
```

## Component Boundaries

### 1. Presentation Layers

**Astra Web** (`src/web/`)
- React + TypeScript frontend
- Vite for build/dev server
- Tailwind CSS for styling
- WebSocket for streaming
- Zustand or Redux for state management
- React Markdown + Prism for rendering

**Astra CLI** (`src/cli/`)
- Node.js + TypeScript
- Ink or blessed for TUI
- Commander.js for CLI parsing
- Shared types with web via core package

### 2. API Layer (`src/core/api/`)
- REST API for web (Express/Fastify)
- WebSocket server for streaming
- gRPC or JSON-RPC for CLI communication
- Authentication (JWT, API keys)
- Rate limiting
- Request validation (Zod)

### 3. Agent Runtime (`src/core/agent/`)

**Orchestration Engine**
```
Task State Machine:
  idle → understanding → planning → waiting_for_approval → executing → verifying → completed
                        ↘ failed/cancelled
```

- Iteration limits, token budgets, time budgets
- Cancellation token propagation
- Checkpoint serialization
- Recovery from interrupted operations

**Planner**
- Structured plan generation (goal, constraints, subtasks, dependencies)
- Sequential execution controller
- Parallel executor for independent subtasks
- Plan revision on failure

**Context Manager**
- Token budgeting (system, conversation, tools, results)
- Relevance ranking for retrieval
- Summarization for long histories
- Working memory management

**Memory Manager**
- Conversation store
- Project memory (persisted per workspace)
- Long-term user preferences
- Retrieval interface (keyword, semantic optional)

### 4. Provider Abstraction (`src/core/providers/`)

```typescript
interface ModelProvider {
  id: string;
  name: string;
  capabilities: ModelCapabilities;
  
  streamChat(request: ChatRequest): AsyncIterable<ChatEvent>;
  countTokens(messages: Message[]): Promise<number>;
  validateConfig(config: ProviderConfig): ValidationResult;
}

interface ModelCapabilities {
  toolCalling: boolean;
  structuredOutput: boolean;
  multimodal: boolean;
  maxContextTokens: number;
  maxOutputTokens: number;
}
```

**Adapters:**
- `OpenAIAdapter` — OpenAI-compatible APIs
- `AnthropicAdapter` — Anthropic Messages API
- `LocalAdapter` — llama.cpp, Ollama, vLLM, TGI
- `MockAdapter` — for testing

### 5. Tool Registry (`src/core/tools/`)

```typescript
interface Tool {
  name: string;
  description: string;
  schema: JSONSchema;  // Input validation
  permissions: Permission[];
  execute(input: unknown, context: ToolContext): Promise<ToolResult>;
}

interface ToolContext {
  workspaceRoot: string;
  sessionId: string;
  permissions: PermissionSet;
  cancellationToken: CancellationToken;
}
```

**Tool Categories:**

| Category | Tools |
|----------|-------|
| Filesystem | `read`, `write`, `edit`, `list`, `glob`, `grep`, `stat`, `patch` |
| Terminal | `execute`, `spawn`, `kill`, `wait` |
| Code Intel | `symbols`, `definitions`, `references`, `diagnostics` |
| Verification | `test`, `typecheck`, `lint`, `build` |
| Research | `web_search`, `fetch`, `extract` |
| Project | `detect`, `config`, `instructions` |

### 6. Security Layer (`src/core/security/`)

**Permission Engine**
- Role-based (user, project, system)
- Tool-level permissions
- Path-based restrictions (workspace root)
- Command allow/deny lists
- Approval workflows

**Sandbox**
- Process isolation (container, gVisor, or user namespace)
- Resource limits (CPU, memory, disk, network)
- Filesystem virtualization
- Network policy

**Audit**
- Structured event logging
- Secret redaction
- Tamper-evident logs

### 7. Persistence (`src/core/persistence/`)

**Database Schema** (PostgreSQL/SQLite)

```sql
-- Users (if multi-user)
users (id, email, hashed_password, created_at)

-- Conversations
conversations (id, user_id, project_id, title, created_at, updated_at)

-- Messages
messages (id, conversation_id, role, content, tool_calls, tool_results, metadata, created_at)

-- Projects
projects (id, user_id, name, root_path, instructions, created_at)

-- Tasks
tasks (id, conversation_id, state, plan, current_step, checkpoints, created_at, updated_at)

-- Memory
memories (id, project_id, key, value, provenance, created_at)

-- Model configs
model_configs (id, user_id, provider, model_id, endpoint, encrypted_credentials)
```

### 8. Observability (`src/core/observability/`)

- **Tracing**: OpenTelemetry for distributed traces
- **Metrics**: Prometheus format (latency, tokens, costs, errors)
- **Logging**: Structured JSON (Pino/Winston)
- **Audit**: Immutable event store for security events

## Data Flow

### Chat Request (Web)
```
User Input → Web UI → WebSocket → API Gateway → Auth → Agent Runtime
                                                              ↓
                                         ┌─────────────────────┼─────────────────────┐
                                         ▼                     ▼                     ▼
                                  Context Manager        Tool Registry         Provider Adapter
                                         │                     │                     │
                                         ▼                     ▼                     ▼
                                  Working Memory         Tool Execution        Model Streaming
                                         │                     │                     │
                                         └─────────────────────┼─────────────────────┘
                                                               ▼
                                                      Task State Update
                                                               ▼
                                                      Persistence
                                                               ▼
                                                      WebSocket Stream
                                                               ▼
                                                          Web UI
```

### CLI Task Execution
```
astra "task" → CLI → RPC → API Gateway → Agent Runtime → (same as above)
                                                              │
                                                              ▼
                                                      Terminal Output Stream
                                                              ▼
                                                           CLI UI
```

## Configuration

```typescript
// config/astra.config.ts
interface AstraConfig {
  // Server
  server: {
    host: string;
    port: number;
    websocketPort: number;
  };
  
  // Database
  database: {
    url: string;
    migrationsPath: string;
  };
  
  // Providers
  providers: {
    openai?: { apiKey: string; baseUrl?: string };
    anthropic?: { apiKey: string; baseUrl?: string };
    local?: { baseUrl: string; model: string };
  };
  
  // Security
  security: {
    workspaceRoot: string;
    allowedCommands: string[];
    deniedCommands: string[];
    sandboxEnabled: boolean;
    sandboxImage?: string;
  };
  
  // Agent
  agent: {
    maxIterations: number;
    maxTokensPerRequest: number;
    maxExecutionTimeMs: number;
    defaultModel: string;
  };
  
  // Observability
  observability: {
    logLevel: string;
    tracingEnabled: boolean;
    metricsPort: number;
  };
}
```

## Technology Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Language | TypeScript | Type safety across boundary |
| Runtime | Node.js 20+ | Mature ecosystem, LTS |
| Web Framework | React 18 + Vite | Fast dev, good DX |
| Styling | Tailwind CSS | Utility-first, design system |
| CLI Framework | Ink + Commander | React-like TUI, robust parsing |
| API | Fastify | Fast, schema validation |
| Database | PostgreSQL (prod) / SQLite (dev) | Relational, migrations |
| ORM | Prisma / Drizzle | Type-safe database access |
| Validation | Zod | Runtime + compile-time |
| Logging | Pino | Fast, structured |
| Tracing | OpenTelemetry | Vendor-neutral |
| Testing | Vitest + Playwright | Fast unit, reliable e2e |

## Deployment

### Development
```bash
# Terminal 1: API + Agent Runtime
npm run dev:api

# Terminal 2: Web UI
npm run dev:web

# Terminal 3: CLI (linked)
npm run dev:cli
```

### Production
- Docker Compose for single-host
- Kubernetes manifests for scale
- Database migrations on deploy
- Health checks for all services
- Reverse proxy (nginx/Caddy) for TLS

## Extension Points

1. **Custom Tools** — Implement `Tool` interface, register in registry
2. **Custom Providers** — Implement `ModelProvider` interface
3. **Custom Skills** — Markdown files with procedures, loaded by planner
4. **Custom Memory Stores** — Implement `MemoryStore` interface
5. **Custom Auth** — Implement `AuthProvider` interface

## Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| API latency (p99) | < 200ms |
| Stream first token | < 500ms |
| CLI startup | < 1s |
| Memory usage (idle) | < 200MB |
| Concurrent sessions | 100+ per instance |
| Token estimation accuracy | ±10% |
| Tool execution timeout | Configurable, default 30s |