/* ============================================================================
   jlejobs — app logic
   - Tab navigation (Opportunities / Biography)
   - Card rendering with filters, search, sort
   - Star / flag / "new" state persisted in localStorage (per-browser)
   ========================================================================== */
(function () {
  "use strict";

  const LS = {
    starred: "jle_starred",
    flagged: "jle_flagged",
    seen:    "jle_seen"
  };

  // ---- persisted sets -------------------------------------------------------
  const load = (k) => new Set(JSON.parse(localStorage.getItem(k) || "[]"));
  const save = (k, set) => localStorage.setItem(k, JSON.stringify([...set]));
  const starred = load(LS.starred);
  const flagged = load(LS.flagged);
  let   seen    = load(LS.seen);

  // First-ever visit: treat everything as already seen EXCEPT nothing — we want
  // the user to see the initial batch as "new", so leave `seen` empty on first run.

  // ===================== JSONBin cross-device sync ==========================
  // A built-in default config (assets/data/sync-config.js) enables sync on every
  // device automatically. A per-device override or "turn off" via the Sync panel
  // is stored in localStorage and takes priority over the default.
  const SYNC_KEY = "jle_jsonbin";   // per-device override config
  const SYNC_OFF = "jle_sync_off";  // set when user explicitly turns sync off
  function resolveCfg() {
    const local = JSON.parse(localStorage.getItem(SYNC_KEY) || "null");
    if (local) return local;
    if (localStorage.getItem(SYNC_OFF)) return null;
    return window.JLE_SYNC_DEFAULT || null;
  }
  const sync = {
    cfg: resolveCfg(), // {binId, key, keyType}
    timer: null, pushing: false,
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

  function setSyncState(text) {
    const el = document.getElementById("syncState");
    if (el) el.textContent = text;
  }
  function syncStatus(msg, kind) {
    const el = document.getElementById("syncStatus");
    if (el) { el.textContent = msg; el.className = "sync-status " + (kind || ""); }
  }

  async function syncPull() {
    if (!sync.on()) return false;
    const url = "https://api.jsonbin.io/v3/b/" + encodeURIComponent(sync.cfg.binId) + "/latest";
    const res = await fetch(url, { headers: sync.headers() });
    if (!res.ok) throw new Error("Pull failed (HTTP " + res.status + ")");
    const data = await res.json();
    const rec = (data && data.record) || {};
    // starred/flagged: adopt remote (last-write-wins). seen: union (only grows).
    if (Array.isArray(rec.starred)) { starred.clear(); rec.starred.forEach((x) => starred.add(x)); }
    if (Array.isArray(rec.flagged)) { flagged.clear(); rec.flagged.forEach((x) => flagged.add(x)); }
    if (Array.isArray(rec.seen)) rec.seen.forEach((x) => seen.add(x));
    // write merged result back to local cache
    save(LS.starred, starred); save(LS.flagged, flagged); save(LS.seen, seen);
    return true;
  }

  async function syncPush() {
    if (!sync.on()) return false;
    const body = JSON.stringify({ starred: [...starred], flagged: [...flagged], seen: [...seen] });
    const url = "https://api.jsonbin.io/v3/b/" + encodeURIComponent(sync.cfg.binId);
    const res = await fetch(url, { method: "PUT", headers: sync.headers(), body });
    if (!res.ok) throw new Error("Push failed (HTTP " + res.status + ")");
    return true;
  }

  function scheduleSync() {
    if (!sync.on()) return;
    clearTimeout(sync.timer);
    setSyncState("syncing…");
    sync.timer = setTimeout(async () => {
      try { await syncPush(); setSyncState("synced ✓"); }
      catch (e) { setSyncState("sync error"); }
    }, 1200);
  }

  const JOBS = window.JOBS || [];

  // ---- active filter state --------------------------------------------------
  const state = {
    q: "",
    sort: "new",
    minSalary: 0,
    toggles: { new: false, starred: false, flagged: false },
    facets: { roleFamily: new Set(), regions: new Set(), workMode: new Set(), kind: new Set() }
  };

  // ---- helpers --------------------------------------------------------------
  const uniqueValues = (key) => {
    const s = new Set();
    JOBS.forEach((j) => {
      const v = j[key];
      if (Array.isArray(v)) v.forEach((x) => s.add(x));
      else if (v) s.add(v);
    });
    return [...s].sort();
  };

  const kindLabel = { posting: "Posting", search: "Saved search", company: "Company watch" };

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const isNew = (j) => !seen.has(j.id);

  // ====================== FILTER UI ==========================================
  function buildFacet(containerId, key) {
    const wrap = document.querySelector("#" + containerId + " .filter-chips");
    wrap.innerHTML = "";
    const values = key === "kind"
      ? ["posting", "search", "company"]
      : uniqueValues(key);
    values.forEach((val) => {
      const chip = document.createElement("button");
      chip.className = "chip";
      chip.textContent = key === "kind" ? kindLabel[val] : val;
      chip.addEventListener("click", () => {
        const set = state.facets[key];
        set.has(val) ? set.delete(val) : set.add(val);
        chip.classList.toggle("active");
        render();
      });
      wrap.appendChild(chip);
    });
  }

  // ====================== MATCHING ===========================================
  function matches(j) {
    // text search
    if (state.q) {
      const hay = [j.title, j.company, j.location, j.description, j.fit,
        (j.tags || []).join(" "), (j.roleFamily || []).join(" ")].join(" ").toLowerCase();
      if (!hay.includes(state.q)) return false;
    }
    // toggles
    if (state.toggles.new && !isNew(j)) return false;
    if (state.toggles.starred && !starred.has(j.id)) return false;
    if (state.toggles.flagged && !flagged.has(j.id)) return false;
    // facets (AND across groups, OR within group)
    const f = state.facets;
    if (f.roleFamily.size && !(j.roleFamily || []).some((r) => f.roleFamily.has(r))) return false;
    if (f.regions.size && !(j.regions || []).some((r) => f.regions.has(r))) return false;
    if (f.workMode.size && !f.workMode.has(j.workMode)) return false;
    if (f.kind.size && !f.kind.has(j.kind)) return false;
    // salary: keep cards whose top of range meets the minimum
    if (state.minSalary > 0 && (j.salaryMax || j.salaryMin || 0) < state.minSalary) return false;
    return true;
  }

  function sortJobs(list) {
    const arr = list.slice();
    if (state.sort === "salary") {
      arr.sort((a, b) => (b.salaryMax || b.salaryMin || 0) - (a.salaryMax || a.salaryMin || 0));
    } else if (state.sort === "company") {
      arr.sort((a, b) => a.company.localeCompare(b.company));
    } else if (state.sort === "title") {
      arr.sort((a, b) => a.title.localeCompare(b.title));
    } else { // new: new first, then by dateAdded desc
      arr.sort((a, b) => {
        const n = (isNew(b) ? 1 : 0) - (isNew(a) ? 1 : 0);
        if (n) return n;
        return String(b.dateAdded).localeCompare(String(a.dateAdded));
      });
    }
    return arr;
  }

  // ====================== CARD RENDER ========================================
  function cardHTML(j) {
    const newBadge = isNew(j) ? `<span class="badge new">NEW</span>` : "";
    const statusBadge = j.status === "verified" ? `<span class="badge verified">✓ verified</span>`
      : j.status === "snapshot" ? `<span class="badge snapshot">snapshot</span>` : "";
    const tags = (j.tags || []).slice(0, 8).map((t) => `<span class="tag">${esc(t)}</span>`).join("");
    const role = (j.roleFamily || []).join(" · ");
    const salary = j.salary ? `<span class="m"><b>${esc(j.salary)}</b></span>` : "";
    const posted = j.posted ? `<span class="m">📅 posted ${esc(j.posted)}</span>` : "";
    const primaryLabel = j.kind === "search" ? "Open live search"
      : j.kind === "company" ? "View careers" : "View posting";

    return `
    <article class="card${isNew(j) ? " is-new" : ""}" data-id="${esc(j.id)}">
      <div class="card-head">
        <div>
          <h3 class="card-title">${esc(j.title)}</h3>
          <div class="card-company">${esc(j.company)}</div>
        </div>
        <div class="card-actions">
          <button class="icon-btn star${starred.has(j.id) ? " on" : ""}" data-act="star" title="Star (like)">★</button>
          <button class="icon-btn flag${flagged.has(j.id) ? " on" : ""}" data-act="flag" title="Flag">⚑</button>
        </div>
      </div>

      <div class="badges">
        ${newBadge}
        <span class="badge kind-${j.kind}">${kindLabel[j.kind]}</span>
        ${statusBadge}
      </div>

      <div class="meta-row">
        <span class="m">📍 ${esc(j.location)}</span>
        <span class="m">🧭 ${esc(j.workMode)}</span>
        ${salary}
        ${posted}
      </div>
      ${role ? `<div class="meta-row"><span class="m">🎯 ${esc(role)}</span></div>` : ""}

      ${j.description ? `<p class="card-desc">${esc(j.description)}</p>` : ""}
      ${j.fit ? `<div class="card-fit"><b>Fit:</b> ${esc(j.fit)}</div>` : ""}
      ${tags ? `<div class="tag-row">${tags}</div>` : ""}

      <div class="card-foot">
        <a class="btn primary" href="${esc(j.applyUrl)}" target="_blank" rel="noopener">${primaryLabel} ↗</a>
        ${j.altUrl ? `<a class="btn ghost" href="${esc(j.altUrl)}" target="_blank" rel="noopener">Alt link</a>` : ""}
      </div>
    </article>`;
  }

  function render() {
    const list = sortJobs(JOBS.filter(matches));
    const cards = document.getElementById("cards");
    const empty = document.getElementById("emptyState");
    cards.innerHTML = list.map(cardHTML).join("");
    empty.hidden = list.length > 0;

    const total = JOBS.length;
    const newCount = JOBS.filter(isNew).length;
    document.getElementById("resultCount").textContent =
      `${list.length} of ${total} opportunities` + (newCount ? ` · ${newCount} new` : "");

    // wire card buttons
    cards.querySelectorAll(".icon-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.closest(".card").dataset.id;
        const act = btn.dataset.act;
        const set = act === "star" ? starred : flagged;
        set.has(id) ? set.delete(id) : set.add(id);
        save(act === "star" ? LS.starred : LS.flagged, set);
        btn.classList.toggle("on");
        scheduleSync();
      });
    });
  }

  // ====================== BIO RENDER =========================================
  function renderBio() {
    const b = window.BIO;
    if (!b) return;
    const exp = b.experience.map((e) => `
      <div class="job-entry">
        <div class="je-head">
          <div><span class="je-role">${esc(e.role)}</span> &nbsp;<span class="je-co">${esc(e.company)} · ${esc(e.where)}</span></div>
          <div class="je-dates">${esc(e.dates)}</div>
        </div>
        <ul>${e.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
      </div>`).join("");

    const skills = b.skills.map((s) => `
      <div class="skill-card">
        <h3>${esc(s.group)}</h3>
        <div class="pills">${s.items.map((i) => `<span class="pill">${esc(i)}</span>`).join("")}</div>
      </div>`).join("");

    const edu = b.education.map((e) => `
      <div class="edu-item">
        <div><div class="deg">${esc(e.deg)}</div><div class="school">${esc(e.school)}</div></div>
        <div class="yr">${esc(e.yr)}</div>
      </div>`).join("");

    document.getElementById("bioContent").innerHTML = `
      <div class="bio-hero">
        <h1>${esc(b.name)}</h1>
        <div class="tagline">${esc(b.tagline)}</div>
        <div class="contact">
          <span>📍 ${esc(b.location)}</span>
          <a href="mailto:${esc(b.email)}">✉ ${esc(b.email)}</a>
          <span>📞 ${esc(b.phone)}</span>
        </div>
        <p class="summary">${esc(b.summary)}</p>
      </div>
      <div class="bio-section"><h2>Experience</h2>${exp}</div>
      <div class="bio-section"><h2>Skills</h2><div class="skill-grid">${skills}</div></div>
      <div class="bio-section"><h2>Certifications</h2>
        <div class="tag-row">${b.certifications.map((c) => `<span class="tag">${esc(c)}</span>`).join("")}</div>
      </div>
      <div class="bio-section"><h2>Education</h2>${edu}</div>`;
  }

  // ====================== RESUME RENDER ======================================
  function renderResume() {
    const r = window.RESUME;
    if (!r) return;
    const comp = r.competencies.map((c) => `
      <div class="skill-card">
        <h3>${esc(c.group)}</h3>
        <div class="pills">${c.items.map((i) => `<span class="pill">${esc(i)}</span>`).join("")}</div>
      </div>`).join("");
    const exp = r.experience.map((e) => `
      <div class="job-entry">
        <div class="je-head">
          <div><span class="je-role">${esc(e.role)}</span> &nbsp;<span class="je-co">${esc(e.company)} · ${esc(e.where)}</span></div>
          <div class="je-dates">${esc(e.dates)}</div>
        </div>
        <ul>${e.bullets.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
      </div>`).join("");
    const edu = r.education.map((e) => `
      <div class="edu-item">
        <div><div class="deg">${esc(e.deg)}</div><div class="school">${esc(e.school)}</div></div>
        <div class="yr">${esc(e.yr)}</div>
      </div>`).join("");

    document.getElementById("resumeContent").innerHTML = `
      <div class="bio-hero">
        <div class="resume-top">
          <div>
            <h1>${esc(r.name)}</h1>
            <div class="tagline">${esc(r.title)}</div>
            <div class="contact">
              <span>📍 ${esc(r.contact.location)}</span>
              <a href="mailto:${esc(r.contact.email)}">✉ ${esc(r.contact.email)}</a>
              <span>📞 ${esc(r.contact.phone)}</span>
            </div>
          </div>
          <a class="btn primary dl" href="${esc(r.downloadFile)}" download>⬇ Download Word résumé</a>
        </div>
        <p class="summary">${esc(r.summary)}</p>
      </div>
      <div class="bio-section"><h2>Core Competencies</h2><div class="skill-grid">${comp}</div></div>
      <div class="bio-section"><h2>Professional Experience</h2>${exp}</div>
      <div class="bio-section"><h2>Certifications</h2>
        <div class="tag-row">${r.certifications.map((c) => `<span class="tag">${esc(c)}</span>`).join("")}</div>
      </div>
      <div class="bio-section"><h2>Education</h2>${edu}</div>
      <p class="resume-foot-note">This is an AI-restructured version of your résumé (modern format, achievement-oriented).
      The downloadable Word file matches it. Street address intentionally omitted per current best practice.</p>`;
  }

  // ====================== SYNC MODAL WIRING ==================================
  function initSyncUI() {
    const modal = document.getElementById("syncModal");
    const open = () => {
      if (sync.cfg) {
        document.getElementById("binId").value = sync.cfg.binId || "";
        document.getElementById("binKey").value = sync.cfg.key || "";
        document.getElementById("binKeyType").value = sync.cfg.keyType || "access";
      }
      syncStatus(
        sync.on()
          ? (sync.usingDefault()
              ? "Sync is ON via the built-in default — works on all devices automatically."
              : "Sync is ON (per-device override).")
          : "Sync is off on this device.",
        sync.on() ? "ok" : "");
      modal.hidden = false;
    };
    const close = () => { modal.hidden = true; };

    document.getElementById("syncBtn").addEventListener("click", open);
    document.getElementById("syncClose").addEventListener("click", close);
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

    document.getElementById("syncSave").addEventListener("click", async () => {
      const binId = document.getElementById("binId").value.trim();
      const key = document.getElementById("binKey").value.trim();
      const keyType = document.getElementById("binKeyType").value;
      if (!binId || !key) { syncStatus("Enter both a Bin ID and a key.", "err"); return; }
      sync.save({ binId, key, keyType });
      syncStatus("Saved. Syncing…", "");
      try {
        await syncPull(); await syncPush();
        setSyncState("synced ✓"); syncStatus("Connected and synced ✓", "ok"); render();
      } catch (e) { setSyncState("sync error"); syncStatus(String(e.message || e), "err"); }
    });

    document.getElementById("syncNow").addEventListener("click", async () => {
      if (!sync.on()) { syncStatus("Save a Bin ID + key first.", "err"); return; }
      syncStatus("Syncing…", "");
      try { await syncPull(); await syncPush(); setSyncState("synced ✓"); syncStatus("Synced ✓", "ok"); render(); }
      catch (e) { setSyncState("sync error"); syncStatus(String(e.message || e), "err"); }
    });

    document.getElementById("syncDisable").addEventListener("click", () => {
      sync.forget();
      document.getElementById("binId").value = "";
      document.getElementById("binKey").value = "";
      setSyncState("Sync off"); syncStatus("Turned off; key removed from this browser.", "");
    });
  }

  // ====================== WIRING =============================================
  function init() {
    // tabs
    document.getElementById("tabs").addEventListener("click", (e) => {
      const btn = e.target.closest(".tab");
      if (!btn) return;
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      btn.classList.add("active");
      const view = btn.dataset.view;
      document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
      document.getElementById("view-" + view).classList.add("active");
    });

    // facets
    buildFacet("filter-roleFamily", "roleFamily");
    buildFacet("filter-regions", "regions");
    buildFacet("filter-workMode", "workMode");
    buildFacet("filter-kind", "kind");

    // search
    document.getElementById("searchBox").addEventListener("input", (e) => {
      state.q = e.target.value.trim().toLowerCase();
      render();
    });

    // sort
    document.getElementById("sortBy").addEventListener("change", (e) => {
      state.sort = e.target.value; render();
    });

    // salary slider
    const salaryRange = document.getElementById("salaryRange");
    const salaryReadout = document.getElementById("salaryReadout");
    const fmtSalary = (v) => v <= 0 ? "Any" : "$" + Math.round(v / 1000) + "k+";
    salaryRange.addEventListener("input", (e) => {
      state.minSalary = +e.target.value;
      salaryReadout.textContent = fmtSalary(state.minSalary);
      render();
    });

    // quick toggles
    document.getElementById("quickFilters").addEventListener("click", (e) => {
      const btn = e.target.closest(".toggle");
      if (!btn) return;
      const key = btn.dataset.toggle;
      state.toggles[key] = !state.toggles[key];
      btn.classList.toggle("active");
      render();
    });

    // mark all seen
    document.getElementById("markSeenBtn").addEventListener("click", () => {
      JOBS.forEach((j) => seen.add(j.id));
      save(LS.seen, seen);
      scheduleSync();
      render();
    });

    // clear filters
    document.getElementById("clearFiltersBtn").addEventListener("click", () => {
      state.q = ""; document.getElementById("searchBox").value = "";
      state.minSalary = 0;
      document.getElementById("salaryRange").value = 0;
      document.getElementById("salaryReadout").textContent = "Any";
      Object.keys(state.toggles).forEach((k) => (state.toggles[k] = false));
      Object.values(state.facets).forEach((s) => s.clear());
      document.querySelectorAll(".chip.active").forEach((c) => c.classList.remove("active"));
      render();
    });

    // stamps
    const stamp = "Data refreshed " + (window.JOBS_GENERATED || "—");
    document.getElementById("updatedStamp").textContent = stamp;
    document.getElementById("footStamp").textContent = stamp;

    renderBio();
    renderResume();
    initSyncUI();
    render();

    // If sync configured, pull remote state then re-render.
    if (sync.on()) {
      setSyncState("syncing…");
      syncPull()
        .then(() => { setSyncState("synced ✓"); render(); })
        .catch(() => setSyncState("sync error"));
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
