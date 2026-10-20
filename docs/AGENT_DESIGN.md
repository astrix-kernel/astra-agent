# Astra Agent AI — Agent Design

## Agent Loop Overview

The agent loop is the core execution engine that drives all agent behavior. It implements a bounded, observable, and recoverable execution model.

```
┌─────────────────────────────────────────────────────────────────┐
                        AGENT LOOP
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │   UNDERSTAND REQUEST    │
                    │  - Parse user intent    │
                    │  - Identify task type   │
                    │  - Check ambiguity      │
                    └───────────┬─────────────┘
                                │
                                ▼
                    ┌─────────────────────────┐
                    │   COLLECT CONTEXT       │
                    │  - Conversation history │
                    │  - Project files        │
                    │  - Working memory       │
                    │  - Relevant memories    │
                    └───────────┬─────────────┘
                                │
                                ▼
                    ┌─────────────────────────┐
                    │   DETECT GAPS           │
                    │  - Missing info?        │
                    │  - Need clarification?  │
                    │  - Can auto-resolve?    │
                    └───────────┬─────────────┘
                                │
                                ▼
                    ┌─────────────────────────┐
                    │   PLAN (if complex)     │
                    │  - Create subtasks      │
                    │  - Identify dependencies│
                    │  - Estimate resources   │
                    └───────────┬─────────────┘
                                │
                                ▼
                    ┌─────────────────────────┐
                    │   EXECUTE / APPROVE     │
                    │  - Select tool          │
                    │  - Validate input       │
                    │  - Check permissions    │
                    │  - Request approval     │
                    │  - Execute tool         │
                    └───────────┬─────────────┘
                                │
                                ▼
                    ┌─────────────────────────┐
                    │   OBSERVE RESULT        │
                    │  - Parse tool output    │
                    │  - Update working mem   │
                    │  - Check for errors     │
                    │  - Assess progress      │
                    └───────────┬─────────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
                    ▼                       ▼
           ┌───────────────┐       ┌───────────────┐
           │  CONTINUE?    │       │   COMPLETE?   │
           └───────┬───────┘       └───────┬───────┘
                   │                       │
           ┌───────┴───────┐       ┌───────┴───────┐
           ▼               ▼       ▼               ▼
        YES              NO     YES              NO
           │               │       │               │
           └───────────────┘       └───────────────┘
                    │                       │
                    ▼                       ▼
           ┌───────────────┐       ┌───────────────┐
           │  LOOP BACK    │       │  VERIFY &     │
           │  TO COLLECT   │       │  FINALIZE     │
           └───────────────┘       └───────────────┘
                                        │
                                        ▼
                              ┌─────────────────┐
                              │  RETURN RESULT  │
                              │  - Evidence     │
                              │  - Changes      │
                              │  - Unresolved   │
                              └─────────────────┘
```

## Task State Machine

```typescript
type TaskState = 
  | 'idle'
  | 'understanding'
  | 'planning'
  | 'waiting_for_approval'
  | 'executing'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'cancelled';

interface Task {
  id: string;
  conversationId: string;
  state: TaskState;
  goal: string;
  plan?: Plan;
  currentStepIndex: number;
  workingMemory: WorkingMemory;
  checkpoints: Checkpoint[];
  limits: ExecutionLimits;
  metadata: TaskMetadata;
  createdAt: Date;
  updatedAt: Date;
}

interface ExecutionLimits {
  maxIterations: number;
  maxTokens: number;
  maxTimeMs: number;
  maxToolCalls: number;
  currentIteration: number;
  tokensUsed: number;
  toolCallsUsed: number;
  startTime: number;
}
```

### State Transitions

| From | To | Trigger |
|------|-----|---------|
| idle | understanding | New task received |
| understanding | planning | Complex task detected |
| understanding | executing | Simple task, direct execution |
| planning | waiting_for_approval | Plan requires user approval |
| planning | executing | Auto-approved or low-risk |
| waiting_for_approval | executing | User approves |
| waiting_for_approval | cancelled | User rejects/cancels |
| executing | verifying | All steps done, verification needed |
| executing | planning | Replan needed (failure, new info) |
| executing | failed | Unrecoverable error |
| executing | cancelled | User cancellation |
| verifying | completed | Verification passed |
| verifying | executing | Verification failed, retry |
| verifying | failed | Verification failed, unrecoverable |
| * | cancelled | Explicit cancellation |

## Planning System

### Plan Structure

