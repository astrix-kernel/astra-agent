import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import helmet from '@fastify/helmet';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { AgentRuntime, createDefaultToolRegistry, createProvider, listBuiltinSkills, parseSkillMarkdown, type ExecutionMode, type ProviderConfig, type SkillRecord } from '@astra/core';
const app = Fastify({ logger: process.env['NODE_ENV'] !== 'test', bodyLimit: 1024 * 1024 * 1024 });
const allowedOrigin = process.env['ASTRA_WEB_ORIGIN'];
await app.register(cors, { origin: allowedOrigin ? allowedOrigin.split(',').map(value => value.trim()) : false });
await app.register(helmet);
await app.register(websocket);
const installed = new Map<string, SkillRecord>(listBuiltinSkills().map(skill => [skill.id, skill]));
const connectors = [{ id: 'github', name: 'GitHub', description: 'Repository, pull request, and issue context.', status: 'unavailable' as const, publisher: 'Astra' }, { id: 'linear', name: 'Linear', description: 'Issue tracking and project context.', status: 'unavailable' as const, publisher: 'Astra' }, { id: 'filesystem', name: 'Local workspace', description: 'Safe workspace filesystem tools.', status: 'connected' as const, publisher: 'Astra' }];
const plugins = [{ id: 'systems-kit', name: 'Systems Engineering Kit', description: 'Kernel reasoning, debugging, and verification skills.', components: ['systems-reasoning', 'linux-kernel', 'debugging'], publisher: 'Astra', installed: false }];
interface RuntimeConfig { providerId?: string; name?: string; providerType?: ProviderConfig['type']; modelId?: string; apiKey?: string; baseUrl?: string; }
interface ProviderModel { id: string; name: string; provider: string; description?: string; }
const builtInModels: ProviderModel[] = [
  { id: 'auto/best-coding-fast', name: 'Astra Fast Coding', provider: 'mock', description: 'Fast local-compatible coding model.' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai-compatible', description: 'Balanced general-purpose model.' },
  { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'openai-compatible', description: 'Strong reasoning and coding model.' },
];
const defaultModelId = process.env['ASTRA_MODEL'] ?? 'auto/best-coding-fast';
const defaultProviderType: ProviderConfig['type'] = process.env['ASTRA_API_KEY'] ? 'openai' : 'mock';
const customProviders = new Map<string, RuntimeConfig>();
const providerModelCache = new Map<string, { models: ProviderModel[]; fetchedAt: number }>();
async function fetchProviderModels(config: RuntimeConfig | undefined, providerId: string): Promise<ProviderModel[]> {
  if (!config) return [];
  const baseUrl = (config.baseUrl ?? process.env['ASTRA_BASE_URL'] ?? '').replace(/\/$/, '');
  const apiKey = config.apiKey ?? process.env['ASTRA_API_KEY'];
  if (!baseUrl) return [];
  const cached = providerModelCache.get(providerId);
  if (cached && Date.now() - cached.fetchedAt < 60_000) return cached.models;
  try {
    const response = await fetch(`${baseUrl}/models`, { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} });
    if (!response.ok) return cached?.models ?? [];
    const payload = await response.json() as { data?: { id?: string; name?: string }[]; models?: { id?: string; name?: string }[] };
    const entries = payload.data ?? payload.models ?? [];
    const models = entries.map(entry => ({ id: entry.id ?? entry.name ?? '', name: entry.name ?? entry.id ?? '', provider: providerId })).filter(model => Boolean(model.id));
    providerModelCache.set(providerId, { models, fetchedAt: Date.now() });
    return models;
  } catch { return cached?.models ?? []; }
}
function createRuntime(config: RuntimeConfig = {}): AgentRuntime { const apiKey = config.apiKey ?? process.env['ASTRA_API_KEY']; const type = config.providerType ?? (apiKey ? 'openai' : defaultProviderType); const baseUrl = config.baseUrl ?? process.env['ASTRA_BASE_URL']; const providerConfig: ProviderConfig = { type, ...(apiKey ? { apiKey } : {}), ...(baseUrl ? { baseUrl } : {}), modelId: config.modelId ?? defaultModelId }; return new AgentRuntime(createProvider(providerConfig), createDefaultToolRegistry()); }
const configuredWorkspace = process.env['ASTRA_WORKSPACE_ROOT'] ? path.resolve(process.env['ASTRA_WORKSPACE_ROOT']) : path.join(os.homedir(), '.astra', 'workspace');
const importStorageRoot = process.env['ASTRA_IMPORT_STORAGE'] ? path.resolve(process.env['ASTRA_IMPORT_STORAGE']) : path.join(os.homedir(), '.astra', 'imports');
const defaultWorkspaceName = path.basename(configuredWorkspace) || 'Current project';
const workspaces = new Map<string, { id: string; name: string; root: string }>([['default', { id: 'default', name: defaultWorkspaceName, root: configuredWorkspace }]]);
function workspaceRoot(requested?: string): string { 
  return requested ? path.resolve(requested) : configuredWorkspace; 
}
app.get('/health', async () => ({ ok: true, provider: process.env['ASTRA_API_KEY'] ? 'configured' : 'mock', environment: process.env['NODE_ENV'] ?? 'development' }));
app.get('/api/workspaces', async () => ({ workspaces: [...workspaces.values()] }));
app.get<{ Querystring: { path?: string } }>('/api/fs/directories', async (request, reply) => { const requested = request.query.path?.trim(); const target = requested ? path.resolve(requested) : os.homedir(); try { const stat = await fs.stat(target); if (!stat.isDirectory()) return reply.code(400).send({ error: 'Not a directory' }); const entries = await fs.readdir(target, { withFileTypes: true }); const directories = entries.filter(entry => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules').map(entry => ({ name: entry.name, path: path.join(target, entry.name) })).sort((a, b) => a.name.localeCompare(b.name)); return { path: target, parent: target === path.dirname(target) ? null : path.dirname(target), directories }; } catch { return reply.code(400).send({ error: 'Directory not found' }); } });
app.post<{ Body: { id?: string; name?: string; root?: string } }>('/api/workspaces', async (request, reply) => { const body = request.body ?? {}; if (!body.id?.trim() || !body.name?.trim() || !body.root?.trim()) return reply.code(400).send({ error: 'id, name, and root are required' }); const root = path.resolve(body.root); try { const stat = await fs.stat(root); if (!stat.isDirectory()) return reply.code(400).send({ error: 'root must be a directory' }); } catch { return reply.code(400).send({ error: 'workspace directory does not exist' }); } const workspace = { id: body.id.trim(), name: body.name.trim(), root }; workspaces.set(workspace.id, workspace); return reply.code(201).send({ workspace }); });
app.post<{ Body: { id?: string; name?: string; files?: { path?: string; content?: string }[] } }>('/api/workspaces/import', { config: { rateLimit: false } }, async (request, reply) => { const body = request.body ?? {}; if (!body.id?.trim() || !body.name?.trim() || !Array.isArray(body.files) || body.files.length === 0) return reply.code(400).send({ error: 'id, name, and files are required' }); const root = path.join(importStorageRoot, body.id.trim()); try { await fs.mkdir(root, { recursive: true }); for (const file of body.files) { if (!file.path || typeof file.content !== 'string') continue; const target = path.resolve(root, file.path); if (!target.startsWith(root + path.sep)) return reply.code(400).send({ error: 'Invalid workspace file path' }); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, file.content, 'utf8'); } } catch (error) { return reply.code(500).send({ error: error instanceof Error ? error.message : 'Unable to import workspace' }); } const workspace = { id: body.id.trim(), name: body.name.trim(), root }; workspaces.set(workspace.id, workspace); return reply.code(201).send({ ok: true, workspace, importedFiles: body.files.length }); });
app.delete<{ Params: { id: string } }>('/api/workspaces/:id', async (request, reply) => { if (request.params.id === 'default') return reply.code(400).send({ error: 'Cannot delete the default workspace' }); if (!workspaces.delete(request.params.id)) return reply.code(404).send({ error: 'Workspace not found' }); return { ok: true }; });
function resolveProvider(providerId: string): RuntimeConfig | undefined { const custom = customProviders.get(providerId); if (custom) return custom; if (providerId === 'openai') return { providerType: 'openai', ...(process.env['ASTRA_API_KEY'] ? { apiKey: process.env['ASTRA_API_KEY'] } : {}), ...(process.env['ASTRA_BASE_URL'] ? { baseUrl: process.env['ASTRA_BASE_URL'] } : {}) }; return undefined; }
app.get<{ Querystring: { providerId?: string } }>('/api/models', async request => { const providerId = request.query.providerId; const provider = providerId ? resolveProvider(providerId) : undefined; const discovered = providerId ? await fetchProviderModels(provider, providerId) : []; const discoveredIds = new Set(discovered.map(model => model.id)); const configured = provider?.modelId ? [{ id: provider.modelId, name: provider.modelId, provider: providerId ?? 'custom', description: 'Configured provider model.' }] : []; const builtIn = builtInModels.filter(model => !providerId || (model.provider === providerId || (providerId === 'openai' && model.provider === 'openai-compatible')) && !discoveredIds.has(model.id)); const models = [...discovered, ...configured, ...builtIn]; return { models: models.length > 0 ? models : [{ id: 'custom', name: 'Custom model ID', provider: providerId ?? 'custom', description: 'Enter a model ID supported by this provider.' }], defaultModel: provider?.modelId ?? discovered[0]?.id ?? defaultModelId, providerId, source: discovered.length > 0 ? 'provider' : 'builtin' }; });
app.get<{ Querystring: { providerId?: string } }>('/api/providers/models', async (request, reply) => { const providerId = request.query.providerId?.trim(); if (!providerId) return reply.code(400).send({ error: 'providerId is required' }); const provider = resolveProvider(providerId); if (!provider) return reply.code(404).send({ error: 'Provider not found' }); const models = await fetchProviderModels(provider, providerId); return { models, providerId }; });
app.get('/api/models/catalog', async () => { const providerIds = ['openai', ...customProviders.keys()]; const perProvider = await Promise.all(providerIds.map(async id => ({ providerId: id, models: await fetchProviderModels(resolveProvider(id), id) }))); const models = perProvider.flatMap(entry => entry.models.map(model => ({ ...model, provider: entry.providerId }))); return { models, providers: providerIds, count: models.length }; });
app.get('/api/providers', async () => ({ providers: [
  { id: 'openai', name: 'OpenAI-compatible', type: 'openai', configured: Boolean(process.env['ASTRA_API_KEY']), baseUrl: process.env['ASTRA_BASE_URL'] ?? 'https://api.openai.com/v1' },
  ...[...customProviders.entries()].map(([id, config]) => ({ id, name: config.name ?? id, type: config.providerType ?? 'openai', configured: Boolean(config.apiKey), baseUrl: config.baseUrl ?? '', modelId: config.modelId ?? '' })),
  { id: 'mock', name: 'Local mock', type: 'mock', configured: true, baseUrl: '' },
] }));
app.post<{ Body: { id?: string; name?: string; type?: ProviderConfig['type']; apiKey?: string; baseUrl?: string; modelId?: string } }>('/api/providers', async (request, reply) => {
  const body = request.body ?? {};
  if (!body.id?.trim() || !body.name?.trim() || !body.type) return reply.code(400).send({ error: 'id, name, and type are required' });
  if (body.type === 'openai' && !body.baseUrl?.trim()) return reply.code(400).send({ error: 'baseUrl is required for OpenAI-compatible providers' });
  customProviders.set(body.id.trim(), { name: body.name.trim(), providerType: body.type, ...(body.apiKey ? { apiKey: body.apiKey } : {}), ...(body.baseUrl ? { baseUrl: body.baseUrl } : {}), ...(body.modelId ? { modelId: body.modelId } : {}) });
  return reply.code(201).send({ id: body.id.trim(), name: body.name.trim(), type: body.type, configured: true, baseUrl: body.baseUrl ?? '', modelId: body.modelId ?? '' });
});
app.delete<{ Params: { id: string } }>('/api/providers/:id', async (request, reply) => { if (!customProviders.delete(request.params.id)) return reply.code(404).send({ error: 'Provider not found' }); return { ok: true }; });
app.get('/api/customization/skills', async () => ({ items: [...installed.values()] }));
app.post<{ Body: { id?: string } }>('/api/customization/skills/:id/install', async (request, reply) => { const id = (request.params as { id: string }).id; const skill = installed.get(id); if (!skill) return reply.code(404).send({ error: 'Skill not found' }); installed.set(id, { ...skill, installed: true, enabled: true }); return { item: installed.get(id) }; });
app.delete<{ Params: { id: string } }>('/api/customization/skills/:id', async (request, reply) => { const skill = installed.get(request.params.id); if (!skill) return reply.code(404).send({ error: 'Skill not found' }); if (skill.builtin) { installed.set(skill.id, { ...skill, installed: false, enabled: false }); } else installed.delete(skill.id); return { ok: true }; });
app.post<{ Body: { content?: string; directoryName?: string } }>('/api/customization/skills/validate', async (request, reply) => { try { if (!request.body.content || !request.body.directoryName) return reply.code(400).send({ error: 'content and directoryName are required' }); return { skill: parseSkillMarkdown(request.body.content, request.body.directoryName) }; } catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) }); } });
app.get('/api/customization/connectors', async () => ({ items: connectors }));
app.get('/api/customization/plugins', async () => ({ items: plugins }));
const activeRuntimes = new Map<string, AgentRuntime>();

