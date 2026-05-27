import { describe, it, expect, beforeEach } from 'vitest';
import { createEngine, type IsoEngine } from './engine';

describe('IsoEngine', () => {
  let engine: IsoEngine;
  beforeEach(() => {
    engine = createEngine();
    engine.setLayout({ canvasWidth: 1000, canvasHeight: 600, wallH: 68 });
  });

  it('places grid origin (0,0,0) at expected screen coords', () => {
    const p = engine.g(0, 0, 0);
    expect(p.x).toBe(engine.OX);
    expect(p.y).toBe(engine.OY);
  });

  it('moves +x to the screen right and down', () => {
    const a = engine.g(0, 0, 0);
    const b = engine.g(1, 0, 0);
    expect(b.x).toBeGreaterThan(a.x);
    expect(b.y).toBeGreaterThan(a.y);
  });

  it('moves +y to the screen left and down', () => {
    const a = engine.g(0, 0, 0);
    const b = engine.g(0, 1, 0);
    expect(b.x).toBeLessThan(a.x);
    expect(b.y).toBeGreaterThan(a.y);
  });

  it('subtracts pz (height) from y so things lift off the floor', () => {
    const floor = engine.g(0, 0, 0);
    const high  = engine.g(0, 0, 20);
    expect(high.y).toBe(floor.y - 20);
  });

  it('applies camera offset', () => {
    engine.setCam(50, 30);
    const p = engine.g(0, 0, 0);
    expect(p.x).toBe(engine.OX + 50);
    expect(p.y).toBe(engine.OY + 30);
  });
});
