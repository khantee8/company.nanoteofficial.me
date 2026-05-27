// src/lib/iso/camera.ts
import type { IsoEngine, Point } from './engine';

export interface Camera {
  /** Smoothly lerp current toward target — call once per frame. */
  update(): void;
  /** Snap target to whatever brings (gx, gy) under (centerScreenX, centerScreenY). */
  panTo(g: { gx: number; gy: number }, centerScreenX: number, centerScreenY: number): void;
  reset(): void;
  getCurrent(): Point;
  getTarget(): Point;
  /** Wires updated current values into the engine. Call after update(). */
  apply(): void;
}

const LERP = 0.07;

export function createCamera(engine: IsoEngine): Camera {
  let curX = 0, curY = 0;
  let tgtX = 0, tgtY = 0;

  return {
    update() {
      curX += (tgtX - curX) * LERP;
      curY += (tgtY - curY) * LERP;
    },
    panTo(g, centerScreenX, centerScreenY) {
      const raw = engine.g(g.gx, g.gy);
      const cur = engine.getCam();
      tgtX = centerScreenX - (raw.x - cur.x);
      tgtY = centerScreenY - (raw.y - cur.y);
    },
    reset() { tgtX = 0; tgtY = 0; },
    getCurrent() { return { x: curX, y: curY }; },
    getTarget()  { return { x: tgtX, y: tgtY }; },
    apply() { engine.setCam(curX, curY); },
  };
}
