import { NextRequest, NextResponse } from "next/server";
import { getCachedSWR, recordSuccess, recordFailure } from "@/lib/api-cache";
import { buildSystemsStatusSnapshot, type SystemResult } from "@/lib/systems-status";
import { getSupabase } from "@/lib/supabase";
import { COOKIE_NAME, verifySession } from "@/lib/auth";
import { CACHE_TTL_SYSTEMS_MS } from "@/lib/constants";

type Status = "green" | "amber" | "red";

// Systems that are manually managed - stored in Supabase system_statuses table
const MANUAL_SYSTEM_KEYS = [
  "Gmail",
  "BILL.com",
  "QuickBooks",
  "Bitwarden",
  "Braintrust",
  "Email Meter",
  "WebWork",
  "Manus/AI",
];

const MANUAL_DEFAULTS: Record<string, { status: Status; detail: string }> = {
  Gmail: { status: "green", detail: "Operational" },
  "BILL.com": { status: "green", detail: "Operational" },
  QuickBooks: { status: "green", detail: "Operational" },
  Bitwarden: { status: "green", detail: "Operational" },
  Braintrust: { status: "green", detail: "Operational" },
  "Email Meter": { status: "green", detail: "Operational" },
  WebWork: { status: "green", detail: "Operational" },
  "Manus/AI": { status: "green", detail: "Operational" },
};

export async function GET() {
  const sb = getSupabase();

  // Always read manual statuses fresh from Supabase (so admin edits are instant)
  const { data: manualRows } = await sb
    .from("system_statuses")
    .select("system_key, status, detail, updated_by, updated_at");

  const manualMap: Record<string, SystemResult> = {};
  for (const key of MANUAL_SYSTEM_KEYS) {
    const row = manualRows?.find((r) => r.system_key === key);
    manualMap[key] = row
      ? {
          system: key,
          status: row.status as Status,
          detail: row.detail,
          manual: true,
          updatedBy: row.updated_by,
          updatedAt: row.updated_at,
        }
      : { system: key, ...MANUAL_DEFAULTS[key], manual: true };
  }

  // Use cached live checks to avoid hitting external APIs on every page load
  const liveCache = await getCachedSWR<{ systems: SystemResult[] }>(
    "systems-status",
    CACHE_TTL_SYSTEMS_MS,
  );

  let liveResults: SystemResult[];
  if (liveCache.data && !liveCache.stale) {
    liveResults = liveCache.data.systems.filter((s) => !s.manual);
  } else {
    const snapshot = await buildSystemsStatusSnapshot();
    liveResults = snapshot.systems;
    await recordSuccess("systems-status", snapshot);
  }

  const systems: SystemResult[] = [
    ...liveResults,
    ...MANUAL_SYSTEM_KEYS.map((k) => manualMap[k]),
  ];

  return NextResponse.json({ systems, timestamp: new Date().toISOString() });
}

// POST - force a live refresh (cron, or cache-health's "Refresh" button).
// Previously nothing ever called this: the daily cron didn't include this
// source and cache-health's refresh treated it as a no-op ("has its own
// route"), so once nobody happened to load /systems while its 5-min cache
// was stale, the cached snapshot froze indefinitely and the health panel
// showed it as permanently expired.
export async function POST(req: NextRequest) {
  const role = req.headers.get("x-role");
  const secret = req.headers.get("x-cron-secret");
  const isScheduled = secret === process.env.CRON_SECRET;
  if (!isScheduled && !role)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const snapshot = await buildSystemsStatusSnapshot();
    await recordSuccess("systems-status", snapshot);
    return NextResponse.json({ ok: true, ...snapshot });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await recordFailure("systems-status", msg);
    return NextResponse.json({ ok: false, error: msg });
  }
}

// PATCH - admin updates a manual system status
export async function PATCH(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;
  if (!session || !["admin", "owner"].includes(session.role)) {
    return NextResponse.json(
      { error: "Admin access required" },
      { status: 403 },
    );
  }

  const { system, status, detail } = await req.json().catch(() => ({}));
  if (!system || !status)
    return NextResponse.json(
      { error: "system and status required" },
      { status: 400 },
    );
  if (!MANUAL_SYSTEM_KEYS.includes(system))
    return NextResponse.json(
      { error: "System is live-monitored and cannot be manually updated" },
      { status: 400 },
    );

  const sb = getSupabase();
  const { error } = await sb.from("system_statuses").upsert(
    {
      system_key: system,
      status,
      detail: detail ?? "Operational",
      updated_by: session.username,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "system_key" },
  );

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
