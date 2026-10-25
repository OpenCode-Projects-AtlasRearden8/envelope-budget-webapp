/*
 * Tests for the rollover math used by index.html.
 * Run with:  node tests/rollover.test.js   (needs Node.js >= 18, zero dependencies)
 *
 * The core functions live inside index.html (single-file app) between the
 * CORE-BEGIN / CORE-END markers. We extract and evaluate that exact block so
 * the tests always test the math the shipped app actually uses.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const start = html.indexOf("/* CORE-BEGIN */");
const end = html.indexOf("/* CORE-END */");
assert.ok(start !== -1 && end !== -1, "CORE markers found in index.html");
const core = html.slice(start, end + "/* CORE-END */".length);
const api = new Function('"use strict";\n' + core + `
  return { round2, envelopeSpent, envelopeAvailable, envelopeRemaining, monthTotals, rolloverMonth };
`)();
const { round2, envelopeSpent, envelopeAvailable, envelopeRemaining, monthTotals, rolloverMonth } = api;

/* ---------- helpers to build minimal state fixtures ---------- */
function envelope(id, kind, opts){
  return Object.assign({ id, name: id, kind, defaultBudget: 0 }, opts || {});
}
function month(budgeted, carriedIn, txs, income){
  return { budgeted, carriedIn: carriedIn || {}, txs: txs || [], income: income || 0 };
}
function ball(envelopes, months){
  return { envelopes, months };
}

/* ---------- rounding ---------- */
test("round2 fixes floating point drift", () => {
  assert.equal(round2(0.1 + 0.2), 0.3);
  assert.equal(round2(4.999999), 5);
  assert.equal(round2("12.345"), 12.35); // string input tolerated, returns number
});

/* ---------- month math ---------- */
test("spent / available / remaining for a fresh month", () => {
  const st = ball(
    [envelope("groceries", "monthly")],
    { "2026-10": month({ groceries: 400 }, {}, [
      { id: "t1", envId: "groceries", date: "2026-10-03", amount: 100, note: "store" }
    ]) }
  );
  const m = st.months["2026-10"];
  assert.equal(envelopeSpent(m, "groceries"), 100);
  assert.equal(envelopeAvailable(m, "groceries"), 400);
  assert.equal(envelopeRemaining(m, "groceries"), 300);
});

test("refunds (negative tx) reduce spent", () => {
  const st = ball(
    [envelope("gas", "monthly")],
    { "2026-10": month({ gas: 120 }, {}, [
      { id: "t1", envId: "gas", date: "2026-10-01", amount: 45 },
      { id: "t2", envId: "gas", date: "2026-10-02", amount: -10 } // refund
    ]) }
  );
  const m = st.months["2026-10"];
  assert.equal(envelopeSpent(m, "gas"), 35);
  assert.equal(envelopeRemaining(m, "gas"), 85);
});

test("monthTotals sums budget, spend, carried-in and left-to-budget", () => {
  const st = ball(
    [
      envelope("a", "monthly"),
      envelope("b", "monthly"),
      envelope("c", "sinking")
    ],
    { "2026-10": month({ a: 100, b: 50, c: 30 }, { c: 70 }, [
      { id: "t1", envId: "a", date: "2026-10-01", amount: 40 }
    ], 400) }
  );
  const t = monthTotals(st, "2026-10");
  assert.equal(t.budgeted, 180);
  assert.equal(t.carriedIn, 70);
  assert.equal(t.spent, 40);
  assert.equal(t.income, 400);
  assert.equal(t.left, 220); // income - budgeted only
  assert.equal(monthTotals(st, "2099-01").left, 0); // nonexistent month is zeroed
});

/* ---------- rollover: full carryover ---------- */
test("rollover full: leftover becomes carriedIn and stacks on the new budget", () => {
  const st = ball(
    [envelope("groceries", "monthly", { carryDefault: "full" })],
    { "2026-10": month({ groceries: 400 }, {}, [
      { id: "t1", envId: "groceries", date: "2026-10-05", amount: 150 }
    ]) }
  );
  const { state, report } = rolloverMonth(st, "2026-10", "2026-11", { groceries: "full" });
  const nov = state.months["2026-11"];
  assert.equal(nov.carriedIn.groceries, 250);
  assert.equal(nov.budgeted.groceries, 400);
  assert.equal(envelopeAvailable(nov, "groceries"), 650);
  assert.equal(envelopeRemaining(nov, "groceries"), 650);
  assert.equal(report[0].leftover, 250);
  assert.equal(report[0].carryover, 250);
});

test("rollover with no spend and no carry plan carries the untouched budget", () => {
  const st = ball(
    [envelope("fun", "monthly")],
    { "2026-10": month({ fun: 60 }) }
  );
  const { state } = rolloverMonth(st, "2026-10", "2026-11", { fun: "full" });
  const nov = state.months["2026-11"];
  assert.equal(envelopeAvailable(nov, "fun"), 120); // 60 carried + 60 re-budgeted
});

/* ---------- rollover: reset (drop leftover) ---------- */
test("rollover reset: leftover is dropped, budget still refills", () => {
  const st = ball(
    [envelope("gas", "monthly", { carryDefault: "reset" })],
    { "2026-10": month({ gas: 120 }, {}, [
      { id: "t1", envId: "gas", date: "2026-10-05", amount: 20 }
    ]) }
  );
  const { state, report } = rolloverMonth(st, "2026-10", "2026-11", { gas: "reset" });
  const nov = state.months["2026-11"];
  assert.equal(nov.carriedIn.gas, 0);
  assert.equal(nov.budgeted.gas, 120);
  assert.equal(envelopeAvailable(nov, "gas"), 120);
  assert.equal(report[0].leftover, 100);
  assert.equal(report[0].carryover, 0);
});

