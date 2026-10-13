import { getTeamMembers } from "./team-db";
import { getCached, setCache } from "./api-cache";
import {
  getMondayOfWeekPT,
  ptDateISO,
  shiftWeeks,
  todayPT,
  weekStartISO,
} from "./week-utils";

const BASE = "https://api.webwork-tracker.com/api/v2";

function headers() {
  return { Authorization: `Bearer ${process.env.WEBWORK_API_KEY}` };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A full snapshot fires one request per member per day (11 members x 14 days
// = 154+ requests). Firing them all at once used to trip WebWork's rate
// limiter and knock out an unpredictable subset of members - this queue caps
// how many are ever in flight at once, the same way lib/clickup.ts batches
// its own requests.
const MAX_CONCURRENT = 8;
let activeRequests = 0;
const waiters: (() => void)[] = [];

function acquireSlot(): Promise<void> {
  if (activeRequests < MAX_CONCURRENT) {
    activeRequests++;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiters.push(resolve));
}

function releaseSlot() {
  const next = waiters.shift();
  if (next) next();
  else activeRequests--;
}

// A 401/403 means the API key itself is bad (WebWork keys can expire, so
// every request would fail the same way) - retrying them all just
// burns time until the function times out and the UI gets nothing back.
// Thrown instead so the whole snapshot fails fast with a clear message.
export class WebWorkAuthError extends Error {}

export interface DayHours {
  date: string;
  minutes: number;
  entries: {
    task: string;
    project: string;
    minutes: number;
    start: string;
    end: string;
  }[];
  ok: boolean;
}

// A failed request here used to silently resolve to "0 minutes," which is
// indistinguishable from a real zero - that's what made missing hours (e.g.
// a member's tracker "not coming through") impossible to tell apart from
// genuinely not having worked. Now a non-2xx response is retried a couple
// times before being marked `ok: false` so callers can flag it instead of
// quietly reporting a wrong number.
export async function getMemberHours(
  userId: number,
  date: string,
  attempt = 0,
): Promise<DayHours> {
  const MAX_ATTEMPTS = 4;
  await acquireSlot();
  let res: Response;
  try {
    res = await fetch(`${BASE}/time-entries?user_id=${userId}&date=${date}&per_page=100`, {
      headers: headers(),
    });
  } catch {
    releaseSlot();
    if (attempt + 1 < MAX_ATTEMPTS) {
      await sleep(300 * (attempt + 1));
      return getMemberHours(userId, date, attempt + 1);
    }
    return { date, minutes: 0, entries: [], ok: false };
  }
  releaseSlot();

  if (res.status === 401 || res.status === 403) {
    throw new WebWorkAuthError(
      `WebWork rejected WEBWORK_API_KEY (HTTP ${res.status}) - the key has likely expired. Generate a new one in WebWork and update the env var.`,
    );
  }

  if (!res.ok) {
    const retryAfterSec = Number(res.headers.get("Retry-After"));
    // WebWork allows ~150 requests/minute and answers a 429 with
    // Retry-After: 60. Waiting that out inside a request outlives the
    // Netlify function timeout, so the snapshot is killed and nothing gets
    // saved. Give up on this day instead - days that did load are kept in the
    // day cache below, so the next refresh only fetches what's missing.
    if (res.status === 429 && retryAfterSec > 5) {
      console.error(
        `WebWork rate-limited user ${userId} on ${date} (Retry-After ${retryAfterSec}s)`,
      );
      return { date, minutes: 0, entries: [], ok: false };
    }
    if (attempt + 1 < MAX_ATTEMPTS) {
      const waitMs =
        res.status === 429 && Number.isFinite(retryAfterSec) && retryAfterSec > 0
          ? retryAfterSec * 1000
          : 400 * 2 ** attempt;
      await sleep(waitMs);
      return getMemberHours(userId, date, attempt + 1);
    }
    console.error(
      `WebWork time-entries failed for user ${userId} on ${date}: HTTP ${res.status}`,
    );
    return { date, minutes: 0, entries: [], ok: false };
  }

  const data = await res.json();
  const entries = (data.data ?? []).map(
    (e: {
      task_title: string;
      project_name: string;
      total_minutes: number;
      start_time: string;
      end_time: string;
    }) => ({
      task: e.task_title,
      project: e.project_name,
      minutes: e.total_minutes,
      start: e.start_time,
      end: e.end_time,
    }),
  );
  return {
    date,
    minutes: entries.reduce(
      (s: number, e: { minutes: number }) => s + e.minutes,
      0,
    ),
    entries,
    ok: true,
  };
}

// Past days barely change, so once a day is a couple of days old its result
// is kept in Supabase (vcos_api_cache, source "webwork-days") instead of being
// re-fetched on every refresh. A full snapshot needs 154 requests - just over
// WebWork's per-minute limit - but with this cache a routine refresh only
// fetches the last few days, and a refresh that got rate-limited halfway
// finishes on the next try instead of starting over.
const DAY_CACHE_SOURCE = "webwork-days";
const FINAL_AFTER_DAYS = 2;
const DAY_CACHE_KEEP_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

type DayCache = Record<string, DayHours>; // `${userId}|${date}` -> day

function daysAgoPT(n: number): string {
  return ptDateISO(new Date(Date.now() - n * DAY_MS));
}

async function loadDayCache(): Promise<DayCache> {
  try {
    const row = await getCached(DAY_CACHE_SOURCE);
    return (row?.data as DayCache) ?? {};
  } catch {
    return {};
  }
}

async function saveDayCache(cache: DayCache) {
  const keepFrom = daysAgoPT(DAY_CACHE_KEEP_DAYS);
  const pruned: DayCache = {};
  for (const [key, day] of Object.entries(cache)) {
    if (day.date >= keepFrom) pruned[key] = day;
  }
  try {
    await setCache(DAY_CACHE_SOURCE, pruned);
  } catch (err) {
    console.error("Failed to save WebWork day cache:", err);
  }
}

export async function getWeekHours(
  userId: number,
  weekDates: string[],
  dayCache: DayCache = {},
  onNewFinalDay: () => void = () => {},
): Promise<{ totalMinutes: number; byDay: DayHours[]; incomplete: boolean }> {
  const today = todayPT();
  const finalBefore = daysAgoPT(FINAL_AFTER_DAYS - 1);
  const byDay = await Promise.all(
    weekDates.map(async (date) => {
      // Days that haven't happened yet can't have hours - no need to ask.
      if (date > today) return { date, minutes: 0, entries: [], ok: true };
      const key = `${userId}|${date}`;
      if (dayCache[key]) return dayCache[key];
      const day = await getMemberHours(userId, date);
      if (day.ok && date < finalBefore) {
        dayCache[key] = day;
        onNewFinalDay();
      }
      return day;
    }),
  );
  return {
    totalMinutes: byDay.reduce((s, d) => s + d.minutes, 0),
    byDay,
    incomplete: byDay.some((d) => !d.ok),
  };
}

// Defaults to the current PT week. Pass a specific Monday to fetch any other
// week (used by the Team Hours date picker) - those calls skip the snapshot
// cache (only the current week is cached) but still reuse the per-day cache.
export async function buildWebWorkSnapshot(weekMonday?: Date) {
  const weekDates = weekMonday
    ? weekDatesFrom(weekMonday)
    : getCurrentWeekDates();
  const lastWeekDates = weekMonday
    ? weekDatesFrom(shiftWeeks(weekMonday, -1))
    : getLastWeekDates();

  const teamMembers = await getTeamMembers();
  const trackable = teamMembers.filter((m) => m.webwork_user_id);
  const dayCache = await loadDayCache();
  let dayCacheChanged = false;
  const markChanged = () => {
    dayCacheChanged = true;
  };

  const raw = await Promise.all(
    trackable.map(async (member) => {
      const userId = parseInt(member.webwork_user_id!, 10);
      const username =
        member.vcos_username ?? member.full_name.split(" ")[0].toLowerCase();
      try {
        const [
          { totalMinutes, byDay, incomplete: thisIncomplete },
          { totalMinutes: lastMinutes, incomplete: lastIncomplete },
        ] = await Promise.all([
          getWeekHours(userId, weekDates, dayCache, markChanged),
          getWeekHours(userId, lastWeekDates, dayCache, markChanged),
        ]);
        return {
          username,
          totalMinutes,
          lastMinutes,
          byDay,
          incomplete: thisIncomplete || lastIncomplete,
        };
      } catch (err) {
        if (err instanceof WebWorkAuthError) throw err;
        return {
          username,
          totalMinutes: 0,
          lastMinutes: 0,
          byDay: [] as DayHours[],
          incomplete: true,
        };
      }
    }),
  );

  if (dayCacheChanged) await saveDayCache(dayCache);

  const members = raw.map((r) => ({
    username: r.username,
    totalMinutes: r.totalMinutes,
    totalHours: Math.round((r.totalMinutes / 60) * 10) / 10,
    lastWeekHours: Math.round((r.lastMinutes / 60) * 10) / 10,
    byDay: r.byDay.map((d) => ({
      date: d.date,
      minutes: d.minutes,
      hours: Math.round((d.minutes / 60) * 10) / 10,
    })),
    incomplete: r.incomplete,
  }));

  return {
    week: weekDates,
    lastWeek: lastWeekDates,
    members,
    projects: buildProjectBreakdown(raw),
    incomplete: members.some((m) => m.incomplete),
  };
}

// Reshapes this week's raw time entries (task/project per day, per member)
// into a project-first view: which projects have activity, who logged time
// against them, and which tasks. ClickUp only tracks *assigned* tasks; this is
// what people are actually clocking hours against, which can differ.
function buildProjectBreakdown(raw: { username: string; byDay: DayHours[] }[]) {
  const projects = new Map<string, Map<string, Map<string, number>>>(); // project -> username -> task -> minutes

  for (const member of raw) {
    for (const day of member.byDay) {
      for (const entry of day.entries) {
        const project = entry.project || "No project";
        const task = entry.task || "Untitled task";
        if (!projects.has(project)) projects.set(project, new Map());
        const byUser = projects.get(project)!;
        if (!byUser.has(member.username))
          byUser.set(member.username, new Map());
        const byTask = byUser.get(member.username)!;
        byTask.set(task, (byTask.get(task) ?? 0) + entry.minutes);
      }
    }
  }

  const result = Array.from(projects.entries())
    .map(([project, byUser]) => {
      const members = Array.from(byUser.entries())
        .map(([username, byTask]) => {
          const tasks = Array.from(byTask.entries())
            .map(([task, minutes]) => ({
              task,
              minutes,
              hours: Math.round((minutes / 60) * 10) / 10,
            }))
            .sort((a, b) => b.minutes - a.minutes);
          const minutes = tasks.reduce((s, t) => s + t.minutes, 0);
          return {
            username,
            minutes,
            hours: Math.round((minutes / 60) * 10) / 10,
            tasks,
          };
        })
        .sort((a, b) => b.minutes - a.minutes);
      const minutes = members.reduce((s, m) => s + m.minutes, 0);
      return {
        project,
        minutes,
        hours: Math.round((minutes / 60) * 10) / 10,
        members,
      };
    })
    .sort((a, b) => b.minutes - a.minutes);

  return result;
}

// Returns Mon–Sun PT-calendar dates for the given week. Anchored to PT (not
// server/browser local time) so this agrees with week-utils everywhere, including
// on IST dev machines where local getDay()/setDate() + toISOString() (UTC) can disagree.
function weekDatesFrom(monday: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(
      Date.UTC(
        monday.getUTCFullYear(),
        monday.getUTCMonth(),
        monday.getUTCDate() + i,
        12,
      ),
    );
    return weekStartISO(d);
  });
}

export function getCurrentWeekDates(): string[] {
  return weekDatesFrom(getMondayOfWeekPT());
}

// Returns Mon–Sun PT-calendar dates for the previous week
export function getLastWeekDates(): string[] {
  return weekDatesFrom(shiftWeeks(getMondayOfWeekPT(), -1));
}
