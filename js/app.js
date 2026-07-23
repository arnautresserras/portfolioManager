/* app.js — state, rendering, CRUD, reorder, import/export, autosave.
   Fully client-side. No network calls except the initial fetch of portfolio.json. */
(function () {
  "use strict";

  var LS_KEY = "portfolioManager.state.v1";
  var LS_DIRTY = "portfolioManager.dirty.v1";

  var state = null;      // current in-memory portfolio
  var dirty = false;     // unsaved local edits vs. committed portfolio.json
  var editingId = null;  // initiative id being edited (null = new)
  var lastPrompt = "";   // last built prompt (for re-copy)

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* ---------------- utilities ---------------- */

  function slugify(s) {
    return String(s).toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "item";
  }

  function uniqueId(base) {
    var id = base, n = 1;
    var ids = {};
    (state.initiatives || []).forEach(function (i) { ids[i.id] = true; });
    while (ids[id]) { id = base + "-" + (++n); }
    return id;
  }

  function fmtDate(iso) {
    if (!iso) return "";
    var p = iso.split("-");
    if (p.length !== 3) return iso;
    var months = ["January","February","March","April","May","June",
      "July","August","September","October","November","December"];
    return months[(+p[1]) - 1] + " " + (+p[2]) + ", " + (+p[0]);
  }

  function catById(id) {
    return (state.statusCategories || []).find(function (c) { return c.id === id; });
  }

  function itemsOf(sectionId) {
    return (state.initiatives || [])
      .filter(function (i) { return i.sectionId === sectionId; })
      .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  }

  function toast(msg, isErr) {
    var t = $("#toast");
    t.textContent = msg;
    t.className = "toast" + (isErr ? " err" : "");
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, 2600);
  }

  /* ---------------- persistence ---------------- */

  function markDirty() {
    dirty = true;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
      localStorage.setItem(LS_DIRTY, "1");
    } catch (e) { /* storage may be unavailable/full — non-fatal */ }
    $("#dirtyBanner").hidden = false;
  }

  function clearDirty() {
    dirty = false;
    try { localStorage.removeItem(LS_DIRTY); } catch (e) {}
    $("#dirtyBanner").hidden = true;
  }

  function loadFromStorage() {
    try {
      if (localStorage.getItem(LS_DIRTY) === "1") {
        var raw = localStorage.getItem(LS_KEY);
        if (raw) return JSON.parse(raw);
      }
    } catch (e) {}
    return null;
  }

  function fetchRepoJson() {
    return fetch("portfolio.json", { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      });
  }

  /* ---------------- rendering ---------------- */

  function render() {
    renderMeta();
    renderSections();
  }

  function renderMeta() {
    $("#metaWeek").value = state.report.week != null ? state.report.week : "";
    $("#metaDate").value = state.report.date || "";
    $("#metaPreview").textContent =
      "Week " + (state.report.week != null ? state.report.week : "?") +
      "  |  " + fmtDate(state.report.date);
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderSections() {
    var host = $("#sections");
    host.innerHTML = "";
    var total = 0;

    (state.sections || []).forEach(function (sec) {
      var items = itemsOf(sec.id);
      total += items.length;

      var secEl = document.createElement("section");
      secEl.className = "section";
      secEl.dataset.sectionId = sec.id;

      var head = document.createElement("div");
      head.className = "section__head";
      head.innerHTML = '<h2>' + esc(sec.name) + '</h2>' +
        '<span class="section__count">' + items.length +
        (items.length === 1 ? " initiative" : " initiatives") + '</span>';
      secEl.appendChild(head);

      items.forEach(function (it) { secEl.appendChild(renderCard(it)); });
      host.appendChild(secEl);
    });

    $("#emptyState").hidden = total > 0;
  }

  function renderCard(it) {
    var cat = catById(it.statusCategory);
    var color = (cat && cat.color ? cat.color : "5F5E5A").replace("#", "");
    var el = document.createElement("article");
    el.className = "card";
    el.dataset.id = it.id;
    el.dataset.cat = it.statusCategory || "";
    el.setAttribute("draggable", "true");

    var badgeLabel = it.statusLabel || (cat && cat.label) || "";

    var bulletsHtml = (it.detailBullets || []).map(function (b) {
      var sub = /^[\t ]{1,}/.test(b);
      return '<li class="' + (sub ? "sub" : "") + '">' + esc(b.replace(/^[\t ]+/, "")) + '</li>';
    }).join("");

    var nextHtml = (it.nextSteps || []).map(function (n) {
      return '<li>' + esc(n) + '</li>';
    }).join("");

    el.innerHTML =
      '<div class="card__top">' +
        '<div class="card__heading">' +
          '<span class="card__drag" title="Drag to reorder" aria-hidden="true">⠿</span>' +
          '<span class="card__name">' + esc(it.name) + '</span>' +
          '<span class="badge" style="background:#' + color + '">' + esc(badgeLabel) + '</span>' +
        '</div>' +
        '<div class="card__actions">' +
          '<button class="btn-icon" data-action="edit" title="Edit" aria-label="Edit ' + esc(it.name) + '">✎</button>' +
          '<button class="btn-icon" data-action="move-up" title="Move up" aria-label="Move up">↑</button>' +
          '<button class="btn-icon" data-action="move-down" title="Move down" aria-label="Move down">↓</button>' +
          '<button class="btn-icon" data-action="delete" title="Delete" aria-label="Delete ' + esc(it.name) + '">🗑</button>' +
        '</div>' +
      '</div>' +
      (it.keySignal ? '<p class="card__signal">' + esc(it.keySignal) + '</p>' : '') +
      (it.statusLine ? '<p class="card__statusline"><strong>Status:</strong> ' + esc(it.statusLine) + '</p>' : '') +
      ((bulletsHtml || nextHtml) ?
        '<details><summary>Details &amp; next steps</summary>' +
          (bulletsHtml ? '<ul class="card__bullets">' + bulletsHtml + '</ul>' : '') +
          (nextHtml ? '<div class="card__nextsteps-label">Next steps</div>' +
                      '<ul class="card__nextsteps">' + nextHtml + '</ul>' : '') +
        '</details>' : '');

    return el;
  }

  /* ---------------- reorder ---------------- */

  function reindex(sectionId) {
    itemsOf(sectionId).forEach(function (it, idx) { it.order = idx + 1; });
  }

  function moveItem(id, dir) {
    var it = state.initiatives.find(function (x) { return x.id === id; });
    if (!it) return;
    var siblings = itemsOf(it.sectionId);
    var pos = siblings.indexOf(it);
    var swap = siblings[pos + dir];
    if (!swap) return;
    var tmp = it.order; it.order = swap.order; swap.order = tmp;
    markDirty();
    renderSections();
  }

  // drag & drop within a section
  var dragId = null;
  function onDragStart(e) {
    var card = e.target.closest(".card");
    if (!card) return;
    dragId = card.dataset.id;
    card.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", dragId); } catch (x) {}
  }
  function onDragOver(e) {
    var card = e.target.closest(".card");
    if (!card || card.dataset.id === dragId) return;
    var dragged = state.initiatives.find(function (x) { return x.id === dragId; });
    var target = state.initiatives.find(function (x) { return x.id === card.dataset.id; });
    if (!dragged || !target || dragged.sectionId !== target.sectionId) return;
    e.preventDefault();
    $$(".card.drag-over").forEach(function (c) { c.classList.remove("drag-over"); });
    card.classList.add("drag-over");
  }
  function onDrop(e) {
    var card = e.target.closest(".card");
    if (!card) return;
    e.preventDefault();
    var dragged = state.initiatives.find(function (x) { return x.id === dragId; });
    var target = state.initiatives.find(function (x) { return x.id === card.dataset.id; });
    if (!dragged || !target || dragged.sectionId !== target.sectionId) return;
    var sibs = itemsOf(dragged.sectionId);
    sibs.splice(sibs.indexOf(dragged), 1);
    sibs.splice(sibs.indexOf(target), 0, dragged);
    sibs.forEach(function (it, idx) { it.order = idx + 1; });
    markDirty();
    renderSections();
  }
  function onDragEnd() {
    dragId = null;
    $$(".card.dragging, .card.drag-over").forEach(function (c) {
      c.classList.remove("dragging", "drag-over");
    });
  }

  /* ---------------- editor dialog ---------------- */

  function openEditor(id) {
    editingId = id || null;
    var dlg = $("#editorDialog");
    var it = id ? state.initiatives.find(function (x) { return x.id === id; }) : null;

    // populate selects
    var secSel = $("#fSection");
    secSel.innerHTML = state.sections.map(function (s) {
      return '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>';
    }).join("");
    var catSel = $("#fCategory");
    catSel.innerHTML = state.statusCategories.map(function (c) {
      return '<option value="' + esc(c.id) + '">' + esc(c.label) + ' (' + esc(c.color) + ')</option>';
    }).join("");

    $("#editorTitle").textContent = it ? "Edit initiative" : "Add initiative";
    $("#fName").value = it ? it.name : "";
    $("#fSection").value = it ? it.sectionId : state.sections[0].id;
    $("#fCategory").value = it ? it.statusCategory : state.statusCategories[0].id;
    $("#fStatusLabel").value = it ? (it.statusLabel || "") : "";
    $("#fKeySignal").value = it ? (it.keySignal || "") : "";
    $("#fStatusLine").value = it ? (it.statusLine || "") : "";
    $("#fBullets").value = it ? (it.detailBullets || []).join("\n") : "";
    $("#fNextSteps").value = it ? (it.nextSteps || []).join("\n") : "";

    dlg.showModal();
    $("#fName").focus();
  }

  function linesToArray(text, keepIndent) {
    return String(text || "").split("\n")
      .map(function (l) { return keepIndent ? l.replace(/\s+$/, "") : l.trim(); })
      .filter(function (l) { return l.length > 0; });
  }

  function saveEditor(e) {
    e.preventDefault();
    var name = $("#fName").value.trim();
    if (!name) { toast("Name is required", true); return; }

    var data = {
      name: name,
      sectionId: $("#fSection").value,
      statusCategory: $("#fCategory").value,
      statusLabel: $("#fStatusLabel").value.trim(),
      keySignal: $("#fKeySignal").value.trim(),
      statusLine: $("#fStatusLine").value.trim(),
      detailBullets: linesToArray($("#fBullets").value, true),
      nextSteps: linesToArray($("#fNextSteps").value, false)
    };

    if (editingId) {
      var it = state.initiatives.find(function (x) { return x.id === editingId; });
      var oldSection = it.sectionId;
      Object.keys(data).forEach(function (k) { it[k] = data[k]; });
      if (oldSection !== it.sectionId) {
        it.order = itemsOf(it.sectionId).length; // append to new section
        reindex(oldSection);
      }
    } else {
      data.id = uniqueId(slugify(name));
      data.order = itemsOf(data.sectionId).length + 1;
      state.initiatives.push(data);
    }

    $("#editorDialog").close();
    markDirty();
    renderSections();
    toast(editingId ? "Initiative updated" : "Initiative added");
    editingId = null;
  }

  function deleteInitiative(id) {
    var it = state.initiatives.find(function (x) { return x.id === id; });
    if (!it) return;
    if (!window.confirm('Delete "' + it.name + '"? This cannot be undone (until you reload from repo).')) return;
    var sec = it.sectionId;
    state.initiatives = state.initiatives.filter(function (x) { return x.id !== id; });
    reindex(sec);
    markDirty();
    renderSections();
    toast("Initiative deleted");
  }

  /* ---------------- import / export ---------------- */

  function exportJson() {
    normalizeOrders();
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "portfolio.json";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    clearDirty();
    toast("Exported portfolio.json — commit it to the repo");
  }

  function normalizeOrders() {
    (state.sections || []).forEach(function (s) { reindex(s.id); });
  }

  function importJson(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (!validate(data)) { toast("Invalid portfolio JSON structure", true); return; }
        state = data;
        markDirty();
        render();
        toast("Imported — remember to export to commit");
      } catch (err) {
        toast("Could not parse JSON: " + err.message, true);
      }
    };
    reader.readAsText(file);
  }

  function validate(d) {
    return d && d.report && Array.isArray(d.sections) &&
      Array.isArray(d.statusCategories) && Array.isArray(d.initiatives);
  }

  function reloadFromRepo() {
    if (dirty && !window.confirm("Discard local edits and reload portfolio.json from the repo?")) return;
    fetchRepoJson().then(function (data) {
      state = data;
      clearDirty();
      render();
      toast("Reloaded from portfolio.json");
    }).catch(function (e) {
      toast("Could not load portfolio.json: " + e.message, true);
    });
  }

  /* ---------------- prompts ---------------- */

  function copyPrompt(kind, label) {
    var text = window.PortfolioPrompts.build(kind, state);
    lastPrompt = text;
    copyText(text).then(function (ok) {
      showPromptDialog(label, text, ok);
    });
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(
        function () { return true; },
        function () { return fallbackCopy(text); });
    }
    return Promise.resolve(fallbackCopy(text));
  }

  function fallbackCopy(text) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.focus(); ta.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  function showPromptDialog(label, text, copied) {
    $("#promptTitle").textContent = copied
      ? label + " — copied to clipboard"
      : label + " — copy manually below";
    $("#promptText").value = text;
    $("#promptDialog").showModal();
    if (copied) toast(label + " prompt copied");
  }

  /* ---------------- github sync ---------------- */

  function refreshGhButtons() {
    var configured = window.GitHubSync && window.GitHubSync.isConfigured();
    $$("[data-gh-only]").forEach(function (el) { el.hidden = !configured; });
  }

  function buildCommitMessage() {
    var tmpl = (window.GitHubSync.getConfig().message || "").trim()
      || "Update portfolio.json — Week {week} ({date})";
    return tmpl
      .replace(/\{week\}/g, state.report.week != null ? state.report.week : "")
      .replace(/\{date\}/g, state.report.date || "");
  }

  function commitToGitHub() {
    if (!window.GitHubSync.isConfigured()) { openGhSettings(); return; }
    normalizeOrders();
    var json = JSON.stringify(state, null, 2);
    toast("Committing to GitHub…");
    window.GitHubSync.commit(json, buildCommitMessage()).then(function (res) {
      clearDirty();
      toast((res.created ? "Created" : "Committed") + " portfolio.json on GitHub");
      if (res.commitUrl) {
        var t = $("#toast");
        t.innerHTML = "";
        t.appendChild(document.createTextNode("Committed — "));
        var a = document.createElement("a");
        a.href = res.commitUrl; a.target = "_blank"; a.rel = "noopener";
        a.textContent = "view commit"; a.style.color = "#9db4e0";
        t.appendChild(a);
      }
    }).catch(function (e) {
      toast(e.message, true);
      console.error(e);
    });
  }

  function openGhSettings() {
    var cfg = window.GitHubSync.getConfig();
    if (!cfg.owner && !cfg.repo) {
      var d = window.GitHubSync.detect();
      cfg.owner = d.owner; cfg.repo = d.repo;
    }
    $("#ghToken").value = window.GitHubSync.getToken();
    $("#ghOwner").value = cfg.owner;
    $("#ghRepo").value = cfg.repo;
    $("#ghBranch").value = cfg.branch || "main";
    $("#ghPath").value = cfg.path || "portfolio.json";
    $("#ghMessage").value = cfg.message || "";
    setGhStatus("");
    $("#ghDialog").showModal();
    $("#ghToken").focus();
  }

  function setGhStatus(msg, isErr) {
    var el = $("#ghStatus");
    el.textContent = msg || "";
    el.className = "gh-status" + (isErr ? " err" : (msg ? " ok" : ""));
  }

  function persistGhFromForm() {
    window.GitHubSync.setToken($("#ghToken").value.trim());
    window.GitHubSync.saveConfig({
      owner: $("#ghOwner").value.trim(),
      repo: $("#ghRepo").value.trim(),
      branch: $("#ghBranch").value.trim() || "main",
      path: $("#ghPath").value.trim() || "portfolio.json",
      message: $("#ghMessage").value.trim()
    });
  }

  function ghSave() {
    persistGhFromForm();
    refreshGhButtons();
    $("#ghDialog").close();
    toast("GitHub sync settings saved");
  }

  function ghTest() {
    persistGhFromForm();
    setGhStatus("Testing…");
    window.GitHubSync.test().then(function (res) {
      var note = res.defaultBranch ? (" Default branch: " + res.defaultBranch + ".") : "";
      var cfg = window.GitHubSync.getConfig();
      var mismatch = res.defaultBranch && cfg.branch && res.defaultBranch !== cfg.branch
        ? " (you're targeting '" + cfg.branch + "')" : "";
      setGhStatus("✓ Connected." + note + mismatch);
      refreshGhButtons();
    }).catch(function (e) {
      setGhStatus("✗ " + e.message, true);
    });
  }

  function ghClearToken() {
    window.GitHubSync.clearToken();
    $("#ghToken").value = "";
    refreshGhButtons();
    setGhStatus("Token cleared from this browser.");
  }

  /* ---------------- event wiring ---------------- */

  function onClick(e) {
    var actionEl = e.target.closest("[data-action]");
    if (actionEl) {
      var action = actionEl.dataset.action;
      var card = e.target.closest(".card");
      var id = card ? card.dataset.id : null;
      switch (action) {
        case "generate-docx": return doGenerateDocx();
        case "add-initiative": return openEditor(null);
        case "edit": return openEditor(id);
        case "delete": return deleteInitiative(id);
        case "move-up": return moveItem(id, -1);
        case "move-down": return moveItem(id, 1);
        case "export-json": return exportJson();
        case "import-json": return $("#importFile").click();
        case "reload-json": return reloadFromRepo();
        case "commit-github": return commitToGitHub();
        case "open-gh-settings": return openGhSettings();
        case "gh-cancel": return $("#ghDialog").close();
        case "gh-test": return ghTest();
        case "gh-save": return ghSave();
        case "gh-clear-token": return ghClearToken();
        case "prompt-summary": return copyPrompt("summary", "Executive summary");
        case "prompt-actions": return copyPrompt("actions", "Action items");
        case "prompt-email": return copyPrompt("email", "Status email");
        case "editor-cancel": return $("#editorDialog").close();
        case "dismiss-banner": return ($("#dirtyBanner").hidden = true);
        case "prompt-close": return $("#promptDialog").close();
        case "prompt-recopy":
          return copyText($("#promptText").value).then(function (ok) {
            toast(ok ? "Copied again" : "Copy failed", !ok);
          });
      }
    }
  }

  function doGenerateDocx() {
    normalizeOrders();
    toast("Generating .docx…");
    window.PortfolioDocx.download(state).then(function (fname) {
      toast("Downloaded " + fname);
    }).catch(function (e) {
      toast("docx generation failed: " + e.message, true);
      console.error(e);
    });
  }

  function wireMeta() {
    $("#metaWeek").addEventListener("input", function () {
      var v = parseInt(this.value, 10);
      state.report.week = isNaN(v) ? null : v;
      renderMeta(); markDirty();
    });
    $("#metaDate").addEventListener("input", function () {
      state.report.date = this.value;
      renderMeta(); markDirty();
    });
  }

  function boot() {
    document.addEventListener("click", onClick);
    $("#editorForm").addEventListener("submit", saveEditor);
    $("#ghForm").addEventListener("submit", function (e) { e.preventDefault(); ghSave(); });
    refreshGhButtons();
    $("#importFile").addEventListener("change", function () {
      if (this.files && this.files[0]) importJson(this.files[0]);
      this.value = "";
    });

    var host = $("#sections");
    host.addEventListener("dragstart", onDragStart);
    host.addEventListener("dragover", onDragOver);
    host.addEventListener("drop", onDrop);
    host.addEventListener("dragend", onDragEnd);

    // Warn before leaving with unsaved edits
    window.addEventListener("beforeunload", function (e) {
      if (dirty) { e.preventDefault(); e.returnValue = ""; }
    });

    var cached = loadFromStorage();
    if (cached && validate(cached)) {
      state = cached;
      wireMeta();
      render();
      dirty = true;
      $("#dirtyBanner").hidden = false;
      toast("Restored unsaved local edits");
      return;
    }

    fetchRepoJson().then(function (data) {
      state = data;
      wireMeta();
      render();
    }).catch(function (e) {
      toast("Could not load portfolio.json: " + e.message + " (serve over http, not file://)", true);
      // Provide an empty scaffold so the app is still usable
      state = {
        report: { title: "Digitalization Portfolio — Status Report", week: 1, date: "" },
        sections: [{ id: "general", name: "GENERAL" }],
        statusCategories: [
          { id: "live", label: "Live", color: "2E6611" },
          { id: "live-attn", label: "Attention", color: "BA7517" },
          { id: "in-progress", label: "In progress", color: "854F0B" },
          { id: "planned", label: "Planned", color: "5F5E5A" }
        ],
        initiatives: []
      };
      wireMeta();
      render();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
