# v1.4.3 — Reading-Optimized UI/UX Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every text surface readable — keep the office animation untouched, fix the dashboard + per-agent pages where content is too small, too low-contrast, or clipped off-screen.

**Architecture:** A small set of global CSS/typography fixes removes the root causes (monospace body, 11px gray narrative, clipped scroll regions, 260px chart boxes). The isometric office (`/`) is explicitly out of scope and stays animated. Reference systems: Linear (chrome + type scale), Stripe Dashboard (reading column + line-height), Vercel/Geist (KPI cards, mono for numbers only), GitHub Primer (long-form `/doc`, already themed).

**Tech Stack:** Next.js 16, React 19, Tailwind v4, hand-rolled CSS in `src/app/globals.css`, `Markdown.tsx` (inline-styled), `next/font` (Inter + JetBrains/Fira for tabular numbers).

---

## Root-Cause Audit (grounded in current code)

| # | Symptom (user-reported) | Root cause | File |
|---|---|---|---|
| 1 | "can't read" the agent analysis | Narrative body is **11px `#bbb`** on dark glass; headings 11–13px | `src/components/Markdown.tsx:11,17-22` |
| 2 | Whole site feels off / hard to read | Body is **`'Courier New', monospace` `#ccc`**; only `.exec` overrides to system-ui — `/admin`, `/doc`, terminal inherit mono | `globals.css:8` |
| 3 | "loses some content" | Body `overflow:hidden; height:100vh`; scroll panes use `calc(100vh - 44px)` but **do not subtract the 44px agent sub-nav** on `/dashboard/*` → bottom rows clipped | `globals.css:9,182-187,198-199` |
| 4 | Charts cramped / cut off on cards | `.exec-artifact { max-height:260px; overflow-y:auto }` squeezes every card chart into a 260px scroll box | `globals.css:254-259` |
| 5 | Labels/tags unreadable | Pervasive sub-12px low-contrast text: KPI label 10px, tag **9px**, meta `#6a6c93`/`#7a7ca6` (< 4.5:1) | `globals.css:237,289,298,285` etc. |
| 6 | Long lines tire the eye | Narrative renders full-width inside `max-width:1080px` glass — no reading measure (~70ch) | `AgentDetail.tsx:129-132` |

**Out of scope (keep as-is):** the isometric office canvas and its `bob` / `dp` / `glow` animations (`globals.css:17-30`, `OfficeCanvas.tsx`). Office tab keeps its animated theme — we only ensure the terminal feed text is ≥12px.

---

## Tab-by-Tab Recommendations

### 1. Office (`/`) — keep the animation, light touch only
- **Do not change** the canvas, sprites, mezzanine, or keyframes. The playful animated office is the brand hero.
- Only fix: `TerminalFeed` / `DepartmentSidebar` text to ≥12px with ≥4.5:1 contrast (the one reading surface on this tab).
- Reference: treat `/` like Linear's marketing hero — motion is the identity; text is supporting.

### 2. `/dashboard` (executive overview)
- Promote body font to **Inter** site-wide (not just `.exec`); keep numbers/KPIs in a tabular mono (Fira Code / JetBrains Mono) so figures align (`number-tabular`).
- KPI value stays large; raise KPI **label 11→12px** and muted text from `#9a9bc4`/`#7a7ca6` to ≥`#a9abce` for AA.
- Remove the **260px clamp** on card artifacts (or raise to ~340px) so the first chart isn't scroll-trapped.
- Company Pulse rows: bump 12px→13px, raise `#7a7ca6` date contrast.
- Reference: **Vercel/Geist** KPI cards + **Stripe Dashboard** scannable rows.

