// src/lib/iso/furniture.ts
import { lighten, type IsoEngine } from './engine';
import { MEZZANINE_ELEVATION } from '../data/departments';

const DK = ['#6a4820', '#4a3010', '#5a3a18'] as const; // desk wood: top, right, left
const MN = ['#181828', '#0a0a18', '#141420'] as const; // monitor frame
const E = MEZZANINE_ELEVATION;

function mon(engine: IsoEngine, gx: number, gy: number, pz: number, glow: string) {
  engine.box(gx, gy, pz, 0.55, 0.08, 16, MN[0], glow, MN[2]);
}

/** Desk + two monitors + chair at an arbitrary base elevation (ground or deck). */
function deskCluster(
  engine: IsoEngine,
  x: number, y: number, baseZ: number,
  glowA: string, glowB: string,
) {
  engine.box(x, y, baseZ, 2.4, 0.85, 18, DK[0], DK[1], DK[2]);     // desk
  mon(engine, x + 0.35, y + 0.05, baseZ + 18, glowA);
  mon(engine, x + 1.15, y + 0.05, baseZ + 18, glowB);
  engine.box(x + 0.8, y + 1.05, baseZ, 0.7, 0.55, 12, '#15152a', '#0d0d1e', '#111126'); // chair
}

function drawPlant(engine: IsoEngine, ctx: CanvasRenderingContext2D, gx: number, gy: number, baseZ = 0) {
  engine.box(gx, gy, baseZ, 0.4, 0.4, 15, '#5a3010', '#3a1a08', '#4a2810');
  const t = engine.g(gx + 0.2, gy + 0.2, baseZ + 22);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(t.x + Math.cos(a) * 8, t.y + Math.sin(a) * 4, 9, 0, Math.PI * 2);
    ctx.fillStyle = i === 1 ? '#1a7025' : '#1a6020';
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(t.x, t.y, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#1a8030';
  ctx.fill();
}

// ───────────────────────── 2nd floor (mezzanine) ─────────────────────────

function drawCeoOffice(engine: IsoEngine, ctx: CanvasRenderingContext2D) {
  // Bookshelf against the back wall
  engine.box(0.4, 0.2, E, 0.5, 2.6, 46, '#2a1a08', '#1a0e05', '#241508');
  const bookCols = ['#7f8cff', '#ff6b9d', '#00cfff', '#ffdd57'];
  for (let i = 0; i < 4; i++) {
    engine.box(0.42, 0.4 + i * 0.6, E + i * 10 + 2, 0.26, 0.5, 8, bookCols[i], '#00000044', bookCols[i]);
  }
  deskCluster(engine, 4.2, 0.8, E, '#7f8cff33', '#ffdd5722');
  // Golden trophy
  engine.box(6.2, 0.85, E + 18, 0.3, 0.22, 14, '#ffdd57', '#cc9900', '#e6ac00');
  engine.box(6.25, 0.85, E + 32, 0.2, 0.14, 6, '#ffaa00', '#cc8800', '#ddaa00');
  // Couch + side plant
  engine.box(1.4, 2.6, E, 2.0, 0.7, 12, '#2a2a4e', '#1a1a38', '#222244');
  drawPlant(engine, ctx, 9.6, 0.6, E);
}

function drawFinanceOffice(engine: IsoEngine, ctx: CanvasRenderingContext2D) {
  // Ticker wall behind the desk
  engine.box(13.2, 0.2, E, 4.0, 0.07, 40, '#0a0a30', '#050520', null);
  const chartPts = [
    { gx: 13.4, pz: 14 }, { gx: 14.2, pz: 26 }, { gx: 15.0, pz: 20 },
    { gx: 15.8, pz: 34 }, { gx: 16.6, pz: 28 }, { gx: 17.0, pz: 38 },
  ];
  ctx.strokeStyle = '#00ff8899'; ctx.lineWidth = 2;
  ctx.beginPath();
  chartPts.forEach((p, i) => {
    const sp = engine.g(p.gx, 0.24, E + p.pz);
    if (i === 0) ctx.moveTo(sp.x, sp.y); else ctx.lineTo(sp.x, sp.y);
  });
  ctx.stroke();
  deskCluster(engine, 17.0, 0.8, E, '#7f8cff55', '#00ff8833');
  // Safe
  engine.box(21.6, 0.7, E, 0.7, 0.9, 26, '#1a1a3e', '#101028', '#181838');
  const fh = engine.g(21.95, 0.75, E + 14);
  ctx.fillStyle = '#7f8cff'; ctx.fillRect(fh.x - 3, fh.y - 1, 6, 2);
  drawPlant(engine, ctx, 22.8, 0.5, E);
}

// ───────────────────────── 1st floor (ground) ─────────────────────────

function drawCyberX(engine: IsoEngine, ctx: CanvasRenderingContext2D) {
  // Threat-monitor screen behind the desk
  engine.box(1.0, 4.9, 0, 3.4, 0.07, 30, '#04140e', '#031009', null);
  for (let i = 0; i < 5; i++) {
    const pL = engine.g(1.2, 4.92, 26 - i * 4);
    const pR = engine.g(4.2, 4.92, 26 - i * 4);
    ctx.strokeStyle = i % 3 === 0 ? '#39ff9d88' : '#1f8f5b88'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(pL.x, pL.y); ctx.lineTo(pR.x, pR.y); ctx.stroke();
  }
  deskCluster(engine, 1.6, 5.8, 0, '#39ff9d55', '#39ff9d33');
  engine.box(4.2, 5.85, 18, 0.3, 0.28, 16, '#0a2a1c', '#061a11', '#0e3424'); // IDS box
  const led = engine.g(4.35, 5.95, 36);
  ctx.beginPath(); ctx.arc(led.x, led.y, 2, 0, Math.PI * 2); ctx.fillStyle = '#39ff9d'; ctx.fill();
  drawPlant(engine, ctx, 5.2, 5.2, 0);
}

function drawMarketing(engine: IsoEngine, ctx: CanvasRenderingContext2D) {
  // Content board behind the desk
  engine.box(7.0, 4.9, 0, 3.2, 0.07, 28, '#e0e0f0', '#c0c0d0', null);
  ['#ffdd57', '#ff9a3c', '#7f8cff', '#00cfff'].forEach((c, i) => {
    engine.box(7.2 + i * 0.7, 4.92, 12, 0.55, 0.05, 12, c, lighten(c, -30) as string, null);
  });
  deskCluster(engine, 7.6, 5.8, 0, '#ff6b9d44', '#ff6b9d22');
  engine.box(10.4, 5.85, 18, 0.28, 0.25, 16, '#7f8cff', '#5a5acc', '#6a6add'); // ring light
  drawPlant(engine, ctx, 11.2, 5.2, 0);
}

function drawRnd(engine: IsoEngine, ctx: CanvasRenderingContext2D) {
  // Whiteboard behind the desk
  engine.box(12.6, 4.9, 0, 3.6, 0.07, 30, '#d4d4ec', '#b4b4cc', null);
  for (let i = 0; i < 4; i++) {
    const p1 = engine.g(12.8 + i * 0.05, 4.92, 24 - i * 5);
    const p2 = engine.g(16.0 + i * 0.05, 4.92, 24 - i * 5);
    ctx.strokeStyle = '#4466cc88'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
  }
  deskCluster(engine, 13.0, 5.8, 0, '#00cfff44', '#00cfff22');
  // Experiment rack with sample beakers
  engine.box(16.2, 5.5, 0, 1.2, 0.5, 20, '#3a3a2a', '#2a2a1a', '#323222');
  engine.box(16.35, 5.55, 20, 0.28, 0.22, 16, '#00cfff', '#008bbb', '#00aadd');
  engine.box(16.8, 5.55, 20, 0.24, 0.2, 20, '#ff6b9d', '#cc4070', '#ee5585');
  drawPlant(engine, ctx, 17.2, 5.2, 0);
}

function drawOperations(engine: IsoEngine, ctx: CanvasRenderingContext2D) {
  // Server racks at the back of the zone
  for (let r = 0; r < 2; r++) {
    const rx = 18.6 + r * 1.0;
    engine.box(rx, 5.0, 0, 0.9, 0.9, 40, '#111', '#0a0a0a', '#181818');
    for (let i = 0; i < 6; i++) {
      const p = engine.g(rx + 0.45, 5.1, 34 - i * 5);
      ctx.fillStyle = i % 2 === 0 ? '#00ff88' : (r === 0 ? '#7f8cff' : '#ffaa00');
      ctx.beginPath(); ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2); ctx.fill();
    }
  }
  deskCluster(engine, 20.4, 5.9, 0, '#ff9a3c44', '#ff9a3c33');
  engine.box(22.9, 5.95, 18, 0.3, 0.25, 14, '#ff9a3c', '#cc7a20', '#e68a30'); // status lamp
  drawPlant(engine, ctx, 18.2, 5.2, 0);
}

