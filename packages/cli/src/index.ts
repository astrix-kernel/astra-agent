#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Command } from 'commander';
import type { Message } from '@astra/core';
import { applyPersonality, DEFAULT_PERSONALITY, type CompanionPersonality } from '@astra/core';
import { extractMemoryCandidate, parseCompanionMemory, remember, relevantMemories } from '@astra/core/companion';
import { TerminalCompanion, detectTerminalCapabilities } from './companion.js';

const program = new Command();
const workspaceRoot = process.cwd();

const API_URL = process.env['ASTRA_API_URL'] ?? 'http://localhost:8787';

const capabilities = detectTerminalCapabilities();
const companion = new TerminalCompanion({ capabilities });
const COMPANION_MEMORY_PATH = path.join(workspaceRoot, '.astra', 'companion-memory.json');

function loadCompanionMemory() {
  try {
    return parseCompanionMemory(readFileSync(COMPANION_MEMORY_PATH, 'utf8'));
  } catch {
    return parseCompanionMemory(null);
  }
}

function saveCompanionMemory(memory: ReturnType<typeof parseCompanionMemory>): void {
  try {
    mkdirSync(path.dirname(COMPANION_MEMORY_PATH), { recursive: true });
    writeFileSync(COMPANION_MEMORY_PATH, JSON.stringify(memory, null, 2));
  } catch {
    /* memory is a convenience, never block the CLI on it */
  }
}
const personality: CompanionPersonality = {
  ...DEFAULT_PERSONALITY,
  enabled: process.env['ASTRA_PERSONALITY'] === '1',
}

interface APIEvent {
  type: 'state' | 'text' | 'tool_start' | 'tool_result' | 'error' | 'done' | 'checkpoint' | 'diff';
  task: { id: string; state: string; iterations: number; toolCalls: number; startedAt: number; failedToolCalls: number; lastError?: string };
  text?: string;
  tool?: string;
  result?: unknown;
  error?: string;
  diff?: string;
  checkpointId?: string;
}

