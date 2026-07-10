// src/lib/agents/sprites.ts
import type { DeptId } from '../data/departments';

/** One pixel-art rectangle on a 14x18 chibi grid. */
export interface PixelRect {
  x: number; y: number; w: number; h: number; fill: string;
}

/**
 * Sprite data per dept — six original chibi-shonen manga pixel characters,
 * hand-authored on a 14x18 grid (approved mockup style: big expressive head
 * ~half the sprite, 2x2-pixel eyes, spiky/shaped hair, mouth row, compact
 * body, per-agent signature accessory). CEOX and CyberX are the
 * user-approved mockup maps verbatim (converted to merged rects); FinX,
 * M&SX, AIX, OperX are authored in the same proportions per the v1.12
 * Task 9 brief. Typed structured data, no HTML strings.
 */
const SPRITE_DATA: Record<DeptId, PixelRect[]> = {
  // CEOX — blond spikes, crimson draped captain's coat, white shirt, sky tie, gold epaulettes
  ceo: [
    { x: 2, y: 0, w: 1, h: 1, fill: '#ffdd57' }, { x: 6, y: 0, w: 1, h: 1, fill: '#ffdd57' }, { x: 10, y: 0, w: 1, h: 1, fill: '#ffdd57' },
    { x: 1, y: 1, w: 11, h: 1, fill: '#ffdd57' },
    { x: 0, y: 2, w: 13, h: 1, fill: '#ffdd57' },
    { x: 0, y: 3, w: 2, h: 1, fill: '#ffdd57' }, { x: 2, y: 3, w: 9, h: 1, fill: '#f5c5a3' }, { x: 11, y: 3, w: 2, h: 1, fill: '#ffdd57' },
    { x: 0, y: 4, w: 1, h: 1, fill: '#ffdd57' }, { x: 1, y: 4, w: 11, h: 1, fill: '#f5c5a3' }, { x: 12, y: 4, w: 1, h: 1, fill: '#ffdd57' },
    { x: 0, y: 5, w: 1, h: 1, fill: '#ffdd57' }, { x: 1, y: 5, w: 2, h: 1, fill: '#f5c5a3' }, { x: 3, y: 5, w: 2, h: 1, fill: '#1a1a2e' }, { x: 5, y: 5, w: 3, h: 1, fill: '#f5c5a3' }, { x: 8, y: 5, w: 2, h: 1, fill: '#1a1a2e' }, { x: 10, y: 5, w: 2, h: 1, fill: '#f5c5a3' }, { x: 12, y: 5, w: 1, h: 1, fill: '#ffdd57' },
    { x: 1, y: 6, w: 2, h: 1, fill: '#f5c5a3' }, { x: 3, y: 6, w: 2, h: 1, fill: '#1a1a2e' }, { x: 5, y: 6, w: 3, h: 1, fill: '#f5c5a3' }, { x: 8, y: 6, w: 2, h: 1, fill: '#1a1a2e' }, { x: 10, y: 6, w: 2, h: 1, fill: '#f5c5a3' },
    { x: 1, y: 7, w: 11, h: 1, fill: '#f5c5a3' },
    { x: 1, y: 8, w: 4, h: 1, fill: '#f5c5a3' }, { x: 5, y: 8, w: 3, h: 1, fill: '#c0785a' }, { x: 8, y: 8, w: 4, h: 1, fill: '#f5c5a3' },
    { x: 2, y: 9, w: 9, h: 1, fill: '#f5c5a3' },
    { x: 1, y: 10, w: 2, h: 1, fill: '#b03a2e' }, { x: 3, y: 10, w: 7, h: 1, fill: '#ffffff' }, { x: 10, y: 10, w: 2, h: 1, fill: '#b03a2e' },
    { x: 0, y: 11, w: 3, h: 1, fill: '#b03a2e' }, { x: 3, y: 11, w: 7, h: 1, fill: '#ffffff' }, { x: 10, y: 11, w: 3, h: 1, fill: '#b03a2e' },
    { x: 0, y: 12, w: 3, h: 1, fill: '#b03a2e' }, { x: 3, y: 12, w: 2, h: 1, fill: '#ffffff' }, { x: 5, y: 12, w: 2, h: 1, fill: '#7f8cff' }, { x: 7, y: 12, w: 3, h: 1, fill: '#ffffff' }, { x: 10, y: 12, w: 3, h: 1, fill: '#b03a2e' },
    { x: 0, y: 13, w: 2, h: 1, fill: '#b03a2e' }, { x: 3, y: 13, w: 7, h: 1, fill: '#ffffff' }, { x: 11, y: 13, w: 2, h: 1, fill: '#b03a2e' },
    { x: 3, y: 14, w: 7, h: 1, fill: '#ffffff' },
    { x: 3, y: 15, w: 2, h: 1, fill: '#22223a' }, { x: 8, y: 15, w: 2, h: 1, fill: '#22223a' },
    { x: 3, y: 16, w: 2, h: 1, fill: '#22223a' }, { x: 8, y: 16, w: 2, h: 1, fill: '#22223a' },
    { x: 2, y: 17, w: 3, h: 1, fill: '#111111' }, { x: 8, y: 17, w: 3, h: 1, fill: '#111111' },
  ],
  // CyberX — dark hood, neon-green visor + zipper accent
  cyb: [
    { x: 2, y: 0, w: 9, h: 1, fill: '#0c2a1e' },
    { x: 1, y: 1, w: 11, h: 1, fill: '#0c2a1e' },
    { x: 1, y: 2, w: 2, h: 1, fill: '#0c2a1e' }, { x: 3, y: 2, w: 7, h: 1, fill: '#f5c5a3' }, { x: 10, y: 2, w: 2, h: 1, fill: '#0c2a1e' },
    { x: 0, y: 3, w: 2, h: 1, fill: '#0c2a1e' }, { x: 2, y: 3, w: 9, h: 1, fill: '#f5c5a3' }, { x: 11, y: 3, w: 2, h: 1, fill: '#0c2a1e' },
    { x: 0, y: 4, w: 2, h: 1, fill: '#0c2a1e' }, { x: 2, y: 4, w: 1, h: 1, fill: '#f5c5a3' }, { x: 3, y: 4, w: 7, h: 1, fill: '#39ff9d' }, { x: 10, y: 4, w: 1, h: 1, fill: '#f5c5a3' }, { x: 11, y: 4, w: 2, h: 1, fill: '#0c2a1e' },
    { x: 0, y: 5, w: 2, h: 1, fill: '#0c2a1e' }, { x: 2, y: 5, w: 1, h: 1, fill: '#f5c5a3' }, { x: 3, y: 5, w: 7, h: 1, fill: '#39ff9d' }, { x: 10, y: 5, w: 1, h: 1, fill: '#f5c5a3' }, { x: 11, y: 5, w: 2, h: 1, fill: '#0c2a1e' },
    { x: 1, y: 6, w: 1, h: 1, fill: '#0c2a1e' }, { x: 2, y: 6, w: 9, h: 1, fill: '#f5c5a3' }, { x: 11, y: 6, w: 1, h: 1, fill: '#0c2a1e' },
    { x: 1, y: 7, w: 1, h: 1, fill: '#0c2a1e' }, { x: 2, y: 7, w: 3, h: 1, fill: '#f5c5a3' }, { x: 5, y: 7, w: 3, h: 1, fill: '#c0785a' }, { x: 8, y: 7, w: 3, h: 1, fill: '#f5c5a3' }, { x: 11, y: 7, w: 1, h: 1, fill: '#0c2a1e' },
    { x: 2, y: 8, w: 1, h: 1, fill: '#0c2a1e' }, { x: 3, y: 8, w: 7, h: 1, fill: '#f5c5a3' }, { x: 10, y: 8, w: 1, h: 1, fill: '#0c2a1e' },
    { x: 2, y: 9, w: 9, h: 1, fill: '#0c2a1e' },
    { x: 1, y: 10, w: 11, h: 1, fill: '#0c2a1e' },
    { x: 0, y: 11, w: 6, h: 1, fill: '#0c2a1e' }, { x: 6, y: 11, w: 1, h: 1, fill: '#39ff9d' }, { x: 7, y: 11, w: 6, h: 1, fill: '#0c2a1e' },
    { x: 0, y: 12, w: 6, h: 1, fill: '#0c2a1e' }, { x: 6, y: 12, w: 1, h: 1, fill: '#39ff9d' }, { x: 7, y: 12, w: 6, h: 1, fill: '#0c2a1e' },
    { x: 0, y: 13, w: 2, h: 1, fill: '#0c2a1e' }, { x: 3, y: 13, w: 3, h: 1, fill: '#0c2a1e' }, { x: 6, y: 13, w: 1, h: 1, fill: '#39ff9d' }, { x: 7, y: 13, w: 3, h: 1, fill: '#0c2a1e' }, { x: 11, y: 13, w: 2, h: 1, fill: '#0c2a1e' },
    { x: 3, y: 14, w: 7, h: 1, fill: '#0c2a1e' },
    { x: 3, y: 15, w: 2, h: 1, fill: '#22223a' }, { x: 8, y: 15, w: 2, h: 1, fill: '#22223a' },
    { x: 3, y: 16, w: 2, h: 1, fill: '#22223a' }, { x: 8, y: 16, w: 2, h: 1, fill: '#22223a' },
    { x: 2, y: 17, w: 3, h: 1, fill: '#111111' }, { x: 8, y: 17, w: 3, h: 1, fill: '#111111' },
  ],
  // FinX — neat slate hair, rimmed glasses, navy suit, sky-blue tie
  fin: [
    { x: 3, y: 0, w: 7, h: 1, fill: '#4a4a6a' },
    { x: 1, y: 1, w: 11, h: 1, fill: '#4a4a6a' },
    { x: 0, y: 2, w: 13, h: 1, fill: '#4a4a6a' },
    { x: 0, y: 3, w: 2, h: 1, fill: '#4a4a6a' }, { x: 2, y: 3, w: 9, h: 1, fill: '#ffd1a3' }, { x: 11, y: 3, w: 2, h: 1, fill: '#4a4a6a' },
    { x: 0, y: 4, w: 1, h: 1, fill: '#4a4a6a' }, { x: 1, y: 4, w: 2, h: 1, fill: '#ffd1a3' }, { x: 3, y: 4, w: 2, h: 1, fill: '#1a1a1a' }, { x: 5, y: 4, w: 3, h: 1, fill: '#ffd1a3' }, { x: 8, y: 4, w: 2, h: 1, fill: '#1a1a1a' }, { x: 10, y: 4, w: 2, h: 1, fill: '#ffd1a3' }, { x: 12, y: 4, w: 1, h: 1, fill: '#4a4a6a' },
    { x: 0, y: 5, w: 1, h: 1, fill: '#4a4a6a' }, { x: 1, y: 5, w: 2, h: 1, fill: '#ffd1a3' }, { x: 3, y: 5, w: 2, h: 1, fill: '#1a1a2e' }, { x: 5, y: 5, w: 3, h: 1, fill: '#ffd1a3' }, { x: 8, y: 5, w: 2, h: 1, fill: '#1a1a2e' }, { x: 10, y: 5, w: 2, h: 1, fill: '#ffd1a3' }, { x: 12, y: 5, w: 1, h: 1, fill: '#4a4a6a' },
    { x: 1, y: 6, w: 2, h: 1, fill: '#ffd1a3' }, { x: 3, y: 6, w: 2, h: 1, fill: '#1a1a1a' }, { x: 5, y: 6, w: 3, h: 1, fill: '#ffd1a3' }, { x: 8, y: 6, w: 2, h: 1, fill: '#1a1a1a' }, { x: 10, y: 6, w: 2, h: 1, fill: '#ffd1a3' },
    { x: 1, y: 7, w: 11, h: 1, fill: '#ffd1a3' },
    { x: 1, y: 8, w: 4, h: 1, fill: '#ffd1a3' }, { x: 5, y: 8, w: 3, h: 1, fill: '#c0785a' }, { x: 8, y: 8, w: 4, h: 1, fill: '#ffd1a3' },
    { x: 2, y: 9, w: 9, h: 1, fill: '#ffd1a3' },
    { x: 1, y: 10, w: 2, h: 1, fill: '#1a1a3e' }, { x: 3, y: 10, w: 7, h: 1, fill: '#f0f0f5' }, { x: 10, y: 10, w: 2, h: 1, fill: '#1a1a3e' },
    { x: 0, y: 11, w: 3, h: 1, fill: '#1a1a3e' }, { x: 3, y: 11, w: 7, h: 1, fill: '#f0f0f5' }, { x: 10, y: 11, w: 3, h: 1, fill: '#1a1a3e' },
    { x: 0, y: 12, w: 3, h: 1, fill: '#1a1a3e' }, { x: 3, y: 12, w: 2, h: 1, fill: '#f0f0f5' }, { x: 5, y: 12, w: 2, h: 1, fill: '#7f8cff' }, { x: 7, y: 12, w: 3, h: 1, fill: '#f0f0f5' }, { x: 10, y: 12, w: 3, h: 1, fill: '#1a1a3e' },
    { x: 0, y: 13, w: 2, h: 1, fill: '#1a1a3e' }, { x: 3, y: 13, w: 2, h: 1, fill: '#f0f0f5' }, { x: 5, y: 13, w: 2, h: 1, fill: '#7f8cff' }, { x: 7, y: 13, w: 3, h: 1, fill: '#f0f0f5' }, { x: 11, y: 13, w: 2, h: 1, fill: '#1a1a3e' },
    { x: 3, y: 14, w: 2, h: 1, fill: '#f0f0f5' }, { x: 5, y: 14, w: 2, h: 1, fill: '#7f8cff' }, { x: 7, y: 14, w: 3, h: 1, fill: '#f0f0f5' },
    { x: 3, y: 15, w: 2, h: 1, fill: '#111133' }, { x: 8, y: 15, w: 2, h: 1, fill: '#111133' },
    { x: 3, y: 16, w: 2, h: 1, fill: '#111133' }, { x: 8, y: 16, w: 2, h: 1, fill: '#111133' },
    { x: 2, y: 17, w: 3, h: 1, fill: '#111111' }, { x: 8, y: 17, w: 3, h: 1, fill: '#111111' },
  ],
  // M&SX — beret, headphone band, hot-pink jacket
  mkt: [
    { x: 3, y: 0, w: 7, h: 1, fill: '#8b3a62' },
    { x: 1, y: 1, w: 11, h: 1, fill: '#8b3a62' },
    { x: 0, y: 2, w: 13, h: 1, fill: '#333333' },
    { x: 0, y: 3, w: 2, h: 1, fill: '#333333' }, { x: 2, y: 3, w: 9, h: 1, fill: '#ffe0b2' }, { x: 11, y: 3, w: 2, h: 1, fill: '#333333' },
    { x: 0, y: 4, w: 1, h: 1, fill: '#333333' }, { x: 1, y: 4, w: 11, h: 1, fill: '#ffe0b2' }, { x: 12, y: 4, w: 1, h: 1, fill: '#333333' },
    { x: 0, y: 5, w: 1, h: 1, fill: '#333333' }, { x: 1, y: 5, w: 2, h: 1, fill: '#ffe0b2' }, { x: 3, y: 5, w: 2, h: 1, fill: '#1a1a2e' }, { x: 5, y: 5, w: 3, h: 1, fill: '#ffe0b2' }, { x: 8, y: 5, w: 2, h: 1, fill: '#1a1a2e' }, { x: 10, y: 5, w: 2, h: 1, fill: '#ffe0b2' }, { x: 12, y: 5, w: 1, h: 1, fill: '#333333' },
    { x: 1, y: 6, w: 2, h: 1, fill: '#ffe0b2' }, { x: 3, y: 6, w: 2, h: 1, fill: '#1a1a2e' }, { x: 5, y: 6, w: 3, h: 1, fill: '#ffe0b2' }, { x: 8, y: 6, w: 2, h: 1, fill: '#1a1a2e' }, { x: 10, y: 6, w: 2, h: 1, fill: '#ffe0b2' },
    { x: 1, y: 7, w: 11, h: 1, fill: '#ffe0b2' },
    { x: 1, y: 8, w: 4, h: 1, fill: '#ffe0b2' }, { x: 5, y: 8, w: 3, h: 1, fill: '#e8a090' }, { x: 8, y: 8, w: 4, h: 1, fill: '#ffe0b2' },
    { x: 2, y: 9, w: 9, h: 1, fill: '#ffe0b2' },
    { x: 1, y: 10, w: 2, h: 1, fill: '#ff6b9d' }, { x: 3, y: 10, w: 7, h: 1, fill: '#fff8fa' }, { x: 10, y: 10, w: 2, h: 1, fill: '#ff6b9d' },
    { x: 0, y: 11, w: 3, h: 1, fill: '#ff6b9d' }, { x: 3, y: 11, w: 7, h: 1, fill: '#fff8fa' }, { x: 10, y: 11, w: 3, h: 1, fill: '#ff6b9d' },
    { x: 0, y: 12, w: 3, h: 1, fill: '#ff6b9d' }, { x: 3, y: 12, w: 2, h: 1, fill: '#fff8fa' }, { x: 5, y: 12, w: 2, h: 1, fill: '#ffffff' }, { x: 7, y: 12, w: 3, h: 1, fill: '#fff8fa' }, { x: 10, y: 12, w: 3, h: 1, fill: '#ff6b9d' },
    { x: 0, y: 13, w: 2, h: 1, fill: '#ff6b9d' }, { x: 3, y: 13, w: 7, h: 1, fill: '#fff8fa' }, { x: 11, y: 13, w: 2, h: 1, fill: '#ff6b9d' },
    { x: 3, y: 14, w: 7, h: 1, fill: '#fff8fa' },
    { x: 3, y: 15, w: 2, h: 1, fill: '#333333' }, { x: 8, y: 15, w: 2, h: 1, fill: '#333333' },
    { x: 3, y: 16, w: 2, h: 1, fill: '#333333' }, { x: 8, y: 16, w: 2, h: 1, fill: '#333333' },
    { x: 2, y: 17, w: 3, h: 1, fill: '#111111' }, { x: 8, y: 17, w: 3, h: 1, fill: '#111111' },
  ],
  // AIX — silver hair, goggles pushed up onto the forehead, lab coat, cyan accent
  rnd: [
    { x: 3, y: 0, w: 7, h: 1, fill: '#aaaaaa' },
    { x: 1, y: 1, w: 11, h: 1, fill: '#aaaaaa' },
    { x: 0, y: 2, w: 13, h: 1, fill: '#aaaaaa' },
    { x: 0, y: 3, w: 2, h: 1, fill: '#aaaaaa' }, { x: 2, y: 3, w: 9, h: 1, fill: '#ffd1a3' }, { x: 11, y: 3, w: 2, h: 1, fill: '#aaaaaa' },
    { x: 0, y: 4, w: 1, h: 1, fill: '#aaaaaa' }, { x: 1, y: 4, w: 1, h: 1, fill: '#ffd1a3' }, { x: 2, y: 4, w: 1, h: 1, fill: '#666666' }, { x: 3, y: 4, w: 7, h: 1, fill: '#00cfff44' }, { x: 10, y: 4, w: 1, h: 1, fill: '#666666' }, { x: 11, y: 4, w: 1, h: 1, fill: '#ffd1a3' }, { x: 12, y: 4, w: 1, h: 1, fill: '#aaaaaa' },
    { x: 0, y: 5, w: 1, h: 1, fill: '#aaaaaa' }, { x: 1, y: 5, w: 2, h: 1, fill: '#ffd1a3' }, { x: 3, y: 5, w: 2, h: 1, fill: '#1a1a2e' }, { x: 5, y: 5, w: 3, h: 1, fill: '#ffd1a3' }, { x: 8, y: 5, w: 2, h: 1, fill: '#1a1a2e' }, { x: 10, y: 5, w: 2, h: 1, fill: '#ffd1a3' }, { x: 12, y: 5, w: 1, h: 1, fill: '#aaaaaa' },
    { x: 1, y: 6, w: 2, h: 1, fill: '#ffd1a3' }, { x: 3, y: 6, w: 2, h: 1, fill: '#1a1a2e' }, { x: 5, y: 6, w: 3, h: 1, fill: '#ffd1a3' }, { x: 8, y: 6, w: 2, h: 1, fill: '#1a1a2e' }, { x: 10, y: 6, w: 2, h: 1, fill: '#ffd1a3' },
    { x: 1, y: 7, w: 11, h: 1, fill: '#ffd1a3' },
    { x: 1, y: 8, w: 4, h: 1, fill: '#ffd1a3' }, { x: 5, y: 8, w: 3, h: 1, fill: '#c09070' }, { x: 8, y: 8, w: 4, h: 1, fill: '#ffd1a3' },
    { x: 2, y: 9, w: 9, h: 1, fill: '#ffd1a3' },
    { x: 1, y: 10, w: 11, h: 1, fill: '#dde0f0' },
    { x: 0, y: 11, w: 13, h: 1, fill: '#dde0f0' },
    { x: 0, y: 12, w: 5, h: 1, fill: '#dde0f0' }, { x: 5, y: 12, w: 2, h: 1, fill: '#00cfff' }, { x: 7, y: 12, w: 6, h: 1, fill: '#dde0f0' },
    { x: 1, y: 13, w: 11, h: 1, fill: '#dde0f0' },
    { x: 3, y: 14, w: 7, h: 1, fill: '#dde0f0' },
    { x: 3, y: 15, w: 2, h: 1, fill: '#444444' }, { x: 8, y: 15, w: 2, h: 1, fill: '#444444' },
    { x: 3, y: 16, w: 2, h: 1, fill: '#444444' }, { x: 8, y: 16, w: 2, h: 1, fill: '#444444' },
    { x: 2, y: 17, w: 3, h: 1, fill: '#111111' }, { x: 8, y: 17, w: 3, h: 1, fill: '#111111' },
  ],
  // OperX — headset arc + mic boom, orange vest over dark shirt, wrench holster, boots
  ops: [
    { x: 3, y: 0, w: 7, h: 1, fill: '#33261a' },
    { x: 1, y: 1, w: 11, h: 1, fill: '#33261a' },
    { x: 0, y: 2, w: 13, h: 1, fill: '#333333' },
    { x: 0, y: 3, w: 2, h: 1, fill: '#333333' }, { x: 2, y: 3, w: 9, h: 1, fill: '#ffe0b2' }, { x: 11, y: 3, w: 2, h: 1, fill: '#333333' },
    { x: 0, y: 4, w: 1, h: 1, fill: '#333333' }, { x: 1, y: 4, w: 11, h: 1, fill: '#ffe0b2' }, { x: 12, y: 4, w: 1, h: 1, fill: '#333333' },
    { x: 0, y: 5, w: 1, h: 1, fill: '#333333' }, { x: 1, y: 5, w: 2, h: 1, fill: '#ffe0b2' }, { x: 3, y: 5, w: 2, h: 1, fill: '#1a1a2e' }, { x: 5, y: 5, w: 3, h: 1, fill: '#ffe0b2' }, { x: 8, y: 5, w: 2, h: 1, fill: '#1a1a2e' }, { x: 10, y: 5, w: 2, h: 1, fill: '#ffe0b2' }, { x: 12, y: 5, w: 1, h: 1, fill: '#333333' },
    { x: 1, y: 6, w: 2, h: 1, fill: '#ffe0b2' }, { x: 3, y: 6, w: 2, h: 1, fill: '#1a1a2e' }, { x: 5, y: 6, w: 3, h: 1, fill: '#ffe0b2' }, { x: 8, y: 6, w: 2, h: 1, fill: '#1a1a2e' }, { x: 10, y: 6, w: 2, h: 1, fill: '#ffe0b2' },
    { x: 1, y: 7, w: 8, h: 1, fill: '#ffe0b2' }, { x: 9, y: 7, w: 1, h: 1, fill: '#222222' }, { x: 10, y: 7, w: 2, h: 1, fill: '#ffe0b2' },
    { x: 1, y: 8, w: 4, h: 1, fill: '#ffe0b2' }, { x: 5, y: 8, w: 3, h: 1, fill: '#c0785a' }, { x: 8, y: 8, w: 4, h: 1, fill: '#ffe0b2' },
    { x: 2, y: 9, w: 9, h: 1, fill: '#ffe0b2' },
    { x: 1, y: 10, w: 2, h: 1, fill: '#ff9a3c' }, { x: 3, y: 10, w: 7, h: 1, fill: '#333333' }, { x: 10, y: 10, w: 2, h: 1, fill: '#ff9a3c' },
    { x: 0, y: 11, w: 3, h: 1, fill: '#ff9a3c' }, { x: 3, y: 11, w: 7, h: 1, fill: '#333333' }, { x: 10, y: 11, w: 3, h: 1, fill: '#ff9a3c' },
    { x: 0, y: 12, w: 3, h: 1, fill: '#ff9a3c' }, { x: 3, y: 12, w: 7, h: 1, fill: '#333333' }, { x: 10, y: 12, w: 3, h: 1, fill: '#ff9a3c' },
    { x: 0, y: 13, w: 1, h: 1, fill: '#ff9a3c' }, { x: 1, y: 13, w: 1, h: 1, fill: '#7a4a21' }, { x: 3, y: 13, w: 7, h: 1, fill: '#333333' }, { x: 11, y: 13, w: 2, h: 1, fill: '#ff9a3c' },
    { x: 3, y: 14, w: 7, h: 1, fill: '#333333' },
    { x: 3, y: 15, w: 2, h: 1, fill: '#222222' }, { x: 8, y: 15, w: 2, h: 1, fill: '#222222' },
    { x: 3, y: 16, w: 2, h: 1, fill: '#222222' }, { x: 8, y: 16, w: 2, h: 1, fill: '#222222' },
    { x: 2, y: 17, w: 3, h: 1, fill: '#5a3010' }, { x: 8, y: 17, w: 3, h: 1, fill: '#5a3010' },
  ],
};

