// src/lib/iso/engine.ts
export const ROOM_W = 20;
export const ROOM_D = 14;
export const WALL_H = 68;

export interface Point { x: number; y: number; }

export interface IsoEngine {
  /** Tile width in pixels (full width of a diamond). */
  TW: number;
  /** Tile height in pixels (full height of a diamond). */
  TH: number;
  /** Origin X — screen pixel where grid (0,0) lives. */
  OX: number;
  /** Origin Y — screen pixel where grid (0,0) lives. */
  OY: number;

  /** Grid (gx, gy, pz_height) → screen point. */
  g(gx: number, gy: number, pz?: number): Point;

  /** Set camera offset (added to every g() result). */
  setCam(camX: number, camY: number): void;
  /** Current camera offset. */
  getCam(): Point;

  /** Recompute tile sizes + origin based on canvas + wall height. */
  setLayout(params: { canvasWidth: number; canvasHeight: number; wallH: number }): void;

  /** Painter helpers (Canvas2D required). */
  attachContext(ctx: CanvasRenderingContext2D): void;
  poly(pts: Point[], fill?: string | null, stroke?: string | null): void;
  tile(gx: number, gy: number, fill: string): void;
  box(gx: number, gy: number, pz: number, gw: number, gd: number, ph: number, topC: string | null, rightC: string | null, leftC: string | null): void;
}

export function createEngine(): IsoEngine {
  let TW = 56, TH = 28;
  let OX = 0, OY = 0;
  let camX = 0, camY = 0;
  let ctx: CanvasRenderingContext2D | null = null;

  const engine: IsoEngine = {
    get TW() { return TW; },
    get TH() { return TH; },
    get OX() { return OX; },
    get OY() { return OY; },

    g(gx, gy, pz = 0) {
      return {
        x: OX + (gx - gy) * (TW / 2) + camX,
        y: OY + (gx + gy) * (TH / 2) - pz + camY,
      };
    },

    setCam(x, y) { camX = x; camY = y; },
    getCam() { return { x: camX, y: camY }; },

    setLayout({ canvasWidth, canvasHeight, wallH }) {
      const scW = (canvasWidth * 2) / (ROOM_W + ROOM_D);
      const scH = ((canvasHeight - wallH - 24) * 2) / (ROOM_W + ROOM_D);
      TH = Math.min(30, Math.max(14, Math.floor(Math.min(scW / 2, scH))));
      TW = TH * 2;
      OX = canvasWidth / 2 - ((ROOM_W - ROOM_D) * TW) / 4;
      OY = wallH + 18;
    },

    attachContext(c) { ctx = c; },

    poly(pts, fill, stroke) {
      if (!ctx || pts.length === 0) return;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      if (fill)   { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 0.5; ctx.stroke(); }
    },

    tile(gx, gy, fill) {
      engine.poly([engine.g(gx, gy), engine.g(gx + 1, gy), engine.g(gx + 1, gy + 1), engine.g(gx, gy + 1)], fill, 'rgba(0,0,0,0.2)');
    },

    box(gx, gy, pz, gw, gd, ph, topC, rightC, leftC) {
      const A = engine.g(gx, gy, pz + ph);
      const B = engine.g(gx + gw, gy, pz + ph);
      const C = engine.g(gx + gw, gy + gd, pz + ph);
      const D = engine.g(gx, gy + gd, pz + ph);
      const B0 = engine.g(gx + gw, gy, pz);
      const C0 = engine.g(gx + gw, gy + gd, pz);
      const D0 = engine.g(gx, gy + gd, pz);
      if (rightC) engine.poly([B, C, C0, B0], rightC, 'rgba(0,0,0,0.25)');
      if (leftC)  engine.poly([D, C, C0, D0], leftC, 'rgba(0,0,0,0.2)');
      if (topC)   engine.poly([A, B, C, D], topC, 'rgba(0,0,0,0.12)');
    },
  };
  return engine;
}

/** Brighten a #rrggbb hex by `a` per channel and return rgb() string. */
export function lighten(hex: string, a: number): string {
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + a);
  const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + a);
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + a);
  return `rgb(${r},${g},${b})`;
}

/** Rounded rect path helper. */
export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
