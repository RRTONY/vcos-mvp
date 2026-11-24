# Task Guide: What Can We Do, and How

Decide how to handle a request before touching anything. Rules are in
[`/AGENTS.md`](../../AGENTS.md); file locations are in
[`PROJECT_STRUCTURE.md`](PROJECT_STRUCTURE.md).

## Step 1. What kind of request is it?

1. **Question, check, or change?** "Why does X show Y?", "who hasn't filed?", "are the figures
   right?" change nothing. Answer from the code plus a read-only look at live data.
2. **Where does it live?** Code in this repo, a row in Supabase (team roster, logins, a report),
   or outside (ClickUp list setup, Slack, Netlify env vars). See the table below.
3. **How big?** A small fix, a normal change, or big/risky (anything that changes figures every
   page shows, reminders that message people, auth or roles).
4. **Needs a yes?** Merging (it deploys), Slack posts or DMs, deleting data, changing someone's
   access, a new dependency.

If the request is unclear, ask **one** short question with 2 to 4 options.

## Step 2. Find the row

| Request | Where it lives | How | Ask first? |
| --- | --- | --- | --- |
| "X didn't get a report reminder" / wrong filed or missing list | `lib/slack.ts` `buildSlackSnapshot`, `lib/report-*.ts`, `weekly_reports` table | Read [`project_weekly_reports.md`](project_weekly_reports.md); reproduce read-only against live Slack + DB | Fix: no. Merge: yes |
| Dashboard task figures wrong (total, overdue, urgent, per person, on time %) | `lib/clickup.ts` `snapshotFromTasks` | Read [`project_clickup_figures.md`](project_clickup_figures.md); compare live ClickUp counts | Merge: yes |
| Someone joins the team | `team_members` row (Settings → Team), login via Settings → Users or signup approval; ClickUp list in `CLICKUP_PERSONAL_TASK_LISTS` if they get one | Settings UI, or a single Supabase insert/update | **Yes** |
| Someone leaves / "remove X" | `team_members.active = false`; login `vcos_users.status = 'inactive'`; drop their list from `CLICKUP_PERSONAL_TASK_LISTS` | Settings UI or one update each | **Yes** (confirm login too) |
| Mark a report as submitted (shared outside VCoS) | `POST /api/weekly-reports/mark` (admin) | Use the button on the Team tab, not a manual insert | Yes |
| Change dashboard layout or wording | `app/page.tsx`, `components/*` | Code; check admin and normal user views | Merge: yes |
| Change reminder / brief wording or timing | `app/api/reports/daily/route.ts`, `netlify/functions/*.ts` (schedule) | Code | **Yes**, it messages the team |
| New env var / secret | `.env.example` + Netlify dashboard | Code for the example; a person sets the value in Netlify | n/a |
| Database column or table | `scripts/<name>.sql`, run by a person in the Supabase SQL editor | Write the SQL file, hand over | **Yes** |
| ClickUp list statuses or list setup | ClickUp itself | Not in this repo. Tell the person | n/a |

## Step 3. Do it the standard way

1. Read the files you'll change and the matching `docs/ai/` note.
2. Work on a branch off `master`. Smallest change that does the job; keep shared logic in `lib/`.
3. Run the checks in AGENTS.md ("Check before calling anything done"), or the `verify-change`
   skill.
4. For figures: show the person the numbers from live data next to what they expected.
5. Commit, push, open a PR. Merging to `master` deploys: only with a yes.
6. End with the Status Report.

## Common mistakes

- Deciding a report's week by when it was posted. A late report for last week is posted this
  week (the Nov 2026 Rob bug). Use the week named in the report.
- Treating "filed this week or last week" as filed. Judge one week: the report currently due.
- Counting ClickUp tasks from the whole workspace or by assignee. Only the nine personal lists
  count, credited to the list owner.
- Using the browser's or server's local time for dates. Use PT helpers.
- Testing reminders by letting them post to Slack.
- Forgetting that a figure appears on several pages (dashboard, Team tab, profile, chat, daily
  brief). Change the shared `lib/` code, not one page.
