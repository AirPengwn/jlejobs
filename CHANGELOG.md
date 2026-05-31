# Changelog

Versioning: each update ships on its own `vX.Y.Z` branch, then merges to `main`
(which is what GitHub Pages serves).

## v1.8.1 — 2026-05-30 — Claude Design pass (score anatomy + return digest)
Presentation-only restyle of the two items flagged for Design in `DESIGN-HANDOFF-v1.8.md`;
no scoring math, digest computation, or data flow changed. Header/nav untouched (stays centered).
- **Score anatomy (drawer):** the "Why this score" breakdown is now a segmented core-coverage
  meter (`coreN` segments, `hitCore` filled teal), a soft résumé/bio matches bar + count, a
  coral inset row for the disqualifier penalty (only when applied), and core-competency chips —
  hit solid, *missing* dashed/muted so you can see what would raise the score. Emoji dropped.
- **Return digest → "Since you were away":** green left-border removed (green is now only the
  "new" marker dot); activity counts (new / resurfaced / watched-company) each get a colored
  marker dot above a quiet "Market" footnote (salary ▲▼ %, rising skill). Heading shows the
  gap ("· N days"). Market-only return shows a "Market update" heading with no "Show new" button.
  Show/Dismiss handlers unchanged. Wires the reserved `jle_last_visit` timestamp.
- Classes: `.rd-bd*` → `.sa*`; `.digest-banner*`/`.dg-line` → `.rdg*`. SW cache → `jle-cache-v1.8.1`.

## v1.8.0 — 2026-05-30 — Signal & passive-radar features (brief Phases 6–10 + IA)
- **"New" decay (P6):** the green kicker now means *new since your last visit*, not new
  ever. Cards are marked seen on load so the badge decays next time; the first run after
  this ships marks everything silently (no one-time green wall). Fixes the exception-color
  collapse where nearly every card was green.
- **Staleness signal (P7):** every card foot shows a muted relative age ("5 weeks ago");
  Remote roles no longer render a commute field at all (no "0 mi"/"n/a").
- **IA — Me tab:** Biography + Résumé folded into a single **Me** tab with a Bio/Résumé
  segmented switch. Nav is now the four action surfaces (Opportunities, Pipeline, Map,
  Grow) + Me.
- **Market signals (P8):** a "📊 Market signals" panel over the cards — median salary
  (trend vs prior month), work-mode mix, and rising/cooling skills. A monthly snapshot is
  stored locally so trends accrue over time.
- **Skill-gap → Grow (P9):** the Grow tab leads with "Skills the market wants that you
  don't list" — aggregated from your strong-fit (70+) roles, after alias normalization.
