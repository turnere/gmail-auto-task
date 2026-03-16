-- Supabase migration for the contacts reconnect system.
-- Run this in the Supabase SQL Editor (supabase.com → your project → SQL Editor).

-- Contacts table
create table if not exists contacts (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  email text,
  company text,
  notes text,
  last_contacted date,
  habitica_task_id text,
  created_at timestamptz default now()
);

-- Index for fast lookup by email
create index if not exists idx_contacts_email on contacts (lower(email));

-- Index for the reconnect query (oldest contacted first, nulls first)
create index if not exists idx_contacts_last_contacted on contacts (last_contacted asc nulls first);

-- Row Level Security (enable for frontend access)
alter table contacts enable row level security;

-- Policy: allow all operations for authenticated users
-- Adjust this if you want more restrictive access from your frontend.
create policy "Authenticated users can manage contacts"
  on contacts
  for all
  to authenticated
  using (true)
  with check (true);

-- Policy: allow the service role full access (for this CLI/cron script)
create policy "Service role has full access"
  on contacts
  for all
  to service_role
  using (true)
  with check (true);

-- Activity log table
create table if not exists contact_activity (
  id uuid default gen_random_uuid() primary key,
  contact_id uuid references contacts(id) on delete cascade,
  action text not null,       -- 'added', 'removed', 'contacted', 'edited', 'task_created', 'task_completed'
  details text,               -- human-readable description of what changed
  created_at timestamptz default now()
);

create index if not exists idx_activity_contact on contact_activity (contact_id, created_at desc);
create index if not exists idx_activity_created on contact_activity (created_at desc);

alter table contact_activity enable row level security;

create policy "Authenticated users can view activity"
  on contact_activity
  for all
  to authenticated
  using (true)
  with check (true);

create policy "Service role has full access to activity"
  on contact_activity
  for all
  to service_role
  using (true)
  with check (true);
