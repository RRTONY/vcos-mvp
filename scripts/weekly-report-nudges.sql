-- Run this once in the Supabase SQL editor before deploying the admin
-- dashboard's "Nudge on Slack" bell.
--
-- One row per nudge attempt: an admin asking a team member, by Slack DM from
-- the VCOS Bot, to submit their weekly report. Used to show who was nudged
-- (the bell turns green), to allow at most one nudge per person per day, and
-- as an audit log (who sent it, to whom, when, and whether Slack accepted it).
create table if not exists weekly_report_nudges (
  id          uuid primary key default gen_random_uuid(),
  member_name text not null,        -- team_members.full_name of the person nudged
  week_label  text not null,        -- report week, e.g. 'Nov 23–Nov 27'
  nudge_date  date not null,        -- Pacific Time calendar day it was sent
  sent_by     text not null,        -- VCoS username of the admin
  sent_at     timestamptz not null default now(),
  ok          boolean not null,     -- Slack accepted the DM
  error       text                  -- why it failed, when ok = false
);

create index if not exists weekly_report_nudges_week_idx
  on weekly_report_nudges (week_label);
create index if not exists weekly_report_nudges_daily_idx
  on weekly_report_nudges (member_name, nudge_date);
