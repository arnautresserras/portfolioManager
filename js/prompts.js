/* prompts.js — assembles structured prompts from current portfolio state.
   No network / no LLM calls. Output is meant to be pasted into a Claude chat. */
(function (global) {
  "use strict";

  function fmtDate(iso) {
    if (!iso) return "";
    var parts = iso.split("-");
    if (parts.length !== 3) return iso;
    var months = ["January","February","March","April","May","June",
      "July","August","September","October","November","December"];
    var y = +parts[0], m = +parts[1], d = +parts[2];
    return months[m - 1] + " " + d + ", " + y;
  }

  function initiativeName(state, id) {
    if (!id) return "";
    var it = (state.initiatives || []).find(function (x) { return x.id === id; });
    return it ? it.name : "";
  }

  function activeGoals(state) {
    return ((state.report && state.report.weeklyGoals) || [])
      .filter(function (g) { return g && g.text && g.text.trim(); });
  }

  // Compact, readable plain-text rendering of the whole portfolio to embed as context.
  function renderPortfolioContext(state) {
    var lines = [];
    var r = state.report || {};
    lines.push("REPORT: " + (r.title || "Portfolio Status Report"));
    lines.push("Week " + (r.week != null ? r.week : "?") + " | " + fmtDate(r.date));

    var goals = activeGoals(state);
    if (goals.length) {
      lines.push("");
      lines.push("GOALS FOR THIS WEEK:");
      goals.forEach(function (g, i) {
        var link = initiativeName(state, g.initiativeId);
        lines.push("  " + (i + 1) + ". [" + (g.done ? "DONE" : "open") + "] " + g.text +
          (link ? "  (initiative: " + link + ")" : ""));
      });
    }
    lines.push("");

    var catById = {};
    (state.statusCategories || []).forEach(function (c) { catById[c.id] = c; });

    (state.sections || []).forEach(function (sec) {
      var items = (state.initiatives || [])
        .filter(function (i) { return i.sectionId === sec.id; })
        .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      if (!items.length) return;
      lines.push("## " + sec.name);
      items.forEach(function (it) {
        var cat = catById[it.statusCategory];
        lines.push("");
        lines.push("### " + it.name + "  [" + (it.statusLabel || (cat && cat.label) || "") + "]");
        if (it.statusLine) lines.push("Status: " + it.statusLine);
        if (it.keySignal) lines.push("Key signal: " + it.keySignal);
        (it.detailBullets || []).forEach(function (b) {
          var sub = /^[\t ]{1,}/.test(b);
          lines.push((sub ? "    - " : "  - ") + b.replace(/^[\t ]+/, ""));
        });
        if ((it.nextSteps || []).length) {
          lines.push("  Next steps:");
          it.nextSteps.forEach(function (n) { lines.push("    - " + n); });
        }
      });
      lines.push("");
    });
    return lines.join("\n").trim();
  }

  function wrap(instruction, state) {
    var meta = state.report || {};
    var header =
      "You are helping me, a Product Owner, report on a digitalization portfolio " +
      "for my client. Below is the CURRENT, COMPLETE portfolio state for Week " +
      (meta.week != null ? meta.week : "?") + " (" + fmtDate(meta.date) + "). " +
      "Base your answer only on this state — do not invent initiatives, dates, or facts.\n\n" +
      "=== PORTFOLIO STATE ===\n" +
      renderPortfolioContext(state) +
      "\n=== END PORTFOLIO STATE ===\n\n";
    return header + instruction;
  }

  var GENERATORS = {
    goals: function (state) {
      return wrap(
        "TASK — Recommend this week's 3 goals.\n" +
        "Propose exactly THREE focused, achievable goals for me to commit to this week, " +
        "drawn strictly from the portfolio state above. Requirements:\n" +
        "1. Prioritise: regulatory/time-bound deadlines, rollout blockers, and decisions/" +
        "approvals that unblock the most downstream work.\n" +
        "2. Each goal must be a single concrete outcome I can own this week (not a vague theme), " +
        "and should map to a specific initiative — name it.\n" +
        "3. Prefer goals that unblock or de-risk; avoid picking three goals that all depend on the " +
        "same external party.\n" +
        "4. For each: one line for the goal, then a short 'why now' justification.\n" +
        "5. End with 2–3 runner-up candidates I could swap in, so I can choose.\n" +
        "If some goals are already marked DONE above, treat them as in-flight context and don't " +
        "re-propose them.",
        state);
    },
    summary: function (state) {
      return wrap(
        "TASK — Executive summary.\n" +
        "Write a concise executive summary (roughly 150–220 words) of the portfolio's " +
        "overall health for a senior stakeholder audience. Requirements:\n" +
        "1. Open with a one-sentence overall status.\n" +
        "2. Group the narrative by theme, not by listing every initiative: what is live and " +
        "delivering value, what is progressing well (UAT/pilot/ready for rollout), and what is " +
        "blocked or waiting on a gate/decision.\n" +
        "3. Call out the 2–3 items that most need leadership attention and why.\n" +
        "4. If 'Goals for this week' are listed above, weave in one sentence on progress against " +
        "them (what's done vs. open).\n" +
        "5. Neutral, factual, confident tone — no hype, no filler. Prose paragraphs, not bullets.",
        state);
    },
    actions: function (state) {
      return wrap(
        "TASK — Action items.\n" +
        "Produce a prioritized action-items list I can act on this week. Requirements:\n" +
        "1. Derive actions from the 'Next steps' and any blockers/open questions in the state.\n" +
        "2. Group into: (a) Blockers to unblock, (b) Decisions/approvals to chase, " +
        "(c) Delivery tasks in motion.\n" +
        "3. For each action give: the initiative, the concrete next action, and who/what it " +
        "depends on (owner or upstream team) if evident from the state.\n" +
        "4. Order within each group by urgency (regulatory deadlines and rollout blockers first).\n" +
        "5. Output as a clean checklist. Keep each item to one line.",
        state);
    },
    email: function (state) {
      var meta = state.report || {};
      return wrap(
        "TASK — Twice-weekly status email.\n" +
        "Draft the status update email I send to stakeholders. Requirements:\n" +
        "1. Subject line: \"Digitalization Portfolio — Week " + (meta.week != null ? meta.week : "?") +
        " status\".\n" +
        "2. Short greeting, then a 2–3 sentence headline paragraph on overall progress since the " +
        "last update.\n" +
        "3. A 'Highlights' section (what moved forward) and a 'Needs attention' section " +
        "(blockers, pending decisions, deadlines) — each as short bullets referencing initiatives " +
        "by name.\n" +
        "4. If 'Goals for this week' are listed above, add a short 'Goals this week' line reporting " +
        "progress against them (done vs. open).\n" +
        "5. A brief closing line offering to discuss.\n" +
        "6. Professional, concise, warm-but-businesslike tone. Ready to send with minimal edits.",
        state);
    }
  };

  global.PortfolioPrompts = {
    build: function (kind, state) {
      var gen = GENERATORS[kind];
      if (!gen) throw new Error("Unknown prompt kind: " + kind);
      return gen(state);
    },
    renderContext: renderPortfolioContext
  };
})(window);
