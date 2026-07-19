import type { Deck, ThemeId } from './deck';

const SCHEMA_DOC = `Return ONLY JSON: {"theme": "<theme>", "slides": Slide[]}.
Slide layouts (pick the RIGHT one per idea; vary them, never 3 of the same in a row):
- {"layout":"title","title":"...","subtitle":"..."}
- {"layout":"agenda","heading":"...","items":["..."]}
- {"layout":"section","title":"...","kicker":"..."}
- {"layout":"bulletsVisual","heading":"...","bullets":["..."],"note":"..."}  (max 5 bullets)
- {"layout":"quote","quote":"...","attribution":"..."}
- {"layout":"data","heading":"...","stat":"42%","caption":"..."}
- {"layout":"comparison","heading":"...","left":{"title":"...","points":["..."]},"right":{"title":"...","points":["..."]}}
- {"layout":"closing","title":"...","cta":"..."}`;

const VOICE = `Write like a sharp human operator, NOT an AI. Rules:
- Every content slide cites a specific number or proper noun FROM THE BRIEF. No vague claims.
- Ban filler: "fast-paced world", "leverage synergies", "game-changer", "it's not just X it's Y", "move the needle".
- Short, declarative. No triads-for-the-sake-of-it. No emoji. Vary sentence and slide shape.`;

export function outlinePrompt(p: { brief: string; audience: string; slideCount: number; extra?: string }) {
  return {
    system: `You are a presentation strategist. Output a numbered narrative arc (problem → insight → evidence → ask) for a ${p.slideCount}-slide deck. ${VOICE}`,
    prompt: `Audience: ${p.audience || 'executives'}\n\nPLAN BRIEF:\n${p.brief}\n${p.extra ? `\nEXTRA CONTEXT:\n${p.extra}` : ''}\n\nGive ${p.slideCount} one-line slide beats. No slide JSON yet.`,
  };
}

export function draftPrompt(p: { brief: string; theme: ThemeId; outline: string }) {
  return {
    system: `You turn an outline into a slide deck JSON. ${VOICE}\n\n${SCHEMA_DOC}`,
    prompt: `Theme: "${p.theme}".\n\nOUTLINE:\n${p.outline}\n\nBRIEF (source of all facts):\n${p.brief}\n\nReturn the deck JSON now.`,
  };
}

export function criticPrompt(p: { deck: Deck; brief: string; issues: string }) {
  return {
    system: `You are a ruthless deck editor. Fix ONLY the flagged slides so they read as human-made and specific. Keep unflagged slides byte-identical. ${VOICE}\n\n${SCHEMA_DOC}`,
    prompt: `BRIEF:\n${p.brief}\n\nFLAGGED ISSUES:\n${p.issues}\n\nCURRENT DECK JSON:\n${JSON.stringify(p.deck)}\n\nReturn the FULL corrected deck JSON.`,
  };
}

export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : text).trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  return JSON.parse(start >= 0 && end > start ? raw.slice(start, end + 1) : raw);
}
