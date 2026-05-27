// src/lib/iso/lights.ts
import { WALL_H, type IsoEngine } from './engine';

export function drawCeilingLights(engine: IsoEngine, ctx: CanvasRenderingContext2D) {
  const lights = [
    { gx: 2, gy: 1.5 }, { gx: 6, gy: 1.5 }, { gx: 10.5, gy: 1.5 }, { gx: 15, gy: 1.5 }, { gx: 18, gy: 1.5 },
    { gx: 4, gy: 5 }, { gx: 9.5, gy: 5 }, { gx: 14, gy: 5 },
    { gx: 17, gy: 9 }, { gx: 5, gy: 10 }, { gx: 10, gy: 10 }, { gx: 15, gy: 10 },
  ];
  lights.forEach(l => {
    const p = engine.g(l.gx, l.gy, WALL_H);
    // Fixture
    ctx.fillStyle = '#f0f0e0';
    ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
    // Glow cone
    const grd = ctx.createRadialGradient(p.x, p.y + 15, 0, p.x, p.y + 15, 90);
    grd.addColorStop(0, 'rgba(255,253,200,0.07)');
    grd.addColorStop(1, 'transparent');
    ctx.fillStyle = grd;
    ctx.fillRect(p.x - 100, p.y - 10, 200, 120);
  });
}
