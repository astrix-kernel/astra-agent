# Astra Agent AI — Roadmap

## Phase 1: Foundation (Current)
- [x] Project documentation (PRODUCT_SPEC, ARCHITECTURE, AGENT_DESIGN, SECURITY)
- [ ] Repository initialization (package.json, tsconfig, ESLint, Prettier)
- [ ] Core type system and shared interfaces
- [ ] Model provider abstraction and adapters (OpenAI, Anthropic, Local)
- [ ] Streaming support

## Phase 2: Agent Core
- [ ] Message types and conversation model
- [ ] Task state machine with transitions
- [ ] Tool registry and validation
- [ ] Context construction and token budgeting
- [ ] Bounded orchestration loop
- [ ] Error handling and recovery

## Phase 3: First Working CLI
- [ ] CLI command parser (Commander.js)
- [ ] Interactive chat mode (Ink)
- [ ] Streaming output with markdown rendering
- [ ] Configuration management
- [ ] `astra chat`, `astra status`, `astra models`, `astra doctor`

## Phase 4: Tool Implementation
- [ ] Filesystem tools (read, write, edit, list, glob, grep, patch)
- [ ] Terminal execution (sandboxed, with timeout and output capture)
- [ ] Code intelligence (symbol search, definitions, references)
- [ ] Verification tools (test, typecheck, lint, build)
- [ ] Project detection and context

## Phase 5: Web Workspace
- [ ] API server (Fastify + WebSocket)
- [ ] Authentication (JWT)
- [ ] React frontend with Vite
- [ ] Design system (Tailwind, dark/light themes)
- [ ] Conversation UI (Claude-inspired)
- [ ] Streaming responses
- [ ] Tool activity display
- [ ] Sidebar (conversations, projects, settings)
- [ ] Composer with model selection

## Phase 6: Memory & Research
- [ ] Conversation memory with summarization
- [ ] Working memory for active tasks
- [ ] Project memory (persisted per workspace)
- [ ] Retrieval interface
- [ ] Web search integration
- [ ] Documentation retrieval
- [ ] Citation tracking

## Phase 7: Planning & Intelligence
- [ ] Planning system for complex tasks
- [ ] Task decomposition
- [ ] Dependency resolution
- [ ] Parallel subtask execution
- [ ] Plan revision on failure
- [ ] Systems reasoning protocol

## Phase 8: Security Hardening
- [ ] Permission engine implementation
- [ ] Command allow/deny lists
- [ ] Path traversal protection
- [ ] Secret redaction in logs and output
- [ ] Audit event logging
- [ ] Rate limiting
- [ ] Session security

## Phase 9: Verification & Quality
- [ ] Unit tests for core modules
- [ ] Integration tests for providers and tools
- [ ] CLI smoke tests
- [ ] API tests
- [ ] Frontend component tests
- [ ] End-to-end tests
- [ ] Agent evaluation fixtures
- [ ] Performance benchmarks

## Phase 10: Documentation & Delivery
- [ ] Setup guide
- [ ] Configuration reference
- [ ] API documentation
- [ ] CLI usage guide
- [ ] Architecture overview
- [ ] Contributing guide
- [ ] Troubleshooting
- [ ] Security notes
- [ ] Verified capabilities list

## Future Considerations
- Multi-agent specialist system
- Embeddings-based retrieval
- Repository indexing at scale
- Docker-based sandboxing
- Plugin/extension system
- Team collaboration features
- Self-hosted deployment guide
- Kubernetes manifests