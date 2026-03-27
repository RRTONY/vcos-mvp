// Centralized constants — avoids magic strings scattered across the codebase

export const CLICKUP_WORKSPACE_ID = '10643959'
export const CLICKUP_WORKSPACE_URL = `https://app.clickup.com/${CLICKUP_WORKSPACE_ID}`

export const SLACK_CHANNEL_WEEKLY_REPORTS = 'C08K6KM53FV'
export const SLACK_WORKSPACE_URL = 'https://app.slack.com/client/T08K6KLDMJA'

// ClickUp priority IDs (from ClickUp API)
export const PRIORITY_URGENT = '1'
export const PRIORITY_HIGH   = '2'

// Dashboard thresholds
export const OVERDUE_ALERT_THRESHOLD = 70  // % overdue before red alert

// Cache TTLs
export const CACHE_TTL_SYSTEMS_MS  = 5 * 60 * 1000   // 5 min
export const CACHE_TTL_INVOICES_MS = 5 * 60 * 1000   // 5 min
