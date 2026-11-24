---
name: verify-change
description: Run VCoS's "check before calling anything done" steps on the current changes (type check, build, a read-only run of changed figure/reminder logic against live ClickUp, Slack and Supabase with writes and Slack posts stubbed, and a page check as admin and as a normal user). Use before saying a VCoS change is done, or when asked to "test", "verify" or "check the figures".
---

# Verify a change (VCoS)

Run every step that applies, in order, and report each as passed / failed (with output) /
skipped (and why). Never call a change done on a step you didn't run.

## 1. What changed

```bash
git status --short && git diff --stat origin/master...
```

Note which shared `lib/` files changed (a change there affects every page listed for it in
`docs/ai/PROJECT_STRUCTURE.md`) and whether anything is role-dependent.

## 2. Type check and build

```bash
npx tsc --noEmit -p . 2>&1 | grep -v "^.next/"   # must print nothing
npm run build                                       # routes, middleware, config changes
```

Errors under `.next/types/` come from another branch's old build; ignore them or delete `.next`.
`git checkout tsconfig.tsbuildinfo` afterwards so it isn't committed.

## 3. Live data, read-only (figures, reminders, report status)

Run the real `lib/` code against live data without changing anything:

1. Copy `lib/` to the scratchpad, rewrite `@/lib/x` and `./x` imports to `./x.ts`, and symlink
   `node_modules`.
2. **Stub every write:** replace `lib/api-cache.ts` with no-op `recordSuccess` / `setCache` /
   `getCached`, and never import anything that calls `postMessage` or inserts into Supabase.
   `buildSlackSnapshot` and `buildClickUpSnapshot` only read once the cache is stubbed.
3. Run with Node 22+ (strips TypeScript types): `node --env-file=<repo>/.env check.ts`.
   To test a past day, override `Date` before importing (see `docs/ai/project_weekly_reports.md`).
4. Compare with what the person expects (for ClickUp figures, the baseline in
   `docs/ai/project_clickup_figures.md`, re-checked against ClickUp itself).

Never test by letting the daily reminder or a nudge post to Slack, and never write test rows
to the live database.

## 4. The real page

`npm run dev`, sign in as an admin, open the changed page; then as a normal user if the change
depends on role. Check 375px and desktop widths: no sideways scroll, nothing cropped.

## 5. Report

Fill the Status Report's **Checks** lines (AGENTS.md) from what actually ran, and list anything
skipped under **Still pending**. If you learned a rule or gotcha, add it to the matching
`docs/ai/` note.
