import { NextRequest, NextResponse } from "next/server";
import { updateTaskStatus } from "@/lib/clickup";

// PATCH /api/clickup-tasks/[id]/status - pushes a status change made in VCoS
// back to the ClickUp task.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const role = req.headers.get("x-role");
  if (!role)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.CLICKUP_API_KEY)
    return NextResponse.json(
      { error: "CLICKUP_API_KEY not configured" },
      { status: 500 },
    );

  const { id } = await params;
  const { status } = await req.json();
  if (!status)
    return NextResponse.json({ error: "status required" }, { status: 400 });

  try {
    await updateTaskStatus(id, status);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    );
  }
}
