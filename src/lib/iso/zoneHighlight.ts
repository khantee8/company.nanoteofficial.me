// src/lib/iso/zoneHighlight.ts
import type { IsoEngine } from './engine';
import type { Agent } from '../agents/Agent';
import { DEPT_ZONE_BOUNDS, isRaised, MEZZANINE_ELEVATION, type DeptId } from '../data/departments';

export function drawZoneHighlight(
  engine: IsoEngine,
  ctx: CanvasRenderingContext2D,
  selectedDept: DeptId | null,
  agents: Record<DeptId, Agent>,
) {
  if (!selectedDept) return;
  const z = DEPT_ZONE_BOUNDS[selectedDept];
  if (!z) return;

  const now = Date.now();
  const pulse = 0.45 + Math.sin(now * 0.004) * 0.35;
  const color = agents[selectedDept].color;
  const pz = isRaised(selectedDept) ? MEZZANINE_ELEVATION : 0;

  const tl = engine.g(z.x0, z.y0, pz);
  const tr = engine.g(z.x1, z.y0, pz);
  const br = engine.g(z.x1, z.y1, pz);
  const bl = engine.g(z.x0, z.y1, pz);

  // Glow fill
  ctx.beginPath();
  ctx.moveTo(tl.x, tl.y);
  ctx.lineTo(tr.x, tr.y);
  ctx.lineTo(br.x, br.y);
  ctx.lineTo(bl.x, bl.y);
  ctx.closePath();
  ctx.fillStyle = color + Math.round(pulse * 26).toString(16).padStart(2, '0');
  ctx.fill();

  // Animated dashed border
  ctx.strokeStyle = color + Math.round(pulse * 255).toString(16).padStart(2, '0');
  ctx.lineWidth = 2.5;
  ctx.setLineDash([8, 4]);
  ctx.lineDashOffset = -(now / 60) % 24;
  ctx.stroke();
  ctx.setLineDash([]);

  // Corner sparkles
  [tl, tr, br, bl].forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  });

  // Agent spotlight ring
  const agent = agents[selectedDept];
  if (agent) {
    const ap = engine.g(agent.gx, agent.gy, agent.elevation);
    const ringR = 20 + Math.sin(now * 0.006) * 4;
    ctx.beginPath();
    ctx.ellipse(ap.x, ap.y, ringR, ringR / 2, 0, 0, Math.PI * 2);
    ctx.strokeStyle = color + 'cc';
    ctx.lineWidth = 2;
    ctx.stroke();
    const grd = ctx.createRadialGradient(ap.x, ap.y, 0, ap.x, ap.y, ringR);
    grd.addColorStop(0, color + '22');
    grd.addColorStop(1, 'transparent');
    ctx.fillStyle = grd;
    ctx.fill();
  }
}
