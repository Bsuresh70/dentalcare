-- DentalCare: Hyderabad dentist discovery index
create table if not exists public.dentist_directory_sources (
  place_id text primary key,
  city text not null default 'Hyderabad',
  state text not null default 'Telangana',
  source text not null default 'GOOGLE_PLACES',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  active boolean not null default true
);
create table if not exists public.dentist_directory_refresh_runs (
  id uuid primary key default gen_random_uuid(),
  city text not null default 'Hyderabad',
  source text not null default 'GOOGLE_PLACES',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'RUNNING',
  discovered integer not null default 0,
  error_message text
);
create index if not exists idx_dentist_directory_sources_seen on public.dentist_directory_sources(city,last_seen_at desc);
create index if not exists idx_dentist_directory_refresh_runs_started on public.dentist_directory_refresh_runs(started_at desc);
alter table public.dentist_directory_sources enable row level security;
alter table public.dentist_directory_refresh_runs enable row level security;
drop policy if exists dentist_directory_sources_authenticated on public.dentist_directory_sources;
create policy dentist_directory_sources_authenticated on public.dentist_directory_sources for select using (auth.uid() is not null);
drop policy if exists dentist_directory_refresh_runs_authenticated on public.dentist_directory_refresh_runs;
create policy dentist_directory_refresh_runs_authenticated on public.dentist_directory_refresh_runs for select using (auth.uid() is not null);
grant select on public.dentist_directory_sources to authenticated;
grant select on public.dentist_directory_refresh_runs to authenticated;
