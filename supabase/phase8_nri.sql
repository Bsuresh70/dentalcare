-- ============================================================
-- DentalConnect Phase 8
-- NRI Dental Care Lead Engine
-- Consented NRI case capture + clinic lead inbox
-- ============================================================

create table if not exists public.nri_dental_cases (
  id uuid primary key default gen_random_uuid(),
  assigned_clinic_id uuid references public.clinics(id) on delete set null,
  assigned_dentist_id uuid references public.dentists(id) on delete set null,

  full_name text not null,
  email text,
  phone text,
  whatsapp text,

  us_city text,
  us_state text,
  preferred_india_city text,
  preferred_india_state text,

  treatment_need text not null,
  problem_description text,
  urgency text not null default 'FLEXIBLE',

  us_dentist_diagnosis text,
  us_estimated_cost numeric(12,2),
  india_budget numeric(12,2),

  planned_india_visit text,
  travel_start date,
  travel_end date,

  preferred_contact text default 'WHATSAPP',
  source text default 'WEBSITE',
  status text not null default 'NEW',

  consent_to_contact boolean not null default false,
  consent_to_share_case boolean not null default false,

  lead_score integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_nri_cases_status
on public.nri_dental_cases(status,created_at desc);

create index if not exists idx_nri_cases_city
on public.nri_dental_cases(preferred_india_city,status);

create index if not exists idx_nri_cases_assigned
on public.nri_dental_cases(assigned_clinic_id,status);

alter table public.nri_dental_cases enable row level security;

drop policy if exists nri_cases_clinic on public.nri_dental_cases;
create policy nri_cases_clinic on public.nri_dental_cases
for select
using (
  assigned_clinic_id is not null
  and public.is_clinic_member(assigned_clinic_id)
);

drop policy if exists nri_cases_update on public.nri_dental_cases;
create policy nri_cases_update on public.nri_dental_cases
for update
using (
  assigned_clinic_id is not null
  and public.is_clinic_member(assigned_clinic_id)
)
with check (
  assigned_clinic_id is not null
  and public.is_clinic_member(assigned_clinic_id)
);

create or replace function public.calculate_nri_lead_score(
  p_us_estimated_cost numeric,
  p_india_budget numeric,
  p_travel_start date,
  p_treatment text,
  p_urgency text,
  p_consent boolean
) returns integer
language plpgsql
immutable
as $$
declare
  s integer := 0;
begin
  if p_consent then s := s + 15; end if;
  if p_treatment is not null and trim(p_treatment)<>'' then s := s + 20; end if;
  if p_us_estimated_cost is not null and p_us_estimated_cost>0 then s := s + 20; end if;
  if p_india_budget is not null and p_india_budget>0 then s := s + 15; end if;
  if p_travel_start is not null then s := s + 15; end if;
  if upper(coalesce(p_urgency,'')) in ('ASAP','HIGH') then s := s + 10; end if;
  if lower(coalesce(p_treatment,'')) like '%implant%'
     or lower(coalesce(p_treatment,'')) like '%full mouth%'
     or lower(coalesce(p_treatment,'')) like '%crown%'
     or lower(coalesce(p_treatment,'')) like '%root canal%'
  then s := s + 5;
  end if;
  return least(s,100);
end;
$$;

create or replace function public.create_nri_dental_case(
  p_full_name text,
  p_email text,
  p_phone text,
  p_whatsapp text,
  p_us_city text,
  p_us_state text,
  p_preferred_india_city text,
  p_preferred_india_state text,
  p_treatment_need text,
  p_problem_description text,
  p_urgency text,
  p_us_dentist_diagnosis text,
  p_us_estimated_cost numeric,
  p_india_budget numeric,
  p_planned_india_visit text,
  p_travel_start date,
  p_travel_end date,
  p_preferred_contact text,
  p_source text,
  p_consent_to_contact boolean,
  p_consent_to_share_case boolean
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid;
  v_score integer;
begin
  if nullif(trim(p_full_name),'') is null
     or nullif(trim(p_treatment_need),'') is null then
    raise exception 'Name and treatment need are required.';
  end if;

  if not p_consent_to_contact then
    raise exception 'Please provide consent to be contacted.';
  end if;

  v_score := public.calculate_nri_lead_score(
    p_us_estimated_cost,p_india_budget,p_travel_start,
    p_treatment_need,p_urgency,p_consent_to_contact
  );

  insert into public.nri_dental_cases(
    full_name,email,phone,whatsapp,
    us_city,us_state,preferred_india_city,preferred_india_state,
    treatment_need,problem_description,urgency,
    us_dentist_diagnosis,us_estimated_cost,india_budget,
    planned_india_visit,travel_start,travel_end,
    preferred_contact,source,
    consent_to_contact,consent_to_share_case,lead_score
  )
  values(
    trim(p_full_name),
    nullif(trim(coalesce(p_email,'')),''),
    nullif(trim(coalesce(p_phone,'')),''),
    nullif(trim(coalesce(p_whatsapp,'')),''),
    nullif(trim(coalesce(p_us_city,'')),''),
    nullif(trim(coalesce(p_us_state,'')),''),
    nullif(trim(coalesce(p_preferred_india_city,'')),''),
    nullif(trim(coalesce(p_preferred_india_state,'')),''),
    trim(p_treatment_need),
    nullif(trim(coalesce(p_problem_description,'')),''),
    coalesce(nullif(trim(p_urgency),''),'FLEXIBLE'),
    nullif(trim(coalesce(p_us_dentist_diagnosis,'')),''),
    p_us_estimated_cost,
    p_india_budget,
    nullif(trim(coalesce(p_planned_india_visit,'')),''),
    p_travel_start,p_travel_end,
    coalesce(nullif(trim(p_preferred_contact),''),'WHATSAPP'),
    coalesce(nullif(trim(p_source),''),'WEBSITE'),
    p_consent_to_contact,p_consent_to_share_case,v_score
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.calculate_nri_lead_score(numeric,numeric,date,text,text,boolean)
to anon,authenticated;

grant execute on function public.create_nri_dental_case(
  text,text,text,text,text,text,text,text,text,text,text,text,numeric,numeric,text,date,date,text,text,boolean,boolean
) to anon,authenticated;

create or replace function public.claim_nri_case(
  p_case_id uuid,
  p_clinic_id uuid,
  p_dentist_id uuid default null
) returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.is_clinic_member(p_clinic_id) then
    raise exception 'You are not a member of this clinic.';
  end if;

  update public.nri_dental_cases
  set assigned_clinic_id=p_clinic_id,
      assigned_dentist_id=p_dentist_id,
      status='CONTACTED',
      updated_at=now()
  where id=p_case_id
    and assigned_clinic_id is null;

  if not found then
    raise exception 'This NRI case is no longer available.';
  end if;
end;
$$;

grant execute on function public.claim_nri_case(uuid,uuid,uuid)
to authenticated;

create or replace function public.release_nri_case(p_case_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare v_clinic uuid;
begin
  select assigned_clinic_id into v_clinic
  from public.nri_dental_cases where id=p_case_id;

  if v_clinic is null or not public.is_clinic_member(v_clinic) then
    raise exception 'Not authorized.';
  end if;

  update public.nri_dental_cases
  set assigned_clinic_id=null,assigned_dentist_id=null,status='NEW',updated_at=now()
  where id=p_case_id;
end;
$$;

grant execute on function public.release_nri_case(uuid) to authenticated;


-- Unassigned lead pool: only non-identifying case summary is exposed before a clinic claims it.
create or replace function public.get_nri_case_pool(p_clinic_id uuid)
returns table(
  id uuid,
  treatment_need text,
  urgency text,
  preferred_india_city text,
  travel_start date,
  travel_end date,
  lead_score integer,
  created_at timestamptz,
  us_state text
)
language sql
security definer
set search_path=public
as $$
  select
    n.id,n.treatment_need,n.urgency,n.preferred_india_city,
    n.travel_start,n.travel_end,n.lead_score,n.created_at,n.us_state
  from public.nri_dental_cases n
  join public.clinics c on c.id=p_clinic_id
  where n.assigned_clinic_id is null
    and (
      n.preferred_india_city is null
      or c.city is null
      or lower(n.preferred_india_city)=lower(c.city)
    )
  order by n.lead_score desc,n.created_at asc
  limit 100;
$$;

grant execute on function public.get_nri_case_pool(uuid) to authenticated;