function drawCoffeeBar(engine: IsoEngine, ctx: CanvasRenderingContext2D) {
  // Counter
  engine.box(2.0, 9.6, 0, 3.6, 0.8, 20, '#3a2810', '#281808', '#322212');
  engine.box(2.0, 9.6, 20, 3.6, 0.15, 6, '#5a3a18', '#3a2008', '#4a2e10');
  // Espresso machine + steam glow
  engine.box(2.4, 9.7, 20, 0.7, 0.6, 16, '#111', '#0a0a0a', '#181818');
  engine.box(2.5, 9.75, 36, 0.5, 0.4, 8, '#5a3010', '#3a1a08', '#4a2510');
  const cp = engine.g(2.7, 9.9, 44);
  const cg = ctx.createRadialGradient(cp.x, cp.y - 8, 0, cp.x, cp.y - 8, 20);
  cg.addColorStop(0, 'rgba(120,80,30,0.22)'); cg.addColorStop(1, 'transparent');
  ctx.fillStyle = cg; ctx.fillRect(cp.x - 25, cp.y - 30, 50, 40);
  // Mugs on the counter
  ['#a0c8ee', '#ee9a9a', '#9aee9a'].forEach((c, i) =>
    engine.box(3.5 + i * 0.45, 9.75, 20, 0.22, 0.2, 7, c, lighten(c, -30) as string, lighten(c, -15) as string));
  // Stools
  engine.box(2.6, 10.7, 0, 0.5, 0.5, 11, '#2a2a40', '#1a1a30', '#222238');
  engine.box(4.0, 10.7, 0, 0.5, 0.5, 11, '#2a2a40', '#1a1a30', '#222238');
}