async function runTaskAPI(text: string): Promise<void> {
  companion.setState('listening');
  process.stderr.write(`${companion.render()}\n${companion.statusLine()}\n`);
  
  const response = await fetch(`${API_URL}/api/tasks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message: text,
      workspaceRoot,
      allowWrite: process.env['ASTRA_ALLOW_WRITE'] === '1',
      allowDelete: process.env['ASTRA_ALLOW_DELETE'] === '1',
      modelId: process.env['ASTRA_MODEL'] ?? 'gpt-4o-mini',
      providerId: process.env['ASTRA_PROVIDER_ID'],
      mode: 'code',
      executionMode: process.env['ASTRA_EXECUTION_MODE'] ?? 'suggest',
    }),
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
    throw new Error(errorData.error ?? `API error: ${response.status}`);
  }
  
  const payload = await response.json() as { events: APIEvent[]; durationMs: number; taskId: string };
  
  for (const event of payload.events) {
    companion.handleEvent(event);
    if (event.type === 'text') {
      const body = event.text ?? '';
      process.stdout.write(personality.enabled ? applyPersonality(body, 'speaking', personality) : body);
    }
    if (event.type === 'tool_start') process.stderr.write(`\n${companion.statusLine()}\n[tool] ${event.tool}\n`);
    if (event.type === 'tool_result') process.stderr.write(`[result] ${JSON.stringify(event.result)}\n`);
    if (event.type === 'error') process.stderr.write(`\n${companion.statusLine()}\n[error] ${event.error}\n`);
    if (event.type === 'done') {
      process.stderr.write(`\n${companion.statusLine()}\n`);
      if (personality.enabled) process.stdout.write(`${personality.successLines[0] ?? 'Done!'}\n`);
      process.stdout.write('\n');
    }
  }
  companion.stop();
}

async function runTask(text: string): Promise<void> {
  try {
    await runTaskAPI(text);
  } catch (error) {
    // Fallback to local runtime if API is not available
    console.error(`API unavailable, falling back to local mode: ${error instanceof Error ? error.message : String(error)}`);
    
    const { createProvider, createDefaultToolRegistry, AgentRuntime } = await import('@astra/core');
    const apiKey = process.env['ASTRA_API_KEY'];
    const baseUrl = process.env['ASTRA_BASE_URL'];
    const modelId = process.env['ASTRA_MODEL'] ?? 'gpt-4o-mini';
    const provider = createProvider({ type: apiKey ? 'openai' : 'mock', ...(apiKey ? { apiKey } : {}), ...(baseUrl ? { baseUrl } : {}), modelId });
    const agent = new AgentRuntime(provider, createDefaultToolRegistry());
    
    const history: Message[] = [];
    companion.setState('listening');
    process.stderr.write(`${companion.render()}\n${companion.statusLine()}\n`);
    for await (const event of agent.run(text, history, { workspaceRoot, permissions: { allowWrite: process.env['ASTRA_ALLOW_WRITE'] === '1', allowDelete: process.env['ASTRA_ALLOW_DELETE'] === '1', allowCommands: ['git', 'node', 'npm', 'pnpm', 'yarn', 'python', 'python3'] }, executionMode: (process.env['ASTRA_EXECUTION_MODE'] ?? 'suggest') as any })) {
      companion.handleEvent(event);
      if (event.type === 'text') {
        const body = event.text ?? '';
        process.stdout.write(personality.enabled ? applyPersonality(body, 'speaking', personality) : body);
      }
      if (event.type === 'tool_start') process.stderr.write(`\n${companion.statusLine()}\n[tool] ${event.tool}\n`);
      if (event.type === 'tool_result') process.stderr.write(`[result] ${JSON.stringify(event.result)}\n`);
      if (event.type === 'error') process.stderr.write(`\n${companion.statusLine()}\n[error] ${event.error}\n`);
      if (event.type === 'done') {
        process.stderr.write(`\n${companion.statusLine()}\n`);
        if (personality.enabled) process.stdout.write(`${personality.successLines[0] ?? 'Done!'}\n`);
        process.stdout.write('\n');
      }
    }
    companion.stop();
  }
}

program.name('astra').description('Astra Agent AI development assistant').version('0.1.0');
program.argument('[task]', 'Task to execute');
program
  .command('status')
  .description('Show runtime configuration')
  .action(() => {
    console.log(
      JSON.stringify(
        {
          workspace: workspaceRoot,
          provider: process.env['ASTRA_API_KEY'] ? 'openai-compatible' : 'mock',
          model: process.env['ASTRA_MODEL'] ?? 'gpt-4o-mini',
          writeAccess: process.env['ASTRA_ALLOW_WRITE'] === '1',
          companion: { terminal: capabilities.protocol, personality: personality.enabled },
        },
        null,
        2,
      ),
    );
  });
program
  .command('models')
  .description('List configured model')
  .action(() => {
    console.log(process.env['ASTRA_API_KEY'] ? `${process.env['ASTRA_MODEL'] ?? 'gpt-4o-mini'} (OpenAI-compatible)` : 'mock (configure ASTRA_API_KEY for a real provider)');
  });
program
  .command('doctor')
  .description('Check local setup')
  .action(() => {
    console.log(`workspace: ${path.resolve(workspaceRoot)}`);
    console.log(`node: ${process.version}`);
    console.log(`provider: ${process.env['ASTRA_API_KEY'] ? 'configured' : 'mock mode'}`);
    console.log(`terminal graphics: ${capabilities.protocol}`);
    console.log(`companion personality: ${personality.enabled ? 'enabled' : 'disabled'}`);
  });
program
  .command('companion')
  .description('Preview the Aemeath terminal companion')
  .option('-s, --state <state>', 'companion state to preview')
  .action((options: { state?: string }) => {
    const state = (options.state ?? 'idle') as Parameters<TerminalCompanion['setState']>[0];
    companion.setState(state);
    process.stdout.write(`${companion.render()}\n${companion.statusLine()}\n`);
    companion.stop();
  });
program
  .command('talk')
  .description('Chat with Aemeath, the Astra companion')
  .argument('[message]', 'what to ask Aemeath')
  .action(async (message?: string) => {
    const text = message?.trim() ?? (await (async () => {
      const rl = createInterface({ input, output });
      try {
        return (await rl.question('ask Aemeath> ')).trim();
      } finally {
        rl.close();
      }
    })());
    if (!text) {
      companion.setState('idle');
      process.stdout.write(`${companion.render()}\n`);
      companion.stop();
      return;
    }
    companion.setState('thinking');
    process.stderr.write(`${companion.statusLine()}\n`);
    
    const memory = loadCompanionMemory();
    const candidate = extractMemoryCandidate(text);
    if (candidate) saveCompanionMemory(remember(memory, candidate.note, candidate.source));
    
    const response = await fetch(`${API_URL}/api/companion/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: text,
        history: [],
        modelId: process.env['ASTRA_MODEL'] ?? 'gpt-4o-mini',
        providerId: process.env['ASTRA_PROVIDER_ID'],
        workspaceId: 'default',
        mode: 'casual',
        memories: relevantMemories(memory, text),
        sessionSummary: '',
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
      console.error(`API error: ${errorData.error ?? response.status}`);
      companion.setState('error');
      companion.stop();
      return;
    }
    
    const payload = await response.json() as { events: { type: string; text?: string }[]; durationMs: number };
    const reply = (payload.events ?? []).filter(event => event.type === 'text').map(event => event.text ?? '').join('').trim();
    const answer = reply || 'Hmm, aku belum bisa jawab itu. Boleh ulangi?';
    process.stdout.write(companion.renderSpeech(answer));
    companion.setState('success');
    companion.stop();
  });
