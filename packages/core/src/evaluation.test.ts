import { describe, expect, it } from 'vitest';
import { AgentRuntime, createDefaultToolRegistry, createProvider } from './index.js';

describe('coding agent evaluation fixtures', () => {
  it('honestly reports mock-provider limitations', async () => {
    const runtime = new AgentRuntime(createProvider({ type: 'mock', modelId: 'evaluation' }), createDefaultToolRegistry());
    const events: { type: string; text?: string }[] = [];
    for await (const event of runtime.run('inspect this repository structure', [], { workspaceRoot: process.cwd() })) events.push(event);
    const answer = events.filter(event => event.type === 'text').map(event => event.text ?? '').join('');
    expect(answer).toContain('workspace context');
    expect(events.some(event => event.type === 'done')).toBe(true);
  });
});
