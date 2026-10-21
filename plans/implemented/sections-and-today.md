# Plan — Add sections from the editor; default report date to today

## Current state

- `state.sections` (`{id, name}`) is data-driven, but the only way to add one is to hand-edit `portfolio.json`. The editor's `#fSection` select is filled from `state.sections` in `openEditor` (`js/app.js:330`).
- `uniqueId(base)` only checks for collisions against initiative ids, so it can't be reused for sections as it stands.
- The docx export already uppercases section names and skips sections with no initiatives (`js/docx-export.js:113-120`). An empty section therefore only appears in the app UI, not in the report.
- `report.date` / `report.week` are entered by hand and persisted. Nothing reads the system clock. The stored week numbers are ISO weeks (2026-07-09 → W28).
- `state` gets set from four places: boot (localStorage cache, repo fetch, or the empty scaffold), `reloadFromRepo`, and `importJson`.

## Task 1 — Create a new section from the initiative editor — DONE (not yet browser-verified)

**Outcome:** In the editor's Section dropdown, picking "+ New section…" asks for a name, creates the section, and selects it.

**Context files:** `js/app.js`

**Changes (`js/app.js`):**
- Change `uniqueId(base)` to `uniqueId(base, list)` so it checks ids in the list passed to it. Update the one existing call in `saveEditor` to pass `state.initiatives`.
- Move the code that fills the `#fSection` options out of `openEditor` into a `fillSectionSelect(selectedId)` helper. Append `<option value="__new__">+ New section…</option>` at the end.
- In `boot`, add a `change` listener on `#fSection`. When the value is `__new__`:
  - `window.prompt("New section name")`. The app already uses `window.confirm`, so this needs no new dialog.
  - If the name is empty or the prompt is cancelled, restore the previously selected value.
  - Otherwise push `{ id: uniqueId(slugify(name), state.sections), name: name.toUpperCase() }` onto `state.sections`, then `markDirty()`, `renderSections()`, and `fillSectionSelect(newId)`.
- The new section goes at the end of `state.sections`. That is also where it appears in the app and the .docx.

**How you'll know it worked:**
- Open "+ Add initiative", choose "+ New section…" and enter `Quality`. A `QUALITY` header with "0 initiatives" appears at the bottom, and the dropdown shows it selected.
- Save the initiative. It shows under `QUALITY`, and the exported .docx has a `QUALITY` heading.
- Cancelling the prompt leaves the previous section selected and adds nothing.
- Exported JSON contains `{ "id": "quality", "name": "QUALITY" }`.

## Task 2 — Default the report date to today on load — DONE (isoWeek checked in node; not browser-verified)

**Outcome:** When the app opens with a report date older than today (or none), it sets the date to today and the week to today's ISO week. Both fields stay editable.

**Context files:** `js/app.js`

**Changes (`js/app.js`):**
- Add `todayIso()`, built from local `getFullYear/getMonth/getDate`. Not `toISOString()`, which is UTC and returns yesterday's date between 00:00 and 02:00 Spanish time.
- Add `isoWeek(iso)`: the standard ISO-8601 week number (Thursday-of-week method).
- Add `applyToday()`: if `!state.report.date || state.report.date < todayIso()`, set `date = today` and `week = isoWeek(today)`, call `markDirty()`, and toast `"Report date set to today (Week N)"`.
- Call `applyToday()` before `render()` in the three boot paths (cache, fetch, scaffold) and in `reloadFromRepo`. Don't call it in `importJson`: an imported file is a deliberate snapshot.
- In `reloadFromRepo`, call `applyToday()` after `clearDirty()`, so the date change still shows as an unsaved edit.
- In the `#metaDate` input handler, also set `state.report.week = isoWeek(this.value)` when a valid date is entered, so the week can't drift from the date. Typing a week by hand still overrides it.

**How you'll know it worked:**
- With `portfolio.json` at 2026-07-09 / W28, load the app on 2026-10-19. The header reads `Week 43 | October 19, 2026`, the dirty banner shows, and the toast says Week 43.
- Reload the page: no second toast, because the cached date is already today.
- Set the date input to 2026-12-31: the week becomes 53. Set it to 2027-01-01: the week stays 53 (ISO). Set it to 2027-01-04: the week becomes 1.
- Import an old JSON: its date is kept.

## Resolved questions

1. **Section name casing:** stored uppercase. Confirmed.
2. **Weekly goals at a week rollover:** left unchanged, so goals carry over as they do today. No change.
3. **A future-dated report:** left alone. Confirmed.

## Found while working

_(empty)_