### 3. `/dashboard/[dept]` (per-agent — the worst offender)
- **Narrative is the product.** In `Markdown.tsx`: body **11→15px**, color `#bbb→#dfe0f2`, line-height 1.6→**1.7**; `##`→17px, `#`→19px, `###`→14px; list items 11→14px.
- Constrain the narrative section to a **reading measure ≈ 68–72ch** (centered) instead of full 1080px width (`line-length`).
- Fix the **clipped-content** bug: scroll height must subtract the sub-nav (`calc(100dvh - 44px - 41px)`), and switch `100vh→100dvh` for mobile.
- Agent KPIs: value 18px ok; label 10→12px. Tags **9→11px**. Sources/related links 12→13px.
- Highlight blockquote: 14→16px (it's the lead sentence).
- Reference: **Stripe/Notion** long-form reading column; **GitHub Primer** for the analysis body.

### 4. `/doc` (operator guide)
- Already GitHub-Docs themed (good). Just ensure it inherits the new Inter body, not Courier, and body ≥16px (it's pure reading).

### 5. `/admin`
- Lowest priority, but it currently inherits monospace `#ccc`. After the global font fix it improves for free; verify form labels ≥14px and inputs ≥16px (avoids iOS zoom, `readable-font-size`).

### Famous-site reference map (for "professional website")
| Surface | Adapt from | What to borrow |
|---|---|---|
| Dashboard chrome, nav, spacing, type scale | **Linear** | Calm dark surfaces, restrained accent, 4/8px rhythm |
| KPI cards, data density | **Vercel / Geist** | Card structure, mono **only** for numbers |
| Reading column + line-height | **Stripe Dashboard / Notion** | 68–72ch measure, 1.7 leading, generous whitespace |
| Long-form `/doc` | **GitHub Primer** | Already in use — keep |
| Data-dense agent cards | **Datadog / Grafana** | Legends, tooltips, status color + icon (not color alone) |

---

## File Structure

- `src/app/layout.tsx` — add `next/font` (Inter + mono), expose as CSS vars on `<body>`.
- `src/app/globals.css` — body font/color/overflow, scroll-height fix, KPI/tag/meta contrast + sizes, drop 260px clamp, narrative reading-measure class.
- `src/components/Markdown.tsx` — the narrative type scale (the highest-impact single file).
- `src/components/AgentDetail.tsx` — wrap narrative in the reading-measure class; bump inline label sizes.

---

## Task 1: Adopt a readable body font (kills the monospace default)

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css:3-11`

- [ ] **Step 1: Load fonts via next/font in `layout.tsx`**

```tsx
import { Inter, JetBrains_Mono } from 'next/font/google';

const sans = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });
// add `${sans.variable} ${mono.variable}` to the <body> className (keep existing classes)
```

- [ ] **Step 2: Switch the body default in `globals.css`**

```css
html, body {
  margin: 0;
  padding: 0;
  background: #060610;
  color: #d7d8ea;                       /* was #ccc — lift contrast */
  font-family: var(--font-sans), system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  overflow: hidden;
  height: 100dvh;                        /* was 100vh */
}
```

- [ ] **Step 3: Verify** — `npm run dev`, open `/admin` and `/doc`: text is sans-serif, not Courier. Run `npm run build` (font fetch must succeed).
- [ ] **Step 4: Commit** — `git commit -am "fix(ui): readable sans body font, lift base contrast"`

## Task 2: Fix clipped content on `/dashboard/*` (sub-nav height)

**Files:** Modify `src/app/globals.css` (`.exec`, `.dash`, `.agent-detail` wrapper / scroll parent)

- [ ] **Step 1:** Make the dashboard scroll regions subtract BOTH the 44px nav and the 41px agent sub-nav, and use `dvh`:

```css
.exec { height: calc(100dvh - 44px); overflow-y: auto; /* …rest unchanged… */ }
/* per-agent route also carries the sub-nav; ensure its scroll parent uses: */
/*   height: calc(100dvh - 44px - 41px)  where the sub-nav is present     */
```

- [ ] **Step 2: Verify** — on `/dashboard/finance`, scroll to the export buttons row; it must be fully visible above the fold of the scroll container (not cut). Check 375px height too.
- [ ] **Step 3: Commit** — `git commit -am "fix(ui): dashboard scroll height accounts for sub-nav (no clipped content)"`

## Task 3: Make the agent narrative readable (highest impact)

**Files:** Modify `src/components/Markdown.tsx`

- [ ] **Step 1: Bump the type scale + contrast** (replace the inline sizes/colors):

```tsx
// list items
<li ... style={{ fontSize: 14, lineHeight: 1.7, color: '#d7d8ea' }}>
// ### h4
<h4 ... style={{ fontSize: 14, color: '#fff', margin: '14px 0 4px', fontWeight: 700 }}>
// ## h3
<h3 ... style={{ fontSize: 17, color: '#fff', margin: '18px 0 6px', fontWeight: 700 }}>
// # h2
<h2 ... style={{ fontSize: 19, color: '#fff', margin: '20px 0 8px', fontWeight: 700 }}>
// paragraph
<p ... style={{ fontSize: 15, lineHeight: 1.7, color: '#d7d8ea', margin: '0 0 10px' }}>
```

- [ ] **Step 2: Verify** — `/dashboard/cyberx` analysis body reads at ~15px with clear headings; contrast no longer gray-on-gray.
- [ ] **Step 3: Commit** — `git commit -am "fix(ui): legible agent narrative type scale + contrast"`

## Task 4: Reading measure + label/tag/chart fixes

**Files:** Modify `src/app/globals.css`, `src/components/AgentDetail.tsx`

- [ ] **Step 1: Add a reading-measure to the narrative** in `globals.css`:

```css
.agent-narrative .md-measure { max-width: 70ch; margin: 0 auto; }
```
and in `AgentDetail.tsx` wrap the `<Markdown />` in `<div className="md-measure">…</div>`.

- [ ] **Step 2: Lift small UI text** in `globals.css`:

```css
.exec-kpi .l { font-size: 12px; }            /* was 11 */
.agent-kpi .l { font-size: 12px; }           /* was 10 */
.agent-tag { font-size: 11px; }              /* was 9 */
.agent-when { color: #9a9bc4; }              /* was #6a6c93 */
.exec-artifact { max-height: 340px; }        /* was 260 — let charts breathe */
.agent-highlight { font-size: 16px; }        /* was 14 — it's the lead */
```

- [ ] **Step 3: Verify** — agent page: lead sentence prominent, narrative ~70ch centered, tags/labels legible, first card chart not scroll-trapped. Check 375 / 768 / 1440.
- [ ] **Step 4: Commit** — `git commit -am "fix(ui): reading measure, legible labels/tags, roomier chart cards"`

## Task 5: Office terminal-feed legibility (only office change)

**Files:** Modify `src/components/TerminalFeed.tsx` (and `DepartmentSidebar.tsx` if it has sub-12px text)

- [ ] **Step 1:** Ensure feed line text is ≥12px with ≥4.5:1 contrast. **Do not touch** the canvas or keyframes.
- [ ] **Step 2: Verify** — `/` still animates (bob/glow intact); feed text readable.
- [ ] **Step 3: Commit** — `git commit -am "fix(ui): office terminal feed min legible size (animation untouched)"`

## Task 6: Version bump + verify

- [ ] **Step 1:** `package.json` version `1.4.2 → 1.4.3` (NavBar reads it).
- [ ] **Step 2:** `npm run lint && npx tsc --noEmit && npm test` — all green.
- [ ] **Step 3:** Screenshot `/`, `/dashboard`, `/dashboard/finance`, `/doc` at 375 + 1440 for the record.
- [ ] **Step 4: Commit** — `git commit -am "chore(v1.4.3): reading-optimized UI/UX"`

---

## Self-Review Notes
- Office animation preserved (Task 5 explicitly canvas-free). ✓
- "Loses content" addressed at root (Task 2 scroll height). ✓
- "Can't read" addressed at root (Task 1 font + Task 3 narrative scale). ✓
- All sub-12px reading text raised; muted grays lifted toward AA (verify final pairs with a contrast checker during Task 4). ✓
- No `dangerouslySetInnerHTML` introduced; `Markdown.tsx` stays the safe renderer. ✓
