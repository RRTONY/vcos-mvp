# ClickUp Figures: What the Dashboard Counts

> The agreed rules for total / overdue / urgent / per-person / on-time %, from Darryl's figures
> audit (Nov 24, 2026). Last updated 2026-11-25.

## Only nine lists count

Tony's, Josh's, Rob's, Alex's, Kimberly's, Sam's, Darryl's, Sai's and Chitraket's Tasks. Their
ids and owners are in `CLICKUP_PERSONAL_TASK_LISTS` (`lib/constants.ts`). Filter **by list id**.
Everything else (CLIENTS, RELATIONSHIPS, CONTACTS, Agreements Status, pipelines, reference
lists, former members' lists such as Danish's) holds names and details, not tasks, and is ignored
everywhere. When someone joins or leaves, update that constant.

Before the fix the dashboard read the whole workspace (807 tasks) and credited tasks to assignees.

## Rules

- **Open** = status is not "complete" (all nine lists use: to do, in progress, complete). Every
  open task counts, however old.
- **Per person** = open tasks in the list they own, not the assignee field.
- **Overdue** = open, due date earlier than now. No due date = never overdue.
- **Urgent** = open, ClickUp priority Urgent (id `1`).
- **On time %** = (open − overdue) ÷ open. 0 open tasks shows a dash, never 0% or 100%. No minimum
  (there used to be a 5% floor, which showed Sai at 5% instead of 0%).
- Due dates are stored around 2:30 PM PT. Show them, and count "N days overdue" / "Due today",
  as PT calendar dates (`dueLabel`, `bucketFor` in `lib/due-buckets.ts`).

## Where it's implemented

`snapshotFromTasks()` in `lib/clickup.ts` computes everything once; the cached snapshot feeds the
dashboard tiles, team cards, priority tasks, the Team tab, profiles, the kickoff brief, the chat
and the daily brief. `assigneeStats` / `tasksByAssignee` keep their names but are keyed by list
owner ("full name", plus " / clickup_key" when the key isn't part of the name), so the existing
`key.includes(cuKey)` lookups keep working.

## Audit baseline (Nov 24, 2026, PT)

Total open 142, overdue 97, urgent 23. Tony 40 (31, 5), Josh 29 (23, 5), Rob 29 (17, 7),
Alex 24 (20, 5), Kimberly 14 (3, 0), Darryl 3 (0, 0), Sam 2 (2, 0), Sai 1 (1, 1), Chitraket 0.
The fix (branch `fix/dashboard-personal-task-lists`) reproduced every one of these against live
ClickUp. Figures move as tasks change, so re-check against ClickUp, not this list.
