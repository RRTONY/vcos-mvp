import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { applyTaskChange, getTask } from "@/lib/clickup";

// POST /api/clickup-webhook - ClickUp calls this whenever a task changes, so
// VCoS's cached copy is patched within seconds instead of waiting for the next
// full refresh. Public (no session), so every request must carry a valid
// X-Signature: HMAC-SHA256 of the raw body keyed with the webhook's secret
// (CLICKUP_WEBHOOK_SECRET, printed by scripts/register-clickup-webhook.mjs).
export async function POST(req: NextRequest) {
  const secret = process.env.CLICKUP_WEBHOOK_SECRET;
  if (!secret)
    return NextResponse.json(
      { error: "CLICKUP_WEBHOOK_SECRET not configured" },
      { status: 500 },
    );

  const body = await req.text();
  const expected = createHmac("sha256", secret).update(body).digest();
  const given = Buffer.from(req.headers.get("x-signature") ?? "", "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });

  let event: { event?: string; task_id?: string };
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const taskId = event.task_id;
  if (!taskId) return NextResponse.json({ ok: true, ignored: true });

  try {
    // Deleted → drop it; anything else → re-read the task as ClickUp has it
    // now (the event payload only carries the changed field).
    const task = event.event === "taskDeleted" ? null : await getTask(taskId);
    await applyTaskChange(taskId, task);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`ClickUp webhook failed for task ${taskId}:`, err);
    // 500 so ClickUp retries; the periodic full refresh is the backstop.
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
