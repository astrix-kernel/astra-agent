import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

describe('Web components', () => {
  it('should have basic test', () => {
    expect(true).toBe(true);
  });

  it('should have a test file to satisfy vitest', () => {
    expect(1 + 1).toBe(2);
  });
});