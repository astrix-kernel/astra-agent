# Astra Agent AI — Product Specification

## Vision

Astra Agent AI is a production-grade AI coding agent with two first-class interfaces:
- **Astra Web**: Polished browser-based workspace
- **Astra CLI**: Interactive terminal application

Both share the same agent runtime, model adapters, tools, security policies, and memory systems.

## Core Principles

1. **Intelligence through verified actions** — Not confident-sounding text
2. **Security first** — Explicit permissions, sandboxed execution, audit trails
3. **Shared core** — Single agent runtime powering both interfaces
4. **Model agnostic** — Provider abstraction supporting OpenAI, Anthropic, local models
5. **Systems intelligence** — Deep understanding of OS, kernel, hardware, compilers

## Target Users

- Software engineers (feature development, debugging, refactoring)
- Systems programmers (kernel, OS, embedded, performance)
- Researchers (code exploration, documentation retrieval)
- Security engineers (audit, vulnerability analysis)

## Key Capabilities

### Agent Loop
- Bounded execution with configurable limits
- Explicit task states: idle, understanding, planning, waiting_for_approval, executing, verifying, completed, failed, cancelled
- Cancellation, timeouts, retries with backoff
- Checkpointing and recovery

### Planning & Task Decomposition
- Structured plans for complex requests
- Goal, constraints, known facts, unknowns, subtasks, dependencies
- Sequential and safe parallel execution
- Persistent task ledger

### Tool System
- Filesystem operations (read, write, search, list, patch)
- Terminal execution (approved commands, capture stdout/stderr, timeouts)
- Code intelligence (symbol search, definitions, references, LSP integration)
- Verification (tests, type checks, linters, builds)
- Research (web search, documentation retrieval, citations)
- Project context (detection, instructions, package managers)

### Memory Layers
- Conversation memory
- Working memory (active objectives, files, findings)
- Project memory (conventions, architecture, commands)
- Long-term memory (user preferences, durable knowledge)
- Retrieval with provenance and token budgets

### Security
- Explicit tool permissions
- Workspace-root restrictions
- Path traversal protection
- Command argument validation
- Configurable execution timeouts
- Secret redaction
- Approval gates for sensitive operations
- Sandboxed execution for untrusted code

## Interfaces

### Astra Web
- Persistent collapsible left sidebar
- Spacious conversation area
- Streaming responses with markdown rendering
- Syntax-highlighted code blocks
- Tool activity and execution status
- Artifact workspace for documents/code previews
- Responsive design (desktop, tablet, mobile)
- Dark/light themes
- Keyboard shortcuts

### Astra CLI
- `astra` — interactive chat
- `astra "task"` — execute task from terminal
- `astra init` — initialize project instructions
- `astra status` — configuration and runtime status
- `astra models` — list configured models
- `astra config` — inspect/edit configuration
- `astra doctor` — diagnose setup issues
- `astra resume` — resume saved tasks
- `astra diff` — inspect agent-generated changes
- Streaming responses, markdown rendering, tool activity
- Works from current project directory

## Technical Architecture

### Logical Components
1. Web presentation layer
2. CLI presentation layer
3. API and authentication layer
4. Shared agent runtime
5. Model provider abstraction
6. Conversation and session management
7. Context construction and token budgeting
7. Planning and task state management
8. Tool registry and execution dispatcher
9. Repository indexing and code intelligence
10. Retrieval and documentation research
11. Short-term and persistent memory
12. Sandboxed command execution
13. Permission and policy engine
14. Evaluation and regression testing
15. Observability, tracing, and audit logs

### Data Persistence
- Users and sessions (if multi-user)
- Conversations and messages
- Projects and project instructions
- Task records and execution state
- Model configurations (secrets excluded)
- Tool execution metadata
- User-approved memory
- Evaluation results
- Generated artifacts

## Implementation Phases

1. **Phase 1** — Repository understanding, documentation
2. **Phase 2** — Shared agent core (model adapters, streaming, task state, tool registry)
3. **Phase 3** — First working CLI
4. **Phase 4** — Web workspace
5. **Phase 5** — Coding tools (filesystem, terminal, diff, tests)
6. **Phase 6** — Context and research (memory, retrieval, web research)
7. **Phase 7** — Security and reliability (permissions, sandboxing, audit)
8. **Phase 8** — Verification (builds, tests, type checks, e2e)
9. **Phase 9** — Documentation and delivery

## Definition of Done

1. Web app starts with documented commands
2. CLI starts with documented commands
3. Both interfaces use same agent core
4. Configured model answers real requests
5. Responses stream correctly
6. Conversation continues across messages
7. Agent inspects permitted project directory
8. Agent explains source code using actual context
9. Approved code change produces real filesystem diff
10. Agent runs relevant tests and reports actual results
11. Tool failures visible and recoverable
12. High-risk operations require permission
13. Conversation and project state persist
14. Missing configuration handled with actionable errors
15. Interface responsive and accessible
16. Automated tests pass or failures documented
17. No secrets committed or exposed to browser
18. Documentation accurately describes implementation