- **Quality-of-life bundle (P10):**
  - *Walk-away anchor* — set a personal salary number (More filters); qualifying cards get
    a quiet "✓ your #" flag (flags, doesn't hide).
  - *Return digest* — the last-visit banner is now a concise multi-line digest (new,
    resurfaced, watched-company activity, salary/skill movement).
  - *Company watch* — cards from a company you've starred get a "★ watched co" flag when new.
  - *Snooze / resurface* — per-card ⏰ 1 wk / 1 mo in the drawer; snoozed cards drop out of
    the default view and resurface as an event when the timer elapses. Synced.
  - *Journal* — a dated, append-only market-observation log (📓 Journal). Synced.
- Snooze + journal join star/flag/hide/status/notes in the JSONBin sync payload.
- SW cache → `jle-cache-v1.8.0`; scoring-config.js added to the precache list.

## v1.7.0 — 2026-05-30 — Fit-scoring overhaul (brief Phases 0–5)
- **New `assets/data/scoring-config.js`** (window.SCORING_CONFIG) is the single source
  of truth for all scoring values — weights, FIT_TARGET, cap/floor, coverage blend,
  disqualifier penalty, tiers, alias map, bigrams, core competencies, disqualifiers,
  stopwords. `app.js` reads everything from it; nothing hardcoded. Hand-tune there.
- **Absolute scale (P1):** dropped relative `/max` normalization. `displayed =
  round(blended / FIT_TARGET * 100)` clamped [5, 98]. A card's score now depends only
  on the card + résumé/bio vocab, never on other cards. Calibrated FIT_TARGET=30 (top
  match ~92, nothing at the cap, 95+ reserved).
- **Synonyms (P2) + multi-word terms (P3):** card & vocab tokens normalize through the
  alias map (Scrum≈Agile, RTE≈release train, LIMS≈lab informatics, etc.); bigrams
  ("release train", "product owner"…) matched as single tokens first.
- **Bio vocabulary (P4):** bio.js merged into the vocab at ×1 weight (broaden recall
  without diluting title/role-family precision).
- **Coverage + disqualifiers (P5):** score blends raw weight with how much of the core
  competency set a card hits; exec/junior/K-12-teaching/helpdesk terms apply a ×0.5
  penalty (whole-token match — "non-K12" no longer false-triggers "k12"). The details
  drawer now shows a **"Why this score"** breakdown (matches, core coverage, penalty).
- SW cache → jle-cache-v1.7.0. (Feature Phases 6–10 + IA still queued.)

## v1.6.4 — 2026-05-30
- **Mobile "cards-first" (iPhone only):** on ≤640px screens the sort bar, Refine/More
  filters, and presets collapse behind a single **⚙ Filters & sort** toggle, so phones
  land on search + view chips + opportunity cards (first card ~394px down, was ~768px).
  Desktop is unchanged — the toggle is hidden and nothing collapses ≥641px.
  (SW cache → jle-cache-v1.6.4.)

## v1.6.3 — 2026-05-30
- **Fixed a mobile layout bug:** the search box was rendering ~320px tall on phones
  (the toolbar becomes a flex column there, so `.search-wrap`'s `flex-basis:320px`
  applied to height), leaving a huge empty gap above the filter chips. Now content-height.
  (SW cache → jle-cache-v1.6.3.)

## v1.6.2 — 2026-05-30
- **Re-centered the header** (owner preference): desktop is back to a centered stacked
  masthead — avatar + title, subtitle, sync/update chips, and nav tabs all centered.
  The mobile (≤640px) two-row layout + scrolling tab strip + safe-area insets are kept.
  (SW cache → jle-cache-v1.6.2.)

## v1.6.1 — 2026-05-30
- Added a **⟳ Update** button next to the sync chip — clears cached assets + the service
  worker and reloads fresh, so you can pull the latest version on an installed phone PWA
  without a hard refresh. (SW cache → jle-cache-v1.6.1.)

## v1.6.0 — 2026-05-30 — Opportunities redesign (design handoff)
- **Card:** three-tier volume system. Collapsed face = kicker (optional New/Live + muted
  type), title, sub (company · location · salary), right-aligned tier-colored **Fit** anchor,
  one why-line, ≤3 tags + N, quiet hover actions, exception strip. Everything else (full
  description, why, metadata grid, all tags, status, note, outreach, apply/alt) moved into
  an in-card **Details drawer** — nothing removed. +N tags expand in place.
- **Color is now exception-only:** healthy unstarred card = neutrals + teal; green = new/live,
  coral = dead-link/expire, amber = your star. Removed colored type/verified/snapshot pills.
- **Header:** compact left-aligned ~58px bar; mobile (≤640px) reflows to two rows with a
  horizontal scrolling pill tab strip; safe-area insets + viewport-fit=cover for installed PWA.
- **Filters:** Refine row (Location, Work mode + Min-fit segmented controls, Min salary) always
  visible; Role family / Skills / Card type / My status behind a "More filters" toggle.
- **SW cache bumped** (jle-cache-v1.6.0) so restyle ships to installed clients.
- Other tabs (Pipeline / Map / Grow / Biography / Résumé) unchanged.

## v1.5.1 — 2026-05-30
- **Header polish:** removed a stray `margin-left:auto` that was pushing the sync
  status to the right; the ☁ sync indicator now sits centered under the title.
  Removed the duplicate "Data refreshed" date from the header (it stays in the footer).
  Softened the "new since last visit" digest banner (slimmer, less saturated).

## v1.5.0 — 2026-05-30
- **Centered header & nav** — masthead (avatar + title + sync) and tab bar are now
  centered on the page instead of left-aligned.
- **Expanded filters:** new **Skills / keywords** filter row (top ~20 skill tags with
  counts, excluding generic/location/company labels) and a **Minimum fit** filter
  (Any / 50+ / 70+ / 85+) using the résumé fit score.

## v1.4.2 — 2026-05-30
- **3 new specific posting cards (monthly refresh):**
  - eClinical Solutions Technical Writer (Technical Writing / LIMS, remote, $90k–$100k) — clinical data cloud documentation role mirroring Thermo Fisher content work.
  - Platform Science Product Owner (Product Owner / PM, remote, $109k–$143.5k + bonus/equity) — fleet SaaS PO role, posted May 9 2026.
  - Grafana Labs Senior Technical Writer (Technical Writing, remote, $123k–$148k) — high-band developer documentation role.
- **Link-health pass:** checked all 17 existing `kind:"posting"` apply-links; all returned 403 (treated as `"ok"` per conservative policy). Added `linkStatus:"ok"` and `linkChecked:"2026-05-30"` to every posting card.

## v1.4.1 — 2026-05-30
- **Link-health, in the cloud routine.** The monthly routine now curls each posting's
  apply link and sets `linkStatus:"dead"` on clear 404/410s (conservative — ignores
  403/timeouts to avoid false alarms). Cards flagged dead show a new **"⛔ link dead"**
  badge. (Done server-side because a static page can't check cross-origin links.)

## v1.4.0 — 2026-05-30
- **Commute estimate** on CT cards (~miles + rough drive time from Guilford) + a new
  "Closest (CT)" sort.
- **Salary on live cards** — pulls compensation from Ashby boards where published, so
  the salary slider now works on those live listings (~14 surfaced with pay).
- **Cross-source de-dup** — live cards that duplicate a curated card (or each other)
  are collapsed by company+title.
- **JD keyword-gap analyzer** (🧪 JD match) — paste a job description; see which terms
  your résumé covers vs. gaps to address. Runs entirely in-browser.
- **Cover-letter download** — the outreach draft now has a "Download (Word)" button.
- **Saved filter presets** — save the current filter set by name and re-apply in one click.
- **Card detail modal** — click a card title for a full detail view.
- (Link-health check intentionally deferred — can't reliably check external URLs from a
  static page due to CORS; better handled by the monthly cloud routine.)

## v1.3.0 — 2026-05-30
- **New "Grow" tab** — researched professional-development & certifications to stay
  competitive as a Product Owner, with a Product Manager sub-section (adjacent roles
  John qualifies for), plus AI-PM, domain/data, and free/ongoing options. 19 curated
  cards across 5 tracks with provider, level, format, approx cost, and a "why it fits."
- **New "Pipeline" tab** — Kanban board by status (Watching → Interested → Applied →
  Interviewing → Passed) for cards you're tracking, with move-between-columns, plus a
  **stats panel** (totals, starred, in-pipeline, new/unseen; bar charts by status,
  role family, and salary distribution).
- **"New since last visit" digest** — dismissible banner with a one-click "show them".
- **Keyword watchlist** — define terms (e.g., LIMS, enablement); matching cards get a
  ⭐ highlight and pin to the top of Opportunities. Stored per device.
- **Installable PWA** — web manifest + service worker (network-first, offline fallback)
  so the dashboard can be added to a home screen and opened full-screen.

## v1.2.4 — 2026-05-30
- Added a **"🔁 Run full search update ↗"** button (results bar) that opens the
  cloud refresh routine — one click there runs the full web-search update and
  pushes results. A public static page can't trigger the cloud agent directly
  without exposing credentials, so this is the secure path. "🔄 Refresh live"
  still does instant in-browser company-board refresh.

## v1.2.3 — 2026-05-30
- Added 7 new specific job-posting cards (monthly refresh): Leidos Agile Product Owner (PO/Scrum, remote), Beckman Coulter/Danaher Learning Experience Designer-Developer (ID/L&D, remote, $110k–$120k + bonus), Veeva Systems LIMS Implementation Consultant (LIMS/Informatics, remote), Veeva Systems Technical Writer–Vault (Technical Writing, remote), Sorcero Customer Success Manager (Customer Education, remote, $110k–$125k), Salesforce Customer Success Manager Life Sciences (Customer Education, remote, $123k–$227k), Experian Health Product Owner–Health SaaS (PO, remote).
- All new cards are `kind:"posting"`, `status:"snapshot"`, `dateAdded:"2026-05-30"`; covers Product Owner, Instructional Design, Technical Writing, LIMS/Informatics, Customer Education/Enablement, and Solutions/Implementation families.

## v1.2.2 — 2026-05-30
- Added `CLAUDE.md` — a project guide so any Claude session (any machine) is
  instantly oriented: architecture, card shape, features, the release workflow,
  résumé regeneration, and a reminder to `git pull` first.

## v1.2.1 — 2026-05-30
- Added a **"🔄 Refresh live"** button (results bar) that re-pulls all live
  company boards on demand — fully client-side, no GitHub/server needed. Replaces
  prior live cards rather than stacking them.

## v1.2.0 — 2026-05-30
- **Expanded live listings to all verified feeds.** Added Lever + Ashby support
  alongside Greenhouse, and grew the board list to 12 verified, CORS-open boards
  with remote-US/CT roles in John's families: Samsara, GitLab, Instacart, Affirm,
  Twilio, Dropbox, Webflow, BenchPrep, Lattice (Greenhouse) + Vanta, Ashby, OpenAI
  (Ashby). ~48 live roles now surface (up from ~16).
- **Filter quality fixes:** dropped boards whose relevant roles were non-remote
  only; tightened the role regex (no more "Machine Learning" matching "learning");
  word-boundary US match so Austria/Australia/EMEA no longer leak in; per-board
  title de-duplication.

## v1.1.1 — 2026-05-30
- Show the app version (from `assets/data/version.js`) as a small pill next to
  the "Opportunity Dashboard" title. The monthly refresh routine bumps it too.

## v1.1.0 — 2026-05-30
- **Tracker:** per-card status pipeline (Watching → Interested → Applied →
  Interviewing → Passed/Closed), private notes, and hide/dismiss — all synced
  via JSONBin (schema extended with `hidden`, `status`, `notes`).
- **Live listings:** pulls real openings from CORS-enabled Greenhouse boards
  (Datadog, GitLab, Asana, Samsara, Klaviyo), filtered to John's role families +
  remote/CT, merged in at load with a ● LIVE badge.
- **Fit score:** heuristic résumé-match score per card; new "Best fit" sort.
- **UI:** filter-chip count badges, "My status" filter, 🚫 Hidden quick filter,
  compact/comfortable density toggle, tab-refocus auto-pull, "may be expired"
  flag on postings older than 45 days.
- **Map tab:** Leaflet/OpenStreetMap view of CT opportunities near Guilford.
- **Résumé:** 4 tailored variants (General, Product Owner, Learning & Enablement,
  LIMS/Informatics) each with its own Word download; "Save as PDF" via print;
  per-card "Draft outreach" generator.

## v1.0.0 — 2026-05-30
- New masthead: stickman avatar + "Opportunity Dashboard" title, with nav below.
- Reworked filter layout for visual balance: Role family on its own wide row;
  Location / Work mode / Card type / Minimum-salary on a second row.
- Added a **Minimum salary** slider (filters cards by the top of their range).
- (Prior, pre-versioning work: dark-theme dashboard, 46 opportunity cards with
  salary ranges, Biography + Résumé tabs with downloadable Word résumé,
  JSONBin cross-device sync hardcoded as the built-in default.)
