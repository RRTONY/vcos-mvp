import { NextRequest, NextResponse } from "next/server";
import { authTest } from "@/lib/slack";
import { pingUser } from "@/lib/clickup";
import { pingFireflies } from "@/lib/fireflies";
import { getCachedSWR, recordSuccess } from "@/lib/api-cache";
import { getSupabase } from "@/lib/supabase";
import { COOKIE_NAME, verifySession } from "@/lib/auth";
import { CACHE_TTL_SYSTEMS_MS } from "@/lib/constants";

type Status = "green" | "amber" | "red";

interface SystemResult {
  system: string;
  status: Status;
  detail: string;
  manual?: boolean;
  updatedBy?: string;
  updatedAt?: string;
}

// Systems checked via live API call
async function checkSlack(): Promise<SystemResult> {
  if (!process.env.SLACK_BOT_TOKEN)
    return { system: "Slack", status: "amber", detail: "Token not configured" };
  try {
    const d = await authTest();
    return {
      system: "Slack",
      status: d.ok ? "green" : "red",
      detail: d.ok ? `Connected as ${d.user}` : (d.error ?? "Auth failed"),
    };
  } catch (e) {
    return {
      system: "Slack",
      status: "red",
      detail: e instanceof Error ? e.message : "Error",
    };
  }
}

async function checkClickUp(): Promise<SystemResult> {
  if (!process.env.CLICKUP_API_KEY)
    return {
      system: "ClickUp",
      status: "amber",
      detail: "API key not configured",
    };
  try {
    const d = await pingUser();
    return {
      system: "ClickUp",
      status: d.user ? "green" : "red",
      detail: d.user ? `Authed as ${d.user.username}` : "Auth failed",
    };
  } catch (e) {
    return {
      system: "ClickUp",
      status: "red",
      detail: e instanceof Error ? e.message : "Error",
    };
  }
}

async function checkFireflies(): Promise<SystemResult> {
  if (!process.env.FIREFLIES_API_KEY)
    return {
      system: "Fireflies",
      status: "amber",
      detail: "API key not configured",
    };
  try {
    const d = await pingFireflies();
    const ok = d.data?.user;
    return {
      system: "Fireflies",
      status: ok ? "green" : "amber",
      detail: ok ? `Connected as ${d.data.user.name}` : "Auth issue",
    };
  } catch (e) {
    return {
      system: "Fireflies",
      status: "red",
      detail: e instanceof Error ? e.message : "Error",
    };
  }
}

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
    const [slack, clickup, fireflies] = await Promise.all([
      checkSlack(),
      checkClickUp(),
      checkFireflies(),
    ]);
    liveResults = [
      {
        system: "Netlify",
        status: "green",
        detail: "Functions running normally",
      },
      slack,
      clickup,
      fireflies,
    ];
    await recordSuccess("systems-status", {
      systems: liveResults,
      timestamp: new Date().toISOString(),
    });
  }

  const systems: SystemResult[] = [
    ...liveResults,
    ...MANUAL_SYSTEM_KEYS.map((k) => manualMap[k]),
  ];

  return NextResponse.json({ systems, timestamp: new Date().toISOString() });
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
