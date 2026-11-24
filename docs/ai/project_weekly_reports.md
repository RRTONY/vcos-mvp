# Weekly Reports: How Filing Is Detected

> Who owes a report, how VCoS decides filed / late / missing, reminders, and the Nov 2026 bug.
> Last updated 2026-11-25.

## Who owes a report

Active `team_members` with `files_report = true` (Tony is `false`). Managed in Settings → Team.

## Two sources of "filed"

1. **`weekly_reports` table**: reports submitted through `/submit`, plus admin marks
   (`marked_submitted_by` set, no content) from `POST /api/weekly-reports/mark` for reports shared
   outside VCoS. Each row has `week_label` (e.g. `Nov 16–Nov 20`). Look rows up with
   `weekLabelVariants(monday)`: older rows from IST users carry a label one day early.
2. **Slack `#weeklyreports`**: VCoS posts each submitted report as the VCOS Bot with the header
   `*Weekly Report - <name> - <week label>*`. People also post by hand, with `#myweeklyreport` or
   report-shaped text (`isWeeklyReportMessage` in `lib/slack.ts`). Ben, for example, posts by hand.

The daily reminder (`buildSlackSnapshot`) uses **both**. The dashboard and Team tab currently use
only the table, so someone who reports only by hand in Slack shows "Not submitted" there.

## Statuses (`lib/report-status.ts`)

| Status | Meaning | Dashboard badge |
| --- | --- | --- |
| `on-time` | Filed by end of Friday PT | Filed ✓ |
| `weekend` | Filed Saturday or Sunday of that week | Filed (wknd) |
| `late` | Filed the following week or later | Filed (late) |
| `pending` | Not filed, Friday not yet over | Pending |
| `missing` | Not filed, Friday is over | Not Submitted |

Admin-marked reports get one of the first three, based on the date shared, plus a "marked as
submitted" tag.

## Which week a Slack report belongs to

- VCoS-bot posts: the week named in the header.
- Hand-written posts: posting time shifted back 3 days, so Thursday through the following
  Wednesday counts for that Thursday's week (`isReportForWeek`).
- "Missing" is judged against **one** week, the report currently due: last week until this
  week's Friday deadline passes, then this week.

## The reminder

`netlify/functions/daily-report` → `POST /api/reports/daily` every morning: a brief to the admin
channel and, if anyone is missing, a reminder in `#weeklyreports` naming them and the week.
`POST /api/compliance/remind` (admin button) DMs each missing person from the VCOS Bot, finding
their Slack id via `slack_user_id`, then email, then real name; it skips anyone already filed.

## Bug fixed 2026-11-25 (Rob not flagged)

The reminder attributed Slack posts to a week by posting date and treated "filed for this week
**or** last week" as filed. Rob's late Nov 9–13 report, posted Mon Nov 16, counted as his
Nov 16–20 report, so the Nov 23 and Nov 24 reminders named only Danish. Fixed on branch
`fix/weekly-report-missing` by the week rules above. Checked read-only against live data: as of
Nov 23 it flags Danish and Rob, and still counts Ben's hand-written Slack report.
