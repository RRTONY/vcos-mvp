import { NextRequest, NextResponse } from "next/server";
import { getTaskDetail } from "@/lib/clickup";

// GET /api/clickup-tasks/[id] - full detail of one task (description,
// images, files, comments, the list's statuses) for the task detail modal.
export async function GET(
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
  try {
    return NextResponse.json(await getTaskDetail(id));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    );
  }
}
