export interface ToolContext {
    workspaceRoot: string;
    signal?: AbortSignal;
    permissions: PermissionSet;
}
export interface PermissionSet {
    allowWrite: boolean;
    allowCommands: string[];
}
export interface ToolResult<T = unknown> {
    success: boolean;
    output?: T;
    error?: string;
}
export interface Tool {
    name: string;
    description: string;
    schema: Record<string, unknown>;
    execute(input: unknown, context: ToolContext): Promise<ToolResult>;
}
export declare const readFileTool: Tool;
export declare const listDirectoryTool: Tool;
export declare const grepTool: Tool;
export declare const writeFileTool: Tool;
export declare const executeCommandTool: Tool;
export declare const codeSearchTool: Tool;
export declare const verifyTool: Tool;
export declare class ToolRegistry {
    private readonly tools;
    register(tool: Tool): this;
    get(name: string): Tool | undefined;
    list(): Tool[];
    execute(name: string, input: unknown, context: ToolContext): Promise<ToolResult>;
}
export declare function createDefaultToolRegistry(): ToolRegistry;
//# sourceMappingURL=index.d.ts.map