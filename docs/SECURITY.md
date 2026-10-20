# Astra Agent AI — Security

## Threat Model

### Attack Surfaces
1. **Prompt Injection** — Malicious instructions in user input, repository files, web content, or tool output
2. **Path Traversal** — Agent accessing files outside permitted workspace
3. **Command Injection** — Untrusted input in shell commands
4. **Secret Exposure** — API keys/tokens leaked in logs, UI, or source control
5. **Denial of Service** — Unbounded loops, resource exhaustion, recursive tool calls
6. **Privilege Escalation** — Agent executing operations beyond authorized scope
7. **Data Exfiltration** — Sensitive data sent to unauthorized endpoints
8. **Supply Chain** — Malicious dependencies or repository instructions

## Security Architecture

### Defense Layers

```
┌──────────────────────────────────────────────────┐
│                 Input Validation                 │
│  - Schema validation (Zod)                       │
│  - Path normalization & boundary checks          │
│  - Command argument sanitization                 │
│  - Content-type validation                       │
└──────────────────────┬───────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────┐
│                Permission Engine                 │
│  - Tool-level permissions                        │
│  - Path-based access control                     │
│  - Command allow/deny lists                      │
│  - Risk classification                           │
│  - Approval workflows                            │
└──────────────────────┬───────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────┐
│              Execution Isolation                 │
│  - Process isolation                             │
│  - Resource limits (CPU, memory, disk, time)     │
│  - Network policy                                │
│  - Working directory restriction                 │
└──────────────────────┬───────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────┐
│              Output Sanitization                 │
│  - Secret redaction                              │
│  - Content filtering                             │
│  - Size limits                                   │
└──────────────────────┬───────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────┐
│                 Audit & Logging                  │
│  - Structured event logging                      │
│  - Tamper-evident records                        │
│  - Secret-free logs                              │
│  - Operation tracing                             │
└──────────────────────────────────────────────────┘
```

### Risk Classification

| Risk Level | Description | Examples | Approval |
|-----------|-------------|----------|----------|
| LOW | Read-only, workspace-scoped | Read file, list dir, search | Auto |
| MEDIUM | Workspace-scoped writes | Create/edit files, run tests | Session approval |
| HIGH | System-affecting operations | Install packages, git push, delete files | Per-action approval |
| CRITICAL | Destructive/irreversible | rm -rf, deploy, credential access | Explicit per-action + confirmation |

### Credential Management

- API keys stored in environment variables or encrypted config
- Never logged, never sent to client bundles
- Masked in all output and error messages
- Rotatable without restart
- Validated on startup with health checks

### Prompt Injection Defense

1. System prompt is immutable and takes precedence
2. User input clearly delineated from system instructions
3. Tool output and file content treated as untrusted data
4. Repository instructions (AGENTS.md, etc.) are advisory, cannot override security policy
5. Web-fetched content cannot modify agent behavior
6. Content inspection for known injection patterns

### Sandbox Configuration

```typescript
interface SandboxConfig {
  enabled: boolean;
  type: 'process' | 'container' | 'namespace';
  limits: {
    cpuPercent: number;    // default: 50
    memoryMb: number;      // default: 512
    diskMb: number;        // default: 1024
    networkEnabled: boolean; // default: false
    timeoutMs: number;     // default: 30000
  };
  filesystem: {
    readOnly: string[];    // paths mounted read-only
    readWrite: string[];   // paths mounted read-write
    hidden: string[];      // paths not visible
  };
  allowedSyscalls?: string[]; // seccomp profile
}
```

### Command Execution Policy

```typescript
interface CommandPolicy {
  allowedCommands: string[];  // Explicit allow list
  deniedCommands: string[];   // Explicit deny list
  deniedPatterns: RegExp[];   // Pattern-based deny
  maxOutputBytes: number;     // Output capture limit
  maxTimeoutMs: number;       // Execution timeout
  requireApproval: boolean;   // Per-command approval
  auditAll: boolean;          // Log all executions
}

// Default deny patterns
const DEFAULT_DENIED = [
  /rm\s+-rf\s+\//, // rm -rf /
  /chmod\s+777/,    // overly permissive
  /curl.*\|.*sh/,   // pipe to shell
  /wget.*\|.*sh/,   // pipe to shell
  /sudo\s+/,        // privilege escalation
  /passwd/,          // password changes
  /ssh-keygen/,     // key generation
  />\s*\/etc\//,    // write to /etc
  /mkfs/,           // filesystem format
  /dd\s+if=/,       // raw disk writes
];
```

### Path Security

```typescript
function isPathAllowed(requestedPath: string, workspaceRoot: string): boolean {
  const resolved = path.resolve(requestedPath);
  const normalizedRoot = path.resolve(workspaceRoot);
  
  // Must be within workspace root
  if (!resolved.startsWith(normalizedRoot + path.sep) && resolved !== normalizedRoot) {
    return false;
  }
  
  // Check against denied patterns
  const DENIED_PATHS = [
    '.env', '.env.local', '.env.production',
    '.ssh', '.gnupg', '.aws', '.azure',
    'node_modules/.cache',
    '.git/objects',
  ];
  
  const relative = path.relative(normalizedRoot, resolved);
  return !DENIED_PATHS.some(p => relative.startsWith(p));
}
```

### Authentication (Web)

- JWT-based session tokens
- Secure cookie storage (HttpOnly, Secure, SameSite)
- CSRF protection
- Rate limiting per user/IP
- Session timeout and rotation

### Audit Events

```typescript
interface AuditEvent {
  id: string;
  timestamp: Date;
  sessionId: string;
  userId?: string;
  type: AuditEventType;
  tool?: string;
  action: string;
  input: Record<string, unknown>; // sanitized
  result: 'success' | 'denied' | 'failed' | 'timeout';
  riskLevel: RiskLevel;
  metadata: Record<string, unknown>;
}

type AuditEventType =
  | 'tool_execution'
  | 'permission_check'
  | 'permission_grant'
  | 'permission_deny'
  | 'file_read'
  | 'file_write'
  | 'command_execution'
  | 'model_request'
  | 'authentication'
  | 'configuration_change'
  | 'secret_access';
```