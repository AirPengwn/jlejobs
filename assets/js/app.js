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

  const JOBS = window.JOBS || [];

  // ---- active filter state --------------------------------------------------
  const state = {
    q: "",
    sort: "new",
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
      render();
    });

    // clear filters
    document.getElementById("clearFiltersBtn").addEventListener("click", () => {
      state.q = ""; document.getElementById("searchBox").value = "";
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
    render();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
