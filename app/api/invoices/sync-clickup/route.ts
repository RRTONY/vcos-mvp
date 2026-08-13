// POST /api/invoices/sync-clickup
// Cron-authenticated - polls ClickUp invoice list for tasks whose status moved to
// "done/paid/closed" and updates the matching Supabase invoice to paid.
//
// ClickUp status mapping:
//   status.type === 'closed'                       → paid  (ClickUp's "done" category)
//   status.status name matches paid/done/complete  → paid  (custom status names)
import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { CLICKUP_INVOICE_LIST_ID } from "@/lib/constants";

const LIST_ID = process.env.CLICKUP_INVOICE_LIST_ID ?? CLICKUP_INVOICE_LIST_ID;

interface ClickUpStatus {
  status: string;
  type: string; // 'open' | 'custom' | 'closed' | 'done'
}

function isSettled(s: ClickUpStatus): boolean {
  const name = s.status.toLowerCase();
  return (
    s.type === "closed" ||
    name === "paid" ||
    name === "done" ||
    name === "complete" ||
    name === "completed" ||
    name === "resolved"
  );
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.CLICKUP_API_KEY;
  if (!apiKey)
    return NextResponse.json(
      { error: "CLICKUP_API_KEY not configured" },
      { status: 500 },
    );

  // Fetch all tasks from the ClickUp invoice list (include closed/done tasks)
  const cuRes = await fetch(
    `https://api.clickup.com/api/v2/list/${LIST_ID}/task?include_closed=true&subtasks=false`,
    { headers: { Authorization: apiKey } },
  );
  if (!cuRes.ok) {
    return NextResponse.json(
      { error: `ClickUp returned ${cuRes.status} ${cuRes.statusText}` },
      { status: 502 },
    );
  }

  const { tasks } = (await cuRes.json()) as {
    tasks: Array<{ id: string; name: string; status: ClickUpStatus }>;
  };

  if (!tasks?.length) {
    return NextResponse.json({ ok: true, synced: 0, checked: 0 });
  }

  const sb = getSupabase();

  // Load all invoices that have a ClickUp link and are not yet paid
  const { data: invoices, error: dbErr } = await sb
    .from("invoices")
    .select("id, status, clickup_task_id, contractor, invoice_number")
    .not("clickup_task_id", "is", null)
    .neq("status", "paid");

  if (dbErr)
    return NextResponse.json({ error: dbErr.message }, { status: 500 });

  // Index by ClickUp task ID for O(1) lookup
  const byTaskId = new Map(
    (invoices ?? []).map((inv) => [inv.clickup_task_id, inv]),
  );

  const synced: string[] = [];
  const errors: string[] = [];

  for (const task of tasks) {
    const inv = byTaskId.get(task.id);
    if (!inv) continue; // No matching invoice or already paid

    if (isSettled(task.status)) {
      const { error } = await sb
        .from("invoices")
        .update({
          status: "paid",
          paid_by: "clickup-sync",
          paid_at: new Date().toISOString(),
        })
        .eq("id", inv.id);

      if (error) {
        errors.push(
          `${inv.contractor} ${inv.invoice_number}: ${error.message}`,
        );
      } else {
        synced.push(
          `${inv.contractor} ${inv.invoice_number} (task ${task.id})`,
        );
        console.log(
          `[invoice-sync] Marked paid: ${inv.contractor} ${inv.invoice_number} - ClickUp status "${task.status.status}"`,
        );
      }
    }
  }

  return NextResponse.json({
    ok: true,
    checked: tasks.length,
    matched: byTaskId.size,
    synced: synced.length,
    syncedItems: synced,
    errors,
  });
}
