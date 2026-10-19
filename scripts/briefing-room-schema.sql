-- Run this once in the Supabase SQL editor to create the Briefing Room store.
--
-- One generic document table mirrors the page's original document database:
-- collection ∈ meetings | entries | audit | log | waiting | questions,
-- id = the document id (meetings use the meeting date, YYYY-MM-DD),
-- data = the document's fields, exactly as the page reads and writes them.
create table if not exists briefing_docs (
  collection text not null
    check (collection in ('meetings', 'entries', 'audit', 'log', 'waiting', 'questions')),
  id text not null,
  meeting_id text,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text,
  primary key (collection, id)
);

create index if not exists briefing_docs_meeting_idx
  on briefing_docs (collection, meeting_id);

-- Atomic field merge, so two people saving different fields of the same
-- document at the same moment can't overwrite each other.
create or replace function briefing_merge(
  p_collection text,
  p_id text,
  p_patch jsonb,
  p_by text
) returns jsonb
language sql
as $$
  update briefing_docs
     set data = data || p_patch,
         meeting_id = coalesce(p_patch->>'meetingId', meeting_id),
         updated_at = now(),
         updated_by = p_by
   where collection = p_collection and id = p_id
  returning data;
$$;
