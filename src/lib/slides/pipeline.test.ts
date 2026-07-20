import { describe, it, expect } from 'vitest';
import { generateDeck, estimateCost } from './pipeline';

const cleanDeck = { theme: 'midnight', slides: [
  { layout: 'title', title: 'Acme Q3 Growth' },
  { layout: 'data', heading: 'Churn', stat: '8%', caption: 'up from 6%' },
] };

function fakeComplete(seq: string[]) {
  let i = 0;
  return async () => ({ text: seq[Math.min(i++, seq.length - 1)], stopReason: 'end_turn', usage: { input: 100, output: 200 }, model: 'claude-sonnet-5' });
}

describe('generateDeck', () => {
  it('runs outline→draft→lint→critic and returns a valid deck + trace', async () => {
    const complete = fakeComplete([
      '1. title\n2. data',                       // outline
      JSON.stringify(cleanDeck),                  // draft (clean → lint passes)
      JSON.stringify(cleanDeck),                  // critic (unused if no issues, but safe)
    ]);
    const steps: string[] = [];
    const r = await generateDeck(
      { theme: 'midnight', slideCount: 2, audience: 'board', brief: 'Churn 8%. Acme.' },
      complete as never,
      (n) => steps.push(n.step),
    );
    expect(r.deck.slides.length).toBe(2);
    expect(r.meta.trace.map((t) => t.step)).toContain('lint');
    expect(steps).toContain('outline');
    expect(r.meta.costUsd).toBeGreaterThan(0);
  });

  it('throws a clear error on unparseable draft', async () => {
    const complete = fakeComplete(['outline', 'not json', 'still not json']);
    await expect(generateDeck({ theme: 'grid', slideCount: 1, audience: '', brief: 'x' }, complete as never))
      .rejects.toThrow();
  });

  it('keeps the draft deck when the critic step fails to parse', async () => {
    const lintableDeck = { theme: 'midnight', slides: [
      { layout: 'title', title: 'Acme Q3 Growth' },
      { layout: 'data', heading: 'Churn', stat: '8%', caption: 'leverage synergies' }, // triggers filler-phrase lint
    ] };
    const complete = fakeComplete([
      '1. title\n2. data',            // outline
      JSON.stringify(lintableDeck),   // draft (has a lintable filler phrase → critic runs)
      'not json',                     // critic (fails to parse)
    ]);
    const r = await generateDeck(
      { theme: 'midnight', slideCount: 2, audience: 'board', brief: 'Churn 8%. Acme.' },
      complete as never,
    );
    expect(r.deck.slides.length).toBe(2);
    expect((r.deck.slides[1] as { heading: string }).heading).toBe('Churn');
    expect(r.meta.lintFixed).toBe(0);
    expect(r.meta.trace.some((t) => t.step === 'critic' && t.note.includes('Critic revision failed — kept draft deck'))).toBe(true);
  });

  it('estimateCost scales with slide count', () => {
    expect(estimateCost(10)).toBeGreaterThan(estimateCost(4));
  });

  it('reports max_tokens truncation on unparseable draft', async () => {
    let i = 0;
    const complete = async () => ({
      text: i++ === 0 ? 'outline' : '{"theme":"grid","slides":[{"layout":"title","title":"Acme',
      stopReason: i <= 1 ? 'end_turn' : 'max_tokens',
      usage: { input: 10, output: 20 }, model: 'claude-sonnet-5',
    });
    await expect(generateDeck({ theme: 'grid', slideCount: 1, audience: '', brief: 'x' }, complete as never))
      .rejects.toThrow(/output hit max_tokens/);
  });
});
