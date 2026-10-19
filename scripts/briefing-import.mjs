// One-time import of the Briefing Room data from the Claude Artifact export.
// Run after scripts/briefing-room-schema.sql:
//   node scripts/briefing-import.mjs <export-dir>
// <export-dir> holds one folder per collection (meetings, entries, audit, log,
// waiting, questions) with one <docId>.json file per document. Re-running is
// safe: documents are upserted by (collection, id).
import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const dir = process.argv[2];
if (!dir || !existsSync(dir)) {
  console.error("Usage: node scripts/briefing-import.mjs <export-dir>");
  process.exit(1);
}

const COLLECTIONS = ["meetings", "entries", "audit", "log", "waiting", "questions"];
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

for (const collection of COLLECTIONS) {
  const folder = join(dir, collection);
  if (!existsSync(folder)) continue;
  const rows = readdirSync(folder)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const id = f.slice(0, -5);
      const data = JSON.parse(readFileSync(join(folder, f), "utf8"));
      return {
        collection,
        id,
        meeting_id: collection === "meetings" ? id : (data.meetingId ?? null),
        data,
        updated_by: "Artifact import",
      };
    });
  if (!rows.length) continue;
  const { error } = await supabase.from("briefing_docs").upsert(rows);
  if (error) {
    console.error(`${collection}: ${error.message}`);
    process.exit(1);
  }
  console.log(`${collection}: ${rows.length} imported`);
}
