# Project Structure: Where Everything Lives

Map of the VCoS repo. Rules are in [`/AGENTS.md`](../../AGENTS.md). Keep this file current when
you add a page, API route, table, scheduled job or outside system. If it disagrees with the
code, the code wins: fix this file.

## Pages (`app/`)

| URL | File | What it is |
| --- | --- | --- |
| `/` | `app/page.tsx` | Dashboard. Admins see the whole team; users see only their own figures |
| `/team` | `app/team/page.tsx` + `components/team/*` | Team tab: reports, people, filing scorecard, projects, decisions, daily log |
| `/submit` | `app/submit/page.tsx` | Weekly report form (also shows the person's open ClickUp tasks) |
| `/briefing` | `app/briefing/page.tsx` + `components/briefing/*` | Briefing Room / CEO Command Centre (see `docs/briefing-room.md`) |
| `/bd` | `app/bd/page.tsx` | Business development deals |
| `/invoices` | `app/invoices/page.tsx` | Invoices (PDF upload, ClickUp sync) |
| `/analytics` | `app/analytics/page.tsx` | GA4, X and LinkedIn analytics |
| `/systems` | `app/systems/page.tsx` | Health of every connected system |
| `/chatbot` | `app/chatbot/page.tsx` | AI chat over VCoS data (`lib/chat-context.ts`, `lib/vcos-brain.ts`) |
| `/profile/[username]` | `app/profile/[username]/page.tsx` | One person's tasks, hours, reports |
| `/settings/people` | `app/settings/people/page.tsx` + `components/settings/*` | Users, team members, access requests, API keys |
| `/mochary-method` | `app/mochary-method/page.tsx` | Reference page |
| `/login`, `/signup`, `/account/password` | `app/login`, `app/signup`, `app/account/password` | Sign-in, access request, change password |

Shared UI: `components/AppShell.tsx`, `Topbar.tsx`, `NavTabs.tsx`, `PriorityTasks.tsx`,
`TaskBuckets.tsx`, `charts/*`. Client hooks: `hooks/`.

## API routes (`app/api/`)

| Area | Routes |
| --- | --- |
| Auth | `auth/login`, `auth/logout`, `auth/me`, `auth/signup`, `auth/bootstrap`, `account/password` |
| Weekly reports | `weekly-reports` (submit, list by `week_start`), `weekly-reports/mark` (admin "mark as submitted"), `compliance/remind` (admin Slack DM to people missing a report), `reports/daily` (daily brief + reminder, run by cron) |
| ClickUp | `clickup-tasks` (cached snapshot GET, live refresh POST), `clickup-tasks/live`, `clickup-tasks/[id]`, `clickup-tasks/[id]/status`, `clickup-tasks/statuses`, `clickup-webhook` (real-time task updates) |
| Slack | `slack-stats` (weekly-report snapshot), `slack-messages`, `share-slack` |
| Other data | `webwork`, `fireflies-meetings`, `analytics`, `x-analytics`, `linkedin-analytics`, `systems-status`, `screenshots`, `okrs`, `goals`, `commitments`, `bd`, `invoices/*`, `briefing`, `kickoff-brief`, `chat`, `cache-health`, `team`, `settings/*`, `cron/morning-brief` |

Every route reads the caller from the `x-user` / `x-role` headers set by `middleware.ts`.
Admin-only routes check `isManager()` (`lib/roles.ts`) or `["admin","owner"].includes(role)`.

## Core logic (`lib/`)

| File | What it owns |
| --- | --- |
| `clickup.ts` | ClickUp API, the task snapshot (`buildClickUpSnapshot`, `snapshotFromTasks`), webhook patching |
| `slack.ts` | Slack API, weekly-report detection in `#weeklyreports` (`buildSlackSnapshot`) |
| `report-status.ts` | On time / weekend / late / pending / missing, PT deadline |
| `report-match.ts` | Matching `weekly_reports.submitted_by` to a team member |
| `weekly-reports-db.ts` | Who has a `weekly_reports` row for a week |
| `week-utils.ts` | PT week boundaries and week labels (`Nov 16–Nov 20`) |
| `due-buckets.ts` | Overdue / due today / due this week |
| `team-db.ts` | `team_members` reads (5 minute in-process cache) |
| `api-cache.ts` | `vcos_api_cache` table: stale-while-revalidate snapshots, circuit breaker |
| `auth.ts`, `password.ts`, `roles.ts` | Session cookie, password hashing, role checks |
| `admin-notify.ts` | Resolving a person's Slack user id, admin alerts |
| `constants.ts` | Slack channel ids, ClickUp ids (including the nine personal task lists), thresholds, TTLs |
| `webwork.ts`, `fireflies.ts`, `google-analytics.ts`, `x-analytics.ts`, `linkedin-analytics.ts` | Other outside systems |
| `briefing.ts`, `briefing-view.ts` | Briefing Room store and view logic |

## Supabase tables

| Table | Holds |
| --- | --- |
| `team_members` | Team roster: `full_name`, `vcos_username`, `clickup_key`, `clickup_user_id`, `slack_user_id`, `slack_aliases`, `files_report`, `bills_hours`, `active` |
| `vcos_users` | Logins: `username`, `password_hash`, `role`, `status` |
| `vcos_signup_requests` | Access requests waiting for approval |
| `weekly_reports` | One row per person per week (`submitted_by`, `week_label`, `created_at`, report fields, `marked_submitted_by` when an admin marked it) |
| `vcos_daily_reports` | One row per day: who filed / missing, task counts, hours |
| `vcos_api_cache` | Cached snapshots per source (`clickup`, `clickup-raw`, `slack`, `webwork`...) |
| `okrs`, `invoices`, `vcos_bd_deals`, `vcos_bd_activity`, `briefing_docs`, `system_statuses` | Feature data |

SQL for one-off schema changes is in `scripts/*.sql` (run by hand in the Supabase SQL editor).

## Scheduled jobs (`netlify/functions/`, times UTC)

| Job | Schedule | Does |
| --- | --- | --- |
| `clickup-refresh` | every 15 min | Rebuilds the ClickUp snapshot |
| `analytics-refresh` | every 15 min | GA4 |
| `x-refresh` | every 20 min | X analytics |
| `daily-report` | 14:00 daily | `POST /api/reports/daily`: daily brief to the admin channel, report reminder to `#weeklyreports` |
| `cron-refresh` | 14:00 daily | Refreshes cached sources |
| `invoice-sync` | 14:00 daily | Invoices to ClickUp |
| `morning-brief` | 14:15 Mon to Fri | Morning brief |

Jobs call the app with the `x-cron-secret` header (`CRON_SECRET`).

## Outside systems

| System | Used for | Key ids |
| --- | --- | --- |
| ClickUp | Tasks (only the nine personal lists count) | Workspace `10643959`, lists in `CLICKUP_PERSONAL_TASK_LISTS` |
| Slack | Weekly reports, reminders, briefs, DMs (VCOS Bot) | `#weeklyreports` `C08K6KM53FV`, admin channel `C08MKQ2PH2R` |
| WebWork | Hours tracked | `WEBWORK_*` env |
| Fireflies | Meetings | `FIREFLIES_API_KEY` |
| Anthropic | Chat, report summaries | `ANTHROPIC_API_KEY_CHAT`, `ANTHROPIC_API_KEY_REPORTS` |
| Netlify | Hosting, scheduled jobs, env vars | Site `vcos-ramprate` |
