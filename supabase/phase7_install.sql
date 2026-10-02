-- ============================================================
-- DentalConnect Phase 7 - COMPLETE INSTALLATION
-- Patient Matching + Dentist Referral Network
-- Safe to run more than once.
-- ============================================================

-- 1. Clinic/dentist/service information used by matching
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

-- 2. Patient requests
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

-- 3. Dentist-to-dentist referrals
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

create index if not exists idx_patient_requests_status
on public.patient_requests(status,created_at desc);

create index if not exists idx_patient_requests_pincode
on public.patient_requests(pincode);

create index if not exists idx_referrals_source
on public.referrals(source_clinic_id,status);

create index if not exists idx_referrals_target
on public.referrals(target_clinic_id,status);

-- 4. Security
alter table public.patient_requests enable row level security;
alter table public.referrals enable row level security;

drop policy if exists patient_requests_clinic on public.patient_requests;
create policy patient_requests_clinic on public.patient_requests
for all
using (
  (clinic_id is not null and public.is_clinic_member(clinic_id))
  or
  (patient_id is not null and exists (
    select 1
    from public.patients p
    where p.id=patient_id
      and public.is_clinic_member(p.clinic_id)
  ))
)
with check (
  (clinic_id is not null and public.is_clinic_member(clinic_id))
  or
  (patient_id is not null and exists (
    select 1
    from public.patients p
    where p.id=patient_id
      and public.is_clinic_member(p.clinic_id)
  ))
);

drop policy if exists referrals_member on public.referrals;
create policy referrals_member on public.referrals
for all
using (
  public.is_clinic_member(source_clinic_id)
  or public.is_clinic_member(target_clinic_id)
)
with check (
  public.is_clinic_member(source_clinic_id)
  and public.is_clinic_member(target_clinic_id)
);

-- 5. Matching score
create or replace function public.calculate_match_score(
  p_urgency text,
  p_priority text,
  p_distance_km numeric,
  p_budget_fit boolean,
  p_availability boolean,
  p_specialty_match boolean
) returns integer
language plpgsql
immutable
as $$
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

