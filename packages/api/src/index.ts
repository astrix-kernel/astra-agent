import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import path from 'node:path';
import { AgentRuntime, createDefaultToolRegistry, createProvider, listBuiltinSkills, parseSkillMarkdown, type SkillRecord } from '@astra/core';

const app = Fastify({ logger: process.env['NODE_ENV'] !== 'test' });
const allowedOrigin = process.env['ASTRA_WEB_ORIGIN'];
await app.register(cors, { origin: allowedOrigin ? allowedOrigin.split(',').map(value => value.trim()) : false });
await app.register(helmet);
await app.register(rateLimit, { max: Number(process.env['ASTRA_RATE_LIMIT'] ?? 60), timeWindow: '1 minute' });
await app.register(websocket);
const installed = new Map<string, SkillRecord>(listBuiltinSkills().map(skill => [skill.id, skill]));
const connectors = [{ id: 'github', name: 'GitHub', description: 'Repository, pull request, and issue context.', status: 'unavailable' as const, publisher: 'Astra' }, { id: 'linear', name: 'Linear', description: 'Issue tracking and project context.', status: 'unavailable' as const, publisher: 'Astra' }, { id: 'filesystem', name: 'Local workspace', description: 'Safe workspace filesystem tools.', status: 'connected' as const, publisher: 'Astra' }];
const plugins = [{ id: 'systems-kit', name: 'Systems Engineering Kit', description: 'Kernel reasoning, debugging, and verification skills.', components: ['systems-reasoning', 'linux-kernel', 'debugging'], publisher: 'Astra', installed: false }];
function createRuntime(): AgentRuntime { const apiKey = process.env['ASTRA_API_KEY']; const provider = createProvider({ type: apiKey ? 'openai' : 'mock', ...(apiKey ? { apiKey } : {}), ...(process.env['ASTRA_BASE_URL'] ? { baseUrl: process.env['ASTRA_BASE_URL'] } : {}), modelId: process.env['ASTRA_MODEL'] ?? 'auto/best-coding-fast' }); return new AgentRuntime(provider, createDefaultToolRegistry()); }
const configuredWorkspace = process.env['ASTRA_WORKSPACE_ROOT'] ? path.resolve(process.env['ASTRA_WORKSPACE_ROOT']) : process.cwd();
function workspaceRoot(requested?: string): string { const candidate = path.resolve(requested ?? configuredWorkspace); if (!candidate.startsWith(configuredWorkspace + path.sep) && candidate !== configuredWorkspace) throw new Error('Workspace is outside the configured root'); return candidate; }
app.get('/health', async () => ({ ok: true, provider: process.env['ASTRA_API_KEY'] ? 'configured' : 'mock', environment: process.env['NODE_ENV'] ?? 'development' }));
app.get('/api/models', async () => ({ models: [{ id: process.env['ASTRA_MODEL'] ?? 'auto/best-coding-fast', provider: process.env['ASTRA_API_KEY'] ? 'openai-compatible' : 'mock' }] }));
app.get('/api/customization/skills', async () => ({ items: [...installed.values()] }));
app.post<{ Body: { id?: string } }>('/api/customization/skills/:id/install', async (request, reply) => { const id = (request.params as { id: string }).id; const skill = installed.get(id); if (!skill) return reply.code(404).send({ error: 'Skill not found' }); installed.set(id, { ...skill, installed: true, enabled: true }); return { item: installed.get(id) }; });
app.delete<{ Params: { id: string } }>('/api/customization/skills/:id', async (request, reply) => { const skill = installed.get(request.params.id); if (!skill) return reply.code(404).send({ error: 'Skill not found' }); if (skill.builtin) { installed.set(skill.id, { ...skill, installed: false, enabled: false }); } else installed.delete(skill.id); return { ok: true }; });
app.post<{ Body: { content?: string; directoryName?: string } }>('/api/customization/skills/validate', async (request, reply) => { try { if (!request.body.content || !request.body.directoryName) return reply.code(400).send({ error: 'content and directoryName are required' }); return { skill: parseSkillMarkdown(request.body.content, request.body.directoryName) }; } catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) }); } });
app.get('/api/customization/connectors', async () => ({ items: connectors }));
app.get('/api/customization/plugins', async () => ({ items: plugins }));
app.post<{ Body: { message?: string; workspaceRoot?: string; allowWrite?: boolean } }>('/api/tasks', async (request, reply) => { const message = request.body?.message?.trim(); if (!message) return reply.code(400).send({ error: 'message is required' }); const events: unknown[] = []; const startedAt = Date.now(); for await (const event of createRuntime().run(message, [], { workspaceRoot: workspaceRoot(request.body.workspaceRoot), permissions: { allowWrite: request.body.allowWrite === true, allowCommands: ['git', 'node', 'npm', 'pnpm', 'yarn', 'python', 'python3'] } })) events.push(event); return { events, durationMs: Date.now() - startedAt }; });
app.get('/ws', { websocket: true }, connection => { const socket = connection.socket; socket.on('message', async (raw: Buffer) => { try { const request = JSON.parse(raw.toString()) as { message?: string; workspaceRoot?: string; allowWrite?: boolean }; if (!request.message) { socket.send(JSON.stringify({ type: 'error', error: 'message is required' })); return; } for await (const event of createRuntime().run(request.message, [], { workspaceRoot: request.workspaceRoot ?? process.cwd(), permissions: { allowWrite: request.allowWrite === true, allowCommands: ['git', 'node', 'npm', 'pnpm', 'yarn', 'python', 'python3'] } })) socket.send(JSON.stringify(event)); } catch (error) { socket.send(JSON.stringify({ type: 'error', error: error instanceof Error ? error.message : String(error) })); } }); });
const port = Number(process.env['ASTRA_API_PORT'] ?? 8787); await app.listen({ host: '0.0.0.0', port }); console.log(`Astra API listening on http://localhost:${port}`);
