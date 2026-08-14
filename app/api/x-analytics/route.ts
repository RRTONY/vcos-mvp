import { NextRequest, NextResponse } from "next/server";
import { buildXSnapshot } from "@/lib/x-analytics";
import {
  getCachedSWR,
  recordSuccess,
  recordFailure,
  isCircuitOpen,
} from "@/lib/api-cache";
import { CACHE_TTL_X_MS, X_ACCOUNTS, type XAccountId } from "@/lib/constants";

function isValidAccount(account: string | null): account is XAccountId {
  return !!account && X_ACCOUNTS.some((a) => a.id === account);
}

// GET ?account=ramprate|tony - stale-while-revalidate from cache
export async function GET(req: NextRequest) {
  const role = req.headers.get("x-role");
  if (!role)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const account = req.nextUrl.searchParams.get("account");
  if (!isValidAccount(account)) {
    return NextResponse.json(
      {
        error: `account must be one of: ${X_ACCOUNTS.map((a) => a.id).join(", ")}`,
      },
      { status: 400 },
    );
  }

  const result = await getCachedSWR(`x-${account}`, CACHE_TTL_X_MS);
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

// POST ?account=... - fetch live from X, store in cache
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
        error: `account must be one of: ${X_ACCOUNTS.map((a) => a.id).join(", ")}`,
      },
      { status: 400 },
    );
  }

  if (await isCircuitOpen(`x-${account}`)) {
    const stale = await getCachedSWR(`x-${account}`, CACHE_TTL_X_MS);
    return NextResponse.json({
      ...((stale.data as object) ?? {}),
      error: "X API circuit open - 3+ consecutive failures. Returning cached data.",
      circuitOpen: true,
      _stale: true,
      _ageMinutes: stale.ageMinutes,
    });
  }

  try {
    const snapshot = await buildXSnapshot(account);
    await recordSuccess(`x-${account}`, snapshot);
    return NextResponse.json(snapshot);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await recordFailure(`x-${account}`, msg);
    const stale = await getCachedSWR(`x-${account}`, CACHE_TTL_X_MS);
    return NextResponse.json({
      ...((stale.data as object) ?? {}),
      error: `Live fetch failed: ${msg}`,
      _stale: true,
      _ageMinutes: stale.ageMinutes,
    });
  }
}
