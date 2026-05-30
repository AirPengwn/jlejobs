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
    density: "jle_density", watch: "jle_watch", visited: "jle_visited"
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
  let   watchTerms = JSON.parse(localStorage.getItem(LS.watch) || "[]"); // [lowercase terms]
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
    saveSet(LS.starred, starred); saveSet(LS.flagged, flagged); saveSet(LS.hidden, hidden);
    saveSet(LS.seen, seen); saveMap(LS.status, status); saveMap(LS.notes, notes);
    return true;
  }
  async function syncPush() {
    if (!sync.on()) return false;
    const body = JSON.stringify({ starred: [...starred], flagged: [...flagged], seen: [...seen], hidden: [...hidden], status, notes });
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
    toggles: { new: false, starred: false, flagged: false, hidden: false },
    facets: { roleFamily: new Set(), regions: new Set(), workMode: new Set(), kind: new Set(), status: new Set(), skills: new Set() }
  };

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const isNew = (j) => !seen.has(j.id);
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

  // ============================ fit score ===================================
  const STOP = new Set("the and for with that into your you are role our who all team work across both able have this from will plus etc".split(" "));
  function tokenize(s) { return (s || "").toLowerCase().match(/[a-z][a-z+#.]{2,}/g) || []; }
  const resumeTokens = (() => {
    const r = window.RESUME, set = new Set();
    if (r) {
      tokenize(r.title + " " + r.summary).forEach((t) => set.add(t));
      (r.competencies || []).forEach((c) => { tokenize(c.group).forEach((t) => set.add(t)); c.items.forEach((i) => tokenize(i).forEach((t) => set.add(t))); });
      (r.experience || []).forEach((e) => { tokenize(e.role).forEach((t) => set.add(t)); (e.bullets || []).forEach((b) => tokenize(b).forEach((t) => set.add(t))); });
    }
    STOP.forEach((t) => set.delete(t));
    return set;
  })();
  function rawFit(j) {
    let s = 0;
    tokenize(j.title).forEach((t) => { if (resumeTokens.has(t)) s += 3; });
    (j.roleFamily || []).forEach((r) => tokenize(r).forEach((t) => { if (resumeTokens.has(t)) s += 3; }));
    (j.tags || []).forEach((g) => tokenize(g).forEach((t) => { if (resumeTokens.has(t)) s += 2; }));
    tokenize(j.description + " " + (j.fit || "")).forEach((t) => { if (resumeTokens.has(t)) s += 1; });
    return s;
  }
  let fitMax = 1;
  function fitPct(j) { return Math.max(5, Math.round((rawFit(j) / fitMax) * 100)); }

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
  const tierClass = (p) => p >= 85 ? "tier-hi" : p >= 70 ? "tier-mid" : "tier-lo";

  function cardHTML(j) {
    const st = status[j.id] || "", note = notes[j.id] || "";
    const pct = fitPct(j), tier = tierClass(pct);
    const live = j.status === "live" || j.live;
    let typeText = j.kind === "company" ? "Company · watch" : j.kind === "search" ? "Search" : "Posting";
    if (j.kind === "posting") { if (j.status === "verified") typeText += " · verified"; else if (j.status === "snapshot") typeText += " · snapshot"; }
    const kicker = `<div class="r-kicker">${isNew(j) ? `<span class="r-new">New</span>` : ""}${live ? `<span class="r-live">Live</span>` : ""}<span class="r-type">${esc(typeText)}</span></div>`;

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

    const footDate = shortDate(j.posted) || (live ? "Live feed" : j.kind === "company" ? "Watch" : "");
    const footMeta = `<span class="m">🧭 ${esc(j.workMode || "")}</span>${footDate ? `<span class="m">${esc(footDate)}</span>` : ""}`;

    // drawer — the full record, nothing lost
    const ci = commuteInfo(j);
    const commuteStr = ci ? (ci.mi > 0 ? `🚗 ~${ci.mi} mi · ~${ci.min} min` : "🚗 Guilford (home)") : "🚗 n/a (remote)";
    const linkStr = j.linkStatus ? `${j.linkStatus === "dead" ? "⛔ dead" : "✓ " + esc(j.linkStatus)}${j.linkChecked ? " · " + esc(j.linkChecked) : ""}` : "—";
    const role = (j.roleFamily || []).join(" · ");
    const statusOpts = `<option value="">— set status —</option>` + STATUS.map((s) => `<option value="${s.key}"${s.key === st ? " selected" : ""}>${esc(s.label)}</option>`).join("");
    const primaryLabel = j.kind === "search" ? "Open live search" : j.kind === "company" ? "View careers" : "View posting";
    const foot = dead
      ? `<a class="btn ghost dead" title="Primary link returned 404">⛔ Primary dead</a><a class="btn primary" href="${esc(j.altUrl || j.applyUrl)}" target="_blank" rel="noopener">Try alt link ↗</a>`
      : `<a class="btn primary" href="${esc(j.applyUrl)}" target="_blank" rel="noopener">${primaryLabel} ↗</a>${j.altUrl ? `<a class="btn ghost" href="${esc(j.altUrl)}" target="_blank" rel="noopener">Alt link</a>` : ""}`;
    const allSkills = allTags.map((t) => `<span class="r-tag">${esc(t)}</span>`).join("");
    const drawer = `
      <div class="r-drawer">
        ${j.description ? `<div><div class="rd-h">Full description</div><p class="rd-p">${esc(j.description)}</p></div>` : ""}
        ${j.fit ? `<div><div class="rd-h">Why it fits</div><p class="rd-why">${esc(j.fit)}</p></div>` : ""}
        <div class="rd-grid">
          <div><span class="rd-k">Location</span><span class="rd-v">📍 ${esc(j.location || "—")}</span></div>
          <div><span class="rd-k">Work mode</span><span class="rd-v">🧭 ${esc(j.workMode || "—")}</span></div>
          <div><span class="rd-k">Commute</span><span class="rd-v">${commuteStr}</span></div>
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
    fitMax = Math.max(1, ...ALL.map(rawFit));
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
    refreshFacets(); render();
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
    document.getElementById("growContent").innerHTML =
      `<div class="grow-intro">${esc(g.intro)}</div>${groups}
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
  function updateDigest() {
    const banner = document.getElementById("digestBanner"); if (!banner) return;
    const visited = localStorage.getItem(LS.visited);
    const newCount = ALL.filter(isNew).length;
    if (visited && newCount > 0) {
      document.getElementById("digestText").textContent = `🟢 ${newCount} new opportunit${newCount === 1 ? "y" : "ies"} since your last visit.`;
      banner.hidden = false;
    } else { banner.hidden = true; }
    localStorage.setItem(LS.visited, "1");
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

  // ============================ card detail =================================
  function openDetail(id) {
    const j = ALL.find((x) => x.id === id); if (!j) return;
    const ci = commuteInfo(j);
    const rows = [
      ["Company", j.company], ["Location", j.location], ["Work mode", j.workMode],
      ["Salary", j.salary || "See posting"], ["Role family", (j.roleFamily || []).join(", ")],
      ["Posted", j.posted || "—"], ["Added", j.dateAdded || "—"], ["Source", j.source || "—"],
      ["Commute", ci ? (ci.mi > 0 ? `~${ci.mi} mi · ~${ci.min} min from Guilford` : "Guilford (home)") : "—"],
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
    const freq = {};
    tokenize(text).forEach((t) => { if (!JD_STOP.has(t) && !STOP.has(t)) freq[t] = (freq[t] || 0) + 1; });
    const ranked = Object.entries(freq).sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 45);
    return { have: ranked.filter((t) => resumeTokens.has(t)), gaps: ranked.filter((t) => !resumeTokens.has(t)).slice(0, 20) };
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
    document.getElementById("markSeenBtn").addEventListener("click", () => { ALL.forEach((j) => seen.add(j.id)); saveSet(LS.seen, seen); scheduleSync(); render(); });
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

    renderBio(); renderResume(); initSyncUI(); initWatchlistUI(); render();

    // digest banner ("new since last visit")
    document.getElementById("digestShow").addEventListener("click", () => {
      if (!state.toggles.new) { state.toggles.new = true; document.querySelector('.toggle[data-toggle="new"]').classList.add("active"); render(); }
      document.getElementById("digestBanner").hidden = true;
    });
    document.getElementById("digestDismiss").addEventListener("click", () => { document.getElementById("digestBanner").hidden = true; });
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
      if (!document.hidden && sync.on()) { setSyncState("syncing…"); syncPull().then(() => { setSyncState("synced ✓"); refreshFacets(); render(); }).catch(() => setSyncState("sync error")); }
    });

    if (sync.on()) { setSyncState("syncing…"); syncPull().then(() => { setSyncState("synced ✓"); refreshFacets(); render(); }).catch(() => setSyncState("sync error")); }
    loadLive();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
