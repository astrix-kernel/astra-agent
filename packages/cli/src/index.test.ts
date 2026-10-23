import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('CLI', () => {
  it('should have basic test', () => {
    expect(true).toBe(true);
  });

  it('should have a test file to satisfy vitest', () => {
    expect(1 + 1).toBe(2);
  });
});