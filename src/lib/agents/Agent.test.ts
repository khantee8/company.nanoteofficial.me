import { describe, it, expect, beforeEach } from 'vitest';
import { Agent } from './Agent';

describe('Agent', () => {
  let a: Agent;
  beforeEach(() => {
    a = new Agent('ceo', 'NaNote', '#fff', 5, 5);
  });

  it('starts at home position in idle state', () => {
    expect(a.gx).toBe(5);
    expect(a.gy).toBe(5);
    expect(a.state).toBe('idle');
  });

  it('moveTo switches to walking', () => {
    a.moveTo(10, 5);
    expect(a.state).toBe('walking');
    expect(a.tx).toBe(10);
    expect(a.ty).toBe(5);
  });

  it('update moves agent toward target', () => {
    a.moveTo(10, 5);
    const startX = a.gx;
    a.update(0.5);
    expect(a.gx).toBeGreaterThan(startX);
    expect(a.gx).toBeLessThanOrEqual(10);
  });

  it('arrives at target and transitions to arriveState', () => {
    a.moveTo(5.05, 5, 'working');
    a.update(0.5);
    expect(a.gx).toBe(5.05);
    expect(a.state).toBe('working');
  });

  it('goHome resets target to home', () => {
    a.moveTo(10, 5);
    a.update(1);
    a.goHome();
    expect(a.tx).toBe(5);
    expect(a.ty).toBe(5);
  });

  it('say sets bubble with positive life', () => {
    a.say('hi');
    expect(a.bubble).toBe('hi');
    expect(a.bubbleLife).toBeGreaterThan(0);
  });

  it('bubble fades after update', () => {
    a.say('hi', 1000);
    a.update(2);
    expect(a.bubble).toBeNull();
  });

  it('faces left when moving left', () => {
    a = new Agent('ceo', 'NaNote', '#fff', 10, 5);
    a.moveTo(2, 5);
    a.update(0.1);
    expect(a.facingLeft).toBe(true);
  });
});
