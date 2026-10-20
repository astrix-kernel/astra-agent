import type { Message } from '../index.js';
import type { ModelProvider } from '../provider/index.js';
import type { ToolRegistry, PermissionSet } from '../tools/index.js';
export type TaskState = 'idle' | 'understanding' | 'planning' | 'executing' | 'verifying' | 'completed' | 'failed' | 'cancelled';
export interface AgentLimits {
    maxIterations: number;
    maxToolCalls: number;
    maxTimeMs: number;
}
export interface AgentTask {
    id: string;
    state: TaskState;
    iterations: number;
    toolCalls: number;
    startedAt: number;
}
export interface AgentEvent {
    type: 'state' | 'text' | 'tool_start' | 'tool_result' | 'error' | 'done';
    task: AgentTask;
    text?: string;
    tool?: string;
    result?: unknown;
    error?: string;
}
export interface AgentRunOptions {
    workspaceRoot: string;
    permissions?: PermissionSet;
    limits?: Partial<AgentLimits>;
    signal?: AbortSignal;
}
export declare class AgentRuntime {
    private readonly provider;
    private readonly tools;
    constructor(provider: ModelProvider, tools: ToolRegistry);
    run(userText: string, history: Message[] | undefined, options: AgentRunOptions): AsyncIterable<AgentEvent>;
}
//# sourceMappingURL=index.d.ts.map