// Tony's goals - the quarterly "source of truth". Everyone can read; admins edit.
import { NextRequest, NextResponse } from "next/server";
import { loadGoals, saveGoals } from "@/lib/memory";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!req.headers.get("x-role"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const text = await loadGoals().catch(() => "");
  return NextResponse.json({ text });
}

export async function POST(req: NextRequest) {
  if (!["admin", "owner"].includes(req.headers.get("x-role") ?? "")) {
    return NextResponse.json(
      { error: "Admin access required" },
      { status: 403 },
    );
  }
  const body = await req.json().catch(() => ({}));
  if (typeof body.text !== "string")
    return NextResponse.json({ error: "text required" }, { status: 400 });
  await saveGoals(body.text.slice(0, 8000));
  return NextResponse.json({ ok: true, text: body.text.slice(0, 8000) });
}