```typescript
interface Plan {
  id: string;
  goal: string;
  constraints: Constraint[];
  knownFacts: Fact[];
  unknowns: Unknown[];
  assumptions: Assumption[];
  subtasks: Subtask[];
  dependencies: Dependency[];
  riskAssessment: RiskAssessment;
  definitionOfDone: DoneCriteria[];
}

interface Subtask {
  id: string;
  description: string;
  type: 'tool' | 'reasoning' | 'research' | 'verification';
  tool?: string;
  input?: unknown;
  dependencies: string[]; // subtask IDs
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result?: SubtaskResult;
  estimatedTokens: number;
  estimatedTimeMs: number;
}

interface Dependency {
  from: string; // subtask ID
  to: string;   // subtask ID
  type: 'blocks' | 'informs';
}
```

### Planner Algorithm

```
plan(request, context):
  1. Analyze request complexity
  2. If simple (direct answer, single file read):
       return minimal plan (0-1 subtasks)
  
  3. Extract goal and constraints
  4. Identify known facts from context
  5. Identify unknowns and required info
  6. Generate subtask candidates:
       - For each unknown → research/tool subtask
       - For each code change → edit+verify subtasks
       - For each verification → test/lint/typecheck
  7. Build dependency graph
  8. Topological sort for execution order
  9. Estimate resources (tokens, time, tool calls)
  10. Check against limits
  11. If over limits → simplify or split
  12. Return plan
```

### Plan Revision

On failure or new information:
1. Analyze failure/error
2. Identify affected subtasks
3. Generate alternative approaches
4. Update plan with new subtasks
5. Preserve completed work (checkpoint)
6. Resume from last valid checkpoint

## Repository Context Retrieval

Astra builds a bounded evidence set before the first model request. It discovers project instructions and manifests, ranks source paths against task terms, clips files by character budget, and labels all retrieved content as untrusted evidence. This avoids dumping the repository into context while preserving relevant code and verification configuration. Retrieval provenance includes the relative path and reason for selection.

## Verification and Recovery

Tool failures are recorded in task state with `failedToolCalls` and `lastError`. The next model iteration receives a recovery instruction and must inspect the exact result before changing approach. Completion is only emitted after the model returns without tool calls and the runtime enters `verifying`; tool output remains the evidence source and is never replaced by model confidence.

## Context Construction

### Token Budget Allocation

```typescript
interface TokenBudget {
  systemPrompt: number;        // ~2000 tokens
  conversationHistory: number; // ~8000 tokens
  projectContext: number;      // ~4000 tokens
  workingMemory: number;       // ~2000 tokens
  toolResults: number;         // ~4000 tokens
  availableForResponse: number;// ~4000 tokens
  total: number;               // Model max context
}
```

### Context Assembly Priority

1. **System prompt** (always included)
2. **Current task state** (plan, working memory, active files)
3. **Recent conversation** (last N messages, summarized if needed)
4. **Project instructions** (AGENTS.md, astra.md, CLAUDE.md)
5. **Relevant file contents** (based on current task)
6. **Tool results** (from current iteration)
7. **Retrieved memories** (ranked by relevance)
8. **Available for model response**

### Summarization Strategy

- Conversation > 8000 tokens → summarize older messages
- Tool results > 4000 tokens → extract key findings
- File contents → include only relevant sections (symbol-based)
- Preserve: current task, active files, recent decisions, errors

## Tool System Design

### Tool Interface

```typescript
interface Tool<TInput = unknown, TOutput = unknown> {
  readonly name: string;
  readonly description: string;
  readonly schema: JSONSchema7; // Input validation
  readonly permissions: Permission[];
  readonly category: ToolCategory;
  
  // Execution
  execute(input: TInput, context: ToolContext): Promise<ToolResult<TOutput>>;
  
  // Optional: streaming for long-running tools
  executeStream?(input: TInput, context: ToolContext): AsyncIterable<ToolEvent>;
  
  // Optional: preview for destructive operations
  preview?(input: TInput, context: ToolContext): Promise<ToolPreview>;
}

interface ToolContext {
  workspaceRoot: string;
  sessionId: string;
  taskId: string;
  permissions: PermissionSet;
  cancellationToken: CancellationToken;
  memory: WorkingMemory;
}

interface ToolResult<T = unknown> {
  success: boolean;
  output: T;
  error?: ToolError;
  metadata: ToolMetadata;
}

interface ToolMetadata {
  executionTimeMs: number;
  tokensUsed?: number;
  sideEffects: SideEffect[];
  warnings: string[];
}
```

### Permission Model

```typescript
type Permission = 
  | { type: 'filesystem'; access: 'read' | 'write' | 'execute'; paths: string[] }
  | { type: 'terminal'; commands: string[]; args?: Record<string, string[]> }
  | { type: 'network'; domains: string[] }
  | { type: 'system'; capabilities: string[] }
  | { type: 'approval'; required: boolean; reason: string };

interface PermissionSet {
  granted: Permission[];
  denied: Permission[];
  requiresApproval: Permission[];
}
```

### Tool Categories & Permissions

