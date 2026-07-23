# Portfolio Status Manager

A self-hosted, fully client-side web app for maintaining the ICL Iberpotash
digitalization portfolio status report. It replaces the manual Word process:
edit portfolio data in the browser, generate the `.docx` status report with one
click, and copy structured prompts into your Claude chat for narrative help —
**no backend, no API keys, no API cost.**

## How it works

- **`portfolio.json` is the source of truth.** It lives in this repo, so git
  gives you version history of the portfolio over time.
- The app loads `portfolio.json` on startup, lets you edit everything, and you
  **export an updated `portfolio.json` to commit back**.
- Edits autosave to your browser's `localStorage`, so you never lose work if you
  close the tab. A banner reminds you to export + commit. The committed file
  always wins — use **Reload from repo** to discard local edits.
- The app makes **no LLM/network calls**. The "Copy prompt" buttons assemble a
  structured prompt (with your full current portfolio embedded) and copy it to
  your clipboard. You paste it into your normal Claude chat, then paste the
  answer back or use it directly.

## Daily / twice-weekly workflow

1. Open the app (GitHub Pages URL).
2. Update the **Week** and **Date** at the top.
3. Add / edit / reorder / delete initiatives. Drag the ⠿ handle or use ↑/↓ to
   reorder within a section.
4. Click **⬇ Generate .docx** → downloads `portfolio_status_weekNN.docx`
   matching the template (assessment table + per-section detail blocks with
   colored status badges).
5. Optionally click a **Copy prompt** button (Executive summary / Action items /
   Status email), paste into Claude, and fold the result into your report/email.
6. Click **Export JSON**, then commit the updated `portfolio.json` to this repo.

## Data model (`portfolio.json`)

```
report          { title, week (number), date (ISO "YYYY-MM-DD") }
sections[]      { id, name }                 fixed section groups, in report order
statusCategories[] { id, label, color }      badge palette (hex, no '#')
initiatives[]   { id, sectionId, order, name,
                  statusCategory,   // -> badge COLOUR (one of statusCategories.id)
                  statusLabel,      // -> badge TEXT (free text, e.g. "Live (blocked)")
                  keySignal,        // one-line summary for the assessment table
                  statusLine,       // the "Status: ..." line in the detail block
                  detailBullets[],  // one string per bullet; lead with a Tab or
                                    //   two spaces for a sub-bullet
                  nextSteps[] }     // one string per next-step bullet
```

### Sections (fixed, in report order)
IBPROM Platform · HR Payroll Digitalization · Logistics & Truck Management ·
SAP Logistics — Regulatory Digitization · Process Automation ·
Cross-System Integration

### Status categories
| id | label | colour | meaning |
|----|-------|--------|---------|
| `live` | Live | `2E6611` green | live & stable |
| `live-attn` | Attention | `BA7517` amber | live but blocked / low adoption / partial |
| `in-progress` | In progress | `854F0B` orange | UAT / pilot / ready for rollout |
| `planned` | Planned | `5F5E5A` gray | scoped / pending gate / pending scope |

You can rename labels or change colours by editing `statusCategories` in the JSON
(and the matching `--st-*` variables in `css/styles.css` if you want the card
accents to follow).

## File structure

```
index.html            single-page app
portfolio.json        source of truth (commit updates here)
css/styles.css        styling (light/dark, responsive, reduced-motion)
js/app.js             state, render, CRUD, reorder, import/export, autosave
js/docx-export.js     builds the .docx (matches the template)
js/prompts.js         clipboard prompt generators (no LLM calls)
js/vendor/docx.min.js docx library, vendored (works offline)
.nojekyll             serve files as-is on GitHub Pages
```

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. **Settings → Pages → Build and deployment → Source: "Deploy from a branch"**,
   branch `main`, folder `/ (root)`.
3. Open the published URL. No build step is required.

## Local development

Because the app `fetch`es `portfolio.json`, open it over HTTP, not `file://`:

```
python -m http.server 8000
# then visit http://localhost:8000
```

## Accessibility & behaviour

- Keyboard accessible (native dialogs, focusable controls, skip link).
- Respects `prefers-reduced-motion` and `prefers-color-scheme` (light/dark).
- Warns before leaving the page with unsaved local edits.
