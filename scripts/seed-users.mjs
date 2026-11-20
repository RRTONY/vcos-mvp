// One-time seed script - run with: node scripts/seed-users.mjs
// Reads SUPABASE_URL + SUPABASE_SERVICE_KEY from .env and seeds missing users.
//
// Each NEW user gets the team's starting password from VCOS_DEFAULT_PASSWORD
// in .env (kept out of this public repo). If that is unset, each user gets a
// random password, printed once below. Users can change theirs at
// /account/password after signing in.

import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { randomInt } from "crypto";
import { readFileSync } from "fs";

// Parse .env manually (no dotenv needed)
const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

function tempPassword() {
  if (env.VCOS_DEFAULT_PASSWORD) return env.VCOS_DEFAULT_PASSWORD;
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length: 14 }, () => chars[randomInt(chars.length)]).join("");
}

const USERS = [
  { username: "tony", role: "owner" },
  { username: "ramprate", role: "owner" },
  { username: "kim", role: "admin" },
  { username: "rob", role: "user" },
  { username: "alex", role: "user" },
  { username: "josh", role: "user" },
  { username: "daniel", role: "user" },
  { username: "ben", role: "user" },
];

for (const u of USERS) {
  const { data: existing } = await supabase
    .from("vcos_users")
    .select("id")
    .eq("username", u.username)
    .maybeSingle();

  if (existing) {
    console.log(`⏭  ${u.username} - already exists`);
    continue;
  }

  const password = tempPassword();
  const password_hash = await bcrypt.hash(password, 10);
  const { error } = await supabase.from("vcos_users").insert({
    username: u.username,
    role: u.role,
    password_hash,
    status: "active",
    approved_by: "seed-script",
  });

  console.log(
    error
      ? `❌ ${u.username} - ${error.message}`
      : `✅ ${u.username} (${u.role})` +
        (env.VCOS_DEFAULT_PASSWORD ? "  (default password)" : `  temp password: ${password}`),
  );
}

console.log("\nDone. Share passwords privately (not in public Slack channels).");
