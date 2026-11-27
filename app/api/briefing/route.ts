// Briefing Room data API. Used by the page (via public/briefing-room-adapter.js)
// and by the scheduled research / ClickUp-sync jobs (x-briefing-key header).
//
//   GET  ?access=1                       → { canWrite, canAnswer, isAdmin, name }
//   GET  ?attendance=YYYY-MM-DD          → team-meeting attendance per Fireflies
//   GET  ?collection=c[&meetingId=m]     → { docs: [{ id, data }] }
//   GET  ?collection=c&id=x              → { doc: { id, data } | null }
//   POST { op: "set"|"update", collection, id, data[, if_version] } → { ok, id, version }
//   POST { op: "add", collection, data } → { ok, id, version }
//   POST { op: "delete", collection, id[, if_version] }
//   POST { op: "batch", writes: [ ...up to 50 of the above ] } → { results: [...] }
//
// Scheduled jobs sign in with `x-briefing-key: <BRIEFING_API_KEY>` or
// `Authorization: Bearer <CC_SERVICE_TOKEN>` (Darryl's handoff, docs/03 §4).
// Every doc in a GET carries `version`; a write with `if_version` only happens
// if the doc is still at that version (null = must not exist yet), otherwise
// 409 { error, version } with the current version. See writeIfVersion().
import { NextRequest, NextResponse } from "next/server";
import { isManager } from "@/lib/roles";
import { isServiceRequest } from "@/lib/briefing-auth";
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
  writeIfVersion,
  DocNotFound,
  VersionConflict,
  FIREFLIES_ROW_PREFIX,
  type BriefingActor,
  type BriefingData,
} from "@/lib/briefing";

export const dynamic = "force-dynamic";

async function getActor(req: NextRequest): Promise<BriefingActor | null> {
  if (isServiceRequest(req.headers))
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

type WriteResult =
  | { ok: true; id: string; version: string | null }
  | { ok: false; status: number; error: string; id?: string; version?: string | null };

const MAX_BATCH = 50;

async function executeWrite(actor: BriefingActor, body: unknown): Promise<WriteResult> {
  const b = (body ?? {}) as Record<string, unknown>;
  const op = b.op as "set" | "update" | "add" | "delete";
  const collection = b.collection;
  if (!["set", "update", "add", "delete"].includes(op))
    return { ok: false, status: 400, error: "op must be set, update, add, delete or batch" };
  if (!isBriefingCollection(collection))
    return { ok: false, status: 400, error: "Unknown collection" };
  const raw: BriefingData =
    b.data && typeof b.data === "object" && !Array.isArray(b.data)
      ? (b.data as BriefingData)
      : {};
  const id: string | undefined =
    op === "add" ? newDocId() : typeof b.id === "string" ? b.id : undefined;
  if (!id || !/^[A-Za-z0-9_\-.:]{1,200}$/.test(id))
    return { ok: false, status: 400, error: "Invalid id" };
  const hasVersion = Object.prototype.hasOwnProperty.call(b, "if_version");
  const ifVersion = b.if_version;
  if (hasVersion && ifVersion !== null && typeof ifVersion !== "string")
    return { ok: false, status: 400, error: "if_version must be a string or null", id };

  const guarded = guardWrite(actor, op, collection, raw);
  if ("error" in guarded) return { ok: false, status: 403, error: guarded.error, id };

  try {
    // Deleted Fireflies rows are hidden, not erased, so the sync won't re-add them.
    if (op === "delete" && collection === "log" && id.startsWith(FIREFLIES_ROW_PREFIX)) {
      if (hasVersion) {
        const version = await writeIfVersion(actor, "update", collection, id, { hidden: true }, ifVersion as string | null);
        return { ok: true, id, version };
      }
      await updateDoc(actor, collection, id, { hidden: true });
    } else if (hasVersion && op !== "add") {
      const version = await writeIfVersion(actor, op, collection, id, guarded.data, ifVersion as string | null);
      return { ok: true, id, version };
    } else if (op === "delete") {
      await deleteDoc(collection, id);
      return { ok: true, id, version: null };
    } else if (op === "update") {
      if (!(await updateDoc(actor, collection, id, guarded.data)))
        return { ok: false, status: 404, error: "Not found", id };
    } else await setDoc(actor, collection, id, guarded.data);
    return { ok: true, id, version: (await getDoc(collection, id))?.version ?? null };
  } catch (e) {
    if (e instanceof VersionConflict)
      return { ok: false, status: 409, error: "Version conflict", id, version: e.current };
    if (e instanceof DocNotFound) return { ok: false, status: 404, error: "Not found", id };
    return { ok: false, status: 500, error: (e as Error).message, id };
  }
}

export async function POST(req: NextRequest) {
  const actor = await getActor(req);
  if (!actor) return fail("Unauthorized", 401);
  const body = await req.json().catch(() => null);

  if (body?.op === "batch") {
    const writes = body.writes;
    if (!Array.isArray(writes) || writes.length === 0 || writes.length > MAX_BATCH)
      return fail(`writes must be a list of 1 to ${MAX_BATCH} writes`, 400);
    // One after another, in order. Not a transaction: each result says
    // whether that write happened.
    const results: WriteResult[] = [];
    for (const w of writes) results.push(await executeWrite(actor, w));
    return NextResponse.json({ results });
  }

  const r = await executeWrite(actor, body);
  if (r.ok) return NextResponse.json(r);
  const { status, ok: _ok, ...rest } = r;
  return NextResponse.json(rest, { status });
}
