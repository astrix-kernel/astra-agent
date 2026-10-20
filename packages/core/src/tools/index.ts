import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';

const execFileAsync = promisify(execFile);
export interface ToolContext { workspaceRoot: string; signal?: AbortSignal; permissions: PermissionSet; }
export interface PermissionSet { allowWrite: boolean; allowCommands: string[]; }
export interface ToolResult<T = unknown> { success: boolean; output?: T; error?: string; }
export interface Tool { name: string; description: string; schema: Record<string, unknown>; execute(input: unknown, context: ToolContext): Promise<ToolResult>; }

function safePath(input: string, root: string): string {
  const resolved = path.resolve(root, input);
  const relative = path.relative(path.resolve(root), resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Path is outside workspace');
  if (resolved.split(path.sep).some(part => part === '.git' || part === '.ssh')) throw new Error('Protected path');
  return resolved;
}
const readSchema = z.object({ path: z.string().min(1) });
const listSchema = z.object({ path: z.string().default('.') });
const grepSchema = z.object({ pattern: z.string().min(1), path: z.string().default('.') });
const writeSchema = z.object({ path: z.string().min(1), content: z.string() });
const execSchema = z.object({ command: z.string().min(1), args: z.array(z.string()).default([]), timeoutMs: z.number().int().positive().max(120_000).default(30_000) });

export const readFileTool: Tool = { name: 'fs.read', description: 'Read a UTF-8 file in the workspace', schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }, async execute(input, context) { try { const { path: file } = readSchema.parse(input); return { success: true, output: await fs.readFile(safePath(file, context.workspaceRoot), 'utf8') }; } catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) }; } } };
export const listDirectoryTool: Tool = { name: 'fs.list', description: 'List entries in a workspace directory', schema: { type: 'object', properties: { path: { type: 'string' } } }, async execute(input, context) { try { const { path: directory } = listSchema.parse(input); const entries = await fs.readdir(safePath(directory, context.workspaceRoot), { withFileTypes: true }); return { success: true, output: entries.map(entry => ({ name: entry.name, type: entry.isDirectory() ? 'directory' : 'file' })) }; } catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) }; } } };
export const grepTool: Tool = { name: 'fs.grep', description: 'Search text files within the workspace', schema: { type: 'object', properties: { pattern: { type: 'string' }, path: { type: 'string' } }, required: ['pattern'] }, async execute(input, context) {
  try {
    const { pattern, path: directory } = grepSchema.parse(input);
    const root = safePath(directory, context.workspaceRoot); const regex = new RegExp(pattern, 'i');
    const matches: { path: string; line: number; text: string }[] = [];
    const visit = async (current: string): Promise<void> => {
      for (const entry of await fs.readdir(current, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name.startsWith('.')) continue;
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) { await visit(full); continue; }
        if (matches.length >= 200) return;
        try {
          const content = await fs.readFile(full, 'utf8');
          content.split('\n').forEach((text, index) => { if (regex.test(text) && matches.length < 200) matches.push({ path: path.relative(context.workspaceRoot, full), line: index + 1, text: text.slice(0, 500) }); });
        } catch { continue; }
      }
    };
    await visit(root); return { success: true, output: matches };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) }; }
} };
export const writeFileTool: Tool = { name: 'fs.write', description: 'Write a UTF-8 file in the workspace', schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] }, async execute(input, context) { try { if (!context.permissions.allowWrite) return { success: false, error: 'Write permission denied' }; const { path: file, content } = writeSchema.parse(input); const target = safePath(file, context.workspaceRoot); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, content, 'utf8'); return { success: true, output: { path: file, bytes: Buffer.byteLength(content) } }; } catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) }; } } };
export const executeCommandTool: Tool = { name: 'terminal.execute', description: 'Execute an allowlisted command in the workspace', schema: { type: 'object', properties: { command: { type: 'string' }, args: { type: 'array', items: { type: 'string' } }, timeoutMs: { type: 'number' } }, required: ['command'] }, async execute(input, context) { try { const { command, args, timeoutMs } = execSchema.parse(input); if (!context.permissions.allowCommands.includes(command)) return { success: false, error: `Command not allowed: ${command}` }; const result = await execFileAsync(command, args, { cwd: context.workspaceRoot, timeout: timeoutMs, maxBuffer: 1_000_000, ...(context.signal ? { signal: context.signal } : {}) }); return { success: true, output: { stdout: result.stdout, stderr: result.stderr, exitCode: 0 } }; } catch (error) { const e = error as { stdout?: string; stderr?: string; code?: number | string; message?: string }; return { success: false, error: JSON.stringify({ stdout: e.stdout ?? '', stderr: e.stderr ?? '', exitCode: e.code ?? 1, message: e.message ?? String(error) }) }; } } };
const codeSearchSchema = z.object({ pattern: z.string().min(1), path: z.string().default('.') });
const verifySchema = z.object({ command: z.enum(['npm', 'pnpm', 'yarn', 'node', 'python', 'python3']), args: z.array(z.string()).default([]), timeoutMs: z.number().int().positive().max(120_000).default(60_000) });

export const codeSearchTool: Tool = { name: 'code.search', description: 'Search source code for symbols, imports, references, or diagnostics patterns', schema: { type: 'object', properties: { pattern: { type: 'string' }, path: { type: 'string' } }, required: ['pattern'] }, async execute(input, context) { return grepTool.execute(codeSearchSchema.parse(input), context); } };
export const verifyTool: Tool = { name: 'verify.run', description: 'Run an approved project verification command such as tests, typecheck, lint, or build', schema: { type: 'object', properties: { command: { type: 'string', enum: ['npm', 'pnpm', 'yarn', 'node', 'python', 'python3'] }, args: { type: 'array', items: { type: 'string' } }, timeoutMs: { type: 'number' } }, required: ['command'] }, async execute(input, context) { const parsed = verifySchema.parse(input); return executeCommandTool.execute(parsed, context); } };

export class ToolRegistry { private readonly tools = new Map<string, Tool>(); register(tool: Tool): this { this.tools.set(tool.name, tool); return this; } get(name: string): Tool | undefined { return this.tools.get(name); } list(): Tool[] { return [...this.tools.values()]; } async execute(name: string, input: unknown, context: ToolContext): Promise<ToolResult> { const tool = this.get(name); return tool ? tool.execute(input, context) : { success: false, error: `Unknown tool: ${name}` }; } }
export function createDefaultToolRegistry(): ToolRegistry { return new ToolRegistry().register(readFileTool).register(listDirectoryTool).register(grepTool).register(codeSearchTool).register(writeFileTool).register(executeCommandTool).register(verifyTool); }