function drawSnackStation(engine: IsoEngine) {
  // Vending machine
  engine.box(7.4, 9.5, 0, 1.0, 0.8, 40, '#1a1a2e', '#101022', '#16162a');
  const glassPts = [
    engine.g(7.55, 9.55, 36), engine.g(8.25, 9.55, 36),
    engine.g(8.25, 9.55, 8), engine.g(7.55, 9.55, 8),
  ];
  engine.poly(glassPts, 'rgba(120,160,255,0.10)', 'rgba(120,140,255,0.3)');
  ['#ffdd57', '#ff6b9d', '#00cfff', '#39ff9d'].forEach((c, i) =>
    engine.box(7.6, 9.56, 12 + i * 6, 0.6, 0.04, 4, c, lighten(c, -30) as string, null));
  // Snack shelf + basket
  engine.box(8.8, 9.7, 0, 1.0, 0.6, 16, '#3a2810', '#281808', '#322212');
  ['#ffaa00', '#ee5566', '#88cc44'].forEach((c, i) =>
    engine.box(8.9 + i * 0.28, 9.75, 16, 0.22, 0.18, 6, c, lighten(c, -30) as string, lighten(c, -15) as string));
}

function drawBreakRoom(engine: IsoEngine) {
  // Rug
  engine.poly(
    [engine.g(11.0, 9.4), engine.g(16.2, 9.4), engine.g(16.2, 12.0), engine.g(11.0, 12.0)],
    'rgba(120,90,160,0.10)', null,
  );
  // L-shaped sofa
  engine.box(11.2, 9.6, 0, 3.4, 0.9, 16, '#2a1a40', '#1a1030', '#221438');
  engine.box(11.2, 9.6, 16, 3.4, 0.26, 12, '#3a2a56', '#2a1a46', '#32234e');
  engine.box(11.2, 10.5, 0, 0.9, 1.4, 16, '#2a1a40', '#1a1030', '#221438');
  // Cushions
  ['#7f8cff', '#ff6b9d', '#00cfff'].forEach((c, i) =>
    engine.box(11.5 + i * 1.0, 9.65, 16, 0.7, 0.8, 12, c, lighten(c, -40) as string, lighten(c, -20) as string));
  // Coffee table + magazine
  engine.box(13.2, 10.8, 0, 1.6, 0.9, 10, '#3a2810', '#281808', '#322212');
  engine.box(13.6, 10.9, 10, 0.6, 0.45, 2, '#e8e8f0', '#ccc', '#ddd');
}

