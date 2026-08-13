// PATCH /api/invoices/[id] - update invoice status (role-gated)
// admin: pending → audit_done, approved → paid
// owner: audit_done → approved, any status → paid (override for cleanup)
import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, verifySession } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

const ALLOWED_TRANSITIONS: Record<string, { from: string[]; roles: string[] }> =
  {
    audit_done: { from: ["pending"], roles: ["admin", "owner"] },
    approved: { from: ["audit_done"], roles: ["owner"] },
    paid: {
      from: ["approved", "pending", "audit_done"],
      roles: ["admin", "owner"],
    },
  };

// Owners can mark any invoice paid (cleanup override).
// Admins can only follow the normal flow: approved → paid.
function canTransition(
  currentStatus: string,
  newStatus: string,
  role: string,
): boolean {
  const t = ALLOWED_TRANSITIONS[newStatus];
  if (!t) return false;
  if (!t.roles.includes(role)) return false;
  if (role === "owner") return t.from.includes(currentStatus);
  // admin: restrict paid transition to approved only
  if (newStatus === "paid") return currentStatus === "approved";
  return t.from.includes(currentStatus);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;
  if (!session || !["admin", "owner"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  let body: { status: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { status: newStatus } = body;
  if (!ALLOWED_TRANSITIONS[newStatus])
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  if (!ALLOWED_TRANSITIONS[newStatus].roles.includes(session.role)) {
    return NextResponse.json(
      { error: "Insufficient role for this transition" },
      { status: 403 },
    );
  }

  const sb = getSupabase();
  const { data: inv, error: fetchErr } = await sb
    .from("invoices")
    .select("status")
    .eq("id", id)
    .single();
  if (fetchErr || !inv)
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  if (!canTransition(inv.status, newStatus, session.role)) {
    return NextResponse.json(
      { error: `Cannot move to ${newStatus} from ${inv.status}` },
      { status: 409 },
    );
  }

  const { error: updateErr } = await sb
    .from("invoices")
    .update({
      status: newStatus,
      [`${newStatus}_by`]: session.username,
      [`${newStatus}_at`]: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateErr)
    return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, status: newStatus });
}
