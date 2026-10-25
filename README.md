# Envelope Budget

An offline household budget web app that uses **envelope budgeting**: fill
monthly envelopes with money, log spending in two taps, and see exactly how
much is left in each envelope at a glance.

Built to complement **cashflow-simple-ledger** (simple LLC books). This one is
for *home* — the books stay with the business.

By **Asdale Dynamics, LLC** — practical tools that stay local, stay private,
and stay out of your way.

## What it does

- **Monthly envelopes** — budget each envelope once, reuse it every month.
- **Two-tap spending** — tap `Spend`, tap a quick amount ($5 / $10 / $20 / $50).
  Custom amounts and notes are one more field, not one more click wall.
- **Per-envelope remaining bars** — glanceable green → amber → red bars show
  what's left in every envelope.
- **Month rollover with flexible carryover** — when you fill the next month,
  each envelope lets you *carry the leftover* into the new month or *drop it
  and start fresh*. Money you don't spend can stick around — or not — your call.
- **Sinking-fund envelopes** — for yearly bills (car insurance, property tax,
  holidays). They know their goal, and they always carry their balance forward,
  month after month, until the bill arrives.
- **CSV export** — one clean `Month, Date, Envelope, Note, Amount` table of
  every transaction, ready for a spreadsheet or your bookkeeping flow.
- **Everything in localStorage** — no accounts, no servers, no syncing, no
  tracking. Your budget lives in your browser and nowhere else.
- **ADHD-friendly by design** — fewer decisions per screen, rollback-friendly
  (delete or edit any transaction), dark mode follows your system.

## How to run it

No install, no build, no dependencies. Exactly one file: `index.html`.

1. Download or clone this folder.
2. Double-click `index.html` (or open it from any browser, even with
   `file://` — that's how it's meant to run).
3. Budget envelopes, log spending, done.

It works offline, air-gapped, on a USB stick in a browser kiosk mode — pick
your flavor. Data persists in `localStorage` per browser profile. Clearing
"site data" for the page erases it; use **Data → Backup JSON** regularly.

## Tests

Plain Node.js, zero dependencies (Node 18+):

```
node tests/rollover.test.js   # rollover / carryover math, 14 tests
node tests/smoke.js           # boots the app headlessly, spends, rolls over, exports CSV
```

## Files

| File | What it is |
|---|---|
| `index.html` | the entire app (HTML + CSS + JS in one file) |
| `tests/rollover.test.js` | rollover math tests |
| `tests/smoke.js` | headless boot/spend/rollover/export smoke test |
| `README.md` | this file |
| `LICENSE` | MIT |

## Keyboard shortcuts

- `←` / `→` — previous / next month

## Privacy

This app has no telemetry, no network code, and stores nothing outside your
browser. This is a personal budgeting tool, not financial advice.

## License

MIT — see [LICENSE](LICENSE).

&copy; 2026 Asdale Dynamics, LLC
