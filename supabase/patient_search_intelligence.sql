-- DentalCare Patient Search Intelligence
create table if not exists public.patient_search_intents (
  id uuid primary key default gen_random_uuid(),
  patient_request_id uuid references public.patient_requests(id) on delete set null,
  name text,
  phone text,
  search_query text not null,
  detected_treatment text,
  detected_urgency text,
  city text,
  pincode text,
  budget_max numeric(12,2),
  intent_score integer not null default 0,
  source text not null default 'ORGANIC',
  landing_page text,
  consent_to_contact boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_patient_search_intents_time
on public.patient_search_intents(created_at desc);

create index if not exists idx_patient_search_intents_treatment
on public.patient_search_intents(detected_treatment,created_at desc);

alter table public.patient_search_intents enable row level security;

drop policy if exists patient_search_intents_public_insert on public.patient_search_intents;
create policy patient_search_intents_public_insert
on public.patient_search_intents
for insert to anon, authenticated
with check (consent_to_contact = true or phone is null);

create or replace function public.capture_patient_search_intent(
  p_search_query text,
  p_detected_treatment text,
  p_detected_urgency text default 'FLEXIBLE',
  p_name text default null,
  p_phone text default null,
  p_city text default null,
  p_pincode text default null,
  p_budget_max numeric default null,
  p_intent_score integer default 50,
  p_source text default 'ORGANIC',
  p_landing_page text default null,
  p_consent_to_contact boolean default false
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid;
  v_request uuid;
begin
  if nullif(trim(p_search_query),'') is null then
    raise exception 'Please describe what dental help you need.';
  end if;

  if p_consent_to_contact and nullif(trim(coalesce(p_phone,'')),'') is not null
     and nullif(trim(coalesce(p_name,'')),'') is not null
     and nullif(trim(coalesce(p_detected_treatment,'')),'') is not null then
    v_request := public.create_public_patient_request(
      trim(p_name),
      trim(p_phone),
      trim(p_detected_treatment),
      trim(p_search_query),
      coalesce(nullif(trim(p_detected_urgency),''),'FLEXIBLE'),
      nullif(trim(coalesce(p_city,'')),''),
      nullif(trim(coalesce(p_pincode,'')),''),
      null,
      p_budget_max,
      null,
      null,
      'BALANCED'
    );
  end if;

  insert into public.patient_search_intents(
    patient_request_id,name,phone,search_query,detected_treatment,
    detected_urgency,city,pincode,budget_max,intent_score,source,
    landing_page,consent_to_contact
  )
  values(
    v_request,
    nullif(trim(coalesce(p_name,'')),''),
    nullif(trim(coalesce(p_phone,'')),''),
    trim(p_search_query),
    nullif(trim(coalesce(p_detected_treatment,'')),''),
    coalesce(nullif(trim(p_detected_urgency),''),'FLEXIBLE'),
    nullif(trim(coalesce(p_city,'')),''),
    nullif(trim(coalesce(p_pincode,'')),''),
    p_budget_max,
    greatest(0,least(coalesce(p_intent_score,0),100)),
    coalesce(nullif(trim(p_source),''),'ORGANIC'),
    p_landing_page,
    coalesce(p_consent_to_contact,false)
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.capture_patient_search_intent(
  text,text,text,text,text,text,text,numeric,integer,text,text,boolean
) to anon, authenticated;
