-- DentalConnect Phase 7: Patient matching + referral network
-- Run this migration in Supabase SQL Editor after deploying the app.

alter table public.clinics add column if not exists address text;
alter table public.clinics add column if not exists city text;
alter table public.clinics add column if not exists pincode text;
alter table public.clinics add column if not exists latitude numeric(10,7);
alter table public.clinics add column if not exists longitude numeric(10,7);

alter table public.dentists add column if not exists bio text;
alter table public.dentists add column if not exists years_experience integer;
alter table public.dentists add column if not exists languages text;
alter table public.dentists add column if not exists consultation_fee numeric(12,2);

alter table public.services add column if not exists description text;
alter table public.services add column if not exists duration_minutes integer default 30;

create table if not exists public.patient_requests (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients(id) on delete set null,
  clinic_id uuid references public.clinics(id) on delete set null,
  name text not null,
  phone text,
  treatment text not null,
  problem_description text,
  urgency text not null default 'FLEXIBLE',
  city text,
  pincode text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  max_distance_km numeric(8,2),
  budget_min numeric(12,2),
  budget_max numeric(12,2),
  preferred_date date,
  preferred_period text,
  preference_priority text default 'BALANCED',
  status text not null default 'OPEN',
  created_at timestamptz not null default now()
);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  source_clinic_id uuid not null references public.clinics(id) on delete cascade,
  target_clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_request_id uuid references public.patient_requests(id) on delete set null,
  patient_id uuid references public.patients(id) on delete set null,
  referring_dentist_id uuid references public.dentists(id) on delete set null,
  receiving_dentist_id uuid references public.dentists(id) on delete set null,
  treatment text not null,
  reason text,
  status text not null default 'PENDING',
  notes text,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  completed_at timestamptz
);

create index if not exists idx_patient_requests_status on public.patient_requests(status,created_at desc);
create index if not exists idx_patient_requests_pincode on public.patient_requests(pincode);
create index if not exists idx_referrals_source on public.referrals(source_clinic_id,status);
create index if not exists idx_referrals_target on public.referrals(target_clinic_id,status);

alter table public.patient_requests enable row level security;
alter table public.referrals enable row level security;

drop policy if exists patient_requests_clinic on public.patient_requests;
create policy patient_requests_clinic on public.patient_requests
for all using (
  (clinic_id is not null and public.is_clinic_member(clinic_id))
  or (patient_id is not null and exists(select 1 from public.patients p where p.id=patient_id and public.is_clinic_member(p.clinic_id)))
) with check (
  (clinic_id is not null and public.is_clinic_member(clinic_id))
  or (patient_id is not null and exists(select 1 from public.patients p where p.id=patient_id and public.is_clinic_member(p.clinic_id)))
);

drop policy if exists referrals_member on public.referrals;
create policy referrals_member on public.referrals
for all using (
  public.is_clinic_member(source_clinic_id) or public.is_clinic_member(target_clinic_id)
) with check (
  public.is_clinic_member(source_clinic_id) and public.is_clinic_member(target_clinic_id)
);

create or replace function public.calculate_match_score(
  p_urgency text,
  p_priority text,
  p_distance_km numeric,
  p_budget_fit boolean,
  p_availability boolean,
  p_specialty_match boolean
) returns integer
language plpgsql immutable as $$
declare
  s integer := 0;
begin
  if p_specialty_match then s := s + 35; end if;
  if p_availability then s := s + 25; end if;
  if p_budget_fit then s := s + 15; end if;

  if p_priority = 'EARLIEST' then
    if p_availability then s := s + 10; end if;
  elsif p_priority = 'NEAREST' then
    if coalesce(p_distance_km,999) <= 3 then s := s + 10;
    elsif coalesce(p_distance_km,999) <= 8 then s := s + 6;
    end if;
  elsif p_priority = 'LOWEST_PRICE' then
    if p_budget_fit then s := s + 10; end if;
  elsif p_priority = 'EXPERTISE' then
    if p_specialty_match then s := s + 10; end if;
  else
    if coalesce(p_distance_km,999) <= 5 then s := s + 5; end if;
  end if;

  if p_urgency = 'ASAP' and p_availability then s := s + 5; end if;
  return least(s,100);
end;
$$;

grant execute on function public.calculate_match_score(text,text,numeric,boolean,boolean,boolean) to authenticated;