export const SPRITE_WIDTH = 42;
export const SPRITE_HEIGHT = 54;
export const SPRITE_VIEWBOX_W = 14;
export const SPRITE_VIEWBOX_H = 18;

export type SpriteMap = Partial<Record<DeptId, HTMLImageElement>>;

/** Get raw rect data — used by React components to render <svg><rect/>...</svg>. */
export function spriteRects(id: DeptId): PixelRect[] {
  return SPRITE_DATA[id];
}

/** Serialize a dept's rects to an SVG string. Not used as innerHTML. */
export function spriteSvg(id: DeptId): string {
  const inner = SPRITE_DATA[id].map(r =>
    `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${r.fill}"/>`
  ).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SPRITE_WIDTH}" height="${SPRITE_HEIGHT}" viewBox="0 0 ${SPRITE_VIEWBOX_W} ${SPRITE_VIEWBOX_H}">${inner}</svg>`;
}

/** Loads all 6 sprites as HTMLImageElement (for canvas drawImage). */
export function loadSprites(): Promise<SpriteMap> {
  const ids = Object.keys(SPRITE_DATA) as DeptId[];
  return Promise.all(
    ids.map(id => new Promise<[DeptId, HTMLImageElement]>(res => {
      const img = new Image();
      const svg = spriteSvg(id);
      img.onload  = () => res([id, img]);
      img.onerror = () => res([id, img]);
      img.src = 'data:image/svg+xml,' + encodeURIComponent(svg);
    }))
  ).then(entries => Object.fromEntries(entries) as SpriteMap);
}
