# CLAUDE.md — project guide for jlejobs

Context for any Claude session working on this repo (any machine).

## What this is
A private, static **job-opportunity dashboard** for **John L. Evans** (Guilford, CT) —
a SAFe Staff Product Owner with instructional-design / customer-education,
technical-writing / content, IT, and **scientific-informatics / LIMS** background.
Goal: passively track opportunities (Connecticut near Guilford, or remote) while
employed. Excludes K-12 / public-school teaching.

- **Repo:** `AirPengwn/jlejobs` (owner `AirPengwn`; the connected/push account
  `AirPenguin23` is a *write collaborator* — it can push but isn't admin).
- **Live site (GitHub Pages):** https://airpengwn.github.io/jlejobs/
- **Privacy:** public but `noindex` + `robots.txt`. Don't add SEO/sitemaps.

## First thing each session
**`git pull` before starting** — changes may have been pushed from another machine
or by the monthly refresh routine. **Push when done.**

## Architecture (no build step)
Plain static site. All data is plain-JS globals loaded via `<script>` (NOT fetched
JSON) so it works on `file://` and on Pages with no server/CORS issues.

```
index.html                     # shell: masthead, tab nav, modals, script includes
assets/css/styles.css          # dark theme (teal accent); print CSS for résumé
assets/js/app.js               # ALL logic: render, filters, sync, live feeds, map, résumé
assets/data/version.js         # window.APP_VERSION (mirrors VERSION file)
assets/data/sync-config.js     # window.JLE_SYNC_DEFAULT — hardcoded JSONBin key (intentional)
assets/data/jobs.js            # window.JOBS — the opportunity cards (see shape below)
assets/data/bio.js             # window.BIO — biography tab
assets/data/resume.js          # window.RESUME — base résumé
assets/data/resume-variants.js # window.RESUME_VARIANTS — tailored variants
assets/img/stickman.jpg        # header avatar (copied from stickman.jfif)
assets/resume/*.docx           # 4 generated Word résumés
scripts/build-resume.js        # regenerates the .docx résumés (docx-js)
VERSION, CHANGELOG.md
```

## Card shape (`window.JOBS` in jobs.js)
```
{ id, kind:'posting'|'search'|'company', status, title, company, location,
  workMode:'Remote'|'Hybrid'|'Onsite'|'Any', regions:['Remote'|'Connecticut'],
  roleFamily:[...], salary, salaryMin, salaryMax, posted, dateAdded, source,
  applyUrl, altUrl, tags:[...], description, fit }
```
Optional health fields (set by the monthly routine's link-health step): `linkStatus`
(`"ok"` | `"dead"`) and `linkChecked` (YYYY-MM-DD). A `"dead"` status renders a
"⛔ link dead" badge on the card.
roleFamily values (exact strings): `Product Owner / PM`, `Instructional Design / L&D`,
`Technical Writing / Content`, `Scrum Master / Agile`, `Customer Education / Enablement`,
`Business Analyst`, `Solutions / Implementation`, `LIMS / Scientific Informatics`.

## Key features (all in app.js)
- **Tabs:** Opportunities · Pipeline · Map · Grow · Me (Me = Biography + Résumé behind a
  segmented switch; folded together in v1.8 to keep nav to the action surfaces + Me).
- **Filters:** role family + location + work mode + card type + my-status + min-salary
  slider; text search; sort (newest/fit/salary/company/title); quick toggles
  (New/Starred/Flagged/Hidden/Snoozed); density toggle; chip count badges.
- **Tracker:** per-card ★ star, ⚑ flag, 📝 note, 🚫 hide, ⏰ snooze, and a status pipeline
  (Watching→Interested→Applied→Interviewing→Passed/Closed). Persisted + synced.
- **Passive-radar signals (v1.8):** "New" decays to *since last visit*; muted relative
  age per card; 📊 Market signals panel (median salary trend, work-mode mix, rising/cooling
  skills — monthly snapshots in `jle_market_hist`); skill-gap list atop Grow; walk-away
  salary flag; multi-line return digest; company-watch flag; snooze/resurface; 📓 Journal.
- **JSONBin sync:** state `{starred,flagged,seen,hidden,status,notes,snooze,journal}` synced across
  devices. Pull on load + tab-refocus; debounced push on change. Key is in
  sync-config.js (public, scoped Access Key — accepted tradeoff). User can override/off
  via the ☁ Sync modal (localStorage).
- **Live listings:** `LIVE_BOARDS` in app.js — CORS-open boards fetched at load and via
  the "🔄 Refresh live" button. Multi-source (`fetchRaw`): greenhouse, ashby, lever.
  Filtered by TITLE_RX / EXCLUDE_RX / locOK (word-boundary US) + per-board title dedup,
  cap 6/board. Live cards have `live:true`, `id` prefixed `live-`.
- **Fit score (v1.7+):** absolute heuristic in `app.js` (`scoreCard()`), driven entirely by
  `assets/data/scoring-config.js` (`window.SCORING_CONFIG`: SCORING weights/FIT_TARGET/cap/
  COVERAGE_BLEND/DISQUALIFIER_PENALTY/TIERS, ALIAS_MAP, BIGRAMS, CORE_COMPETENCIES,
  DISQUALIFIERS, EXTRA_STOPWORDS — all owner-tunable, nothing hardcoded). Pipeline:
  bigram detection → alias canonicalization → résumé+bio vocab overlap (weighted) →
  coverage blend → disqualifier penalty → `round(blended/FIT_TARGET*100)` clamped [5,98].
  Drawer shows a "Why this score" breakdown. "Best fit" sort uses blended raw.
  Re-calibrate FIT_TARGET if résumé/bio/weights change. (Implements brief Phases 0–5.)
- **Map:** Leaflet/OSM, CT cards plotted by `CITY` coords near Guilford.
- **Résumé:** 4 variants (General/PO/Enablement/LIMS), each with a .docx download +
  "Save as PDF" (print). Per-card "Draft outreach" generator.

## Release workflow (REQUIRED for every change)
1. Make changes. If user-facing/site change, bump SemVer (minor=feature, patch=fix):
   update **both** `VERSION` and `assets/data/version.js` (the header pill mirrors it),
   and prepend a `CHANGELOG.md` entry.
2. `git checkout -b vX.Y.Z` → commit (author `AirPenguin23` / johnlorinevans@gmail.com;
   end message with `Co-Authored-By: Claude ...`) → `git push -u origin vX.Y.Z`.
3. `git checkout main` → `git merge --ff-only vX.Y.Z` → `git tag vX.Y.Z` →
   `git push origin main --tags`.
GitHub Pages serves `main`.

## Regenerating résumés
```
npm install docx        # in a temp dir, or locally (don't commit node_modules)
node scripts/build-resume.js   # writes the 4 .docx into assets/resume/
```

## Adding new opportunity cards
Append objects to `window.JOBS` with a **unique kebab-case id**, `dateAdded` = today
(new ids auto-show a NEW badge), and a one-line `fit`. Update `window.JOBS_GENERATED`.
Keep jobs.js valid JS. Don't remove/reorder existing cards.

## Scheduled refresh routine
Remote routine `trig_01BTfcqsKHc4VqTNhmUF9XRX` (1st of month ~9am ET) re-runs searches
and ships a patch version. Needs GitHub connected to the Claude account to push
(was pending). Manual alternative: ask Claude to "refresh the searches".