| Tool | Category | Default Permission | Approval Required |
|------|----------|-------------------|-------------------|
| `fs.read` | filesystem | read (workspace) | No |
| `fs.write` | filesystem | write (workspace) | Yes* |
| `fs.edit` | filesystem | write (workspace) | Yes* |
| `fs.patch` | filesystem | write (workspace) | Yes* |
| `fs.list` | filesystem | read (workspace) | No |
| `fs.glob` | filesystem | read (workspace) | No |
| `fs.grep` | filesystem | read (workspace) | No |
| `terminal.execute` | terminal | configured commands | Yes |
| `code.symbols` | code_intel | read (workspace) | No |
| `code.definitions` | code_intel | read (workspace) | No |
| `code.references` | code_intel | read (workspace) | No |
| `verify.test` | verification | execute (test cmds) | No |
| `verify.typecheck` | verification | execute (typecheck cmds) | No |
| `verify.lint` | verification | execute (lint cmds) | No |
| `verify.build` | verification | execute (build cmds) | Yes* |
| `research.web_search` | research | network (search APIs) | No |
| `research.fetch` | research | network (any) | Yes* |
| `project.detect` | project | read (workspace) | No |
| `project.config` | project | read (workspace) | No |

*Approval required for first use in session, then cached

## Model Provider Abstraction

### Provider Interface

```typescript
interface ModelProvider {
  readonly id: string;
  readonly name: string;
  readonly capabilities: ModelCapabilities;
  
  // Streaming chat completion
  streamChat(request: ChatRequest): AsyncIterable<ChatEvent>;
  
  // Non-streaming (for simple requests)
  completeChat(request: ChatRequest): Promise<ChatResponse>;
  
  // Token counting
  countTokens(messages: Message[]): Promise<number>;
  
  // Configuration validation
  validateConfig(config: ProviderConfig): ValidationResult;
  
  // Health check
  healthCheck(): Promise<HealthStatus>;
}

interface ModelCapabilities {
  toolCalling: boolean;
  structuredOutput: boolean;
  multimodal: boolean;
  maxContextTokens: number;
  maxOutputTokens: number;
  supportedModels: string[];
}

interface ChatRequest {
  messages: Message[];
  tools?: ToolDefinition[];
  toolChoice?: ToolChoice;
  temperature?: number;
  maxTokens?: number;
  stream: boolean;
  metadata?: RequestMetadata;
}

interface ChatEvent {
  type: 'token' | 'tool_call' | 'tool_result' | 'error' | 'done';
  data: TokenData | ToolCallData | ToolResultData | ErrorData | DoneData;
}
```

### Provider Adapters

#### OpenAI-Compatible Adapter
- Supports: OpenAI, Azure OpenAI, Together, Fireworks, Anyscale, etc.
- Tool calling via `functions` or `tools` parameter
- Streaming via Server-Sent Events

#### Anthropic Adapter
- Messages API format
- Tool calling via `tools` parameter
- Streaming via event stream
- System prompt separate from messages

#### Local Adapter
- llama.cpp / Ollama / vLLM / TGI
- OpenAI-compatible endpoint
- Model info via `/v1/models`
- May not support all features

### Model Selection Strategy

```typescript
interface ModelSelection {
  // Task-based routing
  taskType: 'chat' | 'coding' | 'reasoning' | 'research' | 'systems';
  
  // Preferences
  preferSpeed: boolean;
  preferQuality: boolean;
  preferCost: boolean;
  requireToolCalling: boolean;
  requireMultimodal: boolean;
  
  // Result
  selectedProvider: string;
  selectedModel: string;
  reasoning: string;
}
```

Default routing:
- `chat` → fast, cost-effective model
- `coding` → strong code model with tool calling
- `reasoning` → highest reasoning capability
- `research` → large context, tool calling
- `systems` → strong reasoning + code + large context

## Memory System

### Memory Layers

```typescript
// Conversation memory — scoped to conversation
interface ConversationMemory {
  conversationId: string;
  messages: Message[];
  summary: string; // Updated periodically
  keyDecisions: Decision[];
  activeFiles: string[];
}

// Working memory — scoped to active task
interface WorkingMemory {
  taskId: string;
  objective: string;
  plan?: Plan;
  currentStep: string;
  findings: Finding[];
  openQuestions: Question[];
  hypotheses: Hypothesis[];
  errors: Error[];
  verifiedFacts: VerifiedFact[];
}

// Project memory — scoped to project, persisted
interface ProjectMemory {
  projectId: string;
  conventions: Convention[];
  architecture: ArchitectureDecision[];
  commands: CommandReference[];
  importantPaths: PathReference[];
  userPreferences: UserPreference[];
  lastUpdated: Date;
}

// Long-term memory — user-scoped, optional
interface LongTermMemory {
  userId: string;
  preferences: UserPreference[];
  skills: SkillReference[];
  crossProjectPatterns: Pattern[];
}
```

