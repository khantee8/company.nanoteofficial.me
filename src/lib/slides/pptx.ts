import PptxGenJS from 'pptxgenjs';
import type { Deck, Slide } from './deck';

const THEME_COLORS: Record<string, { bg: string; fg: string; accent: string }> = {
  midnight: { bg: '0B0E14', fg: 'EEF1F6', accent: '5CC8FF' },
  editorial: { bg: 'F7F6F2', fg: '17140F', accent: 'C8452D' },
  grid: { bg: '111111', fg: 'FFFFFF', accent: 'E8FF00' },
};

export function countPptxSlides(deck: Deck): number { return deck.slides.length; }

function addSlide(pptx: PptxGenJS, s: Slide, c: { bg: string; fg: string; accent: string }) {
  const slide = pptx.addSlide();
  slide.background = { color: c.bg };
  const body = (text: string, y: number, opts: object = {}) => slide.addText(text, { x: 0.6, y, w: 9, color: c.fg, fontSize: 18, ...opts });
  switch (s.layout) {
    case 'title': body(s.title, 2.2, { fontSize: 40, bold: true }); if (s.subtitle) body(s.subtitle, 3.4, { color: c.accent }); break;
    case 'section': body(s.kicker ?? '', 2.0, { color: c.accent, fontSize: 12 }); body(s.title, 2.6, { fontSize: 34, bold: true }); break;
    case 'agenda': body(s.heading, 0.6, { color: c.accent, fontSize: 12 }); slide.addText(s.items.map((t) => ({ text: t, options: { bullet: true } })), { x: 0.6, y: 1.4, w: 9, color: c.fg, fontSize: 18 }); break;
    case 'bulletsVisual': body(s.heading, 0.6, { fontSize: 26, bold: true }); slide.addText(s.bullets.map((t) => ({ text: t, options: { bullet: true } })), { x: 0.6, y: 1.6, w: 9, color: c.fg, fontSize: 18 }); if (s.note) body(s.note, 4.6, { fontSize: 12 }); break;
    case 'quote': body(`"${s.quote}"`, 2.0, { fontSize: 28, italic: true }); if (s.attribution) body(s.attribution, 3.6, { color: c.accent }); break;
    case 'data': body(s.heading, 0.8, { color: c.accent, fontSize: 12 }); body(s.stat, 1.6, { fontSize: 72, bold: true, color: c.accent }); if (s.caption) body(s.caption, 3.8); break;
    case 'comparison': body(s.heading, 0.6, { fontSize: 24, bold: true }); slide.addText(s.left.title, { x: 0.6, y: 1.3, w: 4.2, color: c.accent, fontSize: 16, bold: true }); slide.addText(s.right.title, { x: 5.2, y: 1.3, w: 4.2, color: c.accent, fontSize: 16, bold: true }); slide.addText(s.left.points.map((t) => ({ text: t, options: { bullet: true } })), { x: 0.6, y: 1.9, w: 4.2, color: c.fg }); slide.addText(s.right.points.map((t) => ({ text: t, options: { bullet: true } })), { x: 5.2, y: 1.9, w: 4.2, color: c.fg }); break;
    case 'closing': body(s.title, 2.4, { fontSize: 36, bold: true }); if (s.cta) body(s.cta, 3.8, { color: c.accent }); break;
  }
}

export async function deckToPptx(deck: Deck): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'W', width: 10, height: 5.63 });
  pptx.layout = 'W';
  const c = THEME_COLORS[deck.theme] ?? THEME_COLORS.midnight;
  for (const s of deck.slides) addSlide(pptx, s, c);
  return (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
}
