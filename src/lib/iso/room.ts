// src/lib/iso/room.ts
import { ROOM_W, ROOM_D, WALL_H, lighten, type IsoEngine } from './engine';
import { MEZZANINE_ELEVATION } from '../data/departments';

// Front edge of the raised executive mezzanine (2nd floor). Everything with
// gy < MEZZ_FRONT_Y sits on the raised deck; the rest is ground floor.
const MEZZ_FRONT_Y = 4.2;
const E = MEZZANINE_ELEVATION;
// Staircase gap in the mezzanine railing (grid x range), centered.
const STAIR_X0 = 10.8;
const STAIR_X1 = 13.2;

function zoneColor(x: number, y: number): string {
  // Ground floor — department work bands (y 5–8.6) then common area (front).
  if (y >= 5 && y < 9) {
    if (x < 6) return '#0a160f';        // CyberX (green)
    if (x < 12) return '#180e16';       // M&SX (pink)
    if (x < 18) return '#0a1522';       // AIX (cyan)
    return '#180e08';                   // OperX (orange)
  }
  if (y >= 9) return '#0f0f1e';         // common / facilities
  return '#0d0d1c';                     // under-mezzanine floor (mostly hidden)
}

function rug(engine: IsoEngine, gx: number, gy: number, gw: number, gd: number, color: string, pz = 0) {
  engine.poly(
    [engine.g(gx, gy, pz), engine.g(gx + gw, gy, pz), engine.g(gx + gw, gy + gd, pz), engine.g(gx, gy + gd, pz)],
    color, null,
  );
}

