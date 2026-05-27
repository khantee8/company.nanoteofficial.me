// src/lib/iso/room.ts
import { ROOM_W, ROOM_D, WALL_H, lighten, type IsoEngine } from './engine';

function zoneColor(x: number, y: number): string {
  if (x < 4 && y < 4) return '#131328';
  if (x < 8 && x >= 4 && y < 4) return '#180e22';
  if (x < 13 && x >= 8 && y < 4) return '#0a1522';
  if (x < 17 && x >= 13 && y < 4) return '#180e08';
  if (x >= 17 && y < 4) return '#0e0c24';
  if (x >= 6 && x < 14 && y >= 5 && y < 9) return '#111020';
  if (x >= 15 && y >= 6 && y < 12) return '#14101a';
  return '#0f0f1e';
}

function rug(engine: IsoEngine, gx: number, gy: number, gw: number, gd: number, color: string) {
  engine.poly(
    [engine.g(gx, gy), engine.g(gx + gw, gy), engine.g(gx + gw, gy + gd), engine.g(gx, gy + gd)],
    color, null,
  );
}

export function drawFloorAndWalls(engine: IsoEngine, ctx: CanvasRenderingContext2D) {
  // Floor (back → front for painter's algorithm)
  for (let y = ROOM_D - 1; y >= 0; y--) {
    for (let x = 0; x < ROOM_W; x++) {
      const base = zoneColor(x, y);
      engine.tile(x, y, (x + y) % 2 === 0 ? base : lighten(base, 5));
    }
  }
  // Zone rugs
  rug(engine, 0.2, 0.2, 3.5, 3.5, 'rgba(100,80,200,0.07)');
  rug(engine, 4.2, 0.2, 3.5, 3.5, 'rgba(220,80,140,0.06)');
  rug(engine, 8.2, 0.2, 4.5, 3.5, 'rgba(0,180,240,0.06)');
  rug(engine, 13.2, 0.2, 3.5, 3.5, 'rgba(240,130,40,0.06)');
  rug(engine, 17.2, 0.2, 2.5, 3.5, 'rgba(120,90,240,0.06)');
  rug(engine, 6.5, 5.4, 7, 3.2, 'rgba(80,60,120,0.09)');
  rug(engine, 15.3, 6.8, 4.2, 4.5, 'rgba(100,60,40,0.07)');

  // Back wall
  for (let x = 0; x < ROOM_W; x++) {
    let wc = '#0e0e22';
    if (x < 4) wc = '#0e0e2c';
    else if (x < 8) wc = '#140a20';
    else if (x < 13) wc = '#0a1222';
    else if (x < 17) wc = '#14100a';
    else wc = '#0e0c26';
    const t0 = engine.g(x, 0, WALL_H), t1 = engine.g(x + 1, 0, WALL_H);
    const b0 = engine.g(x, 0, 0), b1 = engine.g(x + 1, 0, 0);
    engine.poly([t0, t1, b1, b0], wc, 'rgba(0,0,0,0.3)');
    // Skirting board
    engine.poly([engine.g(x, 0, 5), engine.g(x + 1, 0, 5), b1, b0], '#1e1e3e', null);
    // Wall trim
    engine.poly([t0, t1, { x: t1.x, y: t1.y + 1.5 }, { x: t0.x, y: t0.y + 1.5 }], '#3a3a6a', null);
  }
  // Left wall
  for (let y = 0; y < ROOM_D; y++) {
    const t0 = engine.g(0, y, WALL_H), t1 = engine.g(0, y + 1, WALL_H);
    const b0 = engine.g(0, y, 0), b1 = engine.g(0, y + 1, 0);
    engine.poly([t0, t1, b1, b0], '#0c0c1e', 'rgba(0,0,0,0.4)');
    engine.poly([engine.g(0, y, 5), engine.g(0, y + 1, 5), b1, b0], '#1e1e3e', null);
  }
}

export function drawWindows(engine: IsoEngine, ctx: CanvasRenderingContext2D) {
  const wins = [{ gx: 0.8 }, { gx: 5.5 }, { gx: 9.5 }, { gx: 14.0 }];
  wins.forEach(w => {
    const gx = w.gx, pw = 1.6, h0 = 22, h1 = 58;
    const tl = engine.g(gx, 0, h1), tr = engine.g(gx + pw, 0, h1);
    const ml = engine.g(gx, 0, h0), mr = engine.g(gx + pw, 0, h0);
    engine.poly([tl, tr, mr, ml], '#1e3a6e', '#2a4a8e');
    // Frame cross
    const cmx = (tl.x + tr.x) / 2;
    ctx.strokeStyle = '#2a4a8e'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cmx, tl.y); ctx.lineTo(cmx, ml.y); ctx.stroke();
    // Horizontal frame
    const hy1 = (tl.y + ml.y) / 2, hy2 = (tr.y + mr.y) / 2;
    ctx.beginPath(); ctx.moveTo(tl.x, hy1); ctx.lineTo(tr.x, hy2); ctx.stroke();
    // Glow
    const cx = (tl.x + mr.x) / 2, cy = (tl.y + mr.y) / 2 + 10;
    const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, 40);
    grd.addColorStop(0, 'rgba(100,160,255,0.07)');
    grd.addColorStop(1, 'transparent');
    ctx.fillStyle = grd;
    ctx.fillRect(cx - 50, cy - 50, 100, 100);
  });
  // Left-wall window
  const lt = engine.g(0, 2.5, 55), lb = engine.g(0, 4.0, 55);
  const lbt = engine.g(0, 2.5, 20), lbb = engine.g(0, 4.0, 20);
  engine.poly([lt, lb, lbb, lbt], '#1e3a6e', '#2a4a8e');
}

export function drawZoneLabels(engine: IsoEngine, ctx: CanvasRenderingContext2D) {
  const labels = [
    { t: 'CEO OFFICE', gx: 1.8, gy: 1.8, c: 'rgba(180,160,255,0.4)' },
    { t: 'MARKETING',  gx: 5.5, gy: 1.8, c: 'rgba(255,100,150,0.35)' },
    { t: 'R&D LAB',    gx: 10,  gy: 1.8, c: 'rgba(0,200,255,0.35)' },
    { t: 'OPERATIONS', gx: 14.5,gy: 1.8, c: 'rgba(255,160,60,0.35)' },
    { t: 'FINANCE',    gx: 18.2,gy: 1.8, c: 'rgba(140,110,255,0.35)' },
    { t: 'MEETING',    gx: 9.8, gy: 7.0, c: 'rgba(200,200,255,0.2)' },
    { t: 'BREAK ROOM', gx: 17.5,gy: 9.0, c: 'rgba(200,150,100,0.2)' },
  ];
  ctx.font = 'bold 7px Courier New';
  ctx.textAlign = 'center';
  labels.forEach(l => {
    const p = engine.g(l.gx, l.gy, 1);
    ctx.fillStyle = l.c;
    ctx.fillText(l.t, p.x, p.y);
  });
}
