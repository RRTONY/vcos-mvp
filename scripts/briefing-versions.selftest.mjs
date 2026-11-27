// Self-test for versioned Briefing writes (lib/briefing.ts writeIfVersion).
// Runs against an in-memory fake of the briefing_docs table: never touches
// Supabase. Run: node scripts/briefing-versions.selftest.mjs
import { createRequire } from "node:module";
import path from "node:path";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
process.env.SUPABASE_URL ||= "http://fake.local";
process.env.SUPABASE_SERVICE_KEY ||= "fake";
const jiti = createRequire(import.meta.url)("jiti")(import.meta.url, { alias: { "@": root } });
const B = jiti(path.join(root, "lib/briefing.ts"));

// ── fake table ──
let rows = [];
let tick = 0;
const stamp = () => `2026-11-28T00:00:${String(++tick).padStart(2, "0")}.123456+00:00`;
function builder() {
  const st = { filters: [], kind: "select", payload: null, single: false };
  const match = (r) => st.filters.every(([c, v]) => r[c] === v);
  const run = () => {
    if (st.kind === "select") {
      const out = rows.filter(match).map((r) => ({ id: r.id, data: r.data, updated_at: r.updated_at }));
      return { data: st.single ? out[0] ?? null : out, error: null };
    }
    if (st.kind === "insert") {
      if (rows.some((r) => r.collection === st.payload.collection && r.id === st.payload.id))
        return { data: null, error: { code: "23505", message: "duplicate" } };
      const r = { ...st.payload, updated_at: stamp() };
      rows.push(r);
      return { data: st.single ? { updated_at: r.updated_at } : [{ updated_at: r.updated_at }], error: null };
    }
    if (st.kind === "update") {
      const hit = rows.filter(match);
      for (const r of hit) Object.assign(r, st.payload, { updated_at: stamp() });
      return { data: hit.map((r) => ({ updated_at: r.updated_at })), error: null };
    }
    if (st.kind === "delete") {
      const hit = rows.filter(match);
      rows = rows.filter((r) => !hit.includes(r));
      return { data: hit.map((r) => ({ id: r.id })), error: null };
    }
  };
  const b = {
    select: () => b,
    eq: (c, v) => (st.filters.push([c, v]), b),
    insert: (p) => ((st.kind = "insert"), (st.payload = p), b),
    update: (p) => ((st.kind = "update"), (st.payload = p), b),
    delete: () => ((st.kind = "delete"), b),
    maybeSingle: () => ((st.single = true), b),
    then: (ok, bad) => Promise.resolve(run()).then(ok, bad),
  };
  return b;
}
const db = { from: () => builder() };

const svc = { kind: "service", name: "job" };
const ed = { kind: "editor", name: "Rob" };
let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  console.log("ok -", name);
}
const conflict = (p, current) =>
  p.then(
    () => assert.fail("expected a conflict"),
    (e) => {
      assert.ok(e instanceof B.VersionConflict, e.message);
      if (current !== undefined) assert.equal(e.current, current);
    },
  );

await check("create with if_version null", async () => {
  const v = await B.writeIfVersion(svc, "set", "entries", "e1", { meetingId: "2026-11-30", name: "Kula" }, null, db);
  assert.match(v, /^2026/);
  assert.equal(rows[0].meeting_id, "2026-11-30");
});
await check("create again with null conflicts and returns the current version", async () => {
  await conflict(B.writeIfVersion(svc, "set", "entries", "e1", { name: "x" }, null, db), rows[0].updated_at);
});
await check("update at the right version merges and bumps the version", async () => {
  const v0 = rows[0].updated_at;
  const v1 = await B.writeIfVersion(ed, "update", "entries", "e1", { teamNote: "called", teamNoteBy: "Rob" }, v0, db);
  assert.notEqual(v1, v0);
  assert.deepEqual(rows[0].data, { meetingId: "2026-11-30", name: "Kula", teamNote: "called", teamNoteBy: "Rob" });
});
await check("a stale version is refused (409) and nothing changes", async () => {
  const before = JSON.stringify(rows);
  await conflict(B.writeIfVersion(svc, "update", "entries", "e1", { name: "Stale" }, "2026-01-01T00:00:00+00:00", db), rows[0].updated_at);
  assert.equal(JSON.stringify(rows), before);
});
await check("a job's set keeps the team note (team-owned fields)", async () => {
  await B.writeIfVersion(svc, "set", "entries", "e1", { meetingId: "2026-11-30", name: "Kula v2", teamNote: "job tried" }, rows[0].updated_at, db);
  assert.equal(rows[0].data.name, "Kula v2");
  assert.equal(rows[0].data.teamNote, "called");
  assert.equal(rows[0].data.teamNoteBy, "Rob");
});
await check("guardWrite still strips team fields from a job's write", async () => {
  const g = B.guardWrite(svc, "update", "entries", { teamNote: "x", status: "moving" });
  assert.deepEqual(g, { data: { status: "moving" } });
});
await check("two writers on the same version: only the first wins", async () => {
  const v = rows[0].updated_at;
  await B.writeIfVersion(ed, "update", "entries", "e1", { status: "a" }, v, db);
  await conflict(B.writeIfVersion(ed, "update", "entries", "e1", { status: "b" }, v, db));
  assert.equal(rows[0].data.status, "a");
});
await check("update or delete of a missing doc with null version is 'not found'", async () => {
  await assert.rejects(B.writeIfVersion(ed, "update", "entries", "nope", { a: 1 }, null, db), B.DocNotFound);
});
await check("delete needs the current version", async () => {
  await conflict(B.writeIfVersion(ed, "delete", "entries", "e1", {}, "old", db));
  await B.writeIfVersion(ed, "delete", "entries", "e1", {}, rows[0].updated_at, db);
  assert.equal(rows.length, 0);
});
await check("getDoc returns the version", async () => {
  await B.writeIfVersion(ed, "set", "questions", "q1", { meetingId: "2026-12-03", text: "?" }, null, db);
  const d = await B.getDoc("questions", "q1", db);
  assert.equal(d.version, rows[0].updated_at);
});

console.log(`\n${passed} checks passed`);
