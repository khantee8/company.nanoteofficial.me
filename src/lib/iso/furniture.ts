// src/lib/iso/furniture.ts
import { WALL_H, lighten, type IsoEngine } from './engine';

const DK = ['#6a4820', '#4a3010', '#5a3a18'] as const; // desk wood: top, right, left
const MN = ['#181828', '#0a0a18', '#141420'] as const; // monitor frame

function mon(engine: IsoEngine, gx: number, gy: number, pz: number, glow: string) {
  engine.box(gx, gy, pz, 0.55, 0.08, 16, MN[0], glow, MN[2]);
}

function drawPlant(engine: IsoEngine, ctx: CanvasRenderingContext2D, gx: number, gy: number) {
  engine.box(gx, gy, 0, 0.4, 0.4, 15, '#5a3010', '#3a1a08', '#4a2810');
  const t = engine.g(gx + 0.2, gy + 0.2, 22);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const lx2 = t.x + Math.cos(a) * 8;
    const ly2 = t.y + Math.sin(a) * 4;
    ctx.beginPath();
    ctx.arc(lx2, ly2, 9, 0, Math.PI * 2);
    ctx.fillStyle = i === 1 ? '#1a7025' : '#1a6020';
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(t.x, t.y, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#1a8030';
  ctx.fill();
}

function drawGlassPartition(engine: IsoEngine, gx: number) {
  for (let yy = 0; yy < 4; yy++) {
    const pt = engine.g(gx, yy, WALL_H * 0.8);
    const pb = engine.g(gx, yy, 0);
    const pt2 = engine.g(gx, yy + 1, WALL_H * 0.8);
    const pb2 = engine.g(gx, yy + 1, 0);
    engine.poly([pt, pt2, pb2, pb], 'rgba(150,180,255,0.08)', 'rgba(100,120,255,0.25)');
  }
}

export function drawFurniture(engine: IsoEngine, ctx: CanvasRenderingContext2D) {
  // ── CEO OFFICE ──
  engine.box(0.1, 0.08, 0, 0.5, 2.8, 50, '#2a1a08', '#1a0e05', '#241508');
  const bookCols = ['#7f8cff', '#ff6b9d', '#00cfff', '#ffdd57', '#ff9a3c'];
  for (let i = 0; i < 4; i++) {
    engine.box(0.12, 0.12 + i * 0.65, i * 10 + 2, 0.26, 0.55, 8, bookCols[i], '#00000044', bookCols[i]);
  }
  engine.box(0.6, 0.4, 0, 2.8, 0.85, 18, DK[0], DK[1], DK[2]);
  engine.box(0.6, 1.25, 0, 1.1, 0.7, 18, DK[0], DK[1], DK[2]);
  mon(engine, 0.8, 0.45, 18, '#7f8cff33');
  mon(engine, 1.55, 0.45, 18, '#ffdd5722');
  engine.box(2.5, 0.45, 18, 0.3, 0.22, 14, '#ffdd57', '#cc9900', '#e6ac00');
  engine.box(2.55, 0.45, 32, 0.2, 0.14, 6, '#ffaa00', '#cc8800', '#ddaa00');
  engine.box(1.8, 2.1, 0, 0.6, 0.5, 10, '#2a2a4e', '#1a1a38', '#222244');
  engine.box(2.5, 2.1, 0, 0.6, 0.5, 10, '#2a2a4e', '#1a1a38', '#222244');
  engine.box(1.2, 1.5, 0, 0.7, 0.55, 12, '#0a0a28', '#060618', '#0e0e32');
  engine.box(3.1, 0.44, 18, 0.3, 0.28, 10, '#3a1a06', '#2a1004', '#322008');
  const pp = engine.g(3.22, 0.55, 30);
  ctx.beginPath(); ctx.arc(pp.x, pp.y, 6, 0, Math.PI * 2); ctx.fillStyle = '#1a6a20'; ctx.fill();

  drawGlassPartition(engine, 3.9);

  // ── CYBERX (THREAT INTEL) ──
  engine.box(4.5, 0.04, 0, 2.8, 0.07, 56, '#04140e', '#031009', null); // wall screen
  for (let i = 0; i < 6; i++) {
    const pL = engine.g(4.7, 0.06, 50 - i * 8);
    const pR = engine.g(7.1, 0.06, 50 - i * 8);
    ctx.strokeStyle = i % 3 === 0 ? '#39ff9d88' : '#1f8f5b88'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(pL.x, pL.y); ctx.lineTo(pR.x, pR.y); ctx.stroke();
  }
  engine.box(4.4, 0.5, 0, 2.5, 0.85, 18, DK[0], DK[1], DK[2]); // desk
  mon(engine, 4.9, 0.55, 18, '#39ff9d55');
  mon(engine, 5.65, 0.55, 18, '#39ff9d33');
  engine.box(6.4, 0.5, 18, 0.3, 0.28, 16, '#0a2a1c', '#061a11', '#0e3424'); // IDS box
  const cybLed = engine.g(6.55, 0.6, 36);
  ctx.beginPath(); ctx.arc(cybLed.x, cybLed.y, 2, 0, Math.PI * 2); ctx.fillStyle = '#39ff9d'; ctx.fill();
  engine.box(5.2, 1.6, 0, 0.7, 0.55, 12, '#06140e', '#040d09', '#0a1c14'); // chair
  engine.box(7.0, 0.3, 0, 0.3, 0.28, 10, '#3a1a06', '#2a1004', '#322008'); // plant pot
  const cybp = engine.g(7.12, 0.4, 32);
  ctx.beginPath(); ctx.arc(cybp.x, cybp.y, 5, 0, Math.PI * 2); ctx.fillStyle = '#1a7025'; ctx.fill();

  drawGlassPartition(engine, 7.9);

  // ── MARKETING ──
  engine.box(8.5, 0.04, 0, 2.8, 0.07, 52, '#e0e0f0', '#c0c0d0', null);
  ['#ffdd57', '#ff9a3c', '#7f8cff', '#00cfff'].forEach((c, i) => {
    engine.box(8.6 + i * 0.65, 0.05, 28, 0.5, 0.05, 14, c, lighten(c, -30) as string, null);
  });
  engine.box(8.4, 0.5, 0, 2.2, 0.85, 18, DK[0], DK[1], DK[2]);
  mon(engine, 8.9, 0.55, 18, '#ff6b9d44');
  mon(engine, 9.65, 0.55, 18, '#ff6b9d22');
  engine.box(10.35, 0.5, 18, 0.28, 0.25, 16, '#7f8cff', '#5a5acc', '#6a6add');
  engine.box(9.2, 1.6, 0, 0.7, 0.55, 12, '#1a0a18', '#110810', '#180914');
  ['#ffdd57', '#ff6b9d', '#00cfff'].forEach((c, i) => {
    engine.box(11.0 + i * 0.02, 0.04, 20 + i * 8, 0.5, 0.04, 10, c, lighten(c, -20) as string, null);
  });

  drawGlassPartition(engine, 11.9);

  // ── R&D LAB ──
  engine.box(12.5, 0.04, 0, 4.0, 0.07, 58, '#d4d4ec', '#b4b4cc', null);
  for (let i = 0; i < 4; i++) {
    const p1 = engine.g(12.7 + i * 0.05, 0.06, 46 - i * 10);
    const p2 = engine.g(16.1 + i * 0.05, 0.06, 46 - i * 10);
    ctx.strokeStyle = '#4466cc88'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
  }
  engine.box(12.4, 0.5, 0, 2.5, 0.85, 18, DK[0], DK[1], DK[2]);
  mon(engine, 12.7, 0.55, 18, '#00cfff44');
  mon(engine, 13.5, 0.55, 18, '#00cfff22');
  engine.box(13.2, 1.6, 0, 0.7, 0.55, 12, '#0a1a22', '#061218', '#0e1820');
  engine.box(14.8, 0.3, 0, 2.6, 0.6, 22, '#3a3a2a', '#2a2a1a', '#323222');
  engine.box(15.0, 0.35, 22, 0.3, 0.25, 18, '#00cfff', '#008bbb', '#00aadd');
  engine.box(15.5, 0.35, 22, 0.25, 0.2, 22, '#ff6b9d', '#cc4070', '#ee5585');
  engine.box(16.0, 0.35, 22, 0.3, 0.25, 14, '#ffdd57', '#cc9900', '#eebb00');
  engine.box(15.8, 0.3, 22, 0.4, 0.35, 8, '#333', '#222', '#2a2a2a');
  engine.box(15.9, 0.3, 30, 0.2, 0.18, 16, '#444', '#333', '#3a3a3a');
  engine.box(17.0, 0.3, 22, 0.3, 0.28, 10, '#3a1a06', '#2a1004', '#322008');
  const rp = engine.g(17.1, 0.4, 34);
  ctx.beginPath(); ctx.arc(rp.x, rp.y, 5, 0, Math.PI * 2); ctx.fillStyle = '#1a7025'; ctx.fill();

  drawGlassPartition(engine, 16.9);

  // ── OPERATIONS ──
  engine.box(17.3, 0.15, 0, 0.9, 0.9, 68, '#111', '#0a0a0a', '#181818');
  for (let i = 0; i < 7; i++) {
    const pL = engine.g(17.74, 0.22, 60 - i * 8);
    const pR = engine.g(18.05, 0.22, 60 - i * 8);
    ctx.fillStyle = i % 2 === 0 ? '#00ff88' : '#7f8cff';
    ctx.beginPath(); ctx.arc(pL.x, pL.y, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff6b9d';
    ctx.beginPath(); ctx.arc(pR.x, pR.y, 1.4, 0, Math.PI * 2); ctx.fill();
  }
  engine.box(18.4, 0.15, 0, 0.9, 0.9, 68, '#111', '#0a0a0a', '#181818');
  for (let i = 0; i < 7; i++) {
    const p = engine.g(18.83, 0.22, 60 - i * 8);
    ctx.fillStyle = i % 3 === 0 ? '#ffaa00' : '#00ff88';
    ctx.beginPath(); ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2); ctx.fill();
  }
  engine.box(19.5, 0.2, 0, 0.9, 0.7, 22, '#1a1a1a', '#111', '#222');
  engine.box(17.3, 1.7, 0, 2.8, 0.85, 18, DK[0], DK[1], DK[2]);
  mon(engine, 17.6, 1.75, 18, '#ff9a3c44');
  mon(engine, 18.4, 1.75, 18, '#ff9a3c33');
  mon(engine, 19.1, 1.75, 18, '#00ff8822');
  engine.box(18.5, 2.75, 0, 0.7, 0.55, 12, '#1a0e04', '#110a04', '#18100a');
  engine.box(17.3, 1.1, 0, 2.5, 0.4, 6, '#0a0a0a', '#060606', '#0e0e0e');

  drawGlassPartition(engine, 20.9);

  // ── FINANCE ──
  engine.box(21.2, 0.04, 0, 2.5, 0.07, 52, '#0a0a30', '#050520', null);
  const chartPts = [
    { gx: 21.3, pz: 20 }, { gx: 21.7, pz: 32 }, { gx: 22.1, pz: 26 },
    { gx: 22.5, pz: 42 }, { gx: 22.9, pz: 36 }, { gx: 23.3, pz: 48 },
  ];
  ctx.strokeStyle = '#00ff8899'; ctx.lineWidth = 2;
  ctx.beginPath();
  chartPts.forEach((p, i) => {
    const sp = engine.g(p.gx, 0.05, p.pz);
    if (i === 0) ctx.moveTo(sp.x, sp.y); else ctx.lineTo(sp.x, sp.y);
  });
  ctx.stroke();
  engine.box(21.2, 0.5, 0, 2.5, 0.85, 18, DK[0], DK[1], DK[2]);
  mon(engine, 21.4, 0.55, 18, '#7f8cff55');
  mon(engine, 22.2, 0.55, 18, '#00ff8833');
  engine.box(21.1, 1.55, 0, 0.6, 0.9, 38, '#1a1a3e', '#101028', '#181838');
  engine.box(21.12, 1.57, 12, 0.55, 0.82, 10, '#222244', '#181830', '#1e1e3a');
  engine.box(21.12, 1.57, 24, 0.55, 0.82, 10, '#222244', '#181830', '#1e1e3a');
  const fh = engine.g(21.7, 1.58, 18);
  ctx.fillStyle = '#7f8cff'; ctx.fillRect(fh.x - 3, fh.y - 1, 6, 2);
  engine.box(22.2, 1.6, 0, 0.7, 0.55, 12, '#0a0a2e', '#060618', '#0e0e32');

  // ── MEETING ROOM ──
  engine.box(9.5, 5.04, 0, 5.0, 0.07, 55, '#e4e4fc', '#c4c4dc', null);
  const scrPts = [
    engine.g(10.0, 5.05, 48), engine.g(14.0, 5.05, 48),
    engine.g(14.0, 5.05, 18), engine.g(10.0, 5.05, 18),
  ];
  engine.poly(scrPts, '#0a0a3a', null);
  engine.box(9.2, 5.8, 0, 5.5, 2.2, 22, '#3a2810', '#281808', '#322212');
  const mChairs: [number, number][] = [
    [9.3, 5.3], [10.3, 5.3], [11.3, 5.3], [12.3, 5.3], [13.3, 5.3],
    [9.3, 8.1], [10.3, 8.1], [11.3, 8.1], [12.3, 8.1], [13.3, 8.1],
    [8.6, 6.2], [8.6, 7.1], [14.9, 6.2], [14.9, 7.1],
  ];
  mChairs.forEach(([x, y]) => engine.box(x, y, 0, 0.6, 0.4, 10, '#181830', '#0e0e24', '#14142a'));
  engine.box(11.5, 6.5, 22, 0.5, 0.38, 4, '#333', '#222', '#2a2a2a');
  engine.box(12.5, 6.8, 22, 0.8, 0.45, 2, '#e8e8e8', '#ccc', '#ddd');

  // ── BREAK ROOM ──
  engine.box(17.8, 6.3, 0, 3.7, 0.75, 22, DK[0], DK[1], DK[2]);
  engine.box(18.0, 6.4, 0, 0.7, 0.6, 34, '#111', '#0a0a0a', '#181818');
  engine.box(18.1, 6.45, 34, 0.5, 0.4, 8, '#5a3010', '#3a1a08', '#4a2510');
  const cp = engine.g(18.3, 6.6, 42);
  const cg = ctx.createRadialGradient(cp.x, cp.y - 8, 0, cp.x, cp.y - 8, 20);
  cg.addColorStop(0, 'rgba(90,50,10,0.25)'); cg.addColorStop(1, 'transparent');
  ctx.fillStyle = cg; ctx.fillRect(cp.x - 25, cp.y - 30, 50, 40);
  engine.box(19.0, 6.4, 0, 0.6, 0.6, 44, '#a0c8ee', '#80a8cc', '#90b8dd');
  engine.box(19.1, 6.5, 44, 0.4, 0.38, 8, '#c0dcf0', '#a0c0da', '#b0cce8');
  engine.box(20.0, 6.4, 0, 0.7, 0.65, 44, '#d8d8e8', '#b8b8c8', '#c8c8d8');
  engine.box(20.05, 6.45, 22, 0.6, 0.55, 1, '#aaa', '#888', '#999');
  const fh2 = engine.g(20.72, 6.46, 35);
  ctx.fillStyle = '#888'; ctx.fillRect(fh2.x - 2, fh2.y - 3, 3, 6);
  engine.box(18.0, 8.5, 0, 3.5, 1.1, 24, '#2a1a40', '#1a1030', '#221438');
  engine.box(18.0, 8.5, 24, 3.5, 0.28, 18, '#3a2a56', '#2a1a46', '#32234e');
  engine.box(18.0, 8.5, 0, 0.3, 1.1, 42, '#3a2a56', '#2a1a46', '#32234e');
  engine.box(21.2, 8.5, 0, 0.3, 1.1, 42, '#3a2a56', '#2a1a46', '#32234e');
  ['#7f8cff', '#ff6b9d', '#00cfff'].forEach((c, i) =>
    engine.box(18.4 + i * 0.95, 8.55, 24, 0.75, 0.95, 14, c, lighten(c, -40) as string, lighten(c, -20) as string)
  );
  engine.box(18.8, 9.85, 0, 2.0, 0.8, 12, '#3a2810', '#281808', '#322212');
  engine.box(19.5, 9.9, 12, 0.5, 0.35, 3, '#e8e8f0', '#ccc', '#ddd');

  // ── COMMON / HALLWAY ──
  drawPlant(engine, ctx, 0.1, 13.3);
  drawPlant(engine, ctx, 7.0, 13.3);
  drawPlant(engine, ctx, 11.5, 13.3);
  drawPlant(engine, ctx, 16.0, 13.3);
  drawPlant(engine, ctx, 21.3, 13.3);
  drawPlant(engine, ctx, 0.1, 0.1);
  drawPlant(engine, ctx, 6.0, 3.5);
  drawPlant(engine, ctx, 10.0, 3.5);
  drawPlant(engine, ctx, 15.0, 3.5);
  drawPlant(engine, ctx, 19.0, 3.5);

  engine.box(10.5, 10.5, 0, 3.0, 0.07, 40, '#d0a060', '#a07040', '#b88050');
  ['#ffdd57', '#ff6b9d', '#00cfff', '#7f8cff'].forEach((c, i) =>
    engine.box(10.6 + i * 0.72, 10.52, 22 + i * 2, 0.55, 0.05, 12, c, lighten(c, -30) as string, null)
  );

  // Entrance mat
  engine.poly([engine.g(9, 12.5), engine.g(15, 12.5), engine.g(15, 13.5), engine.g(9, 13.5)], 'rgba(80,60,160,0.2)', null);
  // Reception desk
  engine.box(5.5, 12.8, 0, 3.0, 0.7, 20, DK[0], DK[1], DK[2]);
  engine.box(5.5, 12.8, 20, 3.0, 0.15, 8, '#5a3a18', '#3a2008', '#4a2e10');
}
