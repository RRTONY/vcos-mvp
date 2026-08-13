import { createSign } from "crypto";
import { ANALYTICS_SITES, type AnalyticsSiteId } from "@/lib/constants";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DATA_API_BASE = "https://analyticsdata.googleapis.com/v1beta";
const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

// ─── Service-account auth (JWT bearer flow, no googleapis dependency) ────────

let cachedToken: { value: string; expiresAt: number } | null = null;

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000)
    return cachedToken.value;

  const clientEmail = process.env.GOOGLE_GA_CLIENT_EMAIL;
  const privateKeyRaw = process.env.GOOGLE_GA_PRIVATE_KEY;
  if (!clientEmail || !privateKeyRaw) {
    throw new Error(
      "GOOGLE_GA_CLIENT_EMAIL / GOOGLE_GA_PRIVATE_KEY not configured",
    );
  }
  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: clientEmail,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signature = base64url(
    createSign("RSA-SHA256").update(`${header}.${claims}`).sign(privateKey),
  );
  const jwt = `${header}.${claims}.${signature}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok)
    throw new Error(
      `Google token exchange failed: ${res.status} ${await res.text()}`,
    );
  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

function propertyIdFor(site: AnalyticsSiteId): string {
  const cfg = ANALYTICS_SITES.find((s) => s.id === site);
  if (!cfg) throw new Error(`Unknown analytics site: ${site}`);
  const propertyId = process.env[cfg.propertyEnvVar];
  if (!propertyId) throw new Error(`${cfg.propertyEnvVar} not configured`);
  return propertyId;
}

interface RunReportBody {
  dateRanges: { startDate: string; endDate: string }[];
  dimensions?: { name: string }[];
  metrics: { name: string }[];
  dimensionFilter?: unknown;
  orderBys?: unknown[];
  limit?: number;
}

interface ReportRow {
  dimensionValues?: { value: string }[];
  metricValues?: { value: string }[];
}

interface RunReportResponse {
  dimensionHeaders?: { name: string }[];
  metricHeaders?: { name: string }[];
  rows?: ReportRow[];
}

async function runReport(
  propertyId: string,
  body: RunReportBody,
): Promise<RunReportResponse> {
  const token = await getAccessToken();
  const res = await fetch(
    `${DATA_API_BASE}/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok)
    throw new Error(`GA4 runReport failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function metric(row: ReportRow | undefined, i: number): number {
  return Number(row?.metricValues?.[i]?.value ?? 0);
}

// ─── Snapshot builder ───────────────────────────────────────────────────────

export interface PageRow {
  path: string;
  title: string;
  pageviews: number;
  sessions: number;
}

export interface BreakdownRow {
  label: string;
  pageviews: number;
  newUsers: number;
}

export interface AudienceSnapshot {
  trend: { date: string; views: number; newUsers: number; sessions: number }[];
  last28d: {
    pageviews: number;
    newUsers: number;
    sessions: number;
    bounceRatePct: number;
    sessionsPerUser: number;
    active1DayUsers: number;
    active28DayUsers: number;
  };
  byLanguage: BreakdownRow[];
  byContinent: BreakdownRow[];
  byDevice: BreakdownRow[];
}

export interface AnalyticsSnapshot {
  site: AnalyticsSiteId;
  today: { sessions: number; pageviews: number; avgSessionDurationSec: number };
  yesterday: {
    sessions: number;
    pageviews: number;
    avgSessionDurationSec: number;
  };
  trend: { date: string; sessions: number }[];
  topPages: PageRow[];
  notFoundPages: PageRow[];
  audience: AudienceSnapshot;
}

async function dayTotals(propertyId: string, date: "today" | "yesterday") {
  const report = await runReport(propertyId, {
    dateRanges: [{ startDate: date, endDate: date }],
    metrics: [
      { name: "sessions" },
      { name: "screenPageViews" },
      { name: "averageSessionDuration" },
    ],
  });
  const row = report.rows?.[0];
  return {
    sessions: metric(row, 0),
    pageviews: metric(row, 1),
    avgSessionDurationSec: Math.round(metric(row, 2)),
  };
}

async function trendLast8Days(propertyId: string) {
  const report = await runReport(propertyId, {
    dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
    dimensions: [{ name: "date" }],
    metrics: [{ name: "sessions" }],
    orderBys: [{ dimension: { dimensionName: "date" } }],
  });
  return (report.rows ?? []).map((r) => ({
    date: r.dimensionValues?.[0]?.value ?? "",
    sessions: metric(r, 0),
  }));
}

function toPageRows(report: RunReportResponse): PageRow[] {
  return (report.rows ?? []).map((r) => ({
    path: r.dimensionValues?.[0]?.value ?? "",
    title: r.dimensionValues?.[1]?.value ?? "",
    pageviews: metric(r, 0),
    sessions: metric(r, 1),
  }));
}

async function topPagesLast7Days(propertyId: string): Promise<PageRow[]> {
  const report = await runReport(propertyId, {
    dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
    dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
    metrics: [{ name: "screenPageViews" }, { name: "sessions" }],
    orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
    limit: 10,
  });
  return toPageRows(report);
}

// "Error" pages - GA4 has no built-in 404 dimension, so this flags pages whose
// title or path matches common not-found patterns. Sites without that pattern
// in their title/path (or without one at all) just show an empty list here.
async function notFoundPagesLast7Days(propertyId: string): Promise<PageRow[]> {
  const report = await runReport(propertyId, {
    dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
    dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
    metrics: [{ name: "screenPageViews" }, { name: "sessions" }],
    dimensionFilter: {
      orGroup: {
        expressions: [
          {
            filter: {
              fieldName: "pageTitle",
              stringFilter: {
                matchType: "CONTAINS",
                value: "404",
                caseSensitive: false,
              },
            },
          },
          {
            filter: {
              fieldName: "pageTitle",
              stringFilter: {
                matchType: "CONTAINS",
                value: "not found",
                caseSensitive: false,
              },
            },
          },
          {
            filter: {
              fieldName: "pagePath",
              stringFilter: {
                matchType: "CONTAINS",
                value: "404",
                caseSensitive: false,
              },
            },
          },
        ],
      },
    },
    orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
    limit: 10,
  });
  return toPageRows(report);
}

// ─── Audience - trend, active users, bounce rate, language/continent/device ──

async function audienceTrendLast29Days(propertyId: string) {
  const report = await runReport(propertyId, {
    dateRanges: [{ startDate: "29daysAgo", endDate: "today" }],
    dimensions: [{ name: "date" }],
    metrics: [
      { name: "screenPageViews" },
      { name: "newUsers" },
      { name: "sessions" },
    ],
    orderBys: [{ dimension: { dimensionName: "date" } }],
  });
  return (report.rows ?? []).map((r) => ({
    date: r.dimensionValues?.[0]?.value ?? "",
    views: metric(r, 0),
    newUsers: metric(r, 1),
    sessions: metric(r, 2),
  }));
}

// active1DayUsers/active28DayUsers are rolling-window metrics measured as of
// the range's endDate - they ignore startDate, so requesting a 28-day range
// here doesn't change their meaning, it just keeps this one request consistent
// with the other last-28-days totals below.
async function audienceLast28Days(propertyId: string) {
  const report = await runReport(propertyId, {
    dateRanges: [{ startDate: "27daysAgo", endDate: "today" }],
    metrics: [
      { name: "screenPageViews" },
      { name: "newUsers" },
      { name: "sessions" },
      { name: "bounceRate" },
      { name: "sessionsPerUser" },
      { name: "active1DayUsers" },
      { name: "active28DayUsers" },
    ],
  });
  const row = report.rows?.[0];
  return {
    pageviews: metric(row, 0),
    newUsers: metric(row, 1),
    sessions: metric(row, 2),
    bounceRatePct: Math.round(metric(row, 3) * 10) / 10,
    sessionsPerUser: Math.round(metric(row, 4) * 100) / 100,
    active1DayUsers: metric(row, 5),
    active28DayUsers: metric(row, 6),
  };
}

function toBreakdownRows(report: RunReportResponse): BreakdownRow[] {
  return (report.rows ?? []).map((r) => ({
    label: r.dimensionValues?.[0]?.value ?? "(not set)",
    pageviews: metric(r, 0),
    newUsers: metric(r, 1),
  }));
}

async function breakdownLast28Days(
  propertyId: string,
  dimension: string,
): Promise<BreakdownRow[]> {
  const report = await runReport(propertyId, {
    dateRanges: [{ startDate: "27daysAgo", endDate: "today" }],
    dimensions: [{ name: dimension }],
    metrics: [{ name: "screenPageViews" }, { name: "newUsers" }],
    orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
    limit: 8,
  });
  return toBreakdownRows(report);
}

async function buildAudienceSnapshot(
  propertyId: string,
): Promise<AudienceSnapshot> {
  const [trend, last28d, byLanguage, byContinent, byDevice] = await Promise.all(
    [
      audienceTrendLast29Days(propertyId),
      audienceLast28Days(propertyId),
      breakdownLast28Days(propertyId, "language"),
      breakdownLast28Days(propertyId, "continent"),
      breakdownLast28Days(propertyId, "deviceCategory"),
    ],
  );
  return { trend, last28d, byLanguage, byContinent, byDevice };
}

export async function buildAnalyticsSnapshot(
  site: AnalyticsSiteId,
): Promise<AnalyticsSnapshot> {
  const propertyId = propertyIdFor(site);
  const [today, yesterday, trend, topPages, notFoundPages, audience] =
    await Promise.all([
      dayTotals(propertyId, "today"),
      dayTotals(propertyId, "yesterday"),
      trendLast8Days(propertyId),
      topPagesLast7Days(propertyId),
      notFoundPagesLast7Days(propertyId),
      buildAudienceSnapshot(propertyId),
    ]);
  return { site, today, yesterday, trend, topPages, notFoundPages, audience };
}
