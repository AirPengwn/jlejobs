/* ============================================================================
   jlejobs — app logic (v1.1.0)
   Tabs · cards · filters/search/sort · star/flag/hide · status · notes ·
   fit score · live listings (Greenhouse/Lever) · JSONBin sync · map · resume.
   ========================================================================== */
(function () {
  "use strict";

  const LS = {
    starred: "jle_starred", flagged: "jle_flagged", seen: "jle_seen",
    hidden: "jle_hidden", status: "jle_status", notes: "jle_notes",
    density: "jle_density", watch: "jle_watch", visited: "jle_visited",
    snooze: "jle_snooze", journal: "jle_journal", walkaway: "jle_walkaway",
    marketHist: "jle_market_hist", lastVisit: "jle_last_visit", decayInit: "jle_decay_init"
  };

  const loadSet = (k) => new Set(JSON.parse(localStorage.getItem(k) || "[]"));
  const loadMap = (k) => JSON.parse(localStorage.getItem(k) || "{}");
  const saveSet = (k, set) => localStorage.setItem(k, JSON.stringify([...set]));
  const saveMap = (k, obj) => localStorage.setItem(k, JSON.stringify(obj));

  const starred = loadSet(LS.starred);
  const flagged = loadSet(LS.flagged);
  let   seen    = loadSet(LS.seen);
  const hidden  = loadSet(LS.hidden);
  let   status  = loadMap(LS.status); // {id: statusKey}
  let   notes   = loadMap(LS.notes);  // {id: text}
  let   snooze  = loadMap(LS.snooze); // {id: untilISO} — Phase 10d
  let   journal = JSON.parse(localStorage.getItem(LS.journal) || "[]"); // [{date,text}] — Phase 10e
  let   watchTerms = JSON.parse(localStorage.getItem(LS.watch) || "[]"); // [lowercase terms]
  let   walkaway = +(localStorage.getItem(LS.walkaway) || 0); // Phase 10a personal "worth a look" salary
  const nowISO = () => new Date().toISOString();
  const isSnoozed = (id) => { const u = snooze[id]; return u && u > nowISO(); };
  const matchesWatch = (j) => {
    if (!watchTerms.length) return false;
    const hay = [j.title, j.company, (j.tags || []).join(" "), (j.roleFamily || []).join(" "), j.description, j.fit].join(" ").toLowerCase();
    return watchTerms.some((t) => t && hay.includes(t));
  };

  const STATUS = [
    { key: "watching",     label: "Watching" },
    { key: "interested",   label: "Interested" },
    { key: "applied",      label: "Applied" },
    { key: "interviewing", label: "Interviewing" },
    { key: "passed",       label: "Passed/Closed" }
  ];
  const statusLabel = (k) => (STATUS.find((s) => s.key === k) || {}).label || "";

  // ===================== JSONBin cross-device sync ==========================
  const SYNC_KEY = "jle_jsonbin", SYNC_OFF = "jle_sync_off";
  function resolveCfg() {
    const local = JSON.parse(localStorage.getItem(SYNC_KEY) || "null");
    if (local) return local;
    if (localStorage.getItem(SYNC_OFF)) return null;
    return window.JLE_SYNC_DEFAULT || null;
  }
  const sync = {
    cfg: resolveCfg(), timer: null,
    on() { return !!(this.cfg && this.cfg.binId && this.cfg.key); },
    usingDefault() { return !localStorage.getItem(SYNC_KEY) && !!window.JLE_SYNC_DEFAULT && !localStorage.getItem(SYNC_OFF); },
    headers() {
      const h = { "Content-Type": "application/json" };
      h[this.cfg.keyType === "master" ? "X-Master-Key" : "X-Access-Key"] = this.cfg.key;
      return h;
    },
    save(cfg) { this.cfg = cfg; localStorage.removeItem(SYNC_OFF); localStorage.setItem(SYNC_KEY, JSON.stringify(cfg)); },
    forget() { this.cfg = null; localStorage.removeItem(SYNC_KEY); localStorage.setItem(SYNC_OFF, "1"); }
  };
  function setSyncState(t) { const el = document.getElementById("syncState"); if (el) el.textContent = t; }
  function syncStatus(msg, kind) { const el = document.getElementById("syncStatus"); if (el) { el.textContent = msg; el.className = "sync-status " + (kind || ""); } }

  async function syncPull() {
    if (!sync.on()) return false;
    const res = await fetch("https://api.jsonbin.io/v3/b/" + encodeURIComponent(sync.cfg.binId) + "/latest", { headers: sync.headers() });
    if (!res.ok) throw new Error("Pull failed (HTTP " + res.status + ")");
    const rec = ((await res.json()) || {}).record || {};
    if (Array.isArray(rec.starred)) { starred.clear(); rec.starred.forEach((x) => starred.add(x)); }
    if (Array.isArray(rec.flagged)) { flagged.clear(); rec.flagged.forEach((x) => flagged.add(x)); }
    if (Array.isArray(rec.hidden))  { hidden.clear();  rec.hidden.forEach((x) => hidden.add(x)); }
    if (Array.isArray(rec.seen)) rec.seen.forEach((x) => seen.add(x));
    if (rec.status && typeof rec.status === "object") status = rec.status;
    if (rec.notes && typeof rec.notes === "object") notes = rec.notes;
    if (rec.snooze && typeof rec.snooze === "object") snooze = rec.snooze;
    if (Array.isArray(rec.journal)) journal = rec.journal;
    saveSet(LS.starred, starred); saveSet(LS.flagged, flagged); saveSet(LS.hidden, hidden);
    saveSet(LS.seen, seen); saveMap(LS.status, status); saveMap(LS.notes, notes);
    saveMap(LS.snooze, snooze); localStorage.setItem(LS.journal, JSON.stringify(journal));
    return true;
  }
  async function syncPush() {
    if (!sync.on()) return false;
    const body = JSON.stringify({ starred: [...starred], flagged: [...flagged], seen: [...seen], hidden: [...hidden], status, notes, snooze, journal });
    const res = await fetch("https://api.jsonbin.io/v3/b/" + encodeURIComponent(sync.cfg.binId), { method: "PUT", headers: sync.headers(), body });
    if (!res.ok) throw new Error("Push failed (HTTP " + res.status + ")");
    return true;
  }
  function scheduleSync() {
    if (!sync.on()) return;
    clearTimeout(sync.timer); setSyncState("syncing…");
    sync.timer = setTimeout(async () => {
      try { await syncPush(); setSyncState("synced ✓"); } catch (e) { setSyncState("sync error"); }
    }, 1200);
  }

  // ============================ data ========================================
  let ALL = (window.JOBS || []).slice(); // static + live listings appended later

  const state = {
    q: "", sort: "new", minSalary: 0, minFit: 0,
    toggles: { new: false, starred: false, flagged: false, hidden: false, snoozed: false },
    facets: { roleFamily: new Set(), regions: new Set(), workMode: new Set(), kind: new Set(), status: new Set(), skills: new Set() }
  };

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ===================== "New" decay (Phase 6) ==============================
  // "New" means new SINCE LAST VISIT, not new ever. Snapshot the unseen ids once
  // at load (stable green for the session) then mark them seen so the kicker
  // decays next visit. The first run after this feature ships marks everything
  // seen silently — so the owner doesn't get a one-time green wall.
  let newThisVisit = new Set();
  let resurfacedThisVisit = new Set(); // Phase 10d — snoozes that elapsed since last visit
  let firstDecayRun = false;           // true on the first-ever load of the decay feature
  const isNew = (j) => newThisVisit.has(j.id);
  // Move elapsed snoozes back into view as an event, then clear them from the map.
  function processResurface() {
    let changed = false;
    Object.keys(snooze).forEach((id) => {
      if (snooze[id] && snooze[id] <= nowISO()) { resurfacedThisVisit.add(id); newThisVisit.add(id); delete snooze[id]; changed = true; }
    });
    if (changed) { saveMap(LS.snooze, snooze); scheduleSync(); }
  }
  function noteSeen(jobs, silent) {
    let changed = false;
    jobs.forEach((j) => { if (!seen.has(j.id)) { if (!silent) newThisVisit.add(j.id); seen.add(j.id); changed = true; } });
    if (changed) saveSet(LS.seen, seen); // persist locally; rides along on next sync push
  }
  const kindLabel = { posting: "Posting", search: "Saved search", company: "Company watch" };

  // days since an ISO date (for expiry flags); null-safe
  function daysSince(iso) {
    if (!iso) return null;
    const then = new Date(iso + "T00:00:00"); if (isNaN(then)) return null;
    return Math.floor((Date.now() - then.getTime()) / 86400000);
  }
  function mayBeExpired(j) {
    if (j.kind !== "posting" || j.live) return false;
    const d = daysSince(j.posted || j.dateAdded);
    return d != null && d > 45;
  }
  // Phase 7: always-on, muted relative age ("5 weeks ago"). Distinct from the
  // coral may-expire exception strip.
  function relAge(iso) {
    const d = daysSince(iso); if (d == null) return "";
    if (d <= 0) return "today";
    if (d === 1) return "yesterday";
    if (d < 7) return d + " days ago";
    if (d < 14) return "1 week ago";
    if (d < 45) return Math.round(d / 7) + " weeks ago";
    if (d < 60) return "1 month ago";
    if (d < 365) return Math.round(d / 30) + " months ago";
    const y = (d / 365); return (y < 1.5 ? "1 year" : Math.round(y) + " years") + " ago";
  }

  // ============================ fit score (scoring-config.js driven) =========
  // All tunable values live in window.SCORING_CONFIG; this is behavior only.
  const CFG = window.SCORING_CONFIG || { SCORING: { FIT_TARGET: 18, DISPLAY_CAP: 98, DISPLAY_FLOOR: 5, WEIGHTS: { title: 3, roleFamily: 3, skillTags: 2, description: 1 }, COVERAGE_BLEND: 0, DISQUALIFIER_PENALTY: 1, TIERS: { teal: 85, neutral: 70 } }, ALIAS_MAP: {}, BIGRAMS: [], CORE_COMPETENCIES: [], DISQUALIFIERS: [], EXTRA_STOPWORDS: [] };
  const SC = CFG.SCORING, W = SC.WEIGHTS;
  const STOP = new Set("the and for with that into your you are our who all this from will plus etc a an of to in on at by or as is be we you’ll".split(" ").concat(CFG.EXTRA_STOPWORDS || []));
  function tokenize(s) { return (String(s || "").toLowerCase().match(/[a-z][a-z0-9+&#./-]+/g) || []); }

  // --- alias (Phase 2) + bigram (Phase 3) structures from config ---
  const variantToCanon = new Map();
  Object.entries(CFG.ALIAS_MAP).forEach(([canon, vars]) => { variantToCanon.set(canon.toLowerCase(), canon); (vars || []).forEach((v) => variantToCanon.set(String(v).toLowerCase(), canon)); });
  const SINGLE = new Map(); const PHRASES = [];
  variantToCanon.forEach((canon, variant) => { if (/\s/.test(variant)) PHRASES.push({ phrase: variant, canon }); else SINGLE.set(variant, canon); });
  (CFG.BIGRAMS || []).forEach((bg) => { const p = String(bg).toLowerCase(); PHRASES.push({ phrase: p, canon: variantToCanon.get(p) || p }); });
  PHRASES.sort((a, b) => b.phrase.length - a.phrase.length);
  const wordAdj = (ch) => ch && /[a-z0-9]/.test(ch);

  // text → Set of canonical tokens: detect phrases/bigrams first, then single words
  function canonSet(text) {
    const out = new Set();
    let work = " " + String(text || "").toLowerCase().replace(/\s+/g, " ") + " ";
    for (const { phrase, canon } of PHRASES) {
      let i = work.indexOf(phrase);
      while (i >= 0) {
        if (!wordAdj(work[i - 1]) && !wordAdj(work[i + phrase.length])) { out.add(canon); work = work.slice(0, i) + " " + work.slice(i + phrase.length); i = work.indexOf(phrase); }
        else { i = work.indexOf(phrase, i + 1); }
      }
    }
    for (const t of tokenize(work)) { if (STOP.has(t)) continue; const c = SINGLE.get(t) || t; if (!STOP.has(c)) out.add(c); }
    return out;
  }

  // --- vocabulary: résumé (full weight) + bio (Phase 4, ×1 only) ---
  const _vocab = (parts) => { const s = new Set(); parts.forEach((p) => canonSet(p).forEach((t) => s.add(t))); return s; };
  const RZ = window.RESUME || {}, BZ = window.BIO || {};
  const resumeVocab = _vocab([RZ.title, RZ.summary,
    ...((RZ.competencies || []).flatMap((c) => [c.group, ...(c.items || [])])),
    ...((RZ.experience || []).flatMap((e) => [e.role, ...(e.bullets || [])]))]);
  const bioVocab = _vocab([BZ.tagline, BZ.summary,
    ...((BZ.experience || []).flatMap((e) => [e.role, ...(e.points || [])])),
    ...((BZ.skills || []).flatMap((s) => s.items || [])),
    ...((BZ.education || []).map((e) => e.deg))]);
  const vocabAll = new Set([...resumeVocab, ...bioVocab]);

  // --- disqualifiers (Phase 5b): whole-token / whole-phrase match only ---
  // Single words match as whole tokens (so "k12" won't fire inside "non-k12",
  // "director" won't fire in "directory"); multi-word terms match as phrases.
  const DISQ_SINGLE = [], DISQ_PHRASE_RX = [];
  (CFG.DISQUALIFIERS || []).forEach((d) => {
    const dl = String(d).toLowerCase();
    if (/\s/.test(dl)) {
      const esc = dl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
      try { DISQ_PHRASE_RX.push(new RegExp("(?<![a-z0-9])" + esc + "(?![a-z0-9])", "i")); } catch (e) { DISQ_PHRASE_RX.push(new RegExp("\\b" + esc + "\\b", "i")); }
    } else { DISQ_SINGLE.push(dl); }
  });
  function hasDisqualifier(text) {
    const l = String(text || "").toLowerCase();
    const toks = new Set(tokenize(l));
    if (DISQ_SINGLE.some((d) => toks.has(d))) return true;
    return DISQ_PHRASE_RX.some((rx) => rx.test(l));
  }

  // --- absolute score (Phase 1) + coverage blend (Phase 5a), memoized ---
  const _scoreCache = new Map();
  function scoreCard(j) {
    if (_scoreCache.has(j.id)) return _scoreCache.get(j.id);
    const titleC = canonSet(j.title), roleC = canonSet((j.roleFamily || []).join(" ")),
      tagC = canonSet((j.tags || []).join(" ")), descC = canonSet((j.description || "") + " " + (j.fit || ""));
    let raw = 0; const matched = new Set();
    const add = (set, fieldW) => set.forEach((t) => { if (resumeVocab.has(t)) { raw += fieldW; matched.add(t); } else if (bioVocab.has(t)) { raw += W.description; matched.add(t); } });
    add(titleC, W.title); add(roleC, W.roleFamily); add(tagC, W.skillTags);
    descC.forEach((t) => { if (resumeVocab.has(t) || bioVocab.has(t)) { raw += W.description; matched.add(t); } });
    const cardAll = new Set([...titleC, ...roleC, ...tagC, ...descC]);
    const core = CFG.CORE_COMPETENCIES || [];
    const hitCore = core.filter((c) => cardAll.has(c));
    const coverage = core.length ? hitCore.length / core.length : 0;
    let blended = raw * (1 - SC.COVERAGE_BLEND + SC.COVERAGE_BLEND * coverage);
    const disq = hasDisqualifier([j.title, (j.roleFamily || []).join(" "), j.description, (j.tags || []).join(" ")].join("  "));
    if (disq) blended *= SC.DISQUALIFIER_PENALTY;
    let displayed = Math.round((blended / SC.FIT_TARGET) * 100);
    displayed = Math.max(SC.DISPLAY_FLOOR, Math.min(SC.DISPLAY_CAP, displayed));
    const res = { displayed, raw, blended, coverage, hitCore, disq, matched: [...matched] };
    _scoreCache.set(j.id, res);
    return res;
  }
  function fitPct(j) { return scoreCard(j).displayed; }
  function rawFit(j) { return scoreCard(j).blended; } // sort key

  // ============================ filter UI ===================================
  function countFor(key, val) {
    return ALL.filter((j) => { const v = j[key]; return Array.isArray(v) ? v.includes(val) : v === val; }).length;
  }
  function buildFacet(containerId, key) {
    const wrap = document.querySelector("#" + containerId + " .filter-chips");
    wrap.innerHTML = "";
    const values = key === "kind" ? ["posting", "search", "company"] : uniqueValues(key);
    values.forEach((val) => {
      const chip = document.createElement("button");
      chip.className = "chip" + (state.facets[key].has(val) ? " active" : "");
      chip.innerHTML = (key === "kind" ? kindLabel[val] : esc(val)) + ` <span class="chip-count">${countFor(key, val)}</span>`;
      chip.addEventListener("click", () => {
        const set = state.facets[key]; set.has(val) ? set.delete(val) : set.add(val);
        chip.classList.toggle("active"); render();
      });
      wrap.appendChild(chip);
    });
  }
  function buildStatusFilter() {
    const wrap = document.querySelector("#filter-status .filter-chips");
    wrap.innerHTML = "";
    STATUS.forEach((s) => {
      const n = Object.values(status).filter((v) => v === s.key).length;
      const chip = document.createElement("button");
      chip.className = "chip" + (state.facets.status.has(s.key) ? " active" : "");
      chip.innerHTML = esc(s.label) + (n ? ` <span class="chip-count">${n}</span>` : "");
      chip.addEventListener("click", () => {
        const set = state.facets.status; set.has(s.key) ? set.delete(s.key) : set.add(s.key);
        chip.classList.toggle("active"); render();
      });
      wrap.appendChild(chip);
    });
  }
  function uniqueValues(key) {
    const s = new Set();
    ALL.forEach((j) => { const v = j[key]; if (Array.isArray(v)) v.forEach((x) => s.add(x)); else if (v) s.add(v); });
    return [...s].sort();
  }

  // ============================ matching ====================================
  function matches(j) {
    if (state.q) {
      const hay = [j.title, j.company, j.location, j.description, j.fit, (j.tags || []).join(" "), (j.roleFamily || []).join(" "), notes[j.id] || ""].join(" ").toLowerCase();
      if (!hay.includes(state.q)) return false;
    }
    if (state.toggles.hidden) { if (!hidden.has(j.id)) return false; }
    else if (hidden.has(j.id)) return false;
    if (!state.toggles.snoozed && isSnoozed(j.id)) return false; // Phase 10d
    else if (state.toggles.snoozed && !isSnoozed(j.id)) return false;
    if (state.toggles.new && !isNew(j)) return false;
    if (state.toggles.starred && !starred.has(j.id)) return false;
    if (state.toggles.flagged && !flagged.has(j.id)) return false;
    const f = state.facets;
    if (f.roleFamily.size && !(j.roleFamily || []).some((r) => f.roleFamily.has(r))) return false;
    if (f.regions.size && !(j.regions || []).some((r) => f.regions.has(r))) return false;
    if (f.workMode.size && !f.workMode.has(j.workMode)) return false;
    if (f.kind.size && !f.kind.has(j.kind)) return false;
    if (f.status.size && !f.status.has(status[j.id] || "")) return false;
    if (f.skills.size && !(j.tags || []).some((t) => f.skills.has(t))) return false;
    const top = j.salaryMax || j.salaryMin || 0;
    if (state.minSalary > 0 && top > 0 && top < state.minSalary) return false;
    if (state.minFit > 0 && fitPct(j) < state.minFit) return false;
    return true;
  }
  function sortJobs(list) {
    const arr = list.slice();
    if (state.sort === "salary") arr.sort((a, b) => (b.salaryMax || b.salaryMin || 0) - (a.salaryMax || a.salaryMin || 0));
    else if (state.sort === "fit") arr.sort((a, b) => rawFit(b) - rawFit(a));
    else if (state.sort === "commute") arr.sort((a, b) => { const ca = commuteInfo(a), cb = commuteInfo(b); return (ca ? ca.min : Infinity) - (cb ? cb.min : Infinity); });
    else if (state.sort === "company") arr.sort((a, b) => a.company.localeCompare(b.company));
    else if (state.sort === "title") arr.sort((a, b) => a.title.localeCompare(b.title));
    else arr.sort((a, b) => { const n = (isNew(b) ? 1 : 0) - (isNew(a) ? 1 : 0); return n || String(b.dateAdded).localeCompare(String(a.dateAdded)); });
    return arr;
  }

  // ============================ card render =================================
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const shortDate = (iso) => /^\d{4}-\d{2}-\d{2}/.test(iso || "") ? MON[+iso.slice(5, 7) - 1] + " " + (+iso.slice(8, 10)) : "";
  function compactSal(j) {
    if (j.salaryMin && j.salaryMax) return "$" + Math.round(j.salaryMin / 1000) + "–" + Math.round(j.salaryMax / 1000) + "k";
    if (j.salaryMin || j.salaryMax) return "$" + Math.round((j.salaryMax || j.salaryMin) / 1000) + "k";
    return "";
  }
  const shortLoc = (loc) => (loc || "").replace(/\s*\([^)]*\)\s*/g, "").split(/[/,]/)[0].trim() || (loc || "");
  const tierClass = (p) => p >= SC.TIERS.teal ? "tier-hi" : p >= SC.TIERS.neutral ? "tier-mid" : "tier-lo";

  let _watchedCos = new Set(); // Phase 10c — companies with at least one starred card
  function refreshWatchedCos() { _watchedCos = new Set(ALL.filter((j) => starred.has(j.id)).map((j) => (j.company || "").toLowerCase())); }

  function cardHTML(j) {
    const st = status[j.id] || "", note = notes[j.id] || "";
    const sc = scoreCard(j), pct = sc.displayed, tier = tierClass(pct);
    const live = j.status === "live" || j.live;
    const topSal = j.salaryMax || j.salaryMin || 0;
    const walkOK = walkaway > 0 && topSal >= walkaway;                                   // Phase 10a
    const watchedCoNew = isNew(j) && !starred.has(j.id) && _watchedCos.has((j.company || "").toLowerCase()); // Phase 10c
    const resurfaced = resurfacedThisVisit.has(j.id);                                    // Phase 10d
    let typeText = j.kind === "company" ? "Company · watch" : j.kind === "search" ? "Search" : "Posting";
    if (j.kind === "posting") { if (j.status === "verified") typeText += " · verified"; else if (j.status === "snapshot") typeText += " · snapshot"; }
    const kicker = `<div class="r-kicker">${isNew(j) ? `<span class="r-new">New</span>` : ""}${resurfaced ? `<span class="r-resurfaced">⏰ Resurfaced</span>` : ""}${live ? `<span class="r-live">Live</span>` : ""}${watchedCoNew ? `<span class="r-watchco">★ watched co</span>` : ""}${walkOK ? `<span class="r-walk" title="Clears your walk-away number ($${Math.round(walkaway / 1000)}k)">✓ your #</span>` : ""}<span class="r-type">${esc(typeText)}</span></div>`;

    const csal = compactSal(j);
    const sub = `<div class="r-sub"><span class="co">${esc(j.company)}</span>${j.location ? ` · ${esc(shortLoc(j.location))}` : ""}${csal ? ` · <span class="sal">${esc(csal)}</span>` : ""}</div>`;

    const whyTxt = (j.fit || "").replace(/^Fit:\s*/i, "");
    const why = whyTxt ? `<p class="r-why"><span class="r-why-t">${esc(whyTxt).replace(/^(\S+\s+\S+)/, "<b>$1</b>")}</span></p>` : "";

    const allTags = j.tags || [];
    const visT = allTags.slice(0, 3).map((t) => `<span class="r-tag">${esc(t)}</span>`).join("");
    const hidT = allTags.slice(3).map((t) => `<span class="r-tag hid">${esc(t)}</span>`).join("");
    const moreN = allTags.length - 3;
    const tagsRow = allTags.length ? `<div class="r-tags">${visT}${hidT}${moreN > 0 ? `<button class="r-tagmore" data-more="${moreN}" type="button">+${moreN}</button>` : ""}</div>` : "";

    const dead = j.linkStatus === "dead", exp = mayBeExpired(j);
    const alert = dead ? `<div class="r-alert">⛔ Apply link returned 404 — try the alt link</div>`
      : exp ? `<div class="r-alert">⚠ Snapshot — verify it's still live</div>` : "";

    // Phase 7: muted relative age on the foot (absolute date stays in the drawer).
    const age = live ? "Live feed" : j.kind === "company" ? "Watch" : relAge(j.posted || j.dateAdded);
    const footMeta = `<span class="m">🧭 ${esc(j.workMode || "")}</span>${age ? `<span class="m age" title="${esc(j.posted || j.dateAdded || "")}">${esc(age)}</span>` : ""}`;

    // drawer — the full record, nothing lost
    const ci = commuteInfo(j);
    // Phase 7: only show commute for roles with a real CT location — never "n/a"/"0 mi" for Remote.
    const commuteRow = ci ? `<div><span class="rd-k">Commute</span><span class="rd-v">${ci.mi > 0 ? `🚗 ~${ci.mi} mi · ~${ci.min} min` : "🚗 Guilford (home)"}</span></div>` : "";
    const linkStr = j.linkStatus ? `${j.linkStatus === "dead" ? "⛔ dead" : "✓ " + esc(j.linkStatus)}${j.linkChecked ? " · " + esc(j.linkChecked) : ""}` : "—";
    const role = (j.roleFamily || []).join(" · ");
    const statusOpts = `<option value="">— set status —</option>` + STATUS.map((s) => `<option value="${s.key}"${s.key === st ? " selected" : ""}>${esc(s.label)}</option>`).join("");
    const primaryLabel = j.kind === "search" ? "Open live search" : j.kind === "company" ? "View careers" : "View posting";
    const foot = dead
      ? `<a class="btn ghost dead" title="Primary link returned 404">⛔ Primary dead</a><a class="btn primary" href="${esc(j.altUrl || j.applyUrl)}" target="_blank" rel="noopener">Try alt link ↗</a>`
      : `<a class="btn primary" href="${esc(j.applyUrl)}" target="_blank" rel="noopener">${primaryLabel} ↗</a>${j.altUrl ? `<a class="btn ghost" href="${esc(j.altUrl)}" target="_blank" rel="noopener">Alt link</a>` : ""}`;
    const allSkills = allTags.map((t) => `<span class="r-tag">${esc(t)}</span>`).join("");
    const coreN = (CFG.CORE_COMPETENCIES || []).length;
    // v1.8.1 (Claude Design) — "score anatomy": segmented coverage meter, matches
    // bar, coral penalty row, and core-competency chips (hit solid / missing dashed).
    const matchPct = Math.min(100, Math.round(sc.matched.length / 20 * 100));
    const segs = Array.from({ length: coreN }, (_, i) =>
      `<span class="sa-seg${i < sc.hitCore.length ? " on" : ""}"></span>`).join("");
    const missCore = (CFG.CORE_COMPETENCIES || []).filter((c) => !sc.hitCore.includes(c));
    const coreChips =
      sc.hitCore.map((c) => `<span class="sa-chip">${esc(c)}</span>`).join("") +
      missCore.map((c) => `<span class="sa-chip miss">${esc(c)}</span>`).join("");
    const breakdown = `
        <div class="sa">
          <div class="sa-head">
            <span class="sa-title">Why this score</span>
            <span class="sa-score">${pct}<span class="of"> / 100</span></span>
          </div>
          <div class="sa-row">
            <span class="sa-k">Core coverage</span>
            <div class="sa-meter">${segs}</div>
            <span class="sa-v">${sc.hitCore.length}/${coreN} <span class="pct">${Math.round(sc.coverage * 100)}%</span></span>
          </div>
          <div class="sa-row">
            <span class="sa-k">Résumé &amp; bio matches</span>
            <div class="sa-bar2"><i style="width:${matchPct}%"></i></div>
            <span class="sa-v">${sc.matched.length}</span>
          </div>
          ${sc.disq ? `<div class="sa-disq"><span class="x">×${SC.DISQUALIFIER_PENALTY}</span> Disqualifier penalty applied — contains an excluded term</div>` : ""}
          ${(sc.hitCore.length || missCore.length) ? `<div class="sa-core"><span class="sa-core-l">Core competencies</span><div class="sa-chips">${coreChips}</div></div>` : ""}
        </div>`;
    const drawer = `
      <div class="r-drawer">
        ${j.description ? `<div><div class="rd-h">Full description</div><p class="rd-p">${esc(j.description)}</p></div>` : ""}
        ${j.fit ? `<div><div class="rd-h">Why it fits</div><p class="rd-why">${esc(j.fit)}</p></div>` : ""}
        ${breakdown}
        <div class="rd-grid">
          <div><span class="rd-k">Location</span><span class="rd-v">📍 ${esc(j.location || "—")}</span></div>
          <div><span class="rd-k">Work mode</span><span class="rd-v">🧭 ${esc(j.workMode || "—")}</span></div>
          ${commuteRow}
          <div><span class="rd-k">Salary</span><span class="rd-v">💰 ${esc(j.salary || "see posting")}</span></div>
          <div><span class="rd-k">Posted</span><span class="rd-v">📅 ${esc(j.posted || (live ? "Live — never stale" : "—"))}</span></div>
          <div><span class="rd-k">Role family</span><span class="rd-v">🗂 ${esc(role || "—")}</span></div>
          <div><span class="rd-k">Source</span><span class="rd-v">${esc(j.source || "—")}</span></div>
          <div><span class="rd-k">Link check</span><span class="rd-v">${linkStr}</span></div>
        </div>
        ${allSkills ? `<div><div class="rd-h">All skills</div><div class="r-tags">${allSkills}</div></div>` : ""}
        <div class="rd-controls">
          <select class="status-select" data-act="status">${statusOpts}</select>
          <button class="rd-mini" data-act="outreach" type="button">✍ Draft outreach</button>
          ${isSnoozed(j.id)
            ? `<span class="rd-snoozed" title="Resurfaces on this date">⏰ snoozed → ${esc((snooze[j.id] || "").slice(0, 10))}</span><button class="rd-mini" data-act="unsnooze" type="button">Unsnooze</button>`
            : `<button class="rd-mini" data-act="snooze" data-days="7" type="button">⏰ 1 wk</button><button class="rd-mini" data-act="snooze" data-days="30" type="button">⏰ 1 mo</button>`}
        </div>
        <div><div class="rd-h">Private note</div><textarea class="rd-note" placeholder="Synced across your devices…">${esc(note)}</textarea></div>
        <div class="rd-foot">${foot}</div>
      </div>`;

    const cls = ["card", tier];
    if (starred.has(j.id)) cls.push("starred");
    if (hidden.has(j.id)) cls.push("is-hidden");
    if (matchesWatch(j)) cls.push("is-watched");

    return `
    <article class="${cls.join(" ")}" data-id="${esc(j.id)}">
      <div class="r-top">
        <div class="r-headwrap">
          ${kicker}
          <h3 class="card-title">${esc(j.title)}</h3>
          ${sub}
        </div>
        <div class="r-fit">
          <div class="r-fit-num">${pct}</div>
          <span class="r-fit-label">Fit</span>
          <div class="r-fit-bar"><i style="width:${pct}%"></i></div>
        </div>
      </div>
      ${why}
      ${tagsRow}
      ${alert}
      <div class="r-foot">
        <div class="r-foot-meta">${footMeta}</div>
        <div class="r-foot-right">
          <div class="r-actions">
            <button class="r-act star${starred.has(j.id) ? " on" : ""}" data-act="star" title="Star">★</button>
            <button class="r-act flag${flagged.has(j.id) ? " on" : ""}" data-act="flag" title="Flag">⚑</button>
            <button class="r-act hide${hidden.has(j.id) ? " on" : ""}" data-act="hide" title="${hidden.has(j.id) ? "Unhide" : "Hide"}">${hidden.has(j.id) ? "↩" : "🚫"}</button>
            <a class="r-act open" href="${esc(j.applyUrl)}" target="_blank" rel="noopener" title="Open">↗</a>
          </div>
          <button class="r-details" type="button">Details<span class="chev">⌄</span></button>
        </div>
      </div>
      ${drawer}
    </article>`;
  }

  function render() {
    refreshWatchedCos();
    let list = sortJobs(ALL.filter(matches));
    if (watchTerms.length) { const w = list.filter(matchesWatch), r = list.filter((j) => !matchesWatch(j)); list = w.concat(r); }
    const cards = document.getElementById("cards");
    cards.innerHTML = list.map(cardHTML).join("");
    document.getElementById("emptyState").hidden = list.length > 0;

    const total = ALL.length, newCount = ALL.filter(isNew).length, hiddenCount = hidden.size;
    document.getElementById("resultCount").textContent =
      `${list.length} of ${total} opportunities` + (newCount ? ` · ${newCount} new` : "") + (hiddenCount ? ` · ${hiddenCount} hidden` : "");

    wireCards(cards);
  }

  function wireCards(cards) {
    // title → existing full-screen detail modal
    cards.querySelectorAll(".card-title").forEach((t) => {
      t.addEventListener("click", (e) => { e.stopPropagation(); openDetail(t.closest(".card").dataset.id); });
    });
    // hover actions: star / flag / hide (open-link is a plain <a>, no data-act)
    cards.querySelectorAll(".r-act[data-act]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const card = btn.closest(".card"), id = card.dataset.id, act = btn.dataset.act;
        if (act === "star" || act === "flag") {
          const set = act === "star" ? starred : flagged;
          set.has(id) ? set.delete(id) : set.add(id);
          saveSet(act === "star" ? LS.starred : LS.flagged, set);
          btn.classList.toggle("on");
          if (act === "star") card.classList.toggle("starred", starred.has(id));
          scheduleSync();
        } else if (act === "hide") {
          hidden.has(id) ? hidden.delete(id) : hidden.add(id);
          saveSet(LS.hidden, hidden); scheduleSync(); render();
        }
      });
    });
    // expand-in-place: Details drawer + +N tags (per the handoff)
    cards.querySelectorAll(".r-details").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const open = btn.closest(".card").classList.toggle("open");
        btn.childNodes[0].nodeValue = open ? "Hide " : "Details";
      });
    });
    cards.querySelectorAll(".r-tagmore").forEach((btn) => {
      const n = btn.getAttribute("data-more");
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const open = btn.closest(".card").classList.toggle("tags-open");
        btn.textContent = open ? "− less" : "+" + n;
      });
    });
    // status select (in drawer) — existing handler
    cards.querySelectorAll(".status-select").forEach((sel) => {
      sel.addEventListener("change", (e) => {
        e.stopPropagation();
        const id = sel.closest(".card").dataset.id;
        if (sel.value) status[id] = sel.value; else delete status[id];
        saveMap(LS.status, status); scheduleSync(); buildStatusFilter(); render();
      });
    });
    // note textarea (in drawer) — debounced persist + sync
    cards.querySelectorAll(".rd-note").forEach((ta) => {
      let t = null;
      ta.addEventListener("input", () => {
        const id = ta.closest(".card").dataset.id;
        clearTimeout(t);
        t = setTimeout(() => {
          if (ta.value.trim()) notes[id] = ta.value; else delete notes[id];
          saveMap(LS.notes, notes); scheduleSync();
        }, 700);
      });
    });
    cards.querySelectorAll('[data-act="outreach"]').forEach((b) => {
      b.addEventListener("click", (e) => { e.stopPropagation(); openOutreach(b.closest(".card").dataset.id); });
    });
    // Phase 10d: snooze / unsnooze
    cards.querySelectorAll('[data-act="snooze"]').forEach((b) => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = b.closest(".card").dataset.id, days = +b.dataset.days;
        const until = new Date(Date.now() + days * 86400000).toISOString();
        snooze[id] = until; saveMap(LS.snooze, snooze); scheduleSync(); render();
      });
    });
    cards.querySelectorAll('[data-act="unsnooze"]').forEach((b) => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = b.closest(".card").dataset.id;
        delete snooze[id]; saveMap(LS.snooze, snooze); scheduleSync(); render();
      });
    });
  }

  // ============================ outreach modal ==============================
  function openOutreach(id) {
    const j = ALL.find((x) => x.id === id); if (!j) return;
    const r = window.RESUME || {};
    const fam = (j.roleFamily || ["this area"])[0];
    const text =
`Dear ${j.company} Hiring Team,

I'm reaching out regarding the ${j.title} role. ${j.fit ? j.fit.replace(/^Fit:\s*/, "") : ""}

As a SAFe-certified Staff Product Owner whose background spans ${fam.toLowerCase()}, instructional design, technical communication, and a Computer Science & Computer Engineering foundation, I bring an unusual combination of product ownership and the ability to make complex products usable for both engineers and end users. ${r.summary ? r.summary.split(".").slice(0, 1)[0] + "." : ""}

I'd welcome the chance to discuss how I could contribute to your team.

Best regards,
John L. Evans
${(r.contact && r.contact.email) || "johnlorinevans@gmail.com"} · ${(r.contact && r.contact.phone) || "(203) 676-3551"}`;
    document.getElementById("outreachTitle").textContent = "Draft outreach — " + j.title + " · " + j.company;
    document.getElementById("outreachText").value = text;
    document.getElementById("outreachModal").hidden = false;
  }

  // ============================ bio / resume ================================
  function renderBio() {
    const b = window.BIO; if (!b) return;
    const exp = b.experience.map((e) => `
      <div class="job-entry"><div class="je-head">
        <div><span class="je-role">${esc(e.role)}</span> &nbsp;<span class="je-co">${esc(e.company)} · ${esc(e.where)}</span></div>
        <div class="je-dates">${esc(e.dates)}</div></div>
        <ul>${e.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></div>`).join("");
    const skills = b.skills.map((s) => `<div class="skill-card"><h3>${esc(s.group)}</h3><div class="pills">${s.items.map((i) => `<span class="pill">${esc(i)}</span>`).join("")}</div></div>`).join("");
    const edu = b.education.map((e) => `<div class="edu-item"><div><div class="deg">${esc(e.deg)}</div><div class="school">${esc(e.school)}</div></div><div class="yr">${esc(e.yr)}</div></div>`).join("");
    document.getElementById("bioContent").innerHTML = `
      <div class="bio-hero"><h1>${esc(b.name)}</h1><div class="tagline">${esc(b.tagline)}</div>
        <div class="contact"><span>📍 ${esc(b.location)}</span><a href="mailto:${esc(b.email)}">✉ ${esc(b.email)}</a><span>📞 ${esc(b.phone)}</span></div>
        <p class="summary">${esc(b.summary)}</p></div>
      <div class="bio-section"><h2>Experience</h2>${exp}</div>
      <div class="bio-section"><h2>Skills</h2><div class="skill-grid">${skills}</div></div>
      <div class="bio-section"><h2>Certifications</h2><div class="tag-row">${b.certifications.map((c) => `<span class="tag">${esc(c)}</span>`).join("")}</div></div>
      <div class="bio-section"><h2>Education</h2>${edu}</div>`;
  }

  let resumeVariant = "general";
  function renderResume() {
    const r = window.RESUME; if (!r) return;
    const variants = window.RESUME_VARIANTS || [{ key: "general", label: "General", title: r.title, summary: r.summary, downloadFile: r.downloadFile }];
    const v = variants.find((x) => x.key === resumeVariant) || variants[0];
    // competency ordering: lead with the variant's emphasis group(s)
    let comps = r.competencies.slice();
    if (v.lead) comps.sort((a, b) => (v.lead.includes(b.group) ? 1 : 0) - (v.lead.includes(a.group) ? 1 : 0));
    const compHTML = comps.map((c) => `<div class="skill-card"><h3>${esc(c.group)}</h3><div class="pills">${c.items.map((i) => `<span class="pill">${esc(i)}</span>`).join("")}</div></div>`).join("");
    const exp = r.experience.map((e) => `
      <div class="job-entry"><div class="je-head">
        <div><span class="je-role">${esc(e.role)}</span> &nbsp;<span class="je-co">${esc(e.company)} · ${esc(e.where)}</span></div>
        <div class="je-dates">${esc(e.dates)}</div></div>
        <ul>${e.bullets.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></div>`).join("");
    const edu = r.education.map((e) => `<div class="edu-item"><div><div class="deg">${esc(e.deg)}</div><div class="school">${esc(e.school)}</div></div><div class="yr">${esc(e.yr)}</div></div>`).join("");
    const variantBtns = variants.map((x) => `<button class="vbtn${x.key === resumeVariant ? " active" : ""}" data-variant="${x.key}">${esc(x.label)}</button>`).join("");

    document.getElementById("resumeContent").innerHTML = `
      <div class="variant-bar"><span class="variant-label">Tailored version:</span>${variantBtns}</div>
      <div class="bio-hero"><div class="resume-top"><div>
        <h1>${esc(r.name)}</h1><div class="tagline">${esc(v.title)}</div>
        <div class="contact"><span>📍 ${esc(r.contact.location)}</span><a href="mailto:${esc(r.contact.email)}">✉ ${esc(r.contact.email)}</a><span>📞 ${esc(r.contact.phone)}</span></div>
      </div><div class="resume-dl">
        <a class="btn primary dl" href="${esc(v.downloadFile)}" download>⬇ Word (.docx)</a>
        <button class="btn ghost dl" id="printResume">🖨 Save as PDF</button>
      </div></div>
      <p class="summary">${esc(v.summary)}</p></div>
      <div class="bio-section"><h2>Core Competencies</h2><div class="skill-grid">${compHTML}</div></div>
      <div class="bio-section"><h2>Professional Experience</h2>${exp}</div>
      <div class="bio-section"><h2>Certifications</h2><div class="tag-row">${r.certifications.map((c) => `<span class="tag">${esc(c)}</span>`).join("")}</div></div>
      <div class="bio-section"><h2>Education</h2>${edu}</div>
      <p class="resume-foot-note">AI-restructured résumé. Switch the tailored version above to re-emphasize for a target role; each has its own Word download. "Save as PDF" prints this view.</p>`;

    document.querySelectorAll(".vbtn").forEach((b) => b.addEventListener("click", () => { resumeVariant = b.dataset.variant; renderResume(); }));
    document.getElementById("printResume").addEventListener("click", () => { document.body.classList.add("printing-resume"); window.print(); setTimeout(() => document.body.classList.remove("printing-resume"), 500); });
  }

  // ============================ sync UI =====================================
  function initSyncUI() {
    const modal = document.getElementById("syncModal");
    const open = () => {
      if (sync.cfg) { document.getElementById("binId").value = sync.cfg.binId || ""; document.getElementById("binKey").value = sync.cfg.key || ""; document.getElementById("binKeyType").value = sync.cfg.keyType || "access"; }
      syncStatus(sync.on() ? (sync.usingDefault() ? "Sync is ON via the built-in default — works on all devices automatically." : "Sync is ON (per-device override).") : "Sync is off on this device.", sync.on() ? "ok" : "");
      modal.hidden = false;
    };
    const close = () => { modal.hidden = true; };
    document.getElementById("syncBtn").addEventListener("click", open);
    document.getElementById("syncClose").addEventListener("click", close);
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
    document.getElementById("syncSave").addEventListener("click", async () => {
      const binId = document.getElementById("binId").value.trim(), key = document.getElementById("binKey").value.trim(), keyType = document.getElementById("binKeyType").value;
      if (!binId || !key) { syncStatus("Enter both a Bin ID and a key.", "err"); return; }
      sync.save({ binId, key, keyType }); syncStatus("Saved. Syncing…", "");
      try { await syncPull(); await syncPush(); setSyncState("synced ✓"); syncStatus("Connected and synced ✓", "ok"); refreshFacets(); render(); }
      catch (e) { setSyncState("sync error"); syncStatus(String(e.message || e), "err"); }
    });
    document.getElementById("syncNow").addEventListener("click", async () => {
      if (!sync.on()) { syncStatus("Save a Bin ID + key first.", "err"); return; }
      syncStatus("Syncing…", "");
      try { await syncPull(); await syncPush(); setSyncState("synced ✓"); syncStatus("Synced ✓", "ok"); refreshFacets(); render(); }
      catch (e) { setSyncState("sync error"); syncStatus(String(e.message || e), "err"); }
    });
    document.getElementById("syncDisable").addEventListener("click", () => { sync.forget(); document.getElementById("binId").value = ""; document.getElementById("binKey").value = ""; setSyncState("Sync off"); syncStatus("Turned off; key removed from this browser.", ""); });
  }

  // ============================ live listings ===============================
  // CORS-enabled JSON boards. Roles filtered to John's families + remote/CT.
  // Verified CORS-open boards with remote-US/CT roles in John's families.
  const LIVE_BOARDS = [
    { src: "greenhouse", token: "samsara",   label: "Samsara" },
    { src: "greenhouse", token: "gitlab",    label: "GitLab" },
    { src: "greenhouse", token: "instacart", label: "Instacart" },
    { src: "greenhouse", token: "affirm",    label: "Affirm" },
    { src: "greenhouse", token: "twilio",    label: "Twilio" },
    { src: "greenhouse", token: "dropbox",   label: "Dropbox" },
    { src: "greenhouse", token: "webflow",   label: "Webflow" },
    { src: "greenhouse", token: "benchprep", label: "BenchPrep" },
    { src: "greenhouse", token: "lattice",   label: "Lattice" },
    { src: "ashby",      token: "vanta",     label: "Vanta" },
    { src: "ashby",      token: "ashby",     label: "Ashby" },
    { src: "ashby",      token: "openai",    label: "OpenAI" }
  ];
  const ROLE_RX = [
    [/product\s+(owner|manager)/i, "Product Owner / PM"],
    [/program manager|technical program/i, "Product Owner / PM"],
    [/instructional|curriculum|learning experience|learning design/i, "Instructional Design / L&D"],
    [/enablement|customer education|technical trainer|\btrainer\b/i, "Customer Education / Enablement"],
    [/learning (experience|design|develop|specialist|architect)|learning &|\bl&d\b|\btraining\b/i, "Instructional Design / L&D"],
    [/technical writer|documentation|content strateg|knowledge manage/i, "Technical Writing / Content"],
    [/scrum master|agile coach|release train/i, "Scrum Master / Agile"],
    [/business analyst|systems analyst/i, "Business Analyst"],
    [/customer success/i, "Customer Education / Enablement"],
    [/implementation|solutions consultant|onboarding/i, "Solutions / Implementation"]
  ];
  const TITLE_RX = /product\s+(owner|manager)|technical program manager|program manager|instructional|curriculum|enablement|learning experience|learning design|learning &|\bl&d\b|learning and development|learning specialist|learning architect|corporate trainer|\btrainer\b|technical writer|documentation|content strateg|knowledge manage|scrum master|agile coach|release train|business analyst|systems analyst|customer success|customer education|implementation (manager|consultant|specialist|lead)|solutions consultant|onboarding (manager|specialist)/i;
  const EXCLUDE_RX = /intern|sales (rep|develop|account)|\bsdr\b|\bbdr\b|machine learning|deep learning|data engineer|data scientist|software engineer|account executive|\bvp\b|recruit|warehouse|driver/i;
  function locOK(loc) {
    const l = (loc || "").toLowerCase();
    if (/connecticut|new haven|hartford|stamford|norwalk|\bct\b/.test(l)) return true;
    // word-boundary US match so "Austria"/"Australia" don't sneak in via "us"
    if (/remote/.test(l) && /(\bus\b|\busa\b|u\.s|united states|america|anywhere|nationwide)/.test(l)) return true;
    if (/^remote$/.test(l.trim())) return true;
    return false;
  }
  function rolesFor(title) {
    const out = []; ROLE_RX.forEach(([rx, fam]) => { if (rx.test(title) && !out.includes(fam)) out.push(fam); });
    return out.length ? out : ["Product Owner / PM"];
  }
  // normalize each source into {title, loc, url, posted, id, remote}
  async function fetchRaw(b) {
    if (b.src === "greenhouse") {
      const res = await fetch("https://boards-api.greenhouse.io/v1/boards/" + b.token + "/jobs");
      if (!res.ok) return [];
      return (((await res.json()) || {}).jobs || []).map((j) => ({
        title: j.title || "", loc: (j.location || {}).name || "", url: j.absolute_url,
        posted: (j.updated_at || "").slice(0, 10), id: j.id
      }));
    }
    if (b.src === "ashby") {
      const res = await fetch("https://api.ashbyhq.com/posting-api/job-board/" + b.token + "?includeCompensation=true");
      if (!res.ok) return [];
      return (((await res.json()) || {}).jobs || []).filter((j) => j.isListed !== false).map((j) => ({
        title: j.title || "", loc: j.location || (j.isRemote ? "Remote" : ""), url: j.jobUrl || j.applyUrl,
        posted: (j.publishedAt || "").slice(0, 10), id: j.id, remote: !!j.isRemote,
        sal: (j.compensation && (j.compensation.compensationTierSummary || j.compensation.scrapeableCompensationSalarySummary)) || ""
      }));
    }
    if (b.src === "lever") {
      const res = await fetch("https://api.lever.co/v0/postings/" + b.token + "?mode=json");
      if (!res.ok) return [];
      return ((await res.json()) || []).map((p) => ({
        title: p.text || "", loc: (p.categories || {}).location || "", url: p.hostedUrl,
        posted: "", id: p.id
      }));
    }
    return [];
  }
  async function fetchBoard(b) {
    try {
      const raw = await fetchRaw(b);
      const out = [], seenTitles = new Set();
      for (const j of raw) {
        if (!j.title || !j.url || !TITLE_RX.test(j.title) || EXCLUDE_RX.test(j.title) || !locOK(j.loc)) continue;
        const tkey = j.title.toLowerCase().trim();
        if (seenTitles.has(tkey)) continue;
        seenTitles.add(tkey);
        const remote = j.remote || /remote/i.test(j.loc);
        const inCT = /connecticut|new haven|hartford|stamford|norwalk|\bct\b/i.test(j.loc);
        const comp = parseComp(j.sal);
        out.push({
          id: "live-" + b.token + "-" + j.id, kind: "posting", status: "live", live: true,
          title: j.title, company: b.label, location: j.loc || (remote ? "Remote" : ""),
          workMode: remote ? "Remote" : "Hybrid", regions: inCT ? ["Connecticut"] : ["Remote"],
          roleFamily: rolesFor(j.title), salary: comp.label, salaryMin: comp.min, salaryMax: comp.max,
          posted: j.posted || "", dateAdded: new Date().toISOString().slice(0, 10),
          source: b.src + " / " + b.label, applyUrl: j.url, altUrl: "",
          tags: ["Live feed", b.label, remote ? "Remote" : "Onsite/Hybrid"],
          description: "Live listing pulled directly from " + b.label + "'s careers board.", fit: ""
        });
        if (out.length >= 6) break;
      }
      return out;
    } catch (e) { return []; }
  }
  // parse a comp string like "$120K – $150K" or "$120,000-$150,000" → {label,min,max}
  function parseComp(str) {
    if (!str) return { label: "", min: null, max: null };
    const nums = [...String(str).matchAll(/\$?\s*([\d.,]+)\s*([kK])?/g)].map((m) => {
      let n = parseFloat(m[1].replace(/,/g, "")); if (isNaN(n)) return 0;
      if (m[2]) n *= 1000; else if (n < 1000) n *= 1000; return Math.round(n);
    }).filter((n) => n >= 20000 && n <= 1000000);
    if (!nums.length) return { label: String(str).trim(), min: null, max: null };
    const min = Math.min(...nums), max = Math.max(...nums);
    return { label: String(str).trim(), min, max: max > min ? max : min };
  }
  const normKey = (j) => (j.company + "|" + j.title).toLowerCase().replace(/\s+/g, " ").trim();

  let liveLoading = false;
  async function loadLive() {
    if (liveLoading) return;
    liveLoading = true;
    const ind = document.getElementById("liveIndicator");
    const btn = document.getElementById("refreshLiveBtn");
    if (ind) ind.textContent = "⟳ refreshing live listings…";
    if (btn) { btn.disabled = true; btn.textContent = "⟳ Refreshing…"; }
    const results = await Promise.allSettled(LIVE_BOARDS.map(fetchBoard));
    const raw = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    // cross-source de-dup: drop live cards that duplicate a curated card or each other
    const staticKeys = new Set((window.JOBS || []).map(normKey));
    const seenLive = new Set(); const live = [];
    for (const j of raw) { const k = normKey(j); if (staticKeys.has(k) || seenLive.has(k)) continue; seenLive.add(k); live.push(j); }
    ALL = ALL.filter((j) => !j.live).concat(live); // replace prior live cards, don't stack
    noteSeen(live, firstDecayRun); // silence the first live batch too on the very first run
    firstDecayRun = false;         // subsequent refreshes surface genuinely-new live cards
    recordMarketSnapshot(); // include freshly-pulled live cards in the snapshot
    refreshFacets(); render();
    const mp = document.getElementById("marketPanel"); if (mp && !mp.hidden) renderMarket();
    if (ind) ind.textContent = live.length ? `● ${live.length} live listings included` : "";
    if (btn) { btn.disabled = false; btn.textContent = "🔄 Refresh live"; }
    liveLoading = false;
  }

  // Skills filter: top tags across cards, excluding generic/location/company labels.
  const SKILL_STOP = new Set(["live feed", "live search", "remote", "onsite/hybrid", "onsite", "hybrid", "current employer", "non-k12", "new haven", "branford", "hamden", "west haven", "hartford", "bloomfield", "new britain", "stamford", "norwalk", "wilton", "ridgefield", "groton", "boston", "20 min from guilford", "~25 min", "award-winning wfh", "remote-first", "remote-friendly"]);
  function buildSkillsFilter() {
    const wrap = document.querySelector("#filter-skills .filter-chips"); if (!wrap) return;
    const companies = new Set(ALL.map((j) => j.company.toLowerCase()));
    const freq = {};
    ALL.forEach((j) => (j.tags || []).forEach((t) => {
      const k = t.toLowerCase();
      if (SKILL_STOP.has(k) || companies.has(k)) return;
      if (/\d/.test(t) && /(opening|min|\bmi\b|day|hr)/i.test(t)) return;
      freq[t] = (freq[t] || 0) + 1;
    }));
    const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 20);
    wrap.innerHTML = "";
    top.forEach(([tag, n]) => {
      const chip = document.createElement("button");
      chip.className = "chip" + (state.facets.skills.has(tag) ? " active" : "");
      chip.innerHTML = esc(tag) + ` <span class="chip-count">${n}</span>`;
      chip.addEventListener("click", () => {
        const set = state.facets.skills; set.has(tag) ? set.delete(tag) : set.add(tag);
        chip.classList.toggle("active"); render();
      });
      wrap.appendChild(chip);
    });
  }
  function refreshFacets() {
    buildFacet("filter-roleFamily", "roleFamily");
    buildFacet("filter-regions", "regions");
    buildFacet("filter-workMode", "workMode");
    buildFacet("filter-kind", "kind");
    buildStatusFilter();
    buildSkillsFilter();
  }

  // ============================ map =========================================
  const CITY = {
    guilford: [41.2895, -72.6816], branford: [41.2793, -72.8151], "new haven": [41.3083, -72.9279],
    hamden: [41.3959, -72.8968], "west haven": [41.2707, -72.947], hartford: [41.7637, -72.6851],
    bloomfield: [41.8265, -72.7401], "new britain": [41.6612, -72.7795], stamford: [41.0534, -73.5387],
    norwalk: [41.1177, -73.4082], wilton: [41.1954, -73.4379], ridgefield: [41.2815, -73.4982], groton: [41.3501, -72.0784]
  };
  const GUILFORD = [41.2895, -72.6816];
  function cityOf(j) {
    if (!(j.regions || []).includes("Connecticut")) return null;
    const l = (j.location || "").toLowerCase();
    return Object.keys(CITY).find((c) => l.includes(c)) || null;
  }
  function haversineMi(a, b) {
    const R = 3958.8, dLat = (b[0] - a[0]) * Math.PI / 180, dLng = (b[1] - a[1]) * Math.PI / 180;
    const la1 = a[0] * Math.PI / 180, la2 = b[0] * Math.PI / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function commuteInfo(j) {
    const c = cityOf(j); if (!c || c === "guilford") return c === "guilford" ? { mi: 0, min: 0 } : null;
    const mi = haversineMi(GUILFORD, CITY[c]);
    return { mi: Math.round(mi), min: Math.round(mi * 1.5 + 5) }; // rough CT drive-time estimate
  }
  let mapInited = false;
  function initMap() {
    if (mapInited || typeof L === "undefined") return;
    mapInited = true;
    const map = L.map("map", { scrollWheelZoom: false }).setView([41.45, -72.75], 9);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 14 }).addTo(map);
    L.circleMarker([41.2895, -72.6816], { radius: 7, color: "#f5c451", fillColor: "#f5c451", fillOpacity: 1 }).addTo(map).bindPopup("<b>Home — Guilford, CT</b>");
    const byCity = {};
    ALL.filter((j) => (j.regions || []).includes("Connecticut") && !hidden.has(j.id)).forEach((j) => {
      const l = (j.location || "").toLowerCase();
      const city = Object.keys(CITY).find((c) => l.includes(c));
      if (!city) return; (byCity[city] = byCity[city] || []).push(j);
    });
    Object.entries(byCity).forEach(([city, jobs]) => {
      jobs.forEach((j, i) => {
        const [lat, lng] = CITY[city];
        const off = i * 0.012;
        L.marker([lat + off, lng + off]).addTo(map)
          .bindPopup(`<b>${esc(j.title)}</b><br>${esc(j.company)}<br>${esc(j.location)}<br><a href="${esc(j.applyUrl)}" target="_blank" rel="noopener">Open ↗</a>`);
      });
    });
    document.getElementById("mapNote").textContent = `${Object.values(byCity).flat().length} Connecticut opportunities mapped (gold = home).`;
  }

  // ============================ Grow (PD) ===================================
  function renderGrow() {
    const g = window.GROW; if (!g) return;
    const groups = g.groups.map((grp) => {
      const cards = grp.items.map((it) => `
        <div class="grow-card">
          <div class="grow-head"><span class="grow-name">${esc(it.name)}</span><span class="grow-provider">${esc(it.provider)}</span></div>
          <div class="grow-meta">
            ${it.level ? `<span class="gm">📈 ${esc(it.level)}</span>` : ""}
            ${it.format ? `<span class="gm">🧩 ${esc(it.format)}</span>` : ""}
            ${it.cost ? `<span class="gm">💵 ${esc(it.cost)}</span>` : ""}
            ${it.time ? `<span class="gm">⏱ ${esc(it.time)}</span>` : ""}
          </div>
          ${it.why ? `<div class="grow-why">${esc(it.why)}</div>` : ""}
          <a class="btn primary" href="${esc(it.url)}" target="_blank" rel="noopener">Learn more ↗</a>
        </div>`).join("");
      return `<div class="grow-group"><h2>${esc(grp.title)}</h2>${grp.note ? `<p class="grow-note">${esc(grp.note)}</p>` : ""}<div class="grow-grid">${cards}</div></div>`;
    }).join("");
    // Phase 9: aggregated skill-gap from strong-fit roles, surfaced atop Grow.
    const gaps = skillGaps(12);
    const gapPanel = `
      <div class="gap-panel">
        <h2>🎯 Skills the market wants that you don't list</h2>
        <p class="grow-note">Aggregated from your strong-fit roles (${SC.TIERS.neutral}+). These appear often in roles that match you but aren't in your résumé/bio vocabulary — prioritize the PD below accordingly.</p>
        ${gaps.length
          ? `<div class="gap-chips">${gaps.map((g2) => `<span class="gap-chip">${esc(g2.skill)} <b>${g2.count}</b></span>`).join("")}</div>`
          : `<p class="jd-empty">No notable gaps right now — your vocabulary covers the strong-fit roles. 👌</p>`}
      </div>`;
    document.getElementById("growContent").innerHTML =
      `<div class="grow-intro">${esc(g.intro)}</div>${gapPanel}${groups}
       <p class="resume-foot-note">Costs and links are approximate (mid-2026) — confirm on each provider's site. You already hold Certified SAFe Product Owner / Product Manager (POPM).</p>`;
  }

  // ============================ Pipeline + Stats ============================
  function renderStats() {
    const el = document.getElementById("statsPanel"); if (!el) return;
    const tracked = ALL.filter((j) => status[j.id]);
    const byStatus = STATUS.map((s) => ({ label: s.label, key: s.key, n: ALL.filter((j) => status[j.id] === s.key).length }));
    const famCount = {};
    ALL.forEach((j) => (j.roleFamily || []).forEach((f) => (famCount[f] = (famCount[f] || 0) + 1)));
    const fams = Object.entries(famCount).sort((a, b) => b[1] - a[1]);
    const famMax = Math.max(1, ...fams.map((f) => f[1]));
    const buckets = [[0, 75000, "< $75k"], [75000, 100000, "$75–100k"], [100000, 130000, "$100–130k"], [130000, 160000, "$130–160k"], [160000, 200000, "$160–200k"], [200000, 1e9, "$200k+"]];
    const withSal = ALL.filter((j) => j.salaryMax || j.salaryMin);
    const hist = buckets.map(([lo, hi, label]) => ({ label, n: withSal.filter((j) => { const v = j.salaryMax || j.salaryMin; return v >= lo && v < hi; }).length }));
    const histMax = Math.max(1, ...hist.map((h) => h.n));
    const newCount = ALL.filter(isNew).length;
    el.innerHTML = `
      <div class="stat-cards">
        <div class="stat"><div class="stat-num">${ALL.length}</div><div class="stat-lbl">Total opportunities</div></div>
        <div class="stat"><div class="stat-num">${starred.size}</div><div class="stat-lbl">★ Starred</div></div>
        <div class="stat"><div class="stat-num">${tracked.length}</div><div class="stat-lbl">In your pipeline</div></div>
        <div class="stat"><div class="stat-num">${newCount}</div><div class="stat-lbl">New / unseen</div></div>
      </div>
      <div class="stats-row">
        <div class="stats-block"><h3>By status</h3>${byStatus.map((s) => `<div class="bar-row"><span class="bar-lbl">${esc(s.label)}</span><span class="bar"><span class="bar-fill st-${s.key}" style="width:${s.n ? Math.max(6, (s.n / Math.max(1, tracked.length)) * 100) : 0}%"></span></span><span class="bar-n">${s.n}</span></div>`).join("")}</div>
        <div class="stats-block"><h3>By role family</h3>${fams.map(([f, n]) => `<div class="bar-row"><span class="bar-lbl">${esc(f)}</span><span class="bar"><span class="bar-fill" style="width:${(n / famMax) * 100}%"></span></span><span class="bar-n">${n}</span></div>`).join("")}</div>
        <div class="stats-block"><h3>Salary distribution</h3>${hist.map((h) => `<div class="bar-row"><span class="bar-lbl">${esc(h.label)}</span><span class="bar"><span class="bar-fill amber" style="width:${(h.n / histMax) * 100}%"></span></span><span class="bar-n">${h.n}</span></div>`).join("")}</div>
      </div>`;
  }
  function renderPipeline() {
    renderStats();
    const kb = document.getElementById("kanban"); if (!kb) return;
    const tracked = ALL.filter((j) => status[j.id]);
    if (!tracked.length) {
      kb.innerHTML = `<div class="empty-state"><p>Your pipeline is empty. Set a <b>status</b> on cards in the Opportunities tab (Watching → Interested → Applied → Interviewing → Passed) and they'll appear here as columns.</p></div>`;
      return;
    }
    kb.innerHTML = STATUS.map((s) => {
      const items = ALL.filter((j) => status[j.id] === s.key);
      const cards = items.map((j) => `
        <div class="kard st-border-${s.key}" data-id="${esc(j.id)}">
          <div class="kard-title">${esc(j.title)}</div>
          <div class="kard-co">${esc(j.company)}</div>
          <div class="kard-meta">${j.salary ? esc(j.salary) : esc(j.location)}</div>
          <div class="kard-foot">
            <select class="kard-status" data-act="kstatus">${STATUS.map((o) => `<option value="${o.key}"${o.key === s.key ? " selected" : ""}>${esc(o.label)}</option>`).join("")}<option value="">— remove —</option></select>
            <a href="${esc(j.applyUrl)}" target="_blank" rel="noopener" title="Open ↗">↗</a>
          </div>
        </div>`).join("");
      return `<div class="kanban-col"><div class="kanban-col-head st-${s.key}">${esc(s.label)} <span>${items.length}</span></div><div class="kanban-col-body">${cards || '<div class="kanban-empty">—</div>'}</div></div>`;
    }).join("");
    kb.querySelectorAll(".kard-status").forEach((sel) => {
      sel.addEventListener("change", () => {
        const id = sel.closest(".kard").dataset.id;
        if (sel.value) status[id] = sel.value; else delete status[id];
        saveMap(LS.status, status); scheduleSync(); buildStatusFilter(); renderPipeline(); render();
      });
    });
  }

  // ============================ digest + watchlist ==========================
  // Phase 10b: graceful dormancy — a concise multi-line digest on return, not a
  // wall of green. Summarizes new, resurfaced, watched-company activity, and
  // salary/skill movement from the stored market history.
  // v1.8.1 (Claude Design): grouped digest — activity counts (marker dots) above a
  // quiet "Market" footnote; "Market update" solo state when only the field moved.
  function updateDigest() {
    const banner = document.getElementById("digestBanner"); if (!banner) return;
    const visited = localStorage.getItem(LS.visited);
    const lastTs = +localStorage.getItem(LS.lastVisit) || 0;
    const daysAway = lastTs ? Math.floor((Date.now() - lastTs) / 86400000) : 0;
    const newCount = newThisVisit.size;
    const watchedNew = ALL.filter((j) => isNew(j) && !starred.has(j.id) && _watchedCos.has((j.company || "").toLowerCase()));

    const act = [];
    if (newCount) act.push(`<div class="rdg-line"><span class="rdg-mk new"></span><span><span class="n">${newCount}</span> new since your last visit</span></div>`);
    if (resurfacedThisVisit.size) act.push(`<div class="rdg-line"><span class="rdg-mk resurf"></span><span><span class="n">${resurfacedThisVisit.size}</span> snoozed role${resurfacedThisVisit.size > 1 ? "s" : ""} resurfaced</span></div>`);
    if (watchedNew.length) act.push(`<div class="rdg-line"><span class="rdg-mk star"></span><span><span class="n">${watchedNew.length}</span> new from compan${watchedNew.length > 1 ? "ies" : "y"} you star <span class="src">— ${esc([...new Set(watchedNew.map((j) => j.company))].slice(0, 3).join(", "))}</span></span></div>`);

    const mkt = [];
    const hist = loadMarketHist(), cur = hist[hist.length - 1], curM = cur && cur.date.slice(0, 7);
    const prev = cur ? hist.filter((h) => h.date.slice(0, 7) < curM).slice(-1)[0] : null;
    if (cur && prev && prev.median) { const c = Math.round((cur.median - prev.median) / prev.median * 100); if (Math.abs(c) >= 2) mkt.push(`<span class="ml">median salary <span class="${c > 0 ? "up" : "down"}">${c > 0 ? "▲" : "▼"} ${Math.abs(c)}%</span></span>`); }
    if (cur && prev) {
      const top = Object.keys(cur.skillFreq).map((k) => ({ k, d: cur.skillFreq[k] - ((prev.skillFreq[k]) || 0) })).filter((s) => s.d > 0).sort((a, b) => b.d - a.d)[0];
      if (top && top.d >= 2) mkt.push(`<span class="ml"><b>“${esc(top.k)}”</b> rising in demand</span>`);
    }

    const solo = act.length === 0 && mkt.length > 0;
    const marketHTML = mkt.length
      ? `<div class="rdg-market${solo ? " solo" : ""}">${solo ? "" : '<span class="rdg-mlabel">Market</span>'}${mkt.join('<span class="sep">·</span>')}</div>`
      : "";
    if (visited && (act.length || mkt.length)) {
      document.getElementById("digestHeading").innerHTML = (solo ? "Market update" : "Since you were away") + (!solo && daysAway >= 1 ? ` <span class="since">· ${daysAway} day${daysAway > 1 ? "s" : ""}</span>` : "");
      document.getElementById("digestShow").style.display = solo ? "none" : "";
      document.getElementById("digestText").innerHTML = `${act.length ? `<div class="rdg-activity">${act.join("")}</div>` : ""}${marketHTML}`;
      banner.hidden = false;
    } else { banner.hidden = true; }
    localStorage.setItem(LS.visited, "1");
    localStorage.setItem(LS.lastVisit, String(Date.now()));
  }
  function initWatchlistUI() {
    const modal = document.getElementById("watchModal");
    document.getElementById("watchlistBtn").addEventListener("click", () => {
      document.getElementById("watchText").value = watchTerms.join("\n");
      document.getElementById("watchStatus").textContent = watchTerms.length ? `${watchTerms.length} term(s) active.` : "";
      modal.hidden = false;
    });
    document.getElementById("watchClose").addEventListener("click", () => { modal.hidden = true; });
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.hidden = true; });
    document.getElementById("watchSave").addEventListener("click", () => {
      watchTerms = document.getElementById("watchText").value.split(/[\n,]/).map((t) => t.trim().toLowerCase()).filter(Boolean);
      localStorage.setItem(LS.watch, JSON.stringify(watchTerms));
      document.getElementById("watchStatus").textContent = `Saved — ${watchTerms.length} term(s) active.`;
      document.getElementById("watchlistBtn").classList.toggle("on", watchTerms.length > 0);
      render();
    });
    document.getElementById("watchClear").addEventListener("click", () => {
      watchTerms = []; localStorage.removeItem(LS.watch);
      document.getElementById("watchText").value = ""; document.getElementById("watchStatus").textContent = "Cleared.";
      document.getElementById("watchlistBtn").classList.remove("on"); render();
    });
    if (watchTerms.length) document.getElementById("watchlistBtn").classList.add("on");
  }

  // ============================ Me tab switch (IA) ==========================
  function initMeSwitch() {
    const sw = document.getElementById("meSwitch"); if (!sw) return;
    sw.addEventListener("click", (e) => {
      const b = e.target.closest("[data-me]"); if (!b) return;
      sw.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === b));
      const me = b.dataset.me;
      document.getElementById("bioContent").hidden = me !== "bio";
      document.getElementById("resumeContent").hidden = me !== "resume";
    });
  }

  // ============================ Journal (Phase 10e) =========================
  function initJournalUI() {
    const modal = document.getElementById("journalModal"); if (!modal) return;
    const list = document.getElementById("journalList"), input = document.getElementById("journalInput");
    const draw = () => {
      list.innerHTML = journal.length
        ? journal.slice().reverse().map((e, i) => `<div class="jrnl-entry"><span class="jrnl-date">${esc(e.date)}</span><span class="jrnl-text">${esc(e.text)}</span><button class="jrnl-del" data-del="${journal.length - 1 - i}" title="Delete">×</button></div>`).join("")
        : `<p class="jd-empty">No entries yet. Jot a market observation — "RTE roles hot this month."</p>`;
      list.querySelectorAll(".jrnl-del").forEach((b) => b.addEventListener("click", () => {
        journal.splice(+b.dataset.del, 1); localStorage.setItem(LS.journal, JSON.stringify(journal)); scheduleSync(); draw();
      }));
    };
    const open = () => { draw(); modal.hidden = false; setTimeout(() => input.focus(), 50); };
    document.getElementById("journalBtn").addEventListener("click", open);
    document.getElementById("journalClose").addEventListener("click", () => { modal.hidden = true; });
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.hidden = true; });
    const add = () => {
      const t = input.value.trim(); if (!t) return;
      journal.push({ date: nowISO().slice(0, 10), text: t });
      localStorage.setItem(LS.journal, JSON.stringify(journal)); scheduleSync();
      input.value = ""; draw();
    };
    document.getElementById("journalAdd").addEventListener("click", add);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) add(); });
  }

  // ============================ Market signals (Phase 8) ====================
  // Location/geography tokens are not skills — keep them out of trends & gaps.
  let _locStop = null;
  function locStop() {
    if (_locStop) return _locStop;
    _locStop = new Set(["ct", "connecticut", "remote", "hybrid", "onsite", "on-site", "usa", "us", "anywhere", "nationwide", "guilford", "new", "haven", "area", "county", "metro"]);
    Object.keys(CITY).forEach((c) => c.split(/\s+/).forEach((w) => _locStop.add(w)));
    return _locStop;
  }
  const salaryTop = (j) => j.salaryMax || j.salaryMin || 0;
  function median(nums) { if (!nums.length) return 0; const s = nums.slice().sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); }
  function workModeMix() {
    const wm = { Remote: 0, Hybrid: 0, Onsite: 0 };
    ALL.forEach((j) => { const m = (j.workMode || "").toLowerCase(); if (/remote/.test(m)) wm.Remote++; else if (/hybrid/.test(m)) wm.Hybrid++; else if (/onsite|on-site|in-?office/.test(m)) wm.Onsite++; });
    return wm;
  }
  function skillFreqAll() {
    const freq = {};
    ALL.forEach((j) => { const set = new Set(); (j.tags || []).forEach((t) => canonSet(t).forEach((c) => set.add(c))); set.forEach((c) => { if (STOP.has(c) || SKILL_STOP.has(c) || locStop().has(c)) return; freq[c] = (freq[c] || 0) + 1; }); });
    return freq;
  }
  function computeMarketSnapshot() {
    return { date: nowISO().slice(0, 10), median: median(ALL.filter((j) => salaryTop(j) > 0).map(salaryTop)), skillFreq: skillFreqAll(), workMode: workModeMix(), n: ALL.length };
  }
  const loadMarketHist = () => JSON.parse(localStorage.getItem(LS.marketHist) || "[]");
  function recordMarketSnapshot() {
    const hist = loadMarketHist(), snap = computeMarketSnapshot(), last = hist[hist.length - 1];
    if (last && last.date.slice(0, 7) === snap.date.slice(0, 7)) hist[hist.length - 1] = snap; // refresh current month
    else hist.push(snap);
    if (hist.length > 24) hist.splice(0, hist.length - 24);
    localStorage.setItem(LS.marketHist, JSON.stringify(hist));
    return hist;
  }
  function trendArrow(cur, prev, goodUp) {
    if (prev == null || !prev) return `<span class="trend new">new</span>`;
    const c = (cur - prev) / prev * 100;
    if (Math.abs(c) < 1) return `<span class="trend flat">→ flat</span>`;
    const up = c > 0, good = goodUp ? up : !up;
    return `<span class="trend ${good ? "up" : "down"}">${up ? "▲" : "▼"} ${Math.abs(Math.round(c))}%</span>`;
  }
  function renderMarket() {
    const el = document.getElementById("marketPanel"); if (!el) return;
    const cur = computeMarketSnapshot();
    const hist = loadMarketHist(), curM = cur.date.slice(0, 7);
    const priors = hist.filter((h) => h.date.slice(0, 7) < curM);
    const prev = priors.length ? priors[priors.length - 1] : null;
    const salStr = cur.median ? "$" + Math.round(cur.median / 1000) + "k" : "—";
    // rising / falling skills
    const keys = Object.keys(cur.skillFreq).filter((k) => cur.skillFreq[k] >= 2);
    const scored = keys.map((k) => ({ k, now: cur.skillFreq[k], was: (prev && prev.skillFreq[k]) || 0 }));
    if (prev) scored.sort((a, b) => (b.now - b.was) - (a.now - a.was) || b.now - a.now);
    else scored.sort((a, b) => b.now - a.now);
    const rising = scored.slice(0, 6);
    const falling = prev ? scored.filter((s) => s.now - s.was < 0).sort((a, b) => (a.now - a.was) - (b.now - b.was)).slice(0, 4) : [];
    const wm = cur.workMode, wmTot = Math.max(1, wm.Remote + wm.Hybrid + wm.Onsite);
    const pct = (n) => Math.round(n / wmTot * 100);
    const skillChip = (s) => `<span class="mk-skill">${esc(s.k)} <b>${s.now}</b>${prev ? ` <span class="mk-delta ${s.now - s.was > 0 ? "up" : s.now - s.was < 0 ? "down" : "flat"}">${s.now - s.was > 0 ? "+" : ""}${s.now - s.was || "="}</span>` : ""}</span>`;
    el.innerHTML = `
      <div class="mk-head"><h3>📊 Market signals</h3><span class="mk-sub">across ${cur.n} tracked cards${prev ? ` · vs ${prev.date.slice(0, 7)}` : " · first snapshot (trends build over time)"}</span></div>
      <div class="mk-grid">
        <div class="mk-block">
          <div class="mk-k">Median salary</div>
          <div class="mk-v">${salStr} ${trendArrow(cur.median, prev && prev.median, true)}</div>
        </div>
        <div class="mk-block">
          <div class="mk-k">Work mode mix</div>
          <div class="mk-bars">
            <div class="mk-bar-row"><span>Remote</span><span class="mk-bar"><i style="width:${pct(wm.Remote)}%"></i></span><span class="mk-n">${pct(wm.Remote)}%</span></div>
            <div class="mk-bar-row"><span>Hybrid</span><span class="mk-bar"><i style="width:${pct(wm.Hybrid)}%"></i></span><span class="mk-n">${pct(wm.Hybrid)}%</span></div>
            <div class="mk-bar-row"><span>Onsite</span><span class="mk-bar"><i style="width:${pct(wm.Onsite)}%"></i></span><span class="mk-n">${pct(wm.Onsite)}%</span></div>
          </div>
        </div>
        <div class="mk-block mk-wide">
          <div class="mk-k">${prev ? "Skills rising" : "Most-required skills"}</div>
          <div class="mk-skills">${rising.map(skillChip).join("") || "<span class='jd-empty'>—</span>"}</div>
          ${falling.length ? `<div class="mk-k mk-k2">Skills cooling</div><div class="mk-skills">${falling.map(skillChip).join("")}</div>` : ""}
        </div>
      </div>
      <p class="mk-foot">Read-only aggregate over the current card set. A monthly snapshot is stored locally so trends accrue with each refresh.</p>`;
  }

  // ============================ Skill-gap → Grow (Phase 9) ==================
  // Skills frequent in strong-fit roles (≥ neutral tier) but absent from the
  // résumé/bio vocabulary after alias normalization — ranked, feeds the Grow tab.
  function skillGaps(n) {
    const strong = ALL.filter((j) => fitPct(j) >= SC.TIERS.neutral);
    const freq = {};
    strong.forEach((j) => {
      const set = canonSet([j.title, (j.roleFamily || []).join(" "), (j.tags || []).join(" ")].join("  "));
      set.forEach((c) => { if (vocabAll.has(c) || STOP.has(c) || SKILL_STOP.has(c) || locStop().has(c)) return; freq[c] = (freq[c] || 0) + 1; });
    });
    return Object.entries(freq).filter(([, v]) => v >= 2).sort((a, b) => b[1] - a[1]).slice(0, n || 12).map(([skill, count]) => ({ skill, count }));
  }

  // ============================ card detail =================================
  function openDetail(id) {
    const j = ALL.find((x) => x.id === id); if (!j) return;
    const ci = commuteInfo(j);
    const rows = [
      ["Company", j.company], ["Location", j.location], ["Work mode", j.workMode],
      ["Salary", j.salary || "See posting"], ["Role family", (j.roleFamily || []).join(", ")],
      ["Posted", (j.posted || "—") + (relAge(j.posted || j.dateAdded) ? ` · ${relAge(j.posted || j.dateAdded)}` : "")],
      ["Added", j.dateAdded || "—"], ["Source", j.source || "—"],
      // Phase 7: commute only for real CT locations (omit entirely for Remote).
      ...(ci ? [["Commute", ci.mi > 0 ? `~${ci.mi} mi · ~${ci.min} min from Guilford` : "Guilford (home)"]] : []),
      ["Fit score", "🎯 " + fitPct(j) + " (heuristic résumé match)"],
      ["Your status", statusLabel(status[j.id]) || "—"]
    ].map(([k, v]) => `<div class="dt-row"><span class="dt-k">${esc(k)}</span><span class="dt-v">${esc(v)}</span></div>`).join("");
    const tags = (j.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("");
    const note = notes[j.id] ? `<div class="card-fit"><b>Your note:</b> ${esc(notes[j.id])}</div>` : "";
    document.getElementById("detailTitle").textContent = j.title;
    document.getElementById("detailBody").innerHTML = `
      <div class="detail-grid">${rows}</div>
      ${j.description ? `<p class="card-desc">${esc(j.description)}</p>` : ""}
      ${j.fit ? `<div class="card-fit"><b>Why it fits:</b> ${esc(j.fit)}</div>` : ""}
      ${note}
      ${tags ? `<div class="tag-row">${tags}</div>` : ""}
      <div class="card-foot">
        <a class="btn primary" href="${esc(j.applyUrl)}" target="_blank" rel="noopener">Open ↗</a>
        ${j.altUrl ? `<a class="btn ghost" href="${esc(j.altUrl)}" target="_blank" rel="noopener">Alt link</a>` : ""}
      </div>`;
    document.getElementById("detailModal").hidden = false;
  }

  // ============================ JD keyword-gap ==============================
  const JD_STOP = new Set("the and for with that into our who all team work across both able have this from will plus etc not but per via year years experience role roles ability strong excellent including within while what when where which their them they out about over more most any can may also new help support build using use used skills skill years’".split(" "));
  function jdAnalyze(text) {
    // canonicalize the JD (bigrams + aliases) then compare against the full
    // résumé+bio vocabulary so synonyms count as covered, not gaps.
    const canon = [...canonSet(text)].filter((t) => !JD_STOP.has(t) && !STOP.has(t));
    return { have: canon.filter((t) => vocabAll.has(t)), gaps: canon.filter((t) => !vocabAll.has(t)).slice(0, 24) };
  }

  // ============================ Word download ===============================
  function downloadDoc(filename, plainText) {
    const body = plainText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>");
    const html = `<html xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'></head><body style="font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.4">${body}</body></html>`;
    const blob = new Blob(["﻿" + html], { type: "application/msword" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ============================ filter presets ==============================
  const loadPresets = () => JSON.parse(localStorage.getItem("jle_presets") || "[]");
  const savePresets = (p) => localStorage.setItem("jle_presets", JSON.stringify(p));
  function applyPreset(p) {
    if (!p) return;
    state.q = p.q || ""; document.getElementById("searchBox").value = state.q;
    state.sort = p.sort || "new"; document.getElementById("sortBy").value = state.sort;
    state.minSalary = p.minSalary || 0;
    document.getElementById("salaryRange").value = state.minSalary;
    document.getElementById("salaryReadout").textContent = state.minSalary > 0 ? "$" + Math.round(state.minSalary / 1000) + "k+" : "Any";
    Object.keys(state.toggles).forEach((k) => (state.toggles[k] = !!(p.toggles && p.toggles[k])));
    Object.keys(state.facets).forEach((k) => (state.facets[k] = new Set((p.facets && p.facets[k]) || [])));
    document.querySelectorAll(".chip.toggle").forEach((c) => c.classList.toggle("active", !!state.toggles[c.dataset.toggle]));
    refreshFacets(); render();
  }
  function renderPresets() {
    const wrap = document.getElementById("presetChips"); if (!wrap) return;
    const presets = loadPresets();
    wrap.innerHTML = presets.length
      ? presets.map((p, i) => `<span class="preset-chip"><button class="preset-apply" data-i="${i}">${esc(p.name)}</button><button class="preset-del" data-del="${i}" title="Delete preset">×</button></span>`).join("")
      : `<span class="preset-empty">none saved yet</span>`;
    wrap.querySelectorAll(".preset-apply").forEach((b) => b.addEventListener("click", () => applyPreset(loadPresets()[+b.dataset.i])));
    wrap.querySelectorAll(".preset-del").forEach((b) => b.addEventListener("click", () => { const p = loadPresets(); p.splice(+b.dataset.del, 1); savePresets(p); renderPresets(); }));
  }

  // ============================ wiring ======================================
  function init() {
    document.getElementById("tabs").addEventListener("click", (e) => {
      const btn = e.target.closest(".tab"); if (!btn) return;
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      btn.classList.add("active");
      const view = btn.dataset.view;
      document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
      document.getElementById("view-" + view).classList.add("active");
      if (view === "map") setTimeout(initMap, 60);
      if (view === "pipeline") renderPipeline();
      if (view === "grow") renderGrow();
      if (view === "me") { renderBio(); renderResume(); }
    });

    refreshFacets();

    document.getElementById("searchBox").addEventListener("input", (e) => { state.q = e.target.value.trim().toLowerCase(); render(); });
    document.getElementById("sortBy").addEventListener("change", (e) => { state.sort = e.target.value; render(); });

    const salaryRange = document.getElementById("salaryRange"), salaryReadout = document.getElementById("salaryReadout");
    const fmtSalary = (v) => v <= 0 ? "Any" : "$" + Math.round(v / 1000) + "k+";
    salaryRange.addEventListener("input", (e) => { state.minSalary = +e.target.value; salaryReadout.textContent = fmtSalary(state.minSalary); render(); });

    document.getElementById("quickFilters").addEventListener("click", (e) => {
      const btn = e.target.closest(".toggle"); if (!btn) return;
      const key = btn.dataset.toggle; state.toggles[key] = !state.toggles[key]; btn.classList.toggle("active"); render();
    });

    document.getElementById("densityBtn").addEventListener("click", () => {
      document.body.classList.toggle("compact");
      const on = document.body.classList.contains("compact");
      localStorage.setItem(LS.density, on ? "compact" : "");
      document.getElementById("densityBtn").textContent = on ? "▤ Comfortable" : "▥ Compact";
    });
    if (localStorage.getItem(LS.density) === "compact") { document.body.classList.add("compact"); document.getElementById("densityBtn").textContent = "▤ Comfortable"; }

    // "More filters" toggle (advanced filter groups, collapsed by default)
    document.getElementById("moreFiltersBtn").addEventListener("click", () => {
      const more = document.getElementById("filtersMore");
      more.hidden = !more.hidden;
      document.getElementById("moreFiltersBtn").textContent = more.hidden ? "＋ More filters ▾" : "− Fewer filters ▴";
    });

    // mobile-only "cards-first": toggle the bulky filter/sort/preset chrome
    const mft = document.getElementById("mFiltersToggle");
    if (mft) mft.addEventListener("click", () => {
      const open = document.body.classList.toggle("m-filters-open");
      mft.textContent = open ? "⚙ Filters & sort ▴" : "⚙ Filters & sort ▾";
    });

    // minimum-fit chips (single-select)
    document.querySelectorAll("#filter-minfit .chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        state.minFit = +chip.dataset.fit;
        document.querySelectorAll("#filter-minfit .chip").forEach((c) => c.classList.toggle("active", c === chip));
        render();
      });
    });

    document.getElementById("refreshLiveBtn").addEventListener("click", () => loadLive());
    document.getElementById("markSeenBtn").addEventListener("click", () => { ALL.forEach((j) => seen.add(j.id)); newThisVisit.clear(); resurfacedThisVisit.clear(); saveSet(LS.seen, seen); scheduleSync(); render(); });
    document.getElementById("clearFiltersBtn").addEventListener("click", () => {
      state.q = ""; document.getElementById("searchBox").value = "";
      state.minSalary = 0; salaryRange.value = 0; salaryReadout.textContent = "Any";
      state.minFit = 0;
      Object.keys(state.toggles).forEach((k) => (state.toggles[k] = false));
      Object.values(state.facets).forEach((s) => s.clear());
      document.querySelectorAll(".chip.active, .toggle.active").forEach((c) => c.classList.remove("active"));
      document.querySelector('#filter-minfit .chip[data-fit="0"]').classList.add("active");
      render();
    });

    // Phase 8: market-signals panel toggle
    const trendsBtn = document.getElementById("trendsBtn"), marketPanel = document.getElementById("marketPanel");
    if (trendsBtn) trendsBtn.addEventListener("click", () => {
      const show = marketPanel.hidden; if (show) renderMarket();
      marketPanel.hidden = !show; trendsBtn.classList.toggle("on", show);
    });

    // Phase 10a: walk-away salary anchor (a personal flag, not a filter)
    const wi = document.getElementById("walkawayInput"), wr = document.getElementById("walkawayReadout");
    const setWalkReadout = () => { if (wr) wr.textContent = walkaway > 0 ? "$" + Math.round(walkaway / 1000) + "k+" : ""; };
    if (wi) {
      if (walkaway > 0) wi.value = walkaway; setWalkReadout();
      wi.addEventListener("input", () => { walkaway = +wi.value || 0; localStorage.setItem(LS.walkaway, walkaway); setWalkReadout(); render(); });
    }

    // outreach modal
    const om = document.getElementById("outreachModal");
    document.getElementById("outreachClose").addEventListener("click", () => { om.hidden = true; });
    om.addEventListener("click", (e) => { if (e.target === om) om.hidden = true; });
    document.getElementById("outreachCopy").addEventListener("click", async () => {
      const ta = document.getElementById("outreachText");
      try { await navigator.clipboard.writeText(ta.value); document.getElementById("outreachCopy").textContent = "Copied ✓"; setTimeout(() => document.getElementById("outreachCopy").textContent = "Copy", 1500); }
      catch (e) { ta.select(); document.execCommand("copy"); }
    });
    document.getElementById("outreachDownload").addEventListener("click", () => {
      const title = document.getElementById("outreachTitle").textContent.replace(/^Draft outreach — /, "").replace(/[^\w]+/g, "-").slice(0, 40);
      downloadDoc("Cover-Letter-" + (title || "JLE") + ".doc", document.getElementById("outreachText").value);
    });

    // JD keyword-gap modal
    const jdm = document.getElementById("jdModal");
    document.getElementById("jdBtn").addEventListener("click", () => { jdm.hidden = false; });
    document.getElementById("jdClose").addEventListener("click", () => { jdm.hidden = true; });
    jdm.addEventListener("click", (e) => { if (e.target === jdm) jdm.hidden = true; });
    document.getElementById("jdAnalyze").addEventListener("click", () => {
      const txt = document.getElementById("jdText").value.trim();
      const res = document.getElementById("jdResult");
      if (!txt) { res.innerHTML = `<p class="jd-empty">Paste a job description above first.</p>`; return; }
      const { have, gaps } = jdAnalyze(txt);
      res.innerHTML =
        `<div class="jd-block"><h3>✅ You already cover (${have.length})</h3><div class="tag-row">${have.map((t) => `<span class="tag jd-have">${esc(t)}</span>`).join("") || "<span class='jd-empty'>—</span>"}</div></div>` +
        `<div class="jd-block"><h3>⚠ Gaps to address / weave in (${gaps.length})</h3><div class="tag-row">${gaps.map((t) => `<span class="tag jd-gap">${esc(t)}</span>`).join("") || "<span class='jd-empty'>none — strong match!</span>"}</div></div>` +
        `<p class="jd-note">Heuristic keyword comparison vs. your résumé. Use the gaps to tailor a résumé variant or talking points — don't claim skills you don't have.</p>`;
    });

    // card detail modal
    const dm = document.getElementById("detailModal");
    document.getElementById("detailClose").addEventListener("click", () => { dm.hidden = true; });
    dm.addEventListener("click", (e) => { if (e.target === dm) dm.hidden = true; });

    // filter presets
    renderPresets();
    document.getElementById("savePresetBtn").addEventListener("click", () => {
      const name = (prompt("Name this preset (e.g. 'Remote PO $130k+'):") || "").trim();
      if (!name) return;
      const p = loadPresets();
      p.push({ name, q: state.q, sort: state.sort, minSalary: state.minSalary, toggles: { ...state.toggles }, facets: Object.fromEntries(Object.entries(state.facets).map(([k, v]) => [k, [...v]])) });
      savePresets(p); renderPresets();
    });

    const stamp = "Data refreshed " + (window.JOBS_GENERATED || "—");
    const us = document.getElementById("updatedStamp"); if (us) us.textContent = stamp;
    document.getElementById("footStamp").textContent = stamp;
    const bv = document.getElementById("brandVersion");
    if (bv && window.APP_VERSION) bv.textContent = "v" + window.APP_VERSION;

    // Phase 6/10d: resurface elapsed snoozes, then snapshot "new since last visit"
    // and mark current cards seen so the green kicker decays next time. The very
    // first run after this ships marks everything silently (no green wall).
    processResurface();
    firstDecayRun = !localStorage.getItem(LS.decayInit);
    noteSeen(ALL, firstDecayRun);
    localStorage.setItem(LS.decayInit, "1");

    renderBio(); renderResume(); initSyncUI(); initWatchlistUI(); initMeSwitch(); initJournalUI(); render();

    // digest banner ("new since last visit")
    document.getElementById("digestShow").addEventListener("click", () => {
      if (!state.toggles.new) { state.toggles.new = true; document.querySelector('.toggle[data-toggle="new"]').classList.add("active"); render(); }
      document.getElementById("digestBanner").hidden = true;
    });
    document.getElementById("digestDismiss").addEventListener("click", () => { document.getElementById("digestBanner").hidden = true; });
    recordMarketSnapshot(); // Phase 8 — persist a monthly snapshot for trend history
    updateDigest();

    // PWA service worker (https/localhost only)
    if ("serviceWorker" in navigator) { window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {})); }

    // force-update: clear cached assets + service worker, then reload fresh (for installed PWA)
    const upBtn = document.getElementById("updateBtn");
    if (upBtn) upBtn.addEventListener("click", async () => {
      upBtn.disabled = true; upBtn.textContent = "⟳ Updating…";
      try {
        if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k))); }
        if ("serviceWorker" in navigator) { const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map((r) => r.unregister())); }
      } catch (e) { /* ignore */ }
      location.reload();
    });

    // refocus pull
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && sync.on()) { setSyncState("syncing…"); syncPull().then(() => { setSyncState("synced ✓"); processResurface(); refreshFacets(); render(); }).catch(() => setSyncState("sync error")); }
    });

    if (sync.on()) { setSyncState("syncing…"); syncPull().then(() => { setSyncState("synced ✓"); refreshFacets(); render(); }).catch(() => setSyncState("sync error")); }
    loadLive();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
