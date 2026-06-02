// src/lib/agents/Agent.ts
import type { DeptId } from '../data/departments';
import type { IsoEngine } from '../iso/engine';
import { roundRect } from '../iso/engine';
import { SPRITE_WIDTH, SPRITE_HEIGHT, type SpriteMap } from './sprites';

export type AgentState = 'idle' | 'walking' | 'working';

const SPEED = 2.0; // grid units per second

export class Agent {
  gx: number;
  gy: number;
  readonly homeX: number;
  readonly homeY: number;
  tx: number;
  ty: number;
  state: AgentState = 'idle';
  arriveState: AgentState = 'working';
  walkPhase = Math.random() * Math.PI * 2;
  facingLeft = false;
  bubble: string | null = null;
  bubbleLife = 0;
  t = Math.random() * 100;

  constructor(
    public readonly id: DeptId,
    public readonly name: string,
    public readonly color: string,
    homeX: number,
    homeY: number,
    /** Vertical pixel offset — non-zero for 2nd-floor (mezzanine) agents. */
    public readonly elevation: number = 0,
  ) {
    this.gx = homeX; this.gy = homeY;
    this.homeX = homeX; this.homeY = homeY;
    this.tx = homeX; this.ty = homeY;
  }

  moveTo(tx: number, ty: number, arriveState: AgentState = 'working') {
    this.tx = tx;
    this.ty = ty;
    this.arriveState = arriveState;
    this.state = 'walking';
  }

  goHome() { this.moveTo(this.homeX, this.homeY, 'working'); }

  say(msg: string, durationMs = 3500) {
    this.bubble = msg;
    this.bubbleLife = durationMs;
  }

  update(dt: number) {
    this.t += dt;
    if (this.state === 'walking') {
      const dx = this.tx - this.gx;
      const dy = this.ty - this.gy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.06) {
        this.gx = this.tx;
        this.gy = this.ty;
        this.state = this.arriveState;
      } else {
        this.gx += (dx / dist) * SPEED * dt;
        this.gy += (dy / dist) * SPEED * dt;
        this.walkPhase += dt * 12;
        if (dx < -0.05) this.facingLeft = true;
        else if (dx > 0.05) this.facingLeft = false;
      }
    }
    if (this.bubbleLife > 0) {
      this.bubbleLife -= dt * 1000;
      if (this.bubbleLife <= 0) this.bubble = null;
    }
  }

  draw(ctx: CanvasRenderingContext2D, engine: IsoEngine, sprites: SpriteMap) {
    const fp = engine.g(this.gx, this.gy, this.elevation);
    const bob = this.state === 'walking'
      ? Math.abs(Math.sin(this.walkPhase)) * 5
      : Math.sin(this.t * 1.5) * 2;

    // Shadow
    ctx.beginPath();
    ctx.ellipse(fp.x, fp.y, 16, 8, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();

    const sy = fp.y - SPRITE_HEIGHT - bob;
    const spr = sprites[this.id];
    if (spr && spr.complete) {
      ctx.save();
      ctx.translate(fp.x, 0);
      if (this.facingLeft) ctx.scale(-1, 1);
      ctx.drawImage(spr, -SPRITE_WIDTH / 2, sy, SPRITE_WIDTH, SPRITE_HEIGHT);
      ctx.restore();
    } else {
      // Fallback: colored ellipse
      ctx.beginPath();
      ctx.ellipse(fp.x, fp.y - 20 - bob, 10, 6, 0, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(fp.x, fp.y - 36 - bob, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#f5c5a3';
      ctx.fill();
    }

    // Name tag
    ctx.font = 'bold 8px Courier New';
    ctx.textAlign = 'center';
    ctx.fillStyle = this.color;
    ctx.fillText(this.name, fp.x, sy - 5);

    // Speech bubble
    if (this.bubble) {
      ctx.font = '8px Courier New';
      const bw = ctx.measureText(this.bubble).width + 14;
      const bh = 14;
      const bx = fp.x - bw / 2;
      const by = sy - 26;
      const alpha = Math.min(1, this.bubbleLife / 600);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(255,255,255,0.96)';
      roundRect(ctx, bx, by, bw, bh, 3);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(fp.x - 5, by + bh);
      ctx.lineTo(fp.x + 5, by + bh);
      ctx.lineTo(fp.x, by + bh + 6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.textAlign = 'center';
      ctx.fillText(this.bubble, fp.x, by + 9);
      ctx.globalAlpha = 1;
    }
  }
}
