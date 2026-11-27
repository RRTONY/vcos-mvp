// Google Search Console for the Digital Estate band (Tony's Nov 27 request:
// clicks, impressions, CTR, average position). Read-only, same service
// account as GA4 (GOOGLE_GA_CLIENT_EMAIL). A property only works once that
// account is added as a user in Search Console; until then the snapshot
// carries an error and the dashboard says "needs access", never zero.
//
// Search Console data is final only after ~2-3 days, so the window ends
// three days ago (Pacific) and the dates are always shown with the numbers.
import { getAccessToken } from "@/lib/google-analytics";

const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const API = "https://www.googleapis.com/webmasters/v3/sites";

import { SEARCH_CONSOLE_SITES, type SearchConsoleSiteId } from "@/lib/constants";
export { SEARCH_CONSOLE_SITES, type SearchConsoleSiteId };

export function isSearchConsoleSite(v: unknown): v is SearchConsoleSiteId {
  return SEARCH_CONSOLE_SITES.some((s) => s.id === v);
}

export const SEARCH_LAG_DAYS = 3;

export interface SearchTotals {
  clicks: number;
  impressions: number;
  /** Click-through rate, 0..1 */
  ctr: number;
  /** Average position, null when there were no impressions */
  position: number | null;
}

export interface SearchConsoleSnapshot {
  site: SearchConsoleSiteId;
  property: string;
  from: string; // YYYY-MM-DD, current window
  to: string;
  current: SearchTotals;
  previous: SearchTotals;
  topQueries: { query: string; clicks: number; impressions: number }[];
}

const pt = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(d);

/** The two 7-day windows, ending SEARCH_LAG_DAYS before today (Pacific). */
export function searchWindows(now: Date = new Date()) {
  const day = (offset: number) => pt(new Date(now.getTime() - offset * 864e5));
  const end = SEARCH_LAG_DAYS;
  return {
    current: { startDate: day(end + 6), endDate: day(end) },
    previous: { startDate: day(end + 13), endDate: day(end + 7) },
  };
}

type Row = { keys?: string[]; clicks: number; impressions: number; ctr: number; position: number };

async function query(
  token: string,
  property: string,
  body: Record<string, unknown>,
): Promise<Row[]> {
  const res = await fetch(
    `${API}/${encodeURIComponent(property)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 403)
      throw new Error(
        `No Search Console access for ${property}. Add ${process.env.GOOGLE_GA_CLIENT_EMAIL ?? "the VCoS service account"} as a user on this property.`,
      );
    throw new Error(`Search Console ${res.status}: ${text.slice(0, 200)}`);
  }
  return ((await res.json()) as { rows?: Row[] }).rows ?? [];
}

export function totals(rows: Row[]): SearchTotals {
  const r = rows[0];
  if (!r) return { clicks: 0, impressions: 0, ctr: 0, position: null };
  return {
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
    position: r.impressions > 0 ? r.position : null,
  };
}

export async function buildSearchConsoleSnapshot(
  site: SearchConsoleSiteId,
): Promise<SearchConsoleSnapshot> {
  const { property } = SEARCH_CONSOLE_SITES.find((s) => s.id === site)!;
  const token = await getAccessToken(SCOPE);
  const w = searchWindows();
  const [cur, prev, queries] = await Promise.all([
    query(token, property, { ...w.current }),
    query(token, property, { ...w.previous }),
    query(token, property, { ...w.current, dimensions: ["query"], rowLimit: 5 }),
  ]);
  return {
    site,
    property,
    from: w.current.startDate,
    to: w.current.endDate,
    current: totals(cur),
    previous: totals(prev),
    topQueries: queries.map((q) => ({
      query: q.keys?.[0] ?? "",
      clicks: q.clicks,
      impressions: q.impressions,
    })),
  };
}
