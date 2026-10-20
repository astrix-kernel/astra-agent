"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolRegistry = exports.verifyTool = exports.codeSearchTool = exports.executeCommandTool = exports.writeFileTool = exports.grepTool = exports.listDirectoryTool = exports.readFileTool = void 0;
exports.createDefaultToolRegistry = createDefaultToolRegistry;
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const zod_1 = require("zod");
const execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);
function safePath(input, root) {
    const resolved = node_path_1.default.resolve(root, input);
    const relative = node_path_1.default.relative(node_path_1.default.resolve(root), resolved);
    if (relative.startsWith('..') || node_path_1.default.isAbsolute(relative))
        throw new Error('Path is outside workspace');
    if (resolved.split(node_path_1.default.sep).some(part => part === '.git' || part === '.ssh'))
        throw new Error('Protected path');
    return resolved;
}
const readSchema = zod_1.z.object({ path: zod_1.z.string().min(1) });
const listSchema = zod_1.z.object({ path: zod_1.z.string().default('.') });
const grepSchema = zod_1.z.object({ pattern: zod_1.z.string().min(1), path: zod_1.z.string().default('.') });
const writeSchema = zod_1.z.object({ path: zod_1.z.string().min(1), content: zod_1.z.string() });
const execSchema = zod_1.z.object({ command: zod_1.z.string().min(1), args: zod_1.z.array(zod_1.z.string()).default([]), timeoutMs: zod_1.z.number().int().positive().max(120_000).default(30_000) });
exports.readFileTool = { name: 'fs.read', description: 'Read a UTF-8 file in the workspace', schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }, async execute(input, context) { try {
        const { path: file } = readSchema.parse(input);
        return { success: true, output: await node_fs_1.promises.readFile(safePath(file, context.workspaceRoot), 'utf8') };
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    } } };
exports.listDirectoryTool = { name: 'fs.list', description: 'List entries in a workspace directory', schema: { type: 'object', properties: { path: { type: 'string' } } }, async execute(input, context) { try {
        const { path: directory } = listSchema.parse(input);
        const entries = await node_fs_1.promises.readdir(safePath(directory, context.workspaceRoot), { withFileTypes: true });
        return { success: true, output: entries.map(entry => ({ name: entry.name, type: entry.isDirectory() ? 'directory' : 'file' })) };
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    } } };
exports.grepTool = { name: 'fs.grep', description: 'Search text files within the workspace', schema: { type: 'object', properties: { pattern: { type: 'string' }, path: { type: 'string' } }, required: ['pattern'] }, async execute(input, context) {
        try {
            const { pattern, path: directory } = grepSchema.parse(input);
            const root = safePath(directory, context.workspaceRoot);
            const regex = new RegExp(pattern, 'i');
            const matches = [];
            const visit = async (current) => {
                for (const entry of await node_fs_1.promises.readdir(current, { withFileTypes: true })) {
                    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name.startsWith('.'))
                        continue;
                    const full = node_path_1.default.join(current, entry.name);
                    if (entry.isDirectory()) {
                        await visit(full);
                        continue;
                    }
                    if (matches.length >= 200)
                        return;
                    try {
                        const content = await node_fs_1.promises.readFile(full, 'utf8');
                        content.split('\n').forEach((text, index) => { if (regex.test(text) && matches.length < 200)
                            matches.push({ path: node_path_1.default.relative(context.workspaceRoot, full), line: index + 1, text: text.slice(0, 500) }); });
                    }
                    catch {
                        continue;
                    }
                }
            };
            await visit(root);
            return { success: true, output: matches };
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    } };
exports.writeFileTool = { name: 'fs.write', description: 'Write a UTF-8 file in the workspace', schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] }, async execute(input, context) { try {
        if (!context.permissions.allowWrite)
            return { success: false, error: 'Write permission denied' };
        const { path: file, content } = writeSchema.parse(input);
        const target = safePath(file, context.workspaceRoot);
        await node_fs_1.promises.mkdir(node_path_1.default.dirname(target), { recursive: true });
        await node_fs_1.promises.writeFile(target, content, 'utf8');
        return { success: true, output: { path: file, bytes: Buffer.byteLength(content) } };
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    } } };
exports.executeCommandTool = { name: 'terminal.execute', description: 'Execute an allowlisted command in the workspace', schema: { type: 'object', properties: { command: { type: 'string' }, args: { type: 'array', items: { type: 'string' } }, timeoutMs: { type: 'number' } }, required: ['command'] }, async execute(input, context) { try {
        const { command, args, timeoutMs } = execSchema.parse(input);
        if (!context.permissions.allowCommands.includes(command))
            return { success: false, error: `Command not allowed: ${command}` };
        const result = await execFileAsync(command, args, { cwd: context.workspaceRoot, timeout: timeoutMs, maxBuffer: 1_000_000, ...(context.signal ? { signal: context.signal } : {}) });
        return { success: true, output: { stdout: result.stdout, stderr: result.stderr, exitCode: 0 } };
    }
    catch (error) {
        const e = error;
        return { success: false, error: JSON.stringify({ stdout: e.stdout ?? '', stderr: e.stderr ?? '', exitCode: e.code ?? 1, message: e.message ?? String(error) }) };
    } } };
const codeSearchSchema = zod_1.z.object({ pattern: zod_1.z.string().min(1), path: zod_1.z.string().default('.') });
const verifySchema = zod_1.z.object({ command: zod_1.z.enum(['npm', 'pnpm', 'yarn', 'node', 'python', 'python3']), args: zod_1.z.array(zod_1.z.string()).default([]), timeoutMs: zod_1.z.number().int().positive().max(120_000).default(60_000) });
exports.codeSearchTool = { name: 'code.search', description: 'Search source code for symbols, imports, references, or diagnostics patterns', schema: { type: 'object', properties: { pattern: { type: 'string' }, path: { type: 'string' } }, required: ['pattern'] }, async execute(input, context) { return exports.grepTool.execute(codeSearchSchema.parse(input), context); } };
exports.verifyTool = { name: 'verify.run', description: 'Run an approved project verification command such as tests, typecheck, lint, or build', schema: { type: 'object', properties: { command: { type: 'string', enum: ['npm', 'pnpm', 'yarn', 'node', 'python', 'python3'] }, args: { type: 'array', items: { type: 'string' } }, timeoutMs: { type: 'number' } }, required: ['command'] }, async execute(input, context) { const parsed = verifySchema.parse(input); return exports.executeCommandTool.execute(parsed, context); } };
class ToolRegistry {
    tools = new Map();
    register(tool) { this.tools.set(tool.name, tool); return this; }
    get(name) { return this.tools.get(name); }
    list() { return [...this.tools.values()]; }
    async execute(name, input, context) { const tool = this.get(name); return tool ? tool.execute(input, context) : { success: false, error: `Unknown tool: ${name}` }; }
}
exports.ToolRegistry = ToolRegistry;
function createDefaultToolRegistry() { return new ToolRegistry().register(exports.readFileTool).register(exports.listDirectoryTool).register(exports.grepTool).register(exports.codeSearchTool).register(exports.writeFileTool).register(exports.executeCommandTool).register(exports.verifyTool); }
//# sourceMappingURL=index.js.map