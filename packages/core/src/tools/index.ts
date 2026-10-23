import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { mathTools } from './math.js';
import { systemsTools } from './systems.js';
import { aiTools } from './ai.js';

const execFileAsync = promisify(execFile);
export interface ToolContext { workspaceRoot: string; signal?: AbortSignal; permissions: PermissionSet; }
export interface PermissionSet { allowWrite: boolean; allowCommands: string[]; allowDelete?: boolean; }
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
const execSchema = z.object({ command: z.string().min(1), args: z.array(z.string()).default([]), timeoutMs: z.number().int().positive().max(120_000).default(30_000), allowFailure: z.boolean().default(false) });
const deleteSchema = z.object({ path: z.string().min(1) });
const mkdirSchema = z.object({ path: z.string().min(1), recursive: z.boolean().default(true) });
const moveSchema = z.object({ from: z.string().min(1), to: z.string().min(1) });
const statSchema = z.object({ path: z.string().min(1) });
const diffSchema = z.object({ path: z.string().min(1), newContent: z.string() });
const patchSchema = z.object({ path: z.string().min(1), patches: z.array(z.object({ oldString: z.string(), newString: z.string() })) });

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
export const executeCommandTool: Tool = { name: 'terminal.execute', description: 'Execute an allowlisted command in the workspace', schema: { type: 'object', properties: { command: { type: 'string' }, args: { type: 'array', items: { type: 'string' } }, timeoutMs: { type: 'number' }, allowFailure: { type: 'boolean' } }, required: ['command'] }, async execute(input, context) { let startTime = Date.now(); let allowFailure = false; try { const { command, args, timeoutMs, allowFailure: allowFail } = execSchema.parse(input); allowFailure = allowFail; if (!context.permissions.allowCommands.includes(command)) return { success: false, error: `Command not allowed: ${command}` }; startTime = Date.now(); const result = await execFileAsync(command, args, { cwd: context.workspaceRoot, timeout: timeoutMs, maxBuffer: 10_000_000, ...(context.signal ? { signal: context.signal } : {}) }); const durationMs = Date.now() - startTime; const output = { stdout: result.stdout, stderr: result.stderr, exitCode: 0, durationMs }; if (!allowFailure && result.stderr && result.stderr.trim() && result.stderr.includes('error')) { return { success: false, error: JSON.stringify({ ...output, message: 'Command produced error output' }) }; } return { success: true, output }; } catch (error) { const e = error as { stdout?: string; stderr?: string; code?: number | string; message?: string; signal?: AbortSignal; name?: string }; const durationMs = Date.now() - startTime; const errorOutput = { stdout: e.stdout ?? '', stderr: e.stderr ?? '', exitCode: e.code ?? 1, durationMs, message: e.message ?? String(error), aborted: e.name === 'AbortError' || e.signal?.aborted === true }; if (allowFailure) { return { success: true, output: errorOutput }; } return { success: false, error: JSON.stringify(errorOutput) }; } } };
const codeSearchSchema = z.object({ pattern: z.string().min(1), path: z.string().default('.') });
const verifySchema = z.object({ command: z.enum(['npm', 'pnpm', 'yarn', 'node', 'python', 'python3']), args: z.array(z.string()).default([]), timeoutMs: z.number().int().positive().max(120_000).default(60_000) });

export const codeSearchTool: Tool = { name: 'code.search', description: 'Search source code for symbols, imports, references, or diagnostics patterns', schema: { type: 'object', properties: { pattern: { type: 'string' }, path: { type: 'string' } }, required: ['pattern'] }, async execute(input, context) {
  try {
    return await grepTool.execute(codeSearchSchema.parse(input), context);
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : JSON.stringify(error) };
  }
} };
export const verifyTool: Tool = { name: 'verify.run', description: 'Run an approved project verification command such as tests, typecheck, lint, or build', schema: { type: 'object', properties: { command: { type: 'string', enum: ['npm', 'pnpm', 'yarn', 'node', 'python', 'python3'] }, args: { type: 'array', items: { type: 'string' } }, timeoutMs: { type: 'number' } }, required: ['command'] }, async execute(input, context) {
  try {
    const parsed = verifySchema.parse(input);
    return await executeCommandTool.execute(parsed, context);
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : JSON.stringify(error) };
  }
} };

