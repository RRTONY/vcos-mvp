import { NextRequest, NextResponse } from "next/server";
import { getTeamMemberByUsername } from "@/lib/team-db";
import { liveOpenTasksFor } from "@/lib/live-open-tasks";
import { isManager } from "@/lib/roles";

// GET /api/clickup-tasks/live?name=<full name> - that person's open tasks
// fetched live from ClickUp (weekly report "Your Open Tasks"). Non-managers
// only ever get their own tasks, whatever name they pass.
export async function GET(req: NextRequest) {
  const role = req.headers.get("x-role");
  if (!role)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let name = req.nextUrl.searchParams.get("name") ?? "";
  if (!isManager(role)) {
    const username = req.headers.get("x-user");
    const member = username ? await getTeamMemberByUsername(username) : null;
    if (!member?.full_name)
      return NextResponse.json({ tasks: [], live: false });
    name = member.full_name;
  }
  if (!name)
    return NextResponse.json({ error: "name required" }, { status: 400 });

  return NextResponse.json(await liveOpenTasksFor(name));
}
