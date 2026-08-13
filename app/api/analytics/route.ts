import { NextRequest, NextResponse } from "next/server";
import { buildAnalyticsSnapshot } from "@/lib/google-analytics";
import {
  getCachedSWR,
  recordSuccess,
  recordFailure,
  isCircuitOpen,
} from "@/lib/api-cache";
import {
  CACHE_TTL_ANALYTICS_MS,
  ANALYTICS_SITES,
  type AnalyticsSiteId,
} from "@/lib/constants";

function isValidSite(site: string | null): site is AnalyticsSiteId {
  return !!site && ANALYTICS_SITES.some((s) => s.id === site);
}

// GET ?site=ramprate|impactsoul|tonygreenberg - stale-while-revalidate from cache
export async function GET(req: NextRequest) {
  const role = req.headers.get("x-role");
  if (!role)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const site = req.nextUrl.searchParams.get("site");
  if (!isValidSite(site)) {
    return NextResponse.json(
      {
        error: `site must be one of: ${ANALYTICS_SITES.map((s) => s.id).join(", ")}`,
      },
      { status: 400 },
    );
  }

  const result = await getCachedSWR(
    `analytics-${site}`,
    CACHE_TTL_ANALYTICS_MS,
  );
  if (!result.data) {
    return NextResponse.json({
      error: result.error,
      circuitOpen: result.circuitOpen,
    });
  }
  return NextResponse.json({
    ...(result.data as object),
    _stale: result.stale || undefined,
    _ageMinutes: result.stale ? result.ageMinutes : undefined,
    _circuitOpen: result.circuitOpen || undefined,
  });
}

// POST ?site=... - fetch live from GA4, store in cache
export async function POST(req: NextRequest) {
  const role = req.headers.get("x-role");
  const secret = req.headers.get("x-cron-secret");
  const isScheduled = secret === process.env.CRON_SECRET;
  if (!isScheduled && !role)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const site = req.nextUrl.searchParams.get("site");
  if (!isValidSite(site)) {
    return NextResponse.json(
      {
        error: `site must be one of: ${ANALYTICS_SITES.map((s) => s.id).join(", ")}`,
      },
      { status: 400 },
    );
  }

  if (await isCircuitOpen(`analytics-${site}`)) {
    const stale = await getCachedSWR(
      `analytics-${site}`,
      CACHE_TTL_ANALYTICS_MS,
    );
    return NextResponse.json({
      ...((stale.data as object) ?? {}),
      error:
        "GA4 circuit open - 3+ consecutive failures. Returning cached data.",
      circuitOpen: true,
      _stale: true,
      _ageMinutes: stale.ageMinutes,
    });
  }

  try {
    const snapshot = await buildAnalyticsSnapshot(site);
    await recordSuccess(`analytics-${site}`, snapshot);
    return NextResponse.json(snapshot);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await recordFailure(`analytics-${site}`, msg);
    const stale = await getCachedSWR(
      `analytics-${site}`,
      CACHE_TTL_ANALYTICS_MS,
    );
    return NextResponse.json({
      ...((stale.data as object) ?? {}),
      error: `Live fetch failed: ${msg}`,
      _stale: true,
      _ageMinutes: stale.ageMinutes,
    });
  }
}