export const deleteFileTool: Tool = { name: 'fs.delete', description: 'Delete a file in the workspace', schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }, async execute(input, context) { try { if (!context.permissions.allowDelete) return { success: false, error: 'Delete permission denied' }; const { path: file } = deleteSchema.parse(input); const target = safePath(file, context.workspaceRoot); await fs.unlink(target); return { success: true, output: { path: file } }; } catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) }; } } };
export const mkdirTool: Tool = { name: 'fs.mkdir', description: 'Create a directory in the workspace', schema: { type: 'object', properties: { path: { type: 'string' }, recursive: { type: 'boolean' } } }, async execute(input, context) { try { if (!context.permissions.allowWrite) return { success: false, error: 'Write permission denied' }; const { path: directory, recursive } = mkdirSchema.parse(input); const target = safePath(directory, context.workspaceRoot); await fs.mkdir(target, { recursive }); return { success: true, output: { path: directory } }; } catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) }; } } };
export const moveFileTool: Tool = { name: 'fs.move', description: 'Move or rename a file in the workspace', schema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'] }, async execute(input, context) { try { if (!context.permissions.allowWrite) return { success: false, error: 'Write permission denied' }; const { from, to } = moveSchema.parse(input); const fromPath = safePath(from, context.workspaceRoot); const toPath = safePath(to, context.workspaceRoot); await fs.mkdir(path.dirname(toPath), { recursive: true }); await fs.rename(fromPath, toPath); return { success: true, output: { from, to } }; } catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) }; } } };
export const statTool: Tool = { name: 'fs.stat', description: 'Get file metadata', schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }, async execute(input, context) { try { const { path: file } = statSchema.parse(input); const target = safePath(file, context.workspaceRoot); const stats = await fs.stat(target); return { success: true, output: { path: file, size: stats.size, isFile: stats.isFile(), isDirectory: stats.isDirectory(), mtime: stats.mtime.toISOString(), ctime: stats.ctime.toISOString() } }; } catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) }; } } };
export const diffTool: Tool = { name: 'fs.diff', description: 'Show diff between current file content and new content', schema: { type: 'object', properties: { path: { type: 'string' }, newContent: { type: 'string' } }, required: ['path', 'newContent'] }, async execute(input, context) { try { const { path: file, newContent } = diffSchema.parse(input); const target = safePath(file, context.workspaceRoot); let oldContent = ''; try { oldContent = await fs.readFile(target, 'utf8'); } catch {
    // file does not exist, treat as empty
  } const oldLines = oldContent.split('\n'); const newLines = newContent.split('\n'); const diff: string[] = []; const maxLines = Math.max(oldLines.length, newLines.length); for (let i = 0; i < maxLines; i++) { const oldLine = oldLines[i]; const newLine = newLines[i]; if (oldLine !== newLine) { if (oldLine !== undefined) diff.push(`- ${oldLine}`); if (newLine !== undefined) diff.push(`+ ${newLine}`); } } return { success: true, output: { path: file, diff: diff.join('\n'), hasChanges: diff.length > 0 } }; } catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) }; } } };
export const patchTool: Tool = { name: 'fs.patch', description: 'Apply targeted patches to a file', schema: { type: 'object', properties: { path: { type: 'string' }, patches: { type: 'array', items: { type: 'object', properties: { oldString: { type: 'string' }, newString: { type: 'string' } }, required: ['oldString', 'newString'] } } }, required: ['path', 'patches'] }, async execute(input, context) { try { if (!context.permissions.allowWrite) return { success: false, error: 'Write permission denied' }; const { path: file, patches } = patchSchema.parse(input); const target = safePath(file, context.workspaceRoot); let content = await fs.readFile(target, 'utf8'); for (const patch of patches) { if (!content.includes(patch.oldString)) { return { success: false, error: `Patch not applied: oldString not found in file` }; } content = content.replace(patch.oldString, patch.newString); } await fs.writeFile(target, content, 'utf8'); return { success: true, output: { path: file, patchesApplied: patches.length } }; } catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) }; } } };

export class ToolRegistry { private readonly tools = new Map<string, Tool>(); register(tool: Tool): this { this.tools.set(tool.name, tool); return this; } get(name: string): Tool | undefined { return this.tools.get(name); } list(): Tool[] { return [...this.tools.values()]; } async execute(name: string, input: unknown, context: ToolContext): Promise<ToolResult> { const tool = this.get(name); return tool ? tool.execute(input, context) : { success: false, error: `Unknown tool: ${name}` }; } }
export function createDefaultToolRegistry(): ToolRegistry { 
  const registry = new ToolRegistry()
    .register(readFileTool)
    .register(listDirectoryTool)
    .register(grepTool)
    .register(codeSearchTool)
    .register(writeFileTool)
    .register(deleteFileTool)
    .register(mkdirTool)
    .register(moveFileTool)
    .register(statTool)
    .register(diffTool)
    .register(patchTool)
    .register(executeCommandTool)
    .register(verifyTool);
  
  for (const tool of mathTools) {
    registry.register(tool);
  }
  
  for (const tool of systemsTools) {
    registry.register(tool);
  }
  
  for (const tool of aiTools) {
    registry.register(tool);
  }
  
  return registry;
}