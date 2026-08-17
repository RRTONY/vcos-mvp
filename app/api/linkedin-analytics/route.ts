import { NextRequest, NextResponse } from "next/server";
import { buildLinkedInSnapshot } from "@/lib/linkedin-analytics";
import {
  getCachedSWR,
  recordSuccess,
  recordFailure,
  isCircuitOpen,
} from "@/lib/api-cache";
import {
  CACHE_TTL_LINKEDIN_MS,
  LINKEDIN_ACCOUNTS,
  type LinkedInAccountId,
} from "@/lib/constants";

function isValidAccount(account: string | null): account is LinkedInAccountId {
  return !!account && LINKEDIN_ACCOUNTS.some((a) => a.id === account);
}

// GET ?account=ramprate - stale-while-revalidate from cache
export async function GET(req: NextRequest) {
  const role = req.headers.get("x-role");
  if (!role)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const account = req.nextUrl.searchParams.get("account");
  if (!isValidAccount(account)) {
    return NextResponse.json(
      {
        error: `account must be one of: ${LINKEDIN_ACCOUNTS.map((a) => a.id).join(", ")}`,
      },
      { status: 400 },
    );
  }

  const result = await getCachedSWR(`linkedin-${account}`, CACHE_TTL_LINKEDIN_MS);
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

// POST ?account=... - fetch live from LinkedIn, store in cache
export async function POST(req: NextRequest) {
  const role = req.headers.get("x-role");
  const secret = req.headers.get("x-cron-secret");
  const isScheduled = secret === process.env.CRON_SECRET;
  if (!isScheduled && !role)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const account = req.nextUrl.searchParams.get("account");
  if (!isValidAccount(account)) {
    return NextResponse.json(
      {
        error: `account must be one of: ${LINKEDIN_ACCOUNTS.map((a) => a.id).join(", ")}`,
      },
      { status: 400 },
    );
  }

  if (await isCircuitOpen(`linkedin-${account}`)) {
    const stale = await getCachedSWR(`linkedin-${account}`, CACHE_TTL_LINKEDIN_MS);
    return NextResponse.json({
      ...((stale.data as object) ?? {}),
      error:
        "LinkedIn API circuit open - 3+ consecutive failures. Returning cached data.",
      circuitOpen: true,
      _stale: true,
      _ageMinutes: stale.ageMinutes,
    });
  }

  try {
    const snapshot = await buildLinkedInSnapshot(account);
    await recordSuccess(`linkedin-${account}`, snapshot);
    return NextResponse.json(snapshot);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await recordFailure(`linkedin-${account}`, msg);
    const stale = await getCachedSWR(`linkedin-${account}`, CACHE_TTL_LINKEDIN_MS);
    return NextResponse.json({
      ...((stale.data as object) ?? {}),
      error: `Live fetch failed: ${msg}`,
      _stale: true,
      _ageMinutes: stale.ageMinutes,
    });
  }
}