program
  .command('init')
  .description('Create local Astra instructions')
  .action(async () => {
    const { promises: fs } = await import('node:fs');
    const target = path.join(workspaceRoot, 'ASTRA.md');
    try {
      await fs.access(target);
      console.log('ASTRA.md already exists');
    } catch {
      await fs.writeFile(target, '# Astra Project Instructions\n\nAdd project conventions and verification commands here.\n');
      console.log(`Created ${target}`);
    }
  });
program
  .command('chat')
  .description('Start interactive chat')
  .action(async () => {
    const rl = createInterface({ input, output });
    process.stderr.write(`${companion.render()}\n${companion.statusLine()}\n`);
    try {
      let active = true;
      while (active) {
        const text = await rl.question('you> ');
        if (text.trim() === '/exit') {
          active = false;
          break;
        }
        if (!text.trim()) continue;
        companion.setState('listening');
        
        const response = await fetch(`${API_URL}/api/tasks`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            message: text,
            workspaceRoot,
            allowWrite: process.env['ASTRA_ALLOW_WRITE'] === '1',
            allowDelete: process.env['ASTRA_ALLOW_DELETE'] === '1',
            modelId: process.env['ASTRA_MODEL'] ?? 'gpt-4o-mini',
            providerId: process.env['ASTRA_PROVIDER_ID'],
            mode: 'chat',
            executionMode: process.env['ASTRA_EXECUTION_MODE'] ?? 'suggest',
          }),
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
          console.error(`API error: ${errorData.error ?? response.status}`);
          continue;
        }
        
        const payload = await response.json() as { events: APIEvent[]; durationMs: number; taskId: string };
        
        for (const event of payload.events) {
          companion.handleEvent(event);
          if (event.type === 'text') {
            const body = event.text ?? '';
            process.stdout.write(personality.enabled ? applyPersonality(body, 'speaking', personality) : body);
          }
          if (event.type === 'done') {
            process.stderr.write(`\n${companion.statusLine()}\n`);
            if (personality.enabled) process.stdout.write(`${personality.successLines[0] ?? 'Done!'}\n`);
            process.stdout.write('\n');
          }
        }
      }
    } finally {
      companion.stop();
      rl.close();
    }
  });
program.action(async (task?: string) => {
  if (task) await runTask(task);
  else await program.commands.find(command => command.name() === 'chat')?.parseAsync(['node', 'astra', 'chat']);
});
await program.parseAsync();