-- 6. Public patient request creation
create or replace function public.create_public_patient_request(
  p_name text,
  p_phone text,
  p_treatment text,
  p_problem_description text default null,
  p_urgency text default 'FLEXIBLE',
  p_city text default null,
  p_pincode text default null,
  p_budget_min numeric default null,
  p_budget_max numeric default null,
  p_preferred_date date default null,
  p_preferred_period text default null,
  p_preference_priority text default 'BALANCED'
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid;
begin
  if nullif(trim(p_name),'') is null
     or nullif(trim(p_treatment),'') is null then
    raise exception 'Name and treatment are required.';
  end if;

  insert into public.patient_requests(
    name,phone,treatment,problem_description,urgency,city,pincode,
    budget_min,budget_max,preferred_date,preferred_period,preference_priority
  )
  values(
    trim(p_name),
    nullif(trim(coalesce(p_phone,'')),''),
    trim(p_treatment),
    nullif(trim(coalesce(p_problem_description,'')),''),
    coalesce(nullif(trim(p_urgency),''),'FLEXIBLE'),
    nullif(trim(coalesce(p_city,'')),''),
    nullif(trim(coalesce(p_pincode,'')),''),
    p_budget_min,
    p_budget_max,
    p_preferred_date,
    nullif(trim(coalesce(p_preferred_period,'')),''),
    coalesce(nullif(trim(p_preference_priority),''),'BALANCED')
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- 7. Patient matching
create or replace function public.find_patient_matches(p_request_id uuid)
returns table(
  dentist_id uuid,
  dentist_name text,
  specialty text,
  clinic_id uuid,
  clinic_name text,
  city text,
  pincode text,
  service_id uuid,
  service_name text,
  price numeric,
  distance_km numeric,
  available boolean,
  specialty_match boolean,
  budget_fit boolean,
  match_score integer,
  earliest_slot timestamptz
)
language sql
security definer
set search_path=public
as $$
with req as (
  select
    pr.treatment,
    pr.urgency,
    pr.preference_priority,
    pr.city,
    pr.pincode,
    pr.budget_min,
    pr.budget_max,
    pr.preferred_date
  from public.patient_requests pr
  where pr.id=p_request_id
),
candidates as (
  select
    d.id as dentist_id,
    d.name as dentist_name,
    d.specialty as specialty,
    c.id as clinic_id,
    c.name as clinic_name,
    c.city as city,
    c.pincode as pincode,
    s.id as service_id,
    s.name as service_name,
    s.default_price as price,

    case
      when r.pincode is not null and c.pincode=r.pincode then 0
      when r.city is not null and lower(c.city)=lower(r.city) then 5
      else 15
    end::numeric as distance_km,

    not exists (
      select 1
      from public.appointments a
      where a.dentist_id=d.id
        and a.status in ('SCHEDULED','CONFIRMED')
        and r.preferred_date is not null
        and a.scheduled_at::date=r.preferred_date
    ) as available,

    (
      lower(coalesce(s.name,'')) like '%'||lower(r.treatment)||'%'
      or lower(coalesce(s.category,'')) like '%'||lower(r.treatment)||'%'
      or lower(coalesce(d.specialty,'')) like '%'||lower(r.treatment)||'%'
      or lower(r.treatment) like '%'||lower(coalesce(s.name,''))||'%'
    ) as specialty_match,

    (
      (r.budget_min is null or s.default_price is null or s.default_price>=r.budget_min)
      and
      (r.budget_max is null or s.default_price is null or s.default_price<=r.budget_max)
    ) as budget_fit,

    r.urgency as request_urgency,
    r.preference_priority as request_priority,
    r.preferred_date as request_date

  from public.dentists d
  join public.clinics c
    on c.id=d.clinic_id
   and d.active=true
  join public.services s
    on s.clinic_id=c.id
   and s.active=true
  cross join req r

  where
    (r.city is null or c.city is null or lower(c.city)=lower(r.city))
    and
    (r.pincode is null or c.pincode is null or c.pincode=r.pincode)
),
ranked as (
  select
    x.*,
    public.calculate_match_score(
      x.request_urgency,
      x.request_priority,
      x.distance_km,
      x.budget_fit,
      x.available,
      x.specialty_match
    ) as calculated_score
  from candidates x
  where x.specialty_match
)
select
  r.dentist_id,
  r.dentist_name,
  r.specialty,
  r.clinic_id,
  r.clinic_name,
  r.city,
  r.pincode,
  r.service_id,
  r.service_name,
  r.price,
  r.distance_km,
  r.available,
  r.specialty_match,
  r.budget_fit,
  r.calculated_score as match_score,
  case
    when r.request_date is not null and r.available
      then r.request_date::timestamptz + interval '10 hours'
    when r.request_date is null
      then now()
    else null
  end as earliest_slot
from ranked r
order by r.calculated_score desc,
         r.distance_km asc,
         r.price asc nulls last
limit 20;
$$;

-- 8. Network clinics
create or replace function public.get_network_clinics(p_exclude_clinic uuid)
returns table(
  clinic_id uuid,
  clinic_name text,
  city text,
  pincode text
)
language sql
security definer
set search_path=public
as $$
  select
    c.id,
    c.name,
    c.city,
    c.pincode
  from public.clinics c
  where c.id<>p_exclude_clinic
  order by c.name
  limit 100;
$$;

-- 9. Create referral
create or replace function public.create_referral(
  p_source_clinic_id uuid,
  p_target_clinic_id uuid,
  p_patient_id uuid,
  p_patient_request_id uuid,
  p_treatment text,
  p_reason text,
  p_referring_dentist_id uuid default null,
  p_receiving_dentist_id uuid default null,
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid;
begin
  if not public.is_clinic_member(p_source_clinic_id) then
    raise exception 'You are not a member of the referring clinic.';
  end if;

  if p_target_clinic_id=p_source_clinic_id then
    raise exception 'Referral target must be another clinic.';
  end if;

  if nullif(trim(p_treatment),'') is null then
    raise exception 'Treatment is required.';
  end if;

  insert into public.referrals(
    source_clinic_id,
    target_clinic_id,
    patient_id,
    patient_request_id,
    referring_dentist_id,
    receiving_dentist_id,
    treatment,
    reason,
    notes
  )
  values(
    p_source_clinic_id,
    p_target_clinic_id,
    p_patient_id,
    p_patient_request_id,
    p_referring_dentist_id,
    p_receiving_dentist_id,
    trim(p_treatment),
    p_reason,
    p_notes
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- 10. Permissions
grant execute on function public.calculate_match_score(text,text,numeric,boolean,boolean,boolean)
to anon,authenticated;

grant execute on function public.create_public_patient_request(
  text,text,text,text,text,text,text,numeric,numeric,date,text,text
) to anon,authenticated;

grant execute on function public.find_patient_matches(uuid)
to anon,authenticated;

grant execute on function public.get_network_clinics(uuid)
to authenticated;

grant execute on function public.create_referral(
  uuid,uuid,uuid,uuid,text,text,uuid,uuid,text
) to authenticated;

-- ============================================================
-- Installation complete
-- ============================================================


-- 11. Patient appointment requests
create table if not exists public.appointment_requests (
  id uuid primary key default gen_random_uuid(),
  patient_request_id uuid references public.patient_requests(id) on delete set null,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  dentist_id uuid references public.dentists(id) on delete set null,
  service_id uuid references public.services(id) on delete set null,
  patient_name text not null,
  patient_phone text,
  requested_date date,
  requested_period text,
  notes text,
  status text not null default 'PENDING',
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create index if not exists idx_appointment_requests_clinic
on public.appointment_requests(clinic_id,status,created_at desc);

alter table public.appointment_requests enable row level security;

drop policy if exists appointment_requests_clinic on public.appointment_requests;
create policy appointment_requests_clinic on public.appointment_requests
for all
using (public.is_clinic_member(clinic_id))
with check (public.is_clinic_member(clinic_id));

create or replace function public.create_appointment_request(
  p_patient_request_id uuid,
  p_clinic_id uuid,
  p_dentist_id uuid,
  p_service_id uuid,
  p_patient_name text,
  p_patient_phone text,
  p_requested_date date,
  p_requested_period text,
  p_notes text
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid;
begin
  if nullif(trim(p_patient_name),'') is null then
    raise exception 'Patient name is required.';
  end if;
  if not exists(select 1 from public.clinics where id=p_clinic_id) then
    raise exception 'Clinic not found.';
  end if;

  insert into public.appointment_requests(
    patient_request_id,clinic_id,dentist_id,service_id,
    patient_name,patient_phone,requested_date,requested_period,notes
  )
  values(
    p_patient_request_id,p_clinic_id,p_dentist_id,p_service_id,
    trim(p_patient_name),nullif(trim(coalesce(p_patient_phone,'')),''),
    p_requested_date,nullif(trim(coalesce(p_requested_period,'')),''),
    nullif(trim(coalesce(p_notes,'')),'')
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_appointment_request(
  uuid,uuid,uuid,uuid,text,text,date,text,text
) to anon,authenticated;

-- 12. Clinic response to appointment requests
create or replace function public.respond_to_appointment_request(
  p_request_id uuid,
  p_status text
) returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_clinic uuid;
begin
  select clinic_id into v_clinic
  from public.appointment_requests
  where id=p_request_id;

  if v_clinic is null or not public.is_clinic_member(v_clinic) then
    raise exception 'You are not authorized to respond to this request.';
  end if;

  if p_status not in ('ACCEPTED','DECLINED') then
    raise exception 'Invalid response status.';
  end if;

  update public.appointment_requests
  set status=p_status,responded_at=now()
  where id=p_request_id;
end;
$$;

grant execute on function public.respond_to_appointment_request(uuid,text)
to authenticated;
