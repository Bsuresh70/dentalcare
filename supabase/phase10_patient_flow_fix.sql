-- DentalCare Phase 10 hotfix: return the automatically created patient_request id
-- Run this once in Supabase SQL Editor after the Phase 10 Growth Engine SQL.

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
  v_intent_id uuid;
  v_request uuid;
begin
  if nullif(trim(p_search_query),'') is null then
    raise exception 'Please describe what dental help you need.';
  end if;

  if p_consent_to_contact
     and nullif(trim(coalesce(p_phone,'')),'') is not null
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
    patient_request_id,name,phone,search_query,detected_treatment,detected_urgency,
    city,pincode,budget_max,intent_score,source,landing_page,consent_to_contact
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
  returning id into v_intent_id;

  if v_request is not null then
    update public.patient_requests
    set intent_score=greatest(0,least(coalesce(p_intent_score,0),100)),
        source=coalesce(nullif(trim(p_source),''),'ORGANIC')
    where id=v_request;

    perform public.assign_patient_request_to_best_dentist(v_request);
  end if;

  -- The public patient flow needs the request id, not the private intent id.
  return v_request;
end;
$$;

grant execute on function public.capture_patient_search_intent(
  text,text,text,text,text,text,text,numeric,integer,text,text,boolean
) to anon,authenticated;
