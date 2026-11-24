// Centralized constants - avoids magic strings scattered across the codebase

export const CLICKUP_WORKSPACE_ID = "10643959";
export const CLICKUP_WORKSPACE_URL = `https://app.clickup.com/${CLICKUP_WORKSPACE_ID}`;

export const SLACK_CHANNEL_WEEKLY_REPORTS = "C08K6KM53FV";
export const SLACK_ADMIN_CHANNEL = "C08MKQ2PH2R";
export const SLACK_WORKSPACE_URL = "https://app.slack.com/client/T08K6KLDMJA";

export const CLICKUP_INVOICE_LIST_ID = "901113518927";

// Folders/lists excluded from every ClickUp task view (dashboard, reports, AI
// context). "Legacy Archive" folder and its "Archived tasks" list - old work
// that shouldn't count toward anyone's active task load or overdue stats.
export const CLICKUP_EXCLUDED_FOLDER_IDS = ["90118089652"];
export const CLICKUP_EXCLUDED_LIST_IDS = [
  "90110269512",
  "901114020411",
  "901114023521",
];

// The nine personal task lists - the ONLY ClickUp lists the dashboard counts.
// Everything else in the workspace (CLIENTS, RELATIONSHIPS, CONTACTS,
// Agreements Status, pipelines, reference lists, former members' lists)
// holds names and details, not tasks, and is ignored. A task belongs to the
// person who owns its list (`owner` = team_members.full_name), not to its
// assignee. Add/remove a row here when someone joins or leaves.
export const CLICKUP_PERSONAL_TASK_LISTS = [
  { id: "901115441187", name: "Tony's Tasks", owner: "Tony" },
  { id: "901114764205", name: "Josh's Tasks", owner: "Josh Bykowski" },
  { id: "901115370773", name: "Rob's Tasks", owner: "Rob Holmes" },
  { id: "901115370770", name: "Alex's Tasks", owner: "Alex Veytsel" },
  { id: "901115370908", name: "Kimberly's Tasks", owner: "Kimberly" },
  { id: "901114420816", name: "Sam's Tasks", owner: "Satyajeet Patnayak" },
  { id: "901114761090", name: "Darryl's Tasks", owner: "Darryl D’souza" },
  { id: "901114764065", name: "Sai's tasks", owner: "Sai Narendra" },
  { id: "901114763476", name: "Chitraket's Tasks", owner: "Chitraket Savani" },
] as const;

// ClickUp status that means finished. All nine lists use: to do, in progress,
// complete.
export const CLICKUP_DONE_STATUS = "complete";

// ClickUp priority IDs (from ClickUp API)
export const PRIORITY_URGENT = "1";
export const PRIORITY_HIGH = "2";

// Dashboard thresholds
export const OVERDUE_ALERT_THRESHOLD = 70; // % overdue before red alert
export const DEAL_COLD_DAYS = 14; // days since last contact → "gone cold"
export const DEAL_STUCK_DAYS = 21; // days in same stage → "stuck"
export const INVOICE_PENDING_ALERT_DAYS = 7; // days pending → flag in open loops

// Cache TTLs
export const CACHE_TTL_SYSTEMS_MS = 5 * 60 * 1000; // 5 min
export const CACHE_TTL_INVOICES_MS = 5 * 60 * 1000; // 5 min
export const CACHE_TTL_ANALYTICS_MS = 15 * 60 * 1000; // 15 min - GA4 data doesn't need to be fresher than this
export const CACHE_TTL_X_MS = 20 * 60 * 1000; // 20 min - matches the ~15-30 min poll interval X's pay-per-usage billing was sized around

// Website analytics sites - each backed by its own GA4 property, read via a
// shared Google service account (see lib/google-analytics.ts).
export const ANALYTICS_SITES = [
  {
    id: "ramprate",
    label: "RampRate",
    propertyEnvVar: "GA4_PROPERTY_ID_RAMPRATE",
  },
  {
    id: "impactsoul",
    label: "ImpactSoul",
    propertyEnvVar: "GA4_PROPERTY_ID_IMPACTSOUL",
  },
  {
    id: "tonygreenberg",
    label: "Tony Greenberg",
    propertyEnvVar: "GA4_PROPERTY_ID_TONYGREENBERG",
  },
  {
    id: "clarisseartist",
    label: "Clarisse Artist",
    propertyEnvVar: "GA4_PROPERTY_ID_CLARISSEARTIST",
  },
] as const;

export type AnalyticsSiteId = (typeof ANALYTICS_SITES)[number]["id"];

// X (Twitter) accounts tracked on the dashboard - both authorized under the
// same "RampRate Dashboard" developer app (see lib/x-analytics.ts), just with
// different per-account access tokens.
export const X_ACCOUNTS = [
  {
    id: "ramprate",
    label: "RampRate",
    accessTokenEnvVar: "X_RAMPRATE_ACCESS_TOKEN",
    accessTokenSecretEnvVar: "X_RAMPRATE_ACCESS_TOKEN_SECRET",
  },
  {
    id: "tony",
    label: "Tony Greenberg",
    accessTokenEnvVar: "X_TONY_ACCESS_TOKEN",
    accessTokenSecretEnvVar: "X_TONY_ACCESS_TOKEN_SECRET",
  },
] as const;

export type XAccountId = (typeof X_ACCOUNTS)[number]["id"];

export const CACHE_TTL_LINKEDIN_MS = 60 * 60 * 1000; // 1 hour - no per-request billing pressure like X, so no need to poll often

// LinkedIn Company Page (RampRate only - LinkedIn's API exposes no
// impressions/engagement data for personal profiles under any developer
// path, confirmed via Sprout Social's own reporting, so there's no "tony"
// entry here the way there is for X. See lib/linkedin-analytics.ts.
export const LINKEDIN_ACCOUNTS = [
  {
    id: "ramprate",
    label: "RampRate",
    accessTokenEnvVar: "LINKEDIN_RAMPRATE_ACCESS_TOKEN",
    organizationIdEnvVar: "LINKEDIN_RAMPRATE_ORGANIZATION_ID",
  },
] as const;

export type LinkedInAccountId = (typeof LINKEDIN_ACCOUNTS)[number]["id"];

// Briefing Room (CEO Command Centre). These VCoS usernames see the page
// view-only, except that they can answer the team's questions.
export const BRIEFING_VIEW_ONLY_USERNAMES = ["tony"];
