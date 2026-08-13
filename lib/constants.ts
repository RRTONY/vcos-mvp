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
] as const;

export type AnalyticsSiteId = (typeof ANALYTICS_SITES)[number]["id"];
