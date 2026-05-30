# Changelog

Versioning starts here. Each update ships on its own `vX.Y.Z` branch and is then
merged to `main` (which is what GitHub Pages serves).

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
