import { describe, expect, it } from 'vitest';
import { createDefaultToolRegistry, createProvider, retrieveProjectContext } from './index.js';

describe('core runtime boundaries', () => {
  it('creates a mock provider without credentials', async () => {
    const provider = createProvider({ type: 'mock', modelId: 'test' });
    expect(await provider.healthCheck()).toBe(true);
    const response = await provider.completeChat({ messages: [{ role: 'user', content: 'hello' }], stream: false });
    expect(response.content).toContain('Astra is running in local demo mode');
  });

  it('registers coding and verification tools', () => {
    const registry = createDefaultToolRegistry();
    expect(registry.get('fs.read')).toBeDefined();
    expect(registry.get('code.search')).toBeDefined();
    expect(registry.get('verify.run')).toBeDefined();
  });

  it('retrieves relevant project context and instructions', async () => {
    const hits = await retrieveProjectContext(process.cwd(), 'agent provider tools', 4, 8000);
    expect(hits.some(hit => hit.path === 'package.json')).toBe(true);
    expect(hits.every(hit => hit.content.length <= 12000)).toBe(true);
  });

  it('rejects writes unless explicitly permitted', async () => {
    const registry = createDefaultToolRegistry();
    const result = await registry.execute('fs.write', { path: 'tmp.txt', content: 'blocked' }, { workspaceRoot: process.cwd(), permissions: { allowWrite: false, allowCommands: [] } });
    expect(result.success).toBe(false);
    expect(result.error).toContain('permission');
  });
});
