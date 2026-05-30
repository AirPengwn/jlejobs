# Changelog

Versioning: each update ships on its own `vX.Y.Z` branch, then merges to `main`
(which is what GitHub Pages serves).

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
