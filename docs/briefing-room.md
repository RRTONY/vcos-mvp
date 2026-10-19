# Briefing Room in VCoS

CEO Command Centre for the Monday and Thursday team meetings, at `/briefing`.

## How it is wired

| Piece | File |
|---|---|
| Page (native React, VCoS design system) | `app/briefing/page.tsx` |
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
