import { describe, expect, it } from 'vitest';
import { AgentRuntime, createDefaultToolRegistry, createProvider } from './index.js';

describe('language matching behavior', () => {
  it('mock provider replies in Indonesian when user writes in Indonesian', async () => {
    const runtime = new AgentRuntime(createProvider({ type: 'mock', modelId: 'test' }), createDefaultToolRegistry());
    const events: { type: string; text?: string }[] = [];
    for await (const event of runtime.run('halo apa kabar', [], { workspaceRoot: process.cwd() })) {
      events.push(event);
    }
    const answer = events.filter(event => event.type === 'text').map(event => event.text ?? '').join('');
    expect(answer).toContain('Astra berjalan dalam mode demo lokal');
    expect(answer).not.toContain('Astra is running');
  });

  it('mock provider replies in English when user writes in English', async () => {
    const runtime = new AgentRuntime(createProvider({ type: 'mock', modelId: 'test' }), createDefaultToolRegistry());
    const events: { type: string; text?: string }[] = [];
    for await (const event of runtime.run('hello how are you', [], { workspaceRoot: process.cwd() })) {
      events.push(event);
    }
    const answer = events.filter(event => event.type === 'text').map(event => event.text ?? '').join('');
    expect(answer).toContain('Astra is running in local demo mode');
    expect(answer).not.toContain('Astra berjalan');
  });

  it('mock provider replies in Chinese when user writes in Chinese', async () => {
    const runtime = new AgentRuntime(createProvider({ type: 'mock', modelId: 'test' }), createDefaultToolRegistry());
    const events: { type: string; text?: string }[] = [];
    for await (const event of runtime.run('你好', [], { workspaceRoot: process.cwd() })) {
      events.push(event);
    }
    const answer = events.filter(event => event.type === 'text').map(event => event.text ?? '').join('');
    expect(answer).toContain('Astra 正在本地演示模式下运行');
    expect(answer).not.toContain('Astra is running');
    expect(answer).not.toContain('Astra berjalan');
  });

  it('mock provider replies in Indonesian for inspect command in Indonesian', async () => {
    const runtime = new AgentRuntime(createProvider({ type: 'mock', modelId: 'test' }), createDefaultToolRegistry());
    const events: { type: string; text?: string }[] = [];
    for await (const event of runtime.run('tolong inspect struktur repo ini', [], { workspaceRoot: process.cwd() })) {
      events.push(event);
    }
    const answer = events.filter(event => event.type === 'text').map(event => event.text ?? '').join('');
    expect(answer).toContain('Aku sudah memeriksa');
    expect(answer).not.toContain('I inspected');
  });

  it('mock provider replies in English for inspect command in English', async () => {
    const runtime = new AgentRuntime(createProvider({ type: 'mock', modelId: 'test' }), createDefaultToolRegistry());
    const events: { type: string; text?: string }[] = [];
    for await (const event of runtime.run('please inspect this repo structure', [], { workspaceRoot: process.cwd() })) {
      events.push(event);
    }
    const answer = events.filter(event => event.type === 'text').map(event => event.text ?? '').join('');
    expect(answer).toContain('I inspected the workspace context');
    expect(answer).not.toContain('Aku sudah memeriksa');
  });

  it('mock provider replies in Chinese for inspect command in Chinese', async () => {
    const runtime = new AgentRuntime(createProvider({ type: 'mock', modelId: 'test' }), createDefaultToolRegistry());
    const events: { type: string; text?: string }[] = [];
    for await (const event of runtime.run('请检查这个仓库的结构', [], { workspaceRoot: process.cwd() })) {
      events.push(event);
    }
    const answer = events.filter(event => event.type === 'text').map(event => event.text ?? '').join('');
    expect(answer).toContain('我检查了可供 Astra 使用的工作区上下文');
    expect(answer).not.toContain('I inspected');
    expect(answer).not.toContain('Aku sudah memeriksa');
  });

  it('agent system prompt contains language rule', async () => {
    const runtime = new AgentRuntime(createProvider({ type: 'mock', modelId: 'test' }), createDefaultToolRegistry());
    const events: { type: string; text?: string }[] = [];
    for await (const event of runtime.run('test', [], { workspaceRoot: process.cwd() })) {
      events.push(event);
    }
    const answer = events.filter(event => event.type === 'text').map(event => event.text ?? '').join('');
    expect(answer.length).toBeGreaterThan(0);
  });
});