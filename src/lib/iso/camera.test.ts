import { describe, it, expect, beforeEach } from 'vitest';
import { createCamera, type Camera } from './camera';
import { createEngine, type IsoEngine } from './engine';

describe('Camera', () => {
  let engine: IsoEngine;
  let cam: Camera;
  beforeEach(() => {
    engine = createEngine();
    engine.setLayout({ canvasWidth: 1000, canvasHeight: 600, wallH: 68 });
    cam = createCamera(engine);
  });

  it('starts at origin', () => {
    expect(cam.getTarget()).toEqual({ x: 0, y: 0 });
  });

  it('panTo computes target so dept center sits at canvas midpoint', () => {
    cam.panTo({ gx: 10, gy: 2 }, 500, (600 - 106) / 2);
    const tgt = cam.getTarget();
    const rawX = engine.OX + (10 - 2) * (engine.TW / 2);
    const rawY = engine.OY + (10 + 2) * (engine.TH / 2);
    expect(tgt.x).toBe(500 - rawX);
    expect(tgt.y).toBe((600 - 106) / 2 - rawY);
  });

  it('reset returns target to origin', () => {
    cam.panTo({ gx: 5, gy: 5 }, 800, 500);
    cam.reset();
    expect(cam.getTarget()).toEqual({ x: 0, y: 0 });
  });

  it('update lerps current toward target', () => {
    cam.panTo({ gx: 0, gy: 0 }, 0, 0);
    const start = cam.getCurrent();
    cam.update();
    const after = cam.getCurrent();
    expect(after.x).not.toBe(start.x);
  });
});
