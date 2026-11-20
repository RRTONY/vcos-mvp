import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { hashPassword, generateTempPassword } from "@/lib/password";
import { COOKIE_NAME, verifySession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Seed all users into Supabase vcos_users table
// POST /api/auth/bootstrap  (admin session required via cookie - run once after deploy)
// Returns generated temp passwords in the response - save them, they are not stored in plaintext
const SEED_USERS: { username: string; role: "owner" | "admin" | "user" }[] = [
  { username: "tony", role: "owner" },
  { username: "ramprate", role: "owner" },
  { username: "kim", role: "admin" },
  { username: "rob", role: "user" },
  { username: "alex", role: "user" },
  { username: "josh", role: "user" },
  { username: "daniel", role: "user" },
  { username: "ben", role: "user" },
];

export async function POST(req: NextRequest) {
  // Middleware lets every /api/auth/* request through without a session and
  // does not overwrite x-role there, so a caller could send "x-role: admin"
  // themselves. Check the signed session cookie instead.
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;
  if (!session || !["admin", "owner"].includes(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const results: { username: string; status: string; tempPassword?: string }[] =
    [];

  for (const u of SEED_USERS) {
    const { data: existing } = await supabase
      .from("vcos_users")
      .select("id")
      .eq("username", u.username)
      .single();

    if (existing) {
      results.push({ username: u.username, status: "already_exists" });
      continue;
    }

    const tempPassword = generateTempPassword();
    const password_hash = await hashPassword(tempPassword);
    const { error } = await supabase.from("vcos_users").insert({
      username: u.username,
      role: u.role,
      password_hash,
      status: "active",
      approved_by: "bootstrap",
    });

    results.push({
      username: u.username,
      status: error ? `error: ${error.message}` : "created",
      tempPassword: error ? undefined : tempPassword,
    });
  }

  return NextResponse.json({ results });
}
