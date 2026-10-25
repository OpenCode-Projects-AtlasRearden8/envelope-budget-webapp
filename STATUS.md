# STATUS.md — Envelope Budget

Last updated: 2026-10-25

## What was built

An offline household budget web app using **envelope budgeting**, delivered as
a single self-contained file (`index.html` — HTML + CSS + JS, zero
dependencies, zero network calls, works from `file://`).

Features:

- **Monthly envelopes** with per-month refill budgets and reusable defaults.
- **Two-tap spending** — tap `Spend`, tap a quick amount. Custom amounts,
  negative refunds, and optional notes; every transaction is editable or
  deletable.
- **Per-envelope remaining bars** — green view of money left, amber under 20%,
  red when empty.
- **Month rollover with flexible carryover** — when creating the next month,
  each envelope is carried ("carry leftover") or reset ("drop leftover") per
  your choice; the pure `rolloverMonth(state, fromKey, toKey, plan)` function
  powers it and does not mutate the input state.
- **Sinking-fund envelopes** — target amounts for yearly bills; they default to
  always carrying their balance forward so the fund grows month over month.
- **CSV export** — `Month,Date,Envelope,Note,Amount` for all months.
- **JSON backup / restore**, plus an explicit erase-all with confirmation.
- **localStorage only** — no accounts, no telemetry, no network code.
- Keyboard month navigation (`←`/`→`), dark mode via `prefers-color-scheme`,
  mobile-responsive layout, escape-HTML rendering throughout.
- First-run seeds four friendly example envelopes so it's never a blank page.

## How to run it

Open `index.html` in any modern browser (double-click works; `file://` is the
target environment). Nothing to install, build, or serve.

## Verification results

Environment: Linux, Node.js v20.19.2.

| Check | Result |
|---|---|
| `node tests/rollover.test.js` (rollover/carryover math) | **14/14 pass** |
| `node tests/smoke.js` (boot, render, persist, spend, rollover, CSV export, month-key edges) | **pass** |
| Inline app script `node --check` syntax check | **pass** |

Test notes:

- `tests/rollover.test.js` extracts the `CORE-BEGIN`/`CORE-END` block straight
  out of `index.html`, so the tests exercise the exact shipped math — full
  carry, reset, sinking-fund accumulation across multiple months, explicit
  numeric carry amounts (clamped ≥ 0), budget copying/default fallback, purity
  (no mutation of input state), and error cases (missing source month, existing
  target month).
- `tests/smoke.js` runs the full app script headlessly with a minimal
  DOM/localStorage stub, simulating a spend of $5 (395 left in a 400 envelope),
  a "reload" (state reloaded from localStorage), a month rollover
  (leftover 395 carried into the new month), and asserts the exported CSV
  header/rows.
- No browser was available in this environment; testing was headless. The app
  should also be opened once in a real browser as a final visual check.

## Known gaps

- **No multi-device or cross-browser sync** — by design it is one browser
  profile's localStorage. Backup JSON export/import is the manual sync path.
- **No per-envelope transaction categories or recurring auto-transactions** —
  transactions are a flat list you log by hand.
- **Rollover dialog presets carryover amounts but not per-envelope numeric
  entry** — the UI offers carry/drop (the numeric plan mode exists in the core
  function but isn't surfaced in the dialog).
- **No real-name currency handling** — everything is displayed with `$`
  formatting; the math itself is currency-agnostic.
- **Accessibility**: tested with keyboard basics and ARIA labels on bars, but
  not verified with a screen reader.
- **Tests are headless** — UI interaction (dialogs, drag, true browser storage
  quota behavior) is untested in a real browser engine.
