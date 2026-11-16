-- Run this once in the Supabase SQL editor before deploying "Mark as Submitted".
--
-- An admin can mark a member's weekly report as submitted when it was shared
-- outside VCoS (email, DM, a Slack post without #myweeklyreport, ...). The mark
-- is stored as a normal weekly_reports row with no content, so every view that
-- reads the table (dashboard, filing scorecard, kickoff brief, chat) counts it
-- as filed, and the daily Slack reminder stops for that member.
--
-- marked_submitted_by = username of the admin who marked it; NULL for reports
-- actually filed through VCoS. A real submission for the same week replaces the
-- mark (the submit route clears this column).
alter table weekly_reports
  add column if not exists marked_submitted_by text;