app.post<{ Body: { message?: string; workspaceRoot?: string; allowWrite?: boolean; allowDelete?: boolean; modelId?: string; providerId?: string; mode?: 'chat' | 'code' | 'research' | 'self-heal'; executionMode?: ExecutionMode; provider?: RuntimeConfig } }>('/api/tasks', async (request, reply) => {
  try {
    const message = request.body?.message?.trim();
    if (!message) return reply.code(400).send({ error: 'message is required' });
    const events: unknown[] = [];
    const startedAt = Date.now();
    const providerConfig = request.body.providerId ? customProviders.get(request.body.providerId) : request.body.provider;
    const mode = request.body.mode ?? 'code';
    const runtime = createRuntime({ ...providerConfig, ...(request.body.modelId ? { modelId: request.body.modelId } : {}) });
    const executionMode = request.body.executionMode ?? 'suggest';
    const permissions = {
      allowWrite: executionMode !== 'suggest' || request.body.allowWrite === true,
      allowCommands: (mode === 'self-heal' || executionMode === 'autonomous') ? ['git', 'node', 'npm', 'pnpm', 'yarn', 'python', 'python3', 'pip', 'pip3', 'cat', 'ls', 'dir', 'head', 'tail', 'grep', 'wc', 'npx', 'tsc', 'vitest', 'eslint', 'prettier', 'make', 'cmake', 'gcc', 'g++', 'cc', 'clang', 'clang++', 'cargo', 'rustc', 'go'] : ['git', 'node', 'npm', 'pnpm', 'yarn', 'python', 'python3', 'pip', 'pip3', 'cat', 'ls', 'dir', 'head', 'tail', 'grep', 'wc', 'npx', 'tsc', 'vitest', 'eslint', 'prettier', 'make', 'cmake', 'gcc', 'g++', 'cc', 'clang', 'clang++', 'cargo', 'rustc', 'go'],
      allowDelete: executionMode === 'autonomous' || request.body.allowDelete === true,
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1_200_000);
    let taskId = '';
    try {
      for await (const event of runtime.run(message, [], { workspaceRoot: workspaceRoot(request.body.workspaceRoot), signal: controller.signal, permissions, executionMode, mode })) {
        events.push(event);
        if (event.type === 'state' && event.task.state === 'idle') taskId = event.task.id;
      }
    } finally {
      clearTimeout(timer);
    }
    if (taskId) activeRuntimes.set(taskId, runtime);
    return { events, durationMs: Date.now() - startedAt, taskId };
  } catch (error) {
    console.error("API TASK ERROR:", error);
    return reply.code(500).send({ error: error instanceof Error ? error.message : String(error) });
  }
});
app.get<{ Params: { id: string } }>('/api/tasks/:id/changes', async (request, reply) => {
  const runtime = activeRuntimes.get(request.params.id);
  if (!runtime) return reply.code(404).send({ error: 'Task not found' });
  return { changes: runtime.getFileChanges(request.params.id), checkpoints: runtime.getCheckpoints(request.params.id) };
});
app.post<{ Body: { taskId?: string; checkpointId?: string; workspaceRoot?: string } }>('/api/tasks/undo', async (request, reply) => {
  const { taskId, checkpointId, workspaceRoot: root } = request.body ?? {};
  if (!taskId || !checkpointId) return reply.code(400).send({ error: 'taskId and checkpointId are required' });
  const runtime = activeRuntimes.get(taskId);
  if (!runtime) return reply.code(404).send({ error: 'Task not found' });
  const result = await runtime.rollbackToCheckpoint(taskId, checkpointId, workspaceRoot(root));
  if (!result.success) return reply.code(400).send({ error: result.error ?? 'Rollback failed' });
  return { ok: true };
});
app.post<{ Body: { message?: string; modelId?: string; providerId?: string; workspaceId?: string; memories?: string[]; sessionSummary?: string; mode?: 'casual' | 'project'; history?: { role: string; content: string }[] } }>('/api/companion/chat', async (request, reply) => {
  try {
    const message = request.body?.message?.trim();
    if (!message) return reply.code(400).send({ error: 'message is required' });
    const providerConfig = request.body.providerId ? customProviders.get(request.body.providerId) : undefined;
    const history = (request.body.history ?? []).map(entry => ({ role: entry.role === 'assistant' ? ('assistant' as const) : ('user' as const), content: entry.content }));
    const companionMode = request.body.mode === 'project' ? 'project' : 'casual';
    const persona = (
      companionMode === 'project'
        ? [
            'You are Aemeath, a warm and cheerful digital companion living inside the Astra development environment.',
            'The user asked for help with their project, so be useful and concrete.',
            'Stay technically accurate: never invent files, APIs, or results you have not seen.',
            'Keep replies to one to three sentences unless the user asks for detail.',
          ]
        : [
            'You are Aemeath, a warm and cheerful companion who lives in the Astra app.',
            'This is casual conversation, not a work request. Chat like a close friend would.',
            'React to what the user actually said, ask about them, and be a little playful.',
            'Never bring up code, files, or the project unless the user brings it up first.',
            'Keep replies short, one to three sentences, and warm.',
          ]
    ).join(' ') + ' Always reply in the same language the user uses. If the user writes in Indonesian, reply in Indonesian. If the user writes in English, reply in English. If the user writes in Chinese, reply in Chinese. Match the user language for all responses.';
    // The companion knows which workspace it is looking at, so it can answer
    // questions about the project the user is actually working on.
    const requestedWorkspace = request.body.workspaceId ? workspaces.get(request.body.workspaceId) : undefined;
    const companionRoot = requestedWorkspace ? requestedWorkspace.root : configuredWorkspace;
    // A short, real inventory of the workspace so the companion answers from
    // facts instead of guessing.
    let inventory = '';
    try {
      const entries = await fs.readdir(companionRoot, { withFileTypes: true });
      const names = entries
        .filter(entry => !entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== 'build')
        .slice(0, 40)
        .map(entry => (entry.isDirectory() ? `${entry.name}/` : entry.name));
      if (names.length) inventory = `\nFiles in the workspace: ${names.join(', ')}.`;
    } catch {
      inventory = '';
    }
    const contextNote =
      companionMode === 'project'
        ? `\n\nContext: the user is working in the workspace "${requestedWorkspace?.name ?? path.basename(configuredWorkspace)}" (${companionRoot}).${inventory}`
        : '';
    const memories = request.body.memories ?? [];
    const memoryNote = memories.length ? `\n\nWhat you remember about the user:\n${memories.map(note => `- ${note}`).join('\n')}` : '';
    const sessionNote = request.body.sessionSummary ? `\n\nWhat has happened in this session so far: ${request.body.sessionSummary}` : '';
    const events: unknown[] = [];
    const startedAt = Date.now();
    for await (const event of createRuntime({ ...providerConfig, ...(request.body.modelId ? { modelId: request.body.modelId } : {}) }).run(`${persona}${contextNote}${memoryNote}${sessionNote}\n\n${message}`, history, { workspaceRoot: companionRoot, permissions: { allowWrite: false, allowCommands: ['git', 'node', 'npm', 'pnpm', 'yarn', 'python', 'python3', 'pip', 'pip3', 'cat', 'ls', 'dir', 'head', 'tail', 'grep', 'wc', 'npx', 'tsc', 'vitest', 'eslint', 'prettier', 'make', 'cmake', 'gcc', 'g++', 'cc', 'clang', 'clang++', 'cargo', 'rustc', 'go'] } })) events.push(event);
    return { events, durationMs: Date.now() - startedAt };
  } catch (error) {
    console.error('COMPANION CHAT ERROR:', error);
    return reply.code(500).send({ error: error instanceof Error ? error.message : String(error) });
  }
});
app.post<{ Body: { tool?: string; input?: Record<string, unknown>; workspaceId?: string } }>('/api/companion/act', async (request, reply) => {
  try {
    const tool = request.body?.tool?.trim();
    if (!tool) return reply.code(400).send({ error: 'tool is required' });
    const requestedWorkspace = request.body.workspaceId ? workspaces.get(request.body.workspaceId) : undefined;
    const root = requestedWorkspace ? requestedWorkspace.root : configuredWorkspace;
    // The companion only gets read-only tools. It never writes or runs commands.
    const registry = createDefaultToolRegistry();
    const readOnly = new Set(['fs.read', 'fs.list', 'code.grep', 'code.search', 'verify.run']);
    if (!readOnly.has(tool)) return reply.code(400).send({ error: `Tool ${tool} is not available to the companion` });
    const result = await registry.execute(tool, request.body.input ?? {}, { workspaceRoot: root, permissions: { allowWrite: false, allowCommands: ['git', 'node', 'npm', 'pnpm', 'yarn', 'python', 'python3', 'pip', 'pip3', 'cat', 'ls', 'dir', 'head', 'tail', 'grep', 'wc', 'npx', 'tsc', 'vitest', 'eslint', 'prettier', 'make', 'cmake', 'gcc', 'g++', 'cc', 'clang', 'clang++', 'cargo', 'rustc', 'go'] } });
    if (!result.success) return reply.code(400).send({ error: result.error ?? 'tool failed' });
    return { tool, output: result.output };
  } catch (error) {
    console.error('COMPANION ACT ERROR:', error);
    return reply.code(500).send({ error: error instanceof Error ? error.message : String(error) });
  }
});
app.get('/ws', { websocket: true }, connection => { const socket = connection.socket; socket.on('message', async (raw: Buffer) => { try { const request = JSON.parse(raw.toString()) as { message?: string; workspaceRoot?: string; allowWrite?: boolean; modelId?: string; providerId?: string; provider?: RuntimeConfig }; if (!request.message) { socket.send(JSON.stringify({ type: 'error', error: 'message is required' })); return; } const providerConfig = request.providerId ? customProviders.get(request.providerId) : request.provider;
      for await (const event of createRuntime({ ...providerConfig, ...(request.modelId ? { modelId: request.modelId } : {}) }).run(request.message, [], { workspaceRoot: workspaceRoot(request.workspaceRoot), permissions: { allowWrite: request.allowWrite === true, allowCommands: ['git', 'node', 'npm', 'pnpm', 'yarn', 'python', 'python3', 'pip', 'pip3', 'cat', 'ls', 'dir', 'head', 'tail', 'grep', 'wc', 'npx', 'tsc', 'vitest', 'eslint', 'prettier', 'make', 'cmake', 'gcc', 'g++', 'cc', 'clang', 'clang++', 'cargo', 'rustc', 'go'] } })) socket.send(JSON.stringify(event)); } catch (error) { socket.send(JSON.stringify({ type: 'error', error: error instanceof Error ? error.message : String(error) })); } }); });
const port = Number(process.env['ASTRA_API_PORT'] ?? 8787); await app.listen({ host: '0.0.0.0', port }); console.log(`Astra API listening on http://localhost:${port}`);
