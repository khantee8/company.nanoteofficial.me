import { describe, it, expect } from 'vitest';
import { parseCommand, isAllowedChat, isFocusLive, focusKey, FOCUS_TTL_MS, type FocusSession } from './telegram';

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

describe('parseCommand v1.4 commands', () => {
  it('parses /agents and /report', () => {
    expect(parseCommand('/agents')).toEqual({ cmd: 'agents', args: [] });
    expect(parseCommand('/report fin')).toEqual({ cmd: 'report', args: ['fin'] });
  });
  it('still parses /ask dept question', () => {
    expect(parseCommand('/ask fin compare S&P500 funds')).toEqual({ cmd: 'ask', args: ['fin', 'compare S&P500 funds'] });
  });
  it('returns null for plain text (a focus follow-up, not a command)', () => {
    expect(parseCommand('what about RMF?')).toBeNull();
  });
});

describe('isFocusLive', () => {
  const base: FocusSession = { dept: 'fin', turns: [], until: 0 };
  it('true when until is in the future', () => {
    expect(isFocusLive({ ...base, until: Date.now() + 1000 })).toBe(true);
  });
  it('false when expired or null', () => {
    expect(isFocusLive({ ...base, until: Date.now() - 1 })).toBe(false);
    expect(isFocusLive(null)).toBe(false);
  });
  it('FOCUS_TTL_MS is 15 minutes', () => {
    expect(FOCUS_TTL_MS).toBe(15 * 60 * 1000);
  });
  it('focusKey builds a namespaced key', () => {
    expect(focusKey(42)).toBe('tg:focus:42');
  });
});
