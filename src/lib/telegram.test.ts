import { describe, it, expect } from 'vitest';
import { parseCommand, isAllowedChat } from './telegram';

describe('telegram parseCommand', () => {
  it('parses /status', () => {
    expect(parseCommand('/status')).toEqual({ cmd: 'status', args: [] });
  });
  it('parses /run with a dept', () => {
    expect(parseCommand('/run finance')).toEqual({ cmd: 'run', args: ['finance'] });
  });
  it('parses /ask with dept + question', () => {
    expect(parseCommand('/ask rnd what is new in agents?')).toEqual({ cmd: 'ask', args: ['rnd', 'what is new in agents?'] });
  });
  it('strips @botname suffix', () => {
    expect(parseCommand('/status@NaNoteBot')).toEqual({ cmd: 'status', args: [] });
  });
  it('returns null for non-commands', () => {
    expect(parseCommand('hello')).toBeNull();
  });
});

describe('isAllowedChat', () => {
  it('matches the configured chat id', () => {
    expect(isAllowedChat(12345, '12345')).toBe(true);
    expect(isAllowedChat(999, '12345')).toBe(false);
    expect(isAllowedChat(12345, undefined)).toBe(false);
  });
});
