import { describe, it, expect } from 'vitest';
import { briefSummary } from './finance';

describe('finance briefSummary', () => {
  it('summarizes count + net direction from price lines', () => {
    const lines = ['BTC $1.00 ▲ +2.00%', 'ETH $1.00 ▼ -1.00%', 'SOL $1.00 ▲ +0.50%'];
    expect(briefSummary(lines)).toBe('3 assets tracked · net 2 up / 1 down');
  });
});
