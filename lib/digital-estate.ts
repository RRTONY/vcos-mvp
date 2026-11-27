// Digital Estate figures for the Analytics overview (Tony's Nov 27 "Digital
// Estate Pulse" request). Pure functions over the GA4 snapshot's daily
// audience trend (lib/google-analytics.ts, last 30 days incl. today), so every
// number traces back to GA4 and nothing here is invented.

export interface DayPoint {
  date: string; // GA4 YYYYMMDD
  sessions: number;
  views: number;
  newUsers: number;
}

export interface WeekTotals {
  sessions: number;
  views: number;
  newUsers: number;
}

export interface WeekCompare {
  current: WeekTotals;
  previous: WeekTotals;
  /** Change in sessions, last 7 complete days vs the 7 before. */
  sessionsChange: number;
  /** Percentage change in sessions, null when the previous week had none. */
  sessionsChangePct: number | null;
  /** Tony's rule: flag +/-25% when the change is at least 20 sessions. */
  flag: "up" | "down" | null;
  /** First and last day of the current window, YYYY-MM-DD. */
  from: string;
  to: string;
}

export const FLAG_PCT = 25;
export const FLAG_MIN_SESSIONS = 20;

const sum = (days: DayPoint[]): WeekTotals => ({
  sessions: days.reduce((n, d) => n + d.sessions, 0),
  views: days.reduce((n, d) => n + d.views, 0),
  newUsers: days.reduce((n, d) => n + d.newUsers, 0),
});

const iso = (ga: string) =>
  /^\d{8}$/.test(ga) ? `${ga.slice(0, 4)}-${ga.slice(4, 6)}-${ga.slice(6, 8)}` : ga;

/**
 * Last 7 complete days vs the 7 before. `today` (YYYYMMDD, GA4 property time)
 * is excluded because it is still partial. Returns null when there are fewer
 * than 14 complete days, so a missing week is never shown as zero.
 */
export function compareWeeks(trend: DayPoint[], today: string): WeekCompare | null {
  const complete = [...trend]
    .filter((d) => d.date && d.date < today)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (complete.length < 14) return null;
  const cur = complete.slice(-7);
  const prev = complete.slice(-14, -7);
  const current = sum(cur);
  const previous = sum(prev);
  const sessionsChange = current.sessions - previous.sessions;
  const sessionsChangePct =
    previous.sessions > 0 ? (sessionsChange / previous.sessions) * 100 : null;
  const big =
    Math.abs(sessionsChange) >= FLAG_MIN_SESSIONS &&
    (sessionsChangePct === null || Math.abs(sessionsChangePct) >= FLAG_PCT);
  return {
    current,
    previous,
    sessionsChange,
    sessionsChangePct,
    flag: big ? (sessionsChange > 0 ? "up" : "down") : null,
    from: iso(cur[0].date),
    to: iso(cur[cur.length - 1].date),
  };
}

/** Today's date as GA4 writes it (YYYYMMDD) in Pacific time. */
export function gaToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" })
    .format(now)
    .replace(/-/g, "");
}

/** What Tony asked for that has no live source yet: shown as "not connected", never as zero. */
export const NOT_CONNECTED = [
  "Google Search for ImpactSoul (not in Search Console)",
  "Conversion funnel and form submissions",
  "Calls to action and their clicks",
  "Sign-in numbers",
  "Social and press mentions",
  "Portfolio and partner sites",
  "Webmaster job queue",
] as const;