/* ---------- rollover: flexible default per envelope kind ---------- */
test("default plan: sinking funds carry everything, 'reset' monthly envelopes carry nothing", () => {
  const st2 = ball(
    [
      envelope("insure", "sinking", { defaultBudget: 50 }),
      envelope("gas", "monthly", { carryDefault: "reset" })
    ],
    { "2026-10": month({ insure: 50, gas: 120 }, {}, [
      { id: "t1", envId: "gas", date: "2026-10-05", amount: 20 },
      { id: "t2", envId: "insure", date: "2026-10-06", amount: 10 }
    ]) }
  );
  const { state, report } = rolloverMonth(st2, "2026-10", "2026-11"); // no plan at all
  const nov = state.months["2026-11"];
  assert.equal(nov.carriedIn.insure, 40);              // sinking: full carry by default
  assert.equal(nov.carriedIn.gas, 0);                  // monthly with carryDefault reset
  assert.equal(report.map(r => r.envId).join(","), "insure,gas");
});

/* ---------- rollover: sinking-fund accumulation over months ---------- */
test("sinking fund accumulates across three rollovers (yearly bill)", () => {
  const envs = [envelope("car-ins", "sinking", { defaultBudget: 50, target: 600 })];
  let st = ball(envs, { "2026-01": month({ "car-ins": 50 }) });
  const keys = ["2026-01", "2026-02", "2026-03", "2026-04"];
  for(let i = 1; i < keys.length; i++){
    st = rolloverMonth(st, keys[i - 1], keys[i], { "car-ins": "full" }).state;
  }
  const apr = st.months["2026-04"];
  assert.equal(envelopeAvailable(apr, "car-ins"), 200); // 4 x $50, never spent
  assert.equal(envelopeRemaining(apr, "car-ins"), 200);
});

test("sinking fund keeps accumulating through partial spending", () => {
  const envs = [envelope("car-ins", "sinking", { defaultBudget: 50 })];
  let st = ball(envs, {
    "2026-01": month({ "car-ins": 50 }, {}, [
      { id: "t1", envId: "car-ins", date: "2026-01-20", amount: 30 } // paid part of yearly bill
    ])
  });
  st = rolloverMonth(st, "2026-01", "2026-02", { "car-ins": "full" }).state;
  st.months["2026-02"].txs.push({ id: "t2", envId: "car-ins", date: "2026-02-20", amount: 60 });
  st = rolloverMonth(st, "2026-02", "2026-03", { "car-ins": "full" }).state;
  const mar = st.months["2026-03"];
  // month1: 50 budgeted, 30 spent -> 20 left. month2: 20+50=70, 60 spent -> 10 left.
  // month3: 10 carried + 50 = 60 available.
  assert.equal(envelopeAvailable(mar, "car-ins"), 60);
  assert.equal(envelopeRemaining(mar, "car-ins"), 60);
});

/* ---------- rollover: explicit numeric plan ---------- */
test("explicit numeric carry amount is honored and clamped to >= 0", () => {
  const st = ball(
    [envelope("groceries", "monthly", { carryDefault: "full" })],
    { "2026-10": month({ groceries: 400 }, {}, [
      { id: "t1", envId: "groceries", date: "2026-10-05", amount: 370 }
    ]) } // 30 left
  );
  const { state } = rolloverMonth(st, "2026-10", "2026-11", { groceries: 12.5 });
  assert.equal(state.months["2026-11"].carriedIn.groceries, 12.5);
  const { state: s2 } = rolloverMonth(st, "2026-10", "2026-12", { groceries: -5 });
  assert.equal(s2.months["2026-12"].carriedIn.groceries, 0); // clamped
});

/* ---------- rollover: budget copying ---------- */
test("new month copies previous budget; falls back to defaultBudget when source had none", () => {
  const st = ball(
    [
      envelope("a", "monthly", { defaultBudget: 111 }),
      envelope("b", "monthly", { defaultBudget: 999 })
    ],
    { "2026-10": month({ a: 100 }) } // b has no explicit budget
  );
  const { state } = rolloverMonth(st, "2026-10", "2026-11", { a: "full", b: "full" });
  const nov = state.months["2026-11"];
  assert.equal(nov.budgeted.a, 100);   // copied
  assert.equal(nov.budgeted.b, 999);   // fallback to envelope default
});

/* ---------- purity & errors ---------- */
test("rolloverMonth does not mutate the input state", () => {
  const st = ball(
    [envelope("g", "monthly")],
    { "2026-10": month({ g: 100 }, {}, [ { id: "t1", envId: "g", date: "2026-10-01", amount: 40 } ]) }
  );
  const before = JSON.stringify(st);
  rolloverMonth(st, "2026-10", "2026-11", { g: "full" });
  assert.equal(JSON.stringify(st), before);
});

test("rolloverMonth rejects bad months", () => {
  const st = ball([envelope("g", "monthly")], { "2026-10": month({ g: 100 }) });
  assert.throws(() => rolloverMonth(st, "2026-09", "2026-11", { g: "full" }), /Source month/);
  assert.throws(() => rolloverMonth(st, "2026-10", "2026-10", { g: "full" }), /Target month/);
});
