// Google Search Console snapshot per site, cached like /api/analytics.
//   GET  ?site=ramprate|tonygreenberg|clarisseartist → cached (stale-while-revalidate)
//   POST ?site=...                                    → fetch live, store in cache
// Read-only towards Google. See lib/search-console.ts.
import { NextRequest, NextResponse } from "next/server";
import {
  getCachedSWR,
  isCircuitOpen,
  recordFailure,
  recordSuccess,
} from "@/lib/api-cache";
import {
  SEARCH_CONSOLE_SITES,
  buildSearchConsoleSnapshot,
  isSearchConsoleSite,
} from "@/lib/search-console";

export const dynamic = "force-dynamic";

// Search Console data moves once a day; refreshing more often only spends quota.
const TTL_MS = 6 * 60 * 60 * 1000;
const key = (site: string) => `search-console-${site}`;
const badSite = () =>
  NextResponse.json(
    { error: `site must be one of: ${SEARCH_CONSOLE_SITES.map((s) => s.id).join(", ")}` },
    { status: 400 },
  );

export async function GET(req: NextRequest) {
  if (!req.headers.get("x-role"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const site = req.nextUrl.searchParams.get("site");
  if (!isSearchConsoleSite(site)) return badSite();
  const result = await getCachedSWR(key(site), TTL_MS);
  if (!result.data)
    return NextResponse.json({ error: result.error ?? "Not loaded yet", circuitOpen: result.circuitOpen });
  return NextResponse.json({
    ...(result.data as object),
    _stale: result.stale || undefined,
    _ageMinutes: result.stale ? result.ageMinutes : undefined,
  });
}

export async function POST(req: NextRequest) {
  const scheduled = req.headers.get("x-cron-secret") === process.env.CRON_SECRET;
  if (!scheduled && !req.headers.get("x-role"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const site = req.nextUrl.searchParams.get("site");
  if (!isSearchConsoleSite(site)) return badSite();

  if (await isCircuitOpen(key(site))) {
    const stale = await getCachedSWR(key(site), TTL_MS);
    return NextResponse.json({
      ...((stale.data as object) ?? {}),
      error: "Search Console paused after repeated failures. Showing cached data.",
      circuitOpen: true,
    });
  }
  try {
    const snapshot = await buildSearchConsoleSnapshot(site);
    await recordSuccess(key(site), snapshot);
    return NextResponse.json(snapshot);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await recordFailure(key(site), msg);
    const stale = await getCachedSWR(key(site), TTL_MS);
    return NextResponse.json({ ...((stale.data as object) ?? {}), error: msg, _stale: true });
  }
}
