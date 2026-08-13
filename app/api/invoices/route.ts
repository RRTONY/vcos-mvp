// GET /api/invoices - reads directly from Supabase invoices table
import { NextRequest, NextResponse } from "next/server";
import { buildInvoicesSnapshot } from "@/lib/invoices";

export async function GET(req: NextRequest) {
  const role = req.headers.get("x-role");
  const username = req.headers.get("x-user") ?? "";
  if (!role)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const snapshot = await buildInvoicesSnapshot({ username, role });
    const invoices = snapshot.invoices.map((inv) => ({
      ...inv,
      rate: role === "owner" ? inv.rate : 0,
      amount: role === "admin" || role === "owner" ? inv.amount : 0,
    }));
    return NextResponse.json({ invoices });
  } catch (err) {
    return NextResponse.json(
      { invoices: [], error: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    );
  }
}
