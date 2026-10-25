/*
 * Headless smoke test: runs the app script from index.html inside Node with a
 * minimal DOM/localStorage stub. Verifies boot, render, persistence, spending,
 * month rollover, and CSV export.
 * Zero dependencies. Run: node tests/smoke.js
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert");

/* ---------- tiny DOM / storage fakes ---------- */
function makeEl(){
  return {
    innerHTML: "", style: {}, value: "", hidden: false, textContent: "",
    dataset: {}, handlers: {},
    addEventListener(type, fn){ (this.handlers[type] = this.handlers[type] || []).push(fn); },
    click(){ (this.handlers.click || []).forEach(f => f()); },
    focus(){},
    children: [],
    appendChild(child){ this.children.push(child); },
    remove(){},
    closest(){ return null; },
    querySelectorAll(){ return []; },
    querySelector(){ return null; },
    showModal(){ this.open = true; },
    close(){ this.open = false; }
  };
}
const els = {};
const store = {};
globalThis.document = {
  getElementById(id){ return els[id] || (els[id] = makeEl()); },
  querySelectorAll(){ return []; },
  querySelector(){ return null; },
  createElement(){ return makeEl(); },
  body: makeEl()
};
globalThis.window = { addEventListener(){}, confirm: () => true, alert: () => {} };
globalThis.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
globalThis.Blob = class { constructor(parts){ this.text = parts[0]; } };
globalThis.URL = { createObjectURL(){ return "blob:fake"; }, revokeObjectURL(){} };

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

/* Each runApp(expr) call re-executes the full app script with the SAME fake
   localStorage — which mimics page reloads — then evaluates `expr` and
   returns its value.`expr` has access to the app's top-level functions. */
function runApp(expr){
  return new Function('"use strict";\n' + script + "\nreturn (" + (expr || "null") + ");")();
}

/* ---------- 1. boot + seed + render ---------- */
assert.equal(runApp("state.envelopes.length"), 4, "4 starter envelopes seeded");
assert.ok(runApp("!!state.months[curMonth]"), "current month exists at boot");
const api0 = runApp();
assert.ok(runApp("!!state.months[curMonth]"), "current month exists at boot");

/* ---------- 2. spending (two-tap path) ---------- */
const afterSpend = runApp(`(function(){
  const env = state.envelopes[0];
  openSpend(env.id);  // tap 1: pick envelope (dialog with quick amounts opens)
  logSpend(5);        // tap 2: quick amount button -> logs $5
  return { n: state.months[curMonth].txs.length,
           remaining: envelopeRemaining(state.months[curMonth], env.id) };
})()`);
assert.equal(afterSpend.n, 1, "one transaction logged");
assert.equal(afterSpend.remaining, 395, "Groceries 400 - 5 = 395 left");
assert.ok(store["envelope-budget-v1"], "state persisted to localStorage");
assert.ok(els.envelopes.children.length >= 1, "envelope cards appended to DOM");
assert.ok(els.summary.innerHTML.includes("$"), "summary rendered");
assert.ok(els.currentMonth.textContent.length > 0, "month label rendered");

/* ---------- 3. persistence across a "reload" ---------- */
assert.equal(runApp("state.months[curMonth].txs.length"), 1, "txs survived reload from localStorage");

/* ---------- 4. rollover + save via the app functions ---------- */
const afterRoll = runApp(`(function(){
  const from = curMonth;
  const to = shiftMonth(from, 1);
  const r = rolloverMonth(state, from, to, {});
  state.months = r.state.months;
  saveState();
  return { from, to, report: r.report };
})()`);
assert.equal(afterRoll.report.length, 4, "rollover reported all envelopes");
const stored = JSON.parse(store["envelope-budget-v1"]);
assert.ok(stored.months[afterRoll.to], "new month persisted");
const env0 = stored.envelopes[0];
const month0 = stored.months[afterRoll.from];
assert.equal(
  stored.months[afterRoll.to].carriedIn[env0.id],
  395,
  "leftover $395 carried into the new month"
);

/* ---------- 5. CSV export content ---------- */
globalThis.__cap = null;
runApp(`(function(){
  downloadFile = function(name, content, type){ __cap = { name: name, content: content, type: type }; };
  exportCSV();
})()`);
const csv = globalThis.__cap;
assert.ok(csv, "exportCSV invoked downloadFile");
assert.equal(csv.name, "envelope-budget-transactions.csv");
assert.equal(csv.type, "text/csv");
assert.ok(csv.content.startsWith("Month,Date,Envelope,Note,Amount"), "CSV header");
assert.ok(csv.content.includes("2026-"), "CSV rows contain the transaction month");

/* ---------- 6. month-key edge cases ---------- */
assert.equal(runApp("shiftMonth('2026-01', -1)"), "2025-12");
assert.equal(runApp("shiftMonth('2025-12', 1)"), "2026-01");
assert.equal(runApp("shiftMonth('2026-12', 1)"), "2027-01");

console.log("SMOKE OK — boots, renders, persists, spends, rolls over, exports CSV");
