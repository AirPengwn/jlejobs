# Design handoff — Opportunity Dashboard v1.8

**For:** Claude Design
**From:** Claude Code
**Scope:** Two presentation-only items the implementation brief explicitly flagged for Design. The **logic is done and shipped** — these are pure styling passes. Touch CSS (and, if helpful, the small HTML template strings noted below); do **not** change the scoring math, the digest computation, or the data flow.

## Project facts
- Static vanilla HTML/CSS/JS PWA — no framework, no build step. GitHub Pages.
- Live: `https://airpengwn.github.io/jlejobs`
- Local preview: `python -m http.server 8765 --directory <repo>` then open `http://localhost:8765`
- All CSS is in `assets/css/styles.css`. The two templates below are generated in `assets/js/app.js`.

## Design language (must preserve)
- Dark theme. **Exception-only color**: color appears *only* on events / problems / star / interactive elements — never as decoration.
- Normalized oklch accent family (do **not** add new hues):
  - `--accent` / `--n-teal` `#4fd1c5` — primary / positive signal / interactive
  - `--n-green` (oklch .78 .11 150) — "new" / "live" events
  - `--n-amber` (85) — user star (only when set)
  - `--n-coral` (30) — problems (dead link / may-expire / penalty)
  - `--n-indigo` (275) — secondary signal
- Text ramp: `--text` (brightest), `--text-dim`, `--text-mute` (quietest).
- Surfaces: `--surface`, `--bg-2`; `--border`. Radii: 12px cards, 8px chips (`--radius-sm`). 8px spacing rhythm.

---

## Item 1 — Score breakdown in the card details drawer (brief Phase 5c)

**Where:** expand any card in **Opportunities** → "Details" drawer. The block sits below "Why it fits."

**Brief intent:** make the fit score *interrogable, not decorative* — a small, quiet breakdown of what drove the number. Keep it muted and compact, consistent with the drawer's existing 2-col metadata grid.

**Current rendered markup** (template in `app.js`, `cardHTML()` → `breakdown`):
```html
<div>
  <div class="rd-h">Why this score · 92</div>
  <div class="rd-bd">
    <span class="rd-bd-i">🎯 <b>14</b> résumé/bio matches</span>
    <span class="rd-bd-i">🧩 core coverage <b>7/12</b> (58%)</span>
    <span class="rd-bd-i disq">⛔ disqualifier penalty ×0.5</span> <!-- only when applicable -->
  </div>
  <div class="rd-bd-core">core hit: product owner · agile · safe · customer education · …</div>
</div>
```

**Current CSS** (the v1.7 block in `styles.css`):
```css
.rd-bd { display: flex; flex-wrap: wrap; gap: 7px 14px; font-size: 12px; color: var(--text-dim); }
.rd-bd-i { display: inline-flex; align-items: center; gap: 5px; }
.rd-bd-i b { color: var(--text); font-weight: 700; }
.rd-bd-i.disq { color: var(--n-coral); }
.rd-bd-core { margin-top: 6px; font-size: 11px; color: var(--text-mute); line-height: 1.5; }
```
(`.rd-h` is the existing drawer section-heading class, already styled.)

**Design opportunities / open questions:**
- Could the three signals read as a tiny inline meter or progress visual rather than text+emoji? (Coverage especially — it's a fraction.)
- The emoji are placeholders for "quiet glyph" — fine to replace with a more cohesive icon treatment within the dark/mono aesthetic.
- The `disq` row is a *problem* state (coral) and should stay visually distinct from the two neutral signals.
- **Bonus (also in 5c):** the collapsed card face has a "why it fits" line (`.r-why`, italic, teal left-rule). The brief asks that this line reference *what actually moved the score* where possible. Today it shows the curated `fit` blurb. If Design wants, the matched-core terms are available to surface here — but that's optional and a logic tweak we'd make together.

**Acceptance (from brief):** the user can glance at the drawer and understand *why* a card scored what it did; legible, non-noisy, in keeping with the metadata grid.

---

## Item 2 — Return digest banner (brief Phase 10b)

**Where:** top of **Opportunities**, shown on return after a gap (only when there's something to report). It's the evolution of the old single-line "N new since last visit" banner.

**Brief intent:** *graceful dormancy* — a tool you can neglect shouldn't punish you with a wall of green on return. Lead with a concise digest of what changed; the full grid sits behind it. Up to ~5 lines.

**Current rendered markup** — container is static in `index.html`; `#digestText` is filled by `updateDigest()` in `app.js`:
```html
<div id="digestBanner" class="digest-banner">
  <span id="digestText">
    <span class="dg-line">🟢 <b>3</b> new since your last visit</span>
    <span class="dg-line">⏰ <b>2</b> snoozed roles resurfaced</span>
    <span class="dg-line">★ <b>1</b> new from companies you star (Cresta)</span>
    <span class="dg-line">💰 median salary up <b>4%</b> vs last month</span>
    <span class="dg-line">📈 "release train" rising in demand</span>
  </span>
  <span class="digest-actions">
    <button class="linkbtn" id="digestShow">Show them</button>
    <button class="linkbtn" id="digestDismiss">Dismiss</button>
  </span>
</div>
```
(Lines are generated conditionally — the user may see 1–5 of them. Each is a `.dg-line`. The `<b>` wraps the salient number/term.)

**Current CSS:**
```css
.digest-banner { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
  background: var(--surface); border: 1px solid var(--border); border-left: 3px solid var(--new);
  border-radius: 9px; padding: 7px 13px; margin-bottom: 14px; color: var(--text-dim); font-size: 12.5px; font-weight: 600; }
.digest-actions { display: flex; gap: 14px; }
#digestText { display: flex; flex-direction: column; gap: 3px; }
.dg-line { display: block; }
.dg-line b { color: var(--text); font-weight: 800; }
```

**Design opportunities / open questions:**
- It currently reuses the old one-line banner shell. As a 5-line digest it may want more vertical breathing room, a clearer heading ("Since you were away"), and per-line iconography/alignment rather than inline emoji.
- The lines mix categories — *counts* (new, resurfaced, watched-company) vs *market movement* (salary, skills). Worth considering visual grouping or de-emphasis of the market lines.
- "Show them" filters to the new cards; "Dismiss" hides the banner. Both are `.linkbtn` (teal text). On a taller banner the action placement may need rethinking (currently top-right, baseline-aligned to the first line).
- Each line's `<b>` is the "moved the needle" value — keep that emphasis legible against the dim line text.

**Acceptance (from brief):** returning after a gap shows a concise digest, **not** a green wall; the full grid is reachable behind it.

---

## Handy selectors / files
| Item | Markup (app.js) | Container (index.html) | CSS (styles.css) |
|---|---|---|---|
| Score breakdown | `cardHTML()` → `breakdown` template | rendered into `.r-drawer` | `.rd-bd`, `.rd-bd-i`, `.rd-bd-i.disq`, `.rd-bd-core` |
| Return digest | `updateDigest()` → `.dg-line` spans | `#digestBanner` / `#digestText` | `.digest-banner`, `#digestText`, `.dg-line`, `.digest-actions` |

To force the digest while testing: in DevTools, `localStorage.setItem('jle_visited','1')`, remove a couple of ids from `jle_seen`, then reload.
