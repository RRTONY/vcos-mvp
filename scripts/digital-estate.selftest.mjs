// Self-test for lib/digital-estate.ts. Run: node scripts/digital-estate.selftest.mjs
import { createRequire } from "node:module";
import path from "node:path";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const jiti = createRequire(import.meta.url)("jiti")(import.meta.url, { alias: { "@": root } });
const E = jiti(path.join(root, "lib/digital-estate.ts"));

const day = (i, sessions) => ({ date: `202611${String(i).padStart(2, "0")}`, sessions, views: sessions * 2, newUsers: 1 });
const days = (from, to, f) => Array.from({ length: to - from + 1 }, (_, k) => day(from + k, f(from + k)));
let n = 0;
const ok = (name, fn) => (fn(), n++, console.log("ok -", name));

ok("compares the last 7 complete days with the 7 before, ignoring today", () => {
  const t = [...days(1, 7, () => 0), ...days(8, 14, () => 10), ...days(15, 21, () => 20), day(22, 999)];
  const c = E.compareWeeks(t, "20261122");
  assert.equal(c.current.sessions, 140);
  assert.equal(c.previous.sessions, 70);
  assert.equal(c.sessionsChange, 70);
  assert.equal(Math.round(c.sessionsChangePct), 100);
  assert.equal(c.flag, "up");
  assert.equal(c.from, "2026-11-15");
  assert.equal(c.to, "2026-11-21");
  assert.equal(c.current.views, 280);
});
ok("a big percentage on a tiny site is not flagged (under 20 sessions)", () => {
  const c = E.compareWeeks([...days(1, 7, () => 1), ...days(8, 14, () => 2)], "20261115");
  assert.equal(c.sessionsChange, 7);
  assert.equal(c.flag, null);
});
ok("a 20+ session drop under 25% is not flagged; over 25% is", () => {
  assert.equal(E.compareWeeks([...days(1, 7, () => 20), ...days(8, 14, () => 17)], "20261115").flag, null);
  assert.equal(E.compareWeeks([...days(1, 7, () => 20), ...days(8, 14, () => 10)], "20261115").flag, "down");
});
ok("no previous traffic: percentage is null, flagged up only if 20+", () => {
  const c = E.compareWeeks([...days(1, 7, () => 0), ...days(8, 14, () => 3)], "20261115");
  assert.equal(c.sessionsChangePct, null);
  assert.equal(c.flag, "up");
});
ok("fewer than 14 complete days gives null, never a fake zero", () => {
  assert.equal(E.compareWeeks(days(1, 13, () => 5), "20261114"), null);
  assert.equal(E.compareWeeks([], "20261114"), null);
});
ok("unsorted input is handled", () => {
  const t = [...days(8, 14, () => 10), ...days(1, 7, () => 5)].reverse();
  assert.equal(E.compareWeeks(t, "20261115").previous.sessions, 35);
});
ok("gaToday uses Pacific time", () => {
  assert.equal(E.gaToday(new Date("2026-11-28T05:00:00Z")), "20261127");
  assert.equal(E.gaToday(new Date("2026-11-28T09:00:00Z")), "20261128");
});
console.log(`\n${n} checks passed`);
