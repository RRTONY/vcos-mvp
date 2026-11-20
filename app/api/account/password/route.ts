import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  hashPassword,
  verifyPassword,
  MIN_PASSWORD_LENGTH,
} from "@/lib/password";

export const dynamic = "force-dynamic";

// POST /api/account/password  { currentPassword, newPassword }
// Signed-in users change their own password. x-user is set by middleware
// from the verified session (callers cannot supply it).
export async function POST(req: NextRequest) {
  const username = req.headers.get("x-user");
  if (!username)
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { currentPassword?: unknown; newPassword?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const currentPassword =
    typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword =
    typeof body.newPassword === "string" ? body.newPassword : "";

  if (!currentPassword || !newPassword)
    return NextResponse.json(
      { error: "Current and new password are required" },
      { status: 400 },
    );
  if (newPassword.length < MIN_PASSWORD_LENGTH)
    return NextResponse.json(
      { error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      { status: 400 },
    );
  if (newPassword.length > 200)
    return NextResponse.json({ error: "New password is too long" }, { status: 400 });
  // (The 12-char minimum already rules out the old 8-char shared default.)
  if (newPassword === currentPassword)
    return NextResponse.json(
      { error: "New password must be different from the current one" },
      { status: 400 },
    );

  const { data: user } = await supabase
    .from("vcos_users")
    .select("id, password_hash, status")
    .eq("username", username)
    .maybeSingle();

  if (!user || user.status !== "active")
    return NextResponse.json({ error: "Account not active" }, { status: 403 });

  const ok = await verifyPassword(currentPassword, user.password_hash);
  if (!ok)
    return NextResponse.json(
      { error: "Current password is wrong" },
      { status: 400 },
    );

  const { error } = await supabase
    .from("vcos_users")
    .update({ password_hash: await hashPassword(newPassword) })
    .eq("id", user.id);

  if (error)
    return NextResponse.json({ error: "Could not save. Try again." }, { status: 500 });

  return NextResponse.json({ ok: true });
}
