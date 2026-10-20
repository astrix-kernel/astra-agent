#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import path from 'node:path';
import { Command } from 'commander';
import type { Message } from '@astra/core';
import { createProvider, createDefaultToolRegistry, AgentRuntime } from '@astra/core';

const program = new Command();
const workspaceRoot = process.cwd();

function runtime(): AgentRuntime {
  const apiKey = process.env['ASTRA_API_KEY'];
  const baseUrl = process.env['ASTRA_BASE_URL'];
  const modelId = process.env['ASTRA_MODEL'] ?? 'gpt-4o-mini';
  const provider = createProvider({ type: apiKey ? 'openai' : 'mock', ...(apiKey ? { apiKey } : {}), ...(baseUrl ? { baseUrl } : {}), modelId });
  return new AgentRuntime(provider, createDefaultToolRegistry());
}

async function runTask(text: string): Promise<void> {
  const agent = runtime();
  const history: Message[] = [];
  for await (const event of agent.run(text, history, { workspaceRoot, permissions: { allowWrite: process.env['ASTRA_ALLOW_WRITE'] === '1', allowCommands: ['git', 'node', 'npm', 'pnpm', 'yarn', 'python', 'python3'] } })) {
    if (event.type === 'text') process.stdout.write(event.text ?? '');
    if (event.type === 'tool_start') process.stderr.write(`\n[tool] ${event.tool}\n`);
    if (event.type === 'tool_result') process.stderr.write(`[result] ${JSON.stringify(event.result)}\n`);
    if (event.type === 'error') process.stderr.write(`\n[error] ${event.error}\n`);
    if (event.type === 'done') process.stdout.write('\n');
  }
}

program.name('astra').description('Astra Agent AI development assistant').version('0.1.0');
program.argument('[task]', 'Task to execute');
program.command('status').description('Show runtime configuration').action(() => { console.log(JSON.stringify({ workspace: workspaceRoot, provider: process.env['ASTRA_API_KEY'] ? 'openai-compatible' : 'mock', model: process.env['ASTRA_MODEL'] ?? 'gpt-4o-mini', writeAccess: process.env['ASTRA_ALLOW_WRITE'] === '1' }, null, 2)); });
program.command('models').description('List configured model').action(() => { console.log(process.env['ASTRA_API_KEY'] ? `${process.env['ASTRA_MODEL'] ?? 'gpt-4o-mini'} (OpenAI-compatible)` : 'mock (configure ASTRA_API_KEY for a real provider)'); });
program.command('doctor').description('Check local setup').action(() => { console.log(`workspace: ${path.resolve(workspaceRoot)}`); console.log(`node: ${process.version}`); console.log(`provider: ${process.env['ASTRA_API_KEY'] ? 'configured' : 'mock mode'}`); });
program.command('init').description('Create local Astra instructions').action(async () => { const { promises: fs } = await import('node:fs'); const target = path.join(workspaceRoot, 'ASTRA.md'); try { await fs.access(target); console.log('ASTRA.md already exists'); } catch { await fs.writeFile(target, '# Astra Project Instructions\n\nAdd project conventions and verification commands here.\n'); console.log(`Created ${target}`); } });
program.command('chat').description('Start interactive chat').action(async () => { const rl = createInterface({ input, output }); const history: Message[] = []; console.log('Astra interactive mode. Type /exit to quit.'); try { let active = true; while (active) { const text = await rl.question('you> '); if (text.trim() === '/exit') { active = false; break; } for await (const event of runtime().run(text, history, { workspaceRoot, permissions: { allowWrite: process.env['ASTRA_ALLOW_WRITE'] === '1', allowCommands: ['git', 'node', 'npm', 'pnpm', 'yarn', 'python', 'python3'] } })) { if (event.type === 'text') process.stdout.write(event.text ?? ''); if (event.type === 'done') process.stdout.write('\n'); } } } finally { rl.close(); } });
program.action(async (task?: string) => { if (task) await runTask(task); else await program.commands.find(command => command.name() === 'chat')?.parseAsync(['node', 'astra', 'chat']); });
await program.parseAsync();
