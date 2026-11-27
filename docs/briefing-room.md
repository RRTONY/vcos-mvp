# Briefing Room in VCoS (now the Command Centre)

CEO Command Centre for the Monday and Thursday team meetings, at `/command-centre/<tab>`
(2026-11-28, Darryl's handoff phase 1). The top bar switches between the two workspaces
(`components/WorkspaceSwitch.tsx`, `lib/workspace.ts`): navy "Visual Chief of Staff" and teal
"Command Centre"; the last one used is remembered (`localStorage` `vcos.workspace`) and reopened
when someone lands on `/`. Tabs are real addresses (`overview`, `email-audit`, `decisions`,
`meeting-log`, `what-changed`, `questions`, `history`); the page itself renders in
`app/command-centre/layout.tsx` so data survives tab changes. Old `/briefing` and
`/briefing?tab=<id>` links 308-redirect to the matching tab (`next.config.js`).

## How it is wired

| Piece | File |
|---|---|
| Page (native React, VCoS design system) | `components/briefing/BriefingRoom.tsx`, routed by `app/command-centre/` |
| Tabs and detail panel | `components/briefing/*` |
| Data loading, 60 s refresh, saves | `hooks/useBriefing.ts` |
| Status, ordering, "what changed" logic | `lib/briefing-view.ts` |
| Data API | `app/api/briefing/route.ts` |
| Store + permission rules | `lib/briefing.ts` |
| Table | `scripts/briefing-room-schema.sql` (`briefing_docs`) |
| One-time import from the Artifact export | `scripts/briefing-import.mjs` |

The page refreshes every 60 seconds, when the browser tab regains focus, and right after each save.

## Who can do what

- **Team (every signed-in VCoS user)**: edit data, save Status/Comments, add questions.
- **Tony** (`BRIEFING_VIEW_ONLY_USERNAMES` in `lib/constants.ts`): view only, plus answering questions.
- **Scheduled jobs** (`x-briefing-key` header = `BRIEFING_API_KEY`): read and write everything, except
  `teamNote`, `teamNoteBy` and `teamNoteAt`, which belong to the team. When a job replaces an entry
  with `set`, those fields (and `cuSyncedNote` / `cuSyncedAt` unless the job sends new ones) are carried over.
  Only jobs can write `cuSyncedNote` / `cuSyncedAt`.

## API for the scheduled jobs

Base URL: `https://<vcos-host>/api/briefing`, header `x-briefing-key: <BRIEFING_API_KEY>`.

```
GET  ?collection=entries&meetingId=2026-10-22      → { docs: [{ id, data }] }
GET  ?collection=meetings                          → every meeting record
GET  ?collection=entries&id=2026-10-22_c01         → { doc: { id, data } | null }
POST { "op": "set",    "collection": "meetings", "id": "2026-10-22", "data": { ... } }
POST { "op": "update", "collection": "entries",  "id": "2026-10-22_c01", "data": { "cuSyncedNote": "...", "cuSyncedAt": 1760000000000 } }
POST { "op": "add",    "collection": "questions", "data": { ... } }        → { id }
POST { "op": "delete", "collection": "log", "id": "2026-10-22_l03" }
```

Collections and fields are exactly those in the handoff README (meetings, entries, audit, log,
waiting, questions). Meeting ids are the meeting date, `YYYY-MM-DD`; every other document carries `meetingId`.

## Go-live checklist

1. Run `scripts/briefing-room-schema.sql` in the Supabase SQL editor.
2. Import the current data: `node scripts/briefing-import.mjs <export-dir>`.
3. Set `BRIEFING_API_KEY` in Netlify (and `.env` locally) and give the same value to the scheduled jobs.
4. Point the prepare, refresh and ClickUp-sync jobs at the API above; change the link in the
   #rr-internal notices to `https://<vcos-host>/briefing`.
5. Test: save a team note, refresh, confirm the ClickUp sync posts exactly one comment on the right record.

## API for the scheduled jobs (2026-11-28, handoff docs/03 section 4)

`/api/briefing` (`app/api/briefing/route.ts`, `lib/briefing.ts`):

- **Sign-in:** `x-briefing-key: <BRIEFING_API_KEY>` or `Authorization: Bearer <CC_SERVICE_TOKEN>`
  (`lib/briefing-auth.ts`, constant-time compare, used by `middleware.ts` too). Either makes the
  caller the "service" actor: it can never write `teamNote`/`teamNoteBy`/`teamNoteAt`.
- **Versions:** every doc in a GET has `version` (the row's `updated_at`, exactly as stored).
  A write with `if_version` only happens if the doc is still at that version; `null` means
  "must not exist yet". Otherwise **409** `{ error: "Version conflict", version: <current> }`.
  The condition is in the database update itself (`.eq("updated_at", ifVersion)`), so two writers
  on the same version can't both win. Writes without `if_version` behave as before.
- **Batch:** `{ op: "batch", writes: [...] }`, 1 to 50 writes, run in order, **not a
  transaction**: `results[i]` says whether each write happened (`{ ok, id, version }` or
  `{ ok: false, status, error, version? }`).
- Self-test (fake table, never touches Supabase): `node scripts/briefing-versions.selftest.mjs`.
- `CC_SERVICE_TOKEN` must be set in Netlify (and `.env` locally) before the jobs can use Bearer.
