// src/lib/agents/sprites.ts
import type { DeptId } from '../data/departments';

/** One pixel-art rectangle on a 9-wide grid. */
export interface PixelRect {
  x: number; y: number; w: number; h: number; fill: string;
}

/** Sprite data per dept — typed structured data, no HTML strings. */
const SPRITE_DATA: Record<DeptId, PixelRect[]> = {
  ceo: [
    { x: 2, y: 0, w: 1, h: 1, fill: '#ffdd57' }, { x: 4, y: 0, w: 1, h: 1, fill: '#ffdd57' }, { x: 6, y: 0, w: 1, h: 1, fill: '#ffdd57' },
    { x: 1, y: 1, w: 7, h: 1, fill: '#ffaa00' },
    { x: 1, y: 2, w: 7, h: 3, fill: '#f5c5a3' }, { x: 2, y: 3, w: 1, h: 1, fill: '#222' }, { x: 6, y: 3, w: 1, h: 1, fill: '#222' }, { x: 3, y: 4, w: 3, h: 1, fill: '#c0785a' },
    { x: 1, y: 5, w: 7, h: 4, fill: '#1a1a3e' }, { x: 4, y: 5, w: 1, h: 4, fill: '#7f8cff' },
    { x: 0, y: 5, w: 1, h: 3, fill: '#1a1a3e' }, { x: 8, y: 5, w: 1, h: 3, fill: '#1a1a3e' },
    { x: 0, y: 8, w: 1, h: 1, fill: '#f5c5a3' }, { x: 8, y: 8, w: 1, h: 1, fill: '#f5c5a3' },
    { x: 2, y: 9, w: 2, h: 2, fill: '#0d0d2e' }, { x: 5, y: 9, w: 2, h: 2, fill: '#0d0d2e' },
    { x: 1, y: 10, w: 3, h: 1, fill: '#111' }, { x: 5, y: 10, w: 3, h: 1, fill: '#111' },
  ],
  cyb: [
    { x: 1, y: 0, w: 7, h: 2, fill: '#0c2a1e' },
    { x: 0, y: 1, w: 1, h: 4, fill: '#0c2a1e' }, { x: 8, y: 1, w: 1, h: 4, fill: '#0c2a1e' },
    { x: 1, y: 2, w: 7, h: 3, fill: '#f5c5a3' },
    { x: 1, y: 3, w: 7, h: 1, fill: '#39ff9d' },
    { x: 2, y: 3, w: 1, h: 1, fill: '#063b26' }, { x: 6, y: 3, w: 1, h: 1, fill: '#063b26' },
    { x: 3, y: 4, w: 3, h: 1, fill: '#c0785a' },
    { x: 1, y: 5, w: 7, h: 4, fill: '#0c2a1e' }, { x: 0, y: 5, w: 1, h: 3, fill: '#0c2a1e' }, { x: 8, y: 5, w: 1, h: 3, fill: '#0c2a1e' },
    { x: 4, y: 5, w: 1, h: 4, fill: '#39ff9d' }, { x: 3, y: 6, w: 3, h: 1, fill: '#1f8f5b' },
    { x: 0, y: 8, w: 1, h: 1, fill: '#f5c5a3' }, { x: 8, y: 8, w: 1, h: 1, fill: '#f5c5a3' },
    { x: 2, y: 9, w: 2, h: 2, fill: '#06140e' }, { x: 5, y: 9, w: 2, h: 2, fill: '#06140e' },
    { x: 1, y: 10, w: 3, h: 1, fill: '#020806' }, { x: 5, y: 10, w: 3, h: 1, fill: '#020806' },
  ],
  mkt: [
    { x: 1, y: 0, w: 7, h: 2, fill: '#ff6b9d' },
    { x: 0, y: 2, w: 1, h: 3, fill: '#555' }, { x: 8, y: 2, w: 1, h: 3, fill: '#555' }, { x: 0, y: 3, w: 1, h: 1, fill: '#ff6b9d' },
    { x: 1, y: 2, w: 7, h: 3, fill: '#ffd1a3' }, { x: 2, y: 3, w: 1, h: 1, fill: '#222' }, { x: 6, y: 3, w: 1, h: 1, fill: '#222' }, { x: 3, y: 4, w: 3, h: 1, fill: '#e8a090' },
    { x: 1, y: 5, w: 7, h: 4, fill: '#ff6b9d' }, { x: 0, y: 5, w: 1, h: 3, fill: '#ff6b9d' }, { x: 8, y: 5, w: 1, h: 3, fill: '#ff6b9d' },
    { x: 4, y: 6, w: 1, h: 2, fill: '#fff' }, { x: 3, y: 7, w: 3, h: 1, fill: '#fff' },
    { x: 0, y: 8, w: 1, h: 1, fill: '#ffd1a3' }, { x: 8, y: 8, w: 1, h: 1, fill: '#ffd1a3' },
    { x: 2, y: 9, w: 2, h: 2, fill: '#333' }, { x: 5, y: 9, w: 2, h: 2, fill: '#333' },
    { x: 1, y: 10, w: 3, h: 1, fill: '#222' }, { x: 5, y: 10, w: 3, h: 1, fill: '#222' },
  ],
  rnd: [
    { x: 1, y: 0, w: 7, h: 2, fill: '#aaa' },
    { x: 0, y: 2, w: 9, h: 1, fill: '#555' },
    { x: 1, y: 2, w: 7, h: 3, fill: '#ffe0b2' },
    { x: 1, y: 3, w: 3, h: 1, fill: '#00cfff44' }, { x: 5, y: 3, w: 3, h: 1, fill: '#00cfff44' }, { x: 4, y: 3, w: 1, h: 1, fill: '#666' },
    { x: 2, y: 3, w: 1, h: 1, fill: '#222' }, { x: 6, y: 3, w: 1, h: 1, fill: '#222' }, { x: 3, y: 4, w: 3, h: 1, fill: '#c09070' },
    { x: 1, y: 5, w: 7, h: 4, fill: '#dde0f0' }, { x: 0, y: 5, w: 1, h: 3, fill: '#dde0f0' }, { x: 8, y: 5, w: 1, h: 3, fill: '#dde0f0' },
    { x: 2, y: 6, w: 2, h: 2, fill: '#00cfff' },
    { x: 0, y: 8, w: 1, h: 1, fill: '#ffe0b2' }, { x: 8, y: 8, w: 1, h: 1, fill: '#ffe0b2' },
    { x: 2, y: 9, w: 2, h: 2, fill: '#444' }, { x: 5, y: 9, w: 2, h: 2, fill: '#444' },
    { x: 1, y: 10, w: 3, h: 1, fill: '#222' }, { x: 5, y: 10, w: 3, h: 1, fill: '#222' },
  ],
  ops: [
    { x: 1, y: 0, w: 7, h: 1, fill: '#ff9a3c' }, { x: 0, y: 1, w: 9, h: 1, fill: '#ffaa00' },
    { x: 1, y: 2, w: 7, h: 3, fill: '#f5c5a3' }, { x: 2, y: 3, w: 1, h: 1, fill: '#222' }, { x: 6, y: 3, w: 1, h: 1, fill: '#222' }, { x: 3, y: 4, w: 3, h: 1, fill: '#c0785a' },
    { x: 1, y: 5, w: 7, h: 4, fill: '#ff9a3c' }, { x: 0, y: 5, w: 1, h: 3, fill: '#ff9a3c' }, { x: 8, y: 5, w: 1, h: 3, fill: '#ff9a3c' },
    { x: 1, y: 8, w: 7, h: 1, fill: '#5a3010' },
    { x: 0, y: 8, w: 1, h: 1, fill: '#f5c5a3' }, { x: 8, y: 8, w: 1, h: 1, fill: '#f5c5a3' },
    { x: 2, y: 9, w: 2, h: 2, fill: '#e8890a' }, { x: 5, y: 9, w: 2, h: 2, fill: '#e8890a' },
    { x: 1, y: 10, w: 3, h: 1, fill: '#333' }, { x: 5, y: 10, w: 3, h: 1, fill: '#333' },
  ],
  fin: [
    { x: 2, y: 0, w: 5, h: 2, fill: '#4a4a6a' },
    { x: 1, y: 2, w: 7, h: 3, fill: '#f5c5a3' }, { x: 2, y: 3, w: 1, h: 1, fill: '#222' }, { x: 6, y: 3, w: 1, h: 1, fill: '#222' }, { x: 3, y: 4, w: 3, h: 1, fill: '#c0785a' },
    { x: 1, y: 5, w: 7, h: 4, fill: '#2a2a5e' }, { x: 0, y: 5, w: 1, h: 3, fill: '#2a2a5e' }, { x: 8, y: 5, w: 1, h: 3, fill: '#2a2a5e' },
    { x: 4, y: 5, w: 1, h: 4, fill: '#7f8cff' }, { x: 3, y: 6, w: 3, h: 1, fill: '#7f8cff' }, { x: 3, y: 7, w: 3, h: 1, fill: '#7f8cff' },
    { x: 0, y: 8, w: 1, h: 1, fill: '#f5c5a3' }, { x: 8, y: 8, w: 1, h: 1, fill: '#f5c5a3' },
    { x: 2, y: 9, w: 2, h: 2, fill: '#1a1a3e' }, { x: 5, y: 9, w: 2, h: 2, fill: '#1a1a3e' },
    { x: 1, y: 10, w: 3, h: 1, fill: '#111' }, { x: 5, y: 10, w: 3, h: 1, fill: '#111' },
  ],
};

export const SPRITE_WIDTH = 36;
export const SPRITE_HEIGHT = 44;
export const SPRITE_VIEWBOX_W = 9;
export const SPRITE_VIEWBOX_H = 11;

export type SpriteMap = Partial<Record<DeptId, HTMLImageElement>>;

/** Get raw rect data — used by React components to render <svg><rect/>...</svg>. */
export function getSpriteRects(id: DeptId): PixelRect[] {
  return SPRITE_DATA[id];
}

/** Serialize rects to SVG string — used internally for Image loading. Not exported as innerHTML. */
function rectsToSvgString(rects: PixelRect[]): string {
  const inner = rects.map(r =>
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
      const svg = rectsToSvgString(SPRITE_DATA[id]);
      img.onload  = () => res([id, img]);
      img.onerror = () => res([id, img]);
      img.src = 'data:image/svg+xml,' + encodeURIComponent(svg);
    }))
  ).then(entries => Object.fromEntries(entries) as SpriteMap);
}
