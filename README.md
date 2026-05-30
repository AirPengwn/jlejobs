# jlejobs — Opportunity Dashboard

A private, static dashboard for John L. Evans to passively track job opportunities
that fit a unique Product Owner + Instructional Design + Technical background, in
Connecticut (near Guilford) or remote. Hosted on GitHub Pages.

## Privacy
- `noindex/nofollow` meta tags + `robots.txt` keep the site out of search engines.
- It is still technically public (free GitHub Pages); discoverable only with the URL.
- Full name/address are minimized on public pages where practical.

## Structure
```
index.html              # shell + tab nav (Opportunities / Biography)
assets/css/styles.css   # dark theme
assets/js/app.js        # filtering, search, sort, star/flag, "new" logic
assets/data/jobs.js     # the opportunity cards (window.JOBS)
assets/data/bio.js      # biography data (window.BIO)
robots.txt / .nojekyll  # privacy + Pages config
```

## Cards
Three kinds, all filterable:
- **posting** — a specific listing found on a date (may expire; has a fallback link).
- **search** — a live, pre-filtered job-board query (never goes stale).
- **company** — an employer worth watching (links to careers page).

## Per-browser state (localStorage)
- ★ Star (like) and ⚑ Flag toggles per card.
- "NEW" badge shows on any card whose id you haven't marked seen.
  Click **Mark all as seen** to clear; newly added cards in future runs auto-show NEW.

## Updating the list (future search runs)
Append new objects to `window.JOBS` in `assets/data/jobs.js` with a fresh
`dateAdded`. Because their ids are new, they'll automatically display the NEW badge.
Update `window.JOBS_GENERATED` to the new date.

## Local preview
Open `index.html` directly in a browser — all data is plain JS (no server/CORS needed).

## Optional: JSONBin (later)
If you ever want star/flag state to sync across devices (instead of per-browser
localStorage), we can swap the localStorage layer for a JSONBin bin + key.
