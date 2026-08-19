import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { COOKIE_NAME, verifySession } from "@/lib/auth";
import { buildSlackSnapshot } from "@/lib/slack";
import { buildClickUpSnapshot } from "@/lib/clickup";
import { buildWebWorkSnapshot } from "@/lib/webwork";
import { buildFirefliesSnapshot } from "@/lib/fireflies";
import { buildSystemsStatusSnapshot } from "@/lib/systems-status";
import { recordSuccess, recordFailure } from "@/lib/api-cache";

const STALE_MINUTES = 60;
const DEAD_MINUTES = 24 * 60;

const SOURCES = [
  { key: "slack", label: "Slack" },
  { key: "clickup", label: "ClickUp" },
  { key: "webwork", label: "WebWork" },
  { key: "fireflies", label: "Fireflies" },
  { key: "systems-status", label: "Systems Status" },
] as const;

type SourceKey = (typeof SOURCES)[number]["key"];

export interface HealthRow {
  source: string;
  label: string;
  fetched_at: string | null;
  age_minutes: number | null;
  consecutive_failures: number;
  last_error: string | null;
  health: "ok" | "stale" | "dead" | "never" | "circuit_open";
}

function computeHealth(
  fetchedAt: string | null,
  failures: number,
): HealthRow["health"] {
  if (!fetchedAt) return "never";
  if (failures >= 3) return "circuit_open";
  const ageMinutes = (Date.now() - new Date(fetchedAt).getTime()) / 60000;
  if (ageMinutes > DEAD_MINUTES) return "dead";
  if (ageMinutes > STALE_MINUTES) return "stale";
  return "ok";
}

// GET - read vcos_api_cache directly and compute health at request time
export async function GET(req: NextRequest) {
  const role = req.headers.get("x-role");
  if (!role)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: rows } = await supabase
    .from("vcos_api_cache")
    .select("source, fetched_at, consecutive_failures, last_error");

  const rowMap = Object.fromEntries((rows ?? []).map((r) => [r.source, r]));

  const health: HealthRow[] = SOURCES.map(({ key, label }) => {
    const row = rowMap[key];
    if (!row?.fetched_at) {
      return {
        source: key,
        label,
        fetched_at: null,
        age_minutes: null,
        consecutive_failures: 0,
        last_error: null,
        health: "never" as const,
      };
    }
    const age_minutes = Math.round(
      (Date.now() - new Date(row.fetched_at).getTime()) / 60000,
    );
    return {
      source: key,
      label,
      fetched_at: row.fetched_at,
      age_minutes,
      consecutive_failures: row.consecutive_failures ?? 0,
      last_error: row.last_error ?? null,
      health: computeHealth(row.fetched_at, row.consecutive_failures ?? 0),
    };
  });

  return NextResponse.json({ health });
}

async function refreshSource(
  source: SourceKey,
): Promise<{ ok: boolean; error?: string }> {
  try {
    let snapshot: unknown;
    if (source === "slack") snapshot = await buildSlackSnapshot();
    else if (source === "clickup") snapshot = await buildClickUpSnapshot();
    else if (source === "webwork") snapshot = await buildWebWorkSnapshot();
    else if (source === "fireflies") snapshot = await buildFirefliesSnapshot();
    else if (source === "systems-status")
      snapshot = await buildSystemsStatusSnapshot();

    // A WebWork snapshot can come back "successful" at the HTTP level while
    // some members' hours failed to fetch (see lib/webwork.ts `incomplete`).
    // Caching that as a success would silently freeze stale/wrong per-member
    // warning flags with no way to self-correct until the next full refresh -
    // treat it as a failure instead, matching /api/webwork's POST handler.
    if (source === "webwork" && (snapshot as { incomplete?: boolean }).incomplete) {
      await recordFailure(
        source,
        "Partial fetch - some members' hours could not be retrieved from WebWork",
      );
      return { ok: false, error: "Partial fetch - some members' hours could not be retrieved" };
    }

    await recordSuccess(source, snapshot);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await recordFailure(source, msg);
    return { ok: false, error: msg };
  }
}

// POST - trigger a live refresh for one source or all
export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;
  if (!session || !["admin", "owner"].includes(session.role)) {
    return NextResponse.json(
      { error: "Admin access required" },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const { source } = body as { source?: string };

  if (source === "all") {
    const targets: SourceKey[] = [
      "slack",
      "clickup",
      "webwork",
      "fireflies",
      "systems-status",
    ];
    const results = await Promise.allSettled(
      targets.map((s) => refreshSource(s)),
    );
    const log = results.map((r, i) => ({
      source: targets[i],
      ok: r.status === "fulfilled" ? r.value.ok : false,
      error:
        r.status === "fulfilled"
          ? r.value.error
          : String((r as PromiseRejectedResult).reason),
    }));
    return NextResponse.json({ ok: true, log });
  }

  if (!SOURCES.find((s) => s.key === source)) {
    return NextResponse.json({ error: "Unknown source" }, { status: 400 });
  }

  const result = await refreshSource(source as SourceKey);
  return NextResponse.json(result);
}
