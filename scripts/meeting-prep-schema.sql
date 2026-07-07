-- Run this once in the Supabase SQL editor to create the Team Meeting Prep table.
create table if not exists meeting_prep_updates (
  id uuid primary key default gen_random_uuid(),
  submitted_by text not null,
  meeting_date date not null,
  meeting_type text not null check (meeting_type in ('monday', 'thursday')),
  wins text,
  priorities text,
  blockers text,
  decisions text,
  fyis text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (submitted_by, meeting_date)
);

create index if not exists meeting_prep_updates_meeting_date_idx
  on meeting_prep_updates (meeting_date);