function drawMeeting(engine: IsoEngine) {
  // Wall screen
  engine.box(18.0, 8.7, 0, 4.6, 0.07, 26, '#e4e4fc', '#c4c4dc', null);
  const scrPts = [
    engine.g(18.4, 8.72, 22), engine.g(22.2, 8.72, 22),
    engine.g(22.2, 8.72, 6), engine.g(18.4, 8.72, 6),
  ];
  engine.poly(scrPts, '#0a0a3a', null);
  // Table
  engine.box(18.2, 9.6, 0, 4.2, 1.8, 18, '#3a2810', '#281808', '#322212');
  const chairs: [number, number][] = [
    [18.4, 9.2], [19.4, 9.2], [20.4, 9.2], [21.4, 9.2],
    [18.4, 11.5], [19.4, 11.5], [20.4, 11.5], [21.4, 11.5],
  ];
  chairs.forEach(([x, y]) => engine.box(x, y, 0, 0.6, 0.4, 10, '#181830', '#0e0e24', '#14142a'));
}

export function drawFurniture(engine: IsoEngine, ctx: CanvasRenderingContext2D) {
  // 2nd floor first (back), then ground floor (front) for painter ordering.
  drawCeoOffice(engine, ctx);
  drawFinanceOffice(engine, ctx);

  drawCyberX(engine, ctx);
  drawMarketing(engine, ctx);
  drawRnd(engine, ctx);
  drawOperations(engine, ctx);

  drawCoffeeBar(engine, ctx);
  drawSnackStation(engine);
  drawBreakRoom(engine);
  drawMeeting(engine);

  // Greenery + entrance
  drawPlant(engine, ctx, 0.2, 12.8);
  drawPlant(engine, ctx, 16.8, 12.6);
  drawPlant(engine, ctx, 23.2, 9.0);
  drawPlant(engine, ctx, 6.2, 8.8);

  // Entrance mat + reception desk (front)
  engine.poly([engine.g(8.5, 12.6), engine.g(14.5, 12.6), engine.g(14.5, 13.6), engine.g(8.5, 13.6)], 'rgba(80,60,160,0.2)', null);
  engine.box(5.5, 12.9, 0, 3.0, 0.7, 20, DK[0], DK[1], DK[2]);
  engine.box(5.5, 12.9, 20, 3.0, 0.15, 8, '#5a3a18', '#3a2008', '#4a2e10');
}