### Retrieval Interface

```typescript
interface MemoryStore {
  // Conversation
  getConversation(id: string): Promise<ConversationMemory>;
  saveConversation(memory: ConversationMemory): Promise<void>;
  
  // Working memory
  getWorkingMemory(taskId: string): Promise<WorkingMemory>;
  saveWorkingMemory(memory: WorkingMemory): Promise<void>;
  
  // Project memory
  getProjectMemory(projectId: string): Promise<ProjectMemory>;
  saveProjectMemory(memory: ProjectMemory): Promise<void>;
  upsertProjectMemory(projectId: string, updates: Partial<ProjectMemory>): Promise<void>;
  
  // Retrieval
  retrieve(query: RetrievalQuery): Promise<RetrievalResult[]>;
}

interface RetrievalQuery {
  text: string;
  scope: 'conversation' | 'project' | 'longterm' | 'all';
  filters?: MetadataFilter[];
  limit: number;
  minScore?: number;
}

interface RetrievalResult {
  source: 'conversation' | 'project' | 'longterm';
  content: string;
  metadata: Record<string, unknown>;
  score: number;
  provenance: Provenance;
}
```

### Provenance Tracking

```typescript
interface Provenance {
  source: 'user' | 'model' | 'tool' | 'file' | 'web' | 'inference';
  toolName?: string;
  filePath?: string;
  url?: string;
  timestamp: Date;
  verified: boolean;
  confidence: number; // 0-1
}
```

## Error Handling & Recovery

### Error Types

```typescript
class AgentError extends Error {
  constructor(
    message: string,
    public readonly code: ErrorCode,
    public readonly recoverable: boolean,
    public readonly context: Record<string, unknown>
  ) {}

  static fromToolError(error: ToolError): AgentError;
  static fromProviderError(error: ProviderError): AgentError;
  static fromValidationError(error: ValidationError): AgentError;
}

type ErrorCode =
  | 'TASK_UNDERSTOOD_FAILED'
  | 'CONTEXT_COLLECTION_FAILED'
  | 'PLANNING_FAILED'
  | 'TOOL_EXECUTION_FAILED'
  | 'TOOL_PERMISSION_DENIED'
  | 'TOOL_TIMEOUT'
  | 'PROVIDER_ERROR'
  | 'PROVIDER_RATE_LIMIT'
  | 'PROVIDER_UNAVAILABLE'
  | 'TOKEN_LIMIT_EXCEEDED'
  | 'ITERATION_LIMIT_EXCEEDED'
  | 'TIME_LIMIT_EXCEEDED'
  | 'VERIFICATION_FAILED'
  | 'CANCELLED'
  | 'INTERNAL_ERROR';
```

### Recovery Strategies

| Error | Strategy |
|-------|----------|
| Tool execution failed | Retry with backoff (max 3), then replan |
| Tool permission denied | Request approval, then retry |
| Tool timeout | Increase timeout, retry once |
| Provider error | Retry with backoff, fallback provider |
| Provider rate limit | Wait, retry with exponential backoff |
| Token limit exceeded | Summarize context, retry |
| Iteration limit exceeded | Return partial result with summary |
| Verification failed | Analyze failure, create fix subtask |
| Cancellation | Save checkpoint, clean up resources |

### Checkpointing

```typescript
interface Checkpoint {
  id: string;
  taskId: string;
  stepIndex: number;
  state: TaskState;
  workingMemory: WorkingMemory;
  plan: Plan;
  contextSnapshot: ContextSnapshot;
  timestamp: Date;
}

// Checkpoint created at:
// - After each completed subtask
// - Before each tool execution (for rollback)
// - On explicit user request
// - Before plan revision
```

## Evaluation & Quality

### Acceptance Criteria per Task Type

| Task Type | Criteria |
|-----------|----------|
| Code explanation | References actual files, symbols, lines |
| Bug fix | Reproduces issue, fix passes tests |
| Feature implementation | All acceptance criteria met, tests pass |
| Refactoring | Behavior preserved, tests pass, no regressions |
| Test generation | Tests cover target code, tests pass |
| Research | Citations from primary sources, versions noted |
| Systems question | Layered explanation, authoritative references |

### Quality Gates

1. **Pre-execution**: Plan validated, permissions checked
2. **During execution**: Tool results validated, progress tracked
3. **Post-execution**: Verification runs, criteria checked
4. **Final**: Evidence collected, result formatted

### Self-Correction Loop

```
verify(result, criteria):
  for each criterion:
    evidence = gatherEvidence(criterion)
    if not satisfied(evidence):
      return { passed: false, gaps: [criterion] }
  return { passed: true }

onVerificationFailed(gaps):
  analyzeGaps(gaps)
  createFixSubtasks(gaps)
  revisePlan()
  resumeExecution()
```