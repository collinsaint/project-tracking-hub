-- Pre-Con Priority dashboard tables (new tables only; nothing existing is changed).
-- Run once in Supabase: Dashboard → SQL Editor → New query → paste this file → Run.
-- Safe to re-run (IF NOT EXISTS / DROP POLICY IF EXISTS).

create table if not exists public.precon_pulls (
  id          bigserial primary key,
  program     text not null check (program in ('LC','OC','PIN','RFL','SRQ','PAS','GA')),
  pull_at     timestamptz not null,
  file_name   text,
  row_count   int,
  columns     jsonb,
  uploaded_at timestamptz not null default now(),
  unique (program, pull_at)
);

create table if not exists public.precon_program_records (
  pull_id   bigint not null references public.precon_pulls(id) on delete cascade,
  program   text not null,
  record_id text not null,
  address   text,
  applicant text,
  data      jsonb not null,
  primary key (pull_id, record_id)
);
create index if not exists precon_program_records_program_idx on public.precon_program_records(program);

create table if not exists public.precon_change_log (
  id                   bigserial primary key,
  program              text not null,
  record_id            text not null,
  address              text,
  applicant            text,
  bt_job_name          text,
  field                text not null,
  old_value            text,
  new_value            text,
  changed_at           timestamptz not null,
  changed_at_precision text check (changed_at_precision in ('exact','detected')),
  source               text,
  detail               text,
  inserted_at          timestamptz not null default now(),
  unique (program, record_id, field, new_value, changed_at)
);
create index if not exists precon_change_log_changed_at_idx on public.precon_change_log(changed_at desc);

-- Optional: rules table. If it has rows, the page uses it instead of the bundled seed (precon_rules_seed.js).
create table if not exists public.precon_rules (
  rule_id    text primary key,
  program    text not null,
  field      text not null,
  value      text not null,
  our_court  text not null check (our_court in ('Y','N')),
  priority   text,
  action     text,
  stage      text not null,
  source     text,
  match_type text default 'exact',
  active     text default 'Y',
  notes      text,
  loaded_at  timestamptz not null default now()
);

-- Row Level Security. The hub has no login and uses the public anon key, so:
--   anon can read everything, add pulls/records/changes, and delete old record rows (pruning to the last 2 pulls).
--   anon cannot update or delete pulls or the change log, and cannot touch rules (edit those in the SQL editor).
alter table public.precon_pulls           enable row level security;
alter table public.precon_program_records enable row level security;
alter table public.precon_change_log      enable row level security;
alter table public.precon_rules           enable row level security;

drop policy if exists precon_pulls_select on public.precon_pulls;
drop policy if exists precon_pulls_insert on public.precon_pulls;
create policy precon_pulls_select on public.precon_pulls for select to anon, authenticated using (true);
create policy precon_pulls_insert on public.precon_pulls for insert to anon, authenticated with check (true);

drop policy if exists precon_records_select on public.precon_program_records;
drop policy if exists precon_records_insert on public.precon_program_records;
drop policy if exists precon_records_delete on public.precon_program_records;
create policy precon_records_select on public.precon_program_records for select to anon, authenticated using (true);
create policy precon_records_insert on public.precon_program_records for insert to anon, authenticated with check (true);
create policy precon_records_delete on public.precon_program_records for delete to anon, authenticated using (true);

drop policy if exists precon_log_select on public.precon_change_log;
drop policy if exists precon_log_insert on public.precon_change_log;
create policy precon_log_select on public.precon_change_log for select to anon, authenticated using (true);
create policy precon_log_insert on public.precon_change_log for insert to anon, authenticated with check (true);

drop policy if exists precon_rules_select on public.precon_rules;
create policy precon_rules_select on public.precon_rules for select to anon, authenticated using (true);

grant select, insert on public.precon_pulls, public.precon_change_log to anon, authenticated;
grant select, insert, delete on public.precon_program_records to anon, authenticated;
grant select on public.precon_rules to anon, authenticated;
grant usage, select on sequence public.precon_pulls_id_seq, public.precon_change_log_id_seq to anon, authenticated;
