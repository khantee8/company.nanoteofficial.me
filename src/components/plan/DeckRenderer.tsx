import type { Deck, Slide } from '@/lib/slides/deck';
import './deck-themes.css';

function SlideView({ slide, theme }: { slide: Slide; theme: string }) {
  const frame = (children: React.ReactNode) => <div className="slide" data-theme={theme}>{children}</div>;
  switch (slide.layout) {
    case 'title': return frame(<><div /><div><div className="slide-title">{slide.title}</div>{slide.subtitle && <p style={{ opacity: 0.7, marginTop: 12 }}>{slide.subtitle}</p>}</div><div /></>);
    case 'section': return frame(<><span className="slide-kicker">{slide.kicker}</span><div className="slide-title">{slide.title}</div><div /></>);
    case 'agenda': return frame(<><span className="slide-kicker">{slide.heading}</span><ul>{slide.items.map((x, i) => <li key={i}>{x}</li>)}</ul><div /></>);
    case 'bulletsVisual': return frame(<><h2 className="slide-title" style={{ fontSize: 32 }}>{slide.heading}</h2><ul>{slide.bullets.map((x, i) => <li key={i}>{x}</li>)}</ul>{slide.note && <p style={{ opacity: 0.6 }}>{slide.note}</p>}</>);
    case 'quote': return frame(<><div /><blockquote style={{ fontSize: 30, fontWeight: 600 }}>&ldquo;{slide.quote}&rdquo;</blockquote><cite style={{ opacity: 0.6 }}>{slide.attribution}</cite></>);
    case 'data': return frame(<><span className="slide-kicker">{slide.heading}</span><div className="slide-stat">{slide.stat}</div><p style={{ opacity: 0.7 }}>{slide.caption}</p></>);
    case 'comparison': return frame(<><h2 className="slide-title" style={{ fontSize: 30 }}>{slide.heading}</h2><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>{[slide.left, slide.right].map((c, i) => <div key={i}><h3 style={{ color: 'var(--accent)' }}>{c.title}</h3><ul>{c.points.map((p, j) => <li key={j}>{p}</li>)}</ul></div>)}</div><div /></>);
    case 'closing': return frame(<><div /><div className="slide-title">{slide.title}</div><p style={{ color: 'var(--accent)' }}>{slide.cta}</p></>);
  }
}

export function DeckRenderer({ deck }: { deck: Deck }) {
  return <div style={{ display: 'grid', gap: 16 }}>{deck.slides.map((s, i) => <SlideView key={i} slide={s} theme={deck.theme} />)}</div>;
}