export function drawFloorAndWalls(engine: IsoEngine) {
  // Floor (back → front for painter's algorithm)
  for (let y = ROOM_D - 1; y >= 0; y--) {
    for (let x = 0; x < ROOM_W; x++) {
      const base = zoneColor(x, y);
      engine.tile(x, y, (x + y) % 2 === 0 ? base : lighten(base, 5));
    }
  }
  // Ground-floor zone rugs
  rug(engine, 0.4, 5.2, 5.3, 3.2, 'rgba(57,255,157,0.06)');   // CyberX
  rug(engine, 6.5, 5.2, 5.2, 3.2, 'rgba(255,107,157,0.06)');  // M&SX
  rug(engine, 12.3, 5.2, 5.3, 3.2, 'rgba(0,207,255,0.06)');   // AIX
  rug(engine, 18.4, 5.2, 5.1, 3.2, 'rgba(255,154,60,0.06)');  // OperX

  // Back wall (behind the mezzanine)
  for (let x = 0; x < ROOM_W; x++) {
    const wc = x < 12 ? '#10102c' : '#0e0c26';
    const t0 = engine.g(x, 0, WALL_H), t1 = engine.g(x + 1, 0, WALL_H);
    const b0 = engine.g(x, 0, 0), b1 = engine.g(x + 1, 0, 0);
    engine.poly([t0, t1, b1, b0], wc, 'rgba(0,0,0,0.3)');
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

/** Raised executive mezzanine: deck, front riser, railing and a center stair. */
export function drawMezzanine(engine: IsoEngine, ctx: CanvasRenderingContext2D) {
  // Deck slab (top surface + front/right risers)
  engine.box(0, 0, 0, ROOM_W, MEZZ_FRONT_Y, E, '#16162e', '#0b0b1c', '#090914');
  // Deck surface sheen + zone split (CEOX left, FinX right)
  rug(engine, 0.3, 0.3, 11.0, MEZZ_FRONT_Y - 0.6, 'rgba(255,221,87,0.05)', E);   // CEOX
  rug(engine, 12.4, 0.3, 11.1, MEZZ_FRONT_Y - 0.6, 'rgba(127,140,255,0.06)', E); // FinX
  // Center divider line between the two executive offices
  const d0 = engine.g(11.7, 0.3, E), d1 = engine.g(11.7, MEZZ_FRONT_Y - 0.4, E);
  ctx.strokeStyle = 'rgba(120,120,180,0.18)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(d0.x, d0.y); ctx.lineTo(d1.x, d1.y); ctx.stroke();

  // Front railing along the deck edge — top rail in two segments around the stair gap
  ctx.strokeStyle = 'rgba(150,160,220,0.5)'; ctx.lineWidth = 1.5;
  const railL0 = engine.g(0, MEZZ_FRONT_Y, E + 12), railL1 = engine.g(STAIR_X0, MEZZ_FRONT_Y, E + 12);
  const railR0 = engine.g(STAIR_X1, MEZZ_FRONT_Y, E + 12), railR1 = engine.g(ROOM_W, MEZZ_FRONT_Y, E + 12);
  ctx.beginPath(); ctx.moveTo(railL0.x, railL0.y); ctx.lineTo(railL1.x, railL1.y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(railR0.x, railR0.y); ctx.lineTo(railR1.x, railR1.y); ctx.stroke();
  // vertical balusters
  ctx.strokeStyle = 'rgba(150,160,220,0.32)'; ctx.lineWidth = 1;
  for (let x = 0.4; x < ROOM_W; x += 0.9) {
    if (x > STAIR_X0 - 0.3 && x < STAIR_X1 + 0.3) continue;
    const pTop = engine.g(x, MEZZ_FRONT_Y, E + 12);
    const pBot = engine.g(x, MEZZ_FRONT_Y, E);
    ctx.beginPath(); ctx.moveTo(pTop.x, pTop.y); ctx.lineTo(pBot.x, pBot.y); ctx.stroke();
  }

  // Center staircase down to the ground floor
  const steps = 6;
  for (let i = 0; i < steps; i++) {
    const top = E - (E / steps) * i;            // top of this step
    const h = E / steps;
    const sy = MEZZ_FRONT_Y + i * 0.18;
    engine.box(STAIR_X0, sy, top - h, STAIR_X1 - STAIR_X0, 0.18, h, '#20203a', '#101024', '#15152c');
  }
}

export function drawWindows(engine: IsoEngine, ctx: CanvasRenderingContext2D) {
  // High windows on the back wall, above the mezzanine deck.
  const wins = [{ gx: 1.4 }, { gx: 6.0 }, { gx: 14.0 }, { gx: 19.5 }];
  wins.forEach(w => {
    const gx = w.gx, pw = 1.8, h0 = E + 8, h1 = 60;
    const tl = engine.g(gx, 0, h1), tr = engine.g(gx + pw, 0, h1);
    const ml = engine.g(gx, 0, h0), mr = engine.g(gx + pw, 0, h0);
    engine.poly([tl, tr, mr, ml], '#1e3a6e', '#2a4a8e');
    const cmx = (tl.x + tr.x) / 2;
    ctx.strokeStyle = '#2a4a8e'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cmx, tl.y); ctx.lineTo(cmx, ml.y); ctx.stroke();
    const hy1 = (tl.y + ml.y) / 2, hy2 = (tr.y + mr.y) / 2;
    ctx.beginPath(); ctx.moveTo(tl.x, hy1); ctx.lineTo(tr.x, hy2); ctx.stroke();
    const cx = (tl.x + mr.x) / 2, cy = (tl.y + mr.y) / 2 + 10;
    const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, 40);
    grd.addColorStop(0, 'rgba(100,160,255,0.07)');
    grd.addColorStop(1, 'transparent');
    ctx.fillStyle = grd;
    ctx.fillRect(cx - 50, cy - 50, 100, 100);
  });
}

export function drawZoneLabels(engine: IsoEngine, ctx: CanvasRenderingContext2D) {
  ctx.textAlign = 'center';
  // 2nd-floor banner + exec offices (drawn at deck elevation)
  ctx.font = 'bold 8px Courier New';
  const banner = engine.g(11.7, 0.55, E + 22);
  ctx.fillStyle = 'rgba(180,180,240,0.30)';
  ctx.fillText('— 2ND FLOOR · EXECUTIVE —', banner.x, banner.y);
  ctx.font = 'bold 7px Courier New';
  const raised: { t: string; gx: number; gy: number; c: string }[] = [
    { t: 'CEOX', gx: 5.5,  gy: 1.6, c: 'rgba(255,221,87,0.42)' },
    { t: 'FinX', gx: 18.0, gy: 1.6, c: 'rgba(140,150,255,0.42)' },
  ];
  raised.forEach(l => {
    const p = engine.g(l.gx, l.gy, E + 1);
    ctx.fillStyle = l.c;
    ctx.fillText(l.t, p.x, p.y);
  });
  // Ground floor labels
  const ground: { t: string; gx: number; gy: number; c: string }[] = [
    { t: 'CYBERX', gx: 3.0,  gy: 5.6, c: 'rgba(57,255,157,0.38)' },
    { t: 'M&SX',   gx: 9.0,  gy: 5.6, c: 'rgba(255,107,157,0.36)' },
    { t: 'AIX',    gx: 15.0, gy: 5.6, c: 'rgba(0,207,255,0.36)' },
    { t: 'OPERX',  gx: 21.0, gy: 5.6, c: 'rgba(255,160,60,0.36)' },
    { t: 'CAFE',       gx: 4.0,  gy: 9.4, c: 'rgba(210,170,110,0.30)' },
    { t: 'SNACK BAR',  gx: 8.4,  gy: 9.4, c: 'rgba(220,190,120,0.28)' },
    { t: 'BREAK ROOM', gx: 13.5, gy: 9.4, c: 'rgba(200,150,200,0.26)' },
    { t: 'MEETING',    gx: 20.0, gy: 9.4, c: 'rgba(200,200,255,0.24)' },
  ];
  ground.forEach(l => {
    const p = engine.g(l.gx, l.gy, 1);
    ctx.fillStyle = l.c;
    ctx.fillText(l.t, p.x, p.y);
  });
}
