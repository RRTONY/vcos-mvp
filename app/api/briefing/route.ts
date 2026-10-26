// Briefing Room data API. Used by the page (via public/briefing-room-adapter.js)
// and by the scheduled research / ClickUp-sync jobs (x-briefing-key header).
//
//   GET  ?access=1                       → { canWrite, canAnswer, isAdmin, name }
//   GET  ?attendance=YYYY-MM-DD          → team-meeting attendance per Fireflies
//   GET  ?collection=c[&meetingId=m]     → { docs: [{ id, data }] }
//   GET  ?collection=c&id=x              → { doc: { id, data } | null }
//   POST { op: "set"|"update", collection, id, data }
//   POST { op: "add", collection, data } → { id }
//   POST { op: "delete", collection, id }
import { NextRequest, NextResponse } from "next/server";
import { isManager } from "@/lib/roles";
import {
  actorFromSession,
  attendanceFor,
  deleteDoc,
  getDoc,
  guardWrite,
  isBriefingCollection,
  listDocs,
  newDocId,
  setDoc,
  syncFirefliesIntoLog,
  updateDoc,
  FIREFLIES_ROW_PREFIX,
  type BriefingActor,
  type BriefingData,
} from "@/lib/briefing";

export const dynamic = "force-dynamic";

async function getActor(req: NextRequest): Promise<BriefingActor | null> {
  const key = process.env.BRIEFING_API_KEY;
  if (key && req.headers.get("x-briefing-key") === key)
    return { kind: "service", name: "Briefing Room automation" };
  const username = req.headers.get("x-user");
  if (!req.headers.get("x-role") || !username) return null;
  return actorFromSession(username);
}

const fail = (error: string, status: number) =>
  NextResponse.json({ error }, { status });

export async function GET(req: NextRequest) {
  const actor = await getActor(req);
  if (!actor) return fail("Unauthorized", 401);
  const sp = req.nextUrl.searchParams;

  if (sp.get("access")) {
    const role = req.headers.get("x-role");
    return NextResponse.json({
      canWrite: actor.kind !== "viewer",
      canAnswer: true,
      isAdmin: isManager(role),
      name: actor.name,
    });
  }

  const attendance = sp.get("attendance");
  if (attendance) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(attendance)) return fail("Invalid date", 400);
    try {
      return NextResponse.json(await attendanceFor(attendance));
    } catch (e) {
      return fail((e as Error).message, 500);
    }
  }

  const collection = sp.get("collection");
  if (!isBriefingCollection(collection)) return fail("Unknown collection", 400);
  try {
    const id = sp.get("id");
    if (id) return NextResponse.json({ doc: await getDoc(collection, id) });
    const meetingId = sp.get("meetingId");
    if (collection === "log" && meetingId)
      await syncFirefliesIntoLog(meetingId).catch(() => {}); // never block the log
    return NextResponse.json({
      docs: await listDocs(collection, sp.get("meetingId")),
    });
  } catch (e) {
    return fail((e as Error).message, 500);
  }
}

export async function POST(req: NextRequest) {
  const actor = await getActor(req);
  if (!actor) return fail("Unauthorized", 401);

  const body = await req.json().catch(() => null);
  const op = body?.op;
  const collection = body?.collection;
  if (!["set", "update", "add", "delete"].includes(op))
    return fail("op must be set, update, add or delete", 400);
  if (!isBriefingCollection(collection)) return fail("Unknown collection", 400);
  const raw: BriefingData =
    body.data && typeof body.data === "object" && !Array.isArray(body.data)
      ? body.data
      : {};
  const id: string | undefined =
    op === "add" ? newDocId() : typeof body.id === "string" ? body.id : undefined;
  if (!id || !/^[A-Za-z0-9_\-.:]{1,200}$/.test(id)) return fail("Invalid id", 400);

  const guarded = guardWrite(actor, op, collection, raw);
  if ("error" in guarded) return fail(guarded.error, 403);

  try {
    // Deleted Fireflies rows are hidden, not erased, so the sync won't re-add them.
    if (op === "delete" && collection === "log" && id.startsWith(FIREFLIES_ROW_PREFIX))
      await updateDoc(actor, collection, id, { hidden: true });
    else if (op === "delete") await deleteDoc(collection, id);
    else if (op === "update") {
      if (!(await updateDoc(actor, collection, id, guarded.data)))
        return fail("Not found", 404);
    } else await setDoc(actor, collection, id, guarded.data);
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return fail((e as Error).message, 500);
  }
}
