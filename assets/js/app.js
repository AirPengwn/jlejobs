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
    q: "", sort: "new", minSalary: 0,
    toggles: { new: false, starred: false, flagged: false, hidden: false },
    facets: { roleFamily: new Set(), regions: new Set(), workMode: new Set(), kind: new Set(), status: new Set() }
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
    const top = j.salaryMax || j.salaryMin || 0;
    if (state.minSalary > 0 && top > 0 && top < state.minSalary) return false;
    return true;
  }
  function sortJobs(list) {
    const arr = list.slice();
    if (state.sort === "salary") arr.sort((a, b) => (b.salaryMax || b.salaryMin || 0) - (a.salaryMax || a.salaryMin || 0));
    else if (state.sort === "fit") arr.sort((a, b) => rawFit(b) - rawFit(a));
    else if (state.sort === "company") arr.sort((a, b) => a.company.localeCompare(b.company));
    else if (state.sort === "title") arr.sort((a, b) => a.title.localeCompare(b.title));
    else arr.sort((a, b) => { const n = (isNew(b) ? 1 : 0) - (isNew(a) ? 1 : 0); return n || String(b.dateAdded).localeCompare(String(a.dateAdded)); });
    return arr;
  }

  // ============================ card render =================================
  function cardHTML(j) {
    const st = status[j.id] || "";
    const note = notes[j.id] || "";
    const newBadge = isNew(j) ? `<span class="badge new">NEW</span>` : "";
    const liveBadge = j.live ? `<span class="badge live">● LIVE</span>` : "";
    const statusBadge = j.status === "verified" ? `<span class="badge verified">✓ verified</span>`
      : j.status === "snapshot" ? `<span class="badge snapshot">snapshot</span>` : "";
    const expBadge = mayBeExpired(j) ? `<span class="badge expiring" title="Posting is older than 45 days — may be expired">⚠ may be expired</span>` : "";
    const stBadge = st ? `<span class="badge st st-${st}">${esc(statusLabel(st))}</span>` : "";
    const tags = (j.tags || []).slice(0, 8).map((t) => `<span class="tag">${esc(t)}</span>`).join("");
    const role = (j.roleFamily || []).join(" · ");
    const salary = j.salary ? `<span class="m"><b>${esc(j.salary)}</b></span>` : `<span class="m">💰 see posting</span>`;
    const posted = j.posted ? `<span class="m">📅 ${esc(j.posted)}</span>` : "";
    const fit = `<span class="m fit" title="Heuristic match to your résumé">🎯 Fit ${fitPct(j)}</span>`;
    const primaryLabel = j.live ? "View posting" : j.kind === "search" ? "Open live search" : j.kind === "company" ? "View careers" : "View posting";
    const statusOpts = `<option value="">— set status —</option>` + STATUS.map((s) => `<option value="${s.key}"${s.key === st ? " selected" : ""}>${esc(s.label)}</option>`).join("");

    return `
    <article class="card${isNew(j) ? " is-new" : ""}${st ? " has-status st-border-" + st : ""}${hidden.has(j.id) ? " is-hidden" : ""}${matchesWatch(j) ? " is-watched" : ""}" data-id="${esc(j.id)}">
      <div class="card-head">
        <div>
          <h3 class="card-title">${esc(j.title)}</h3>
          <div class="card-company">${esc(j.company)}</div>
        </div>
        <div class="card-actions">
          <button class="icon-btn star${starred.has(j.id) ? " on" : ""}" data-act="star" title="Star (like)">★</button>
          <button class="icon-btn flag${flagged.has(j.id) ? " on" : ""}" data-act="flag" title="Flag">⚑</button>
          <button class="icon-btn note${note ? " on" : ""}" data-act="note" title="Note">📝</button>
          <button class="icon-btn hide${hidden.has(j.id) ? " on" : ""}" data-act="hide" title="${hidden.has(j.id) ? "Unhide" : "Hide"}">${hidden.has(j.id) ? "↩" : "🚫"}</button>
        </div>
      </div>

      <div class="badges">${matchesWatch(j) ? `<span class="badge watch">⭐ watch</span>` : ""}${newBadge}${liveBadge}<span class="badge kind-${j.kind}">${kindLabel[j.kind]}</span>${statusBadge}${expBadge}${stBadge}</div>

      <div class="meta-row">
        <span class="m">📍 ${esc(j.location)}</span>
        <span class="m">🧭 ${esc(j.workMode)}</span>
        ${salary}${posted}${fit}
      </div>
      ${role ? `<div class="meta-row"><span class="m">🗂 ${esc(role)}</span></div>` : ""}

      ${j.description ? `<p class="card-desc">${esc(j.description)}</p>` : ""}
      ${j.fit ? `<div class="card-fit"><b>Fit:</b> ${esc(j.fit)}</div>` : ""}
      ${tags ? `<div class="tag-row">${tags}</div>` : ""}

      <div class="card-controls">
        <select class="status-select" data-act="status">${statusOpts}</select>
        <button class="mini-btn" data-act="outreach">✍ Draft outreach</button>
      </div>
      <div class="note-box" data-note hidden>
        <textarea placeholder="Private note (synced across your devices)…">${esc(note)}</textarea>
      </div>

      <div class="card-foot">
        <a class="btn primary" href="${esc(j.applyUrl)}" target="_blank" rel="noopener">${primaryLabel} ↗</a>
        ${j.altUrl ? `<a class="btn ghost" href="${esc(j.altUrl)}" target="_blank" rel="noopener">Alt link</a>` : ""}
      </div>
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
    cards.querySelectorAll(".icon-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const card = btn.closest(".card"), id = card.dataset.id, act = btn.dataset.act;
        if (act === "star" || act === "flag") {
          const set = act === "star" ? starred : flagged;
          set.has(id) ? set.delete(id) : set.add(id);
          saveSet(act === "star" ? LS.starred : LS.flagged, set);
          btn.classList.toggle("on"); scheduleSync();
        } else if (act === "hide") {
          hidden.has(id) ? hidden.delete(id) : hidden.add(id);
          saveSet(LS.hidden, hidden); scheduleSync(); render();
        } else if (act === "note") {
          const box = card.querySelector("[data-note]"); box.hidden = !box.hidden;
          if (!box.hidden) box.querySelector("textarea").focus();
        }
      });
    });
    cards.querySelectorAll(".status-select").forEach((sel) => {
      sel.addEventListener("change", () => {
        const id = sel.closest(".card").dataset.id;
        if (sel.value) status[id] = sel.value; else delete status[id];
        saveMap(LS.status, status); scheduleSync(); buildStatusFilter(); render();
      });
    });
    cards.querySelectorAll("[data-note] textarea").forEach((ta) => {
      let t = null;
      ta.addEventListener("input", () => {
        const id = ta.closest(".card").dataset.id;
        clearTimeout(t);
        t = setTimeout(() => {
          if (ta.value.trim()) notes[id] = ta.value; else delete notes[id];
          saveMap(LS.notes, notes); scheduleSync();
          const btn = ta.closest(".card").querySelector(".icon-btn.note");
          btn.classList.toggle("on", !!ta.value.trim());
        }, 700);
      });
    });
    cards.querySelectorAll('[data-act="outreach"]').forEach((b) => {
      b.addEventListener("click", () => openOutreach(b.closest(".card").dataset.id));
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
      const res = await fetch("https://api.ashbyhq.com/posting-api/job-board/" + b.token);
      if (!res.ok) return [];
      return (((await res.json()) || {}).jobs || []).filter((j) => j.isListed !== false).map((j) => ({
        title: j.title || "", loc: j.location || (j.isRemote ? "Remote" : ""), url: j.jobUrl || j.applyUrl,
        posted: (j.publishedAt || "").slice(0, 10), id: j.id, remote: !!j.isRemote
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
        out.push({
          id: "live-" + b.token + "-" + j.id, kind: "posting", status: "live", live: true,
          title: j.title, company: b.label, location: j.loc || (remote ? "Remote" : ""),
          workMode: remote ? "Remote" : "Hybrid", regions: inCT ? ["Connecticut"] : ["Remote"],
          roleFamily: rolesFor(j.title), salary: "", salaryMin: null, salaryMax: null,
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
  let liveLoading = false;
  async function loadLive() {
    if (liveLoading) return;
    liveLoading = true;
    const ind = document.getElementById("liveIndicator");
    const btn = document.getElementById("refreshLiveBtn");
    if (ind) ind.textContent = "⟳ refreshing live listings…";
    if (btn) { btn.disabled = true; btn.textContent = "⟳ Refreshing…"; }
    const results = await Promise.allSettled(LIVE_BOARDS.map(fetchBoard));
    const live = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    ALL = ALL.filter((j) => !j.live).concat(live); // replace prior live cards, don't stack
    refreshFacets(); render();
    if (ind) ind.textContent = live.length ? `● ${live.length} live listings included` : "";
    if (btn) { btn.disabled = false; btn.textContent = "🔄 Refresh live"; }
    liveLoading = false;
  }

  function refreshFacets() {
    buildFacet("filter-roleFamily", "roleFamily");
    buildFacet("filter-regions", "regions");
    buildFacet("filter-workMode", "workMode");
    buildFacet("filter-kind", "kind");
    buildStatusFilter();
  }

  // ============================ map =========================================
  const CITY = {
    guilford: [41.2895, -72.6816], branford: [41.2793, -72.8151], "new haven": [41.3083, -72.9279],
    hamden: [41.3959, -72.8968], "west haven": [41.2707, -72.947], hartford: [41.7637, -72.6851],
    bloomfield: [41.8265, -72.7401], "new britain": [41.6612, -72.7795], stamford: [41.0534, -73.5387],
    norwalk: [41.1177, -73.4082], wilton: [41.1954, -73.4379], ridgefield: [41.2815, -73.4982], groton: [41.3501, -72.0784]
  };
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

    document.getElementById("refreshLiveBtn").addEventListener("click", () => loadLive());
    document.getElementById("markSeenBtn").addEventListener("click", () => { ALL.forEach((j) => seen.add(j.id)); saveSet(LS.seen, seen); scheduleSync(); render(); });
    document.getElementById("clearFiltersBtn").addEventListener("click", () => {
      state.q = ""; document.getElementById("searchBox").value = "";
      state.minSalary = 0; salaryRange.value = 0; salaryReadout.textContent = "Any";
      Object.keys(state.toggles).forEach((k) => (state.toggles[k] = false));
      Object.values(state.facets).forEach((s) => s.clear());
      document.querySelectorAll(".chip.active, .toggle.active").forEach((c) => c.classList.remove("active"));
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

    const stamp = "Data refreshed " + (window.JOBS_GENERATED || "—");
    document.getElementById("updatedStamp").textContent = stamp;
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

    // refocus pull
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && sync.on()) { setSyncState("syncing…"); syncPull().then(() => { setSyncState("synced ✓"); refreshFacets(); render(); }).catch(() => setSyncState("sync error")); }
    });

    if (sync.on()) { setSyncState("syncing…"); syncPull().then(() => { setSyncState("synced ✓"); refreshFacets(); render(); }).catch(() => setSyncState("sync error")); }
    loadLive();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
