-- DentalGrowth AI Phase 12
-- Sequential lead allocation with a strict 10 km geographic radius.
-- Apply after phase10_growth_engine.sql and phase11_lead_sources.sql.
-- Safe to re-run. Coordinates are required for distance-qualified assignment.

alter table public.patient_requests
  add column if not exists latitude numeric(10,7),
  add column if not exists longitude numeric(10,7),
  add column if not exists contact_consent boolean not null default false,
  add column if not exists consent_captured_at timestamptz,
  add column if not exists source text not null default 'WEBSITE';

alter table public.clinics
  add column if not exists latitude numeric(10,7),
  add column if not exists longitude numeric(10,7);

alter table public.patient_lead_assignments
  add column if not exists response_due_at timestamptz,
  add column if not exists declined_at timestamptz,
  add column if not exists expired_at timestamptz,
  add column if not exists allocation_sequence integer;

create index if not exists idx_patient_requests_geo
  on public.patient_requests(latitude, longitude, created_at desc);
create index if not exists idx_clinics_geo
  on public.clinics(latitude, longitude) where latitude is not null and longitude is not null;
create index if not exists idx_patient_lead_assignment_due
  on public.patient_lead_assignments(status, response_due_at)
  where status = 'ASSIGNED';

-- Haversine distance in kilometres.
create or replace function public.distance_km(
  p_lat1 numeric, p_lon1 numeric, p_lat2 numeric, p_lon2 numeric
) returns numeric
language sql immutable
as $$
  select case
    when p_lat1 is null or p_lon1 is null or p_lat2 is null or p_lon2 is null then null
    else 6371 * 2 * asin(sqrt(
      power(sin(radians((p_lat2-p_lat1)::double precision)/2),2) +
      cos(radians(p_lat1::double precision)) *
      cos(radians(p_lat2::double precision)) *
      power(sin(radians((p_lon2-p_lon1)::double precision)/2),2)
    ))
  end;
$$;

-- Replace the previous one-shot allocation with one-offer-at-a-time allocation.
-- A clinic must have verified coordinates and lie within 10 km of the patient's
-- supplied/geocoded coordinates. Missing coordinates never count as a 10 km match.
create or replace function public.assign_patient_request_to_best_dentist(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.patient_requests%rowtype;
  v_assignment uuid;
  v_clinic uuid;
  v_dentist uuid;
  v_service uuid;
  v_score integer;
  v_sequence integer;
begin
  select * into r
  from public.patient_requests
  where id = p_request_id
  for update;

  if r.id is null then
    raise exception 'Patient request not found.';
  end if;

  if not coalesce(r.contact_consent,false) then
    -- Legacy capture path stores consent in patient_search_intents.
    if not exists (
      select 1 from public.patient_search_intents psi
      where psi.patient_request_id = r.id and psi.consent_to_contact = true
    ) then
      raise exception 'Patient contact consent is required before assigning a lead.';
    end if;
  end if;

  -- Never create a second active offer for the same patient request.
  select id into v_assignment
  from public.patient_lead_assignments
  where patient_request_id = p_request_id
    and status in ('ASSIGNED','CONTACTED','BOOKED')
  order by assigned_at desc
  limit 1;

  if v_assignment is not null then
    return v_assignment;
  end if;

  if r.latitude is null or r.longitude is null then
    update public.patient_requests set status='OPEN', clinic_id=null where id=p_request_id;
    return null;
  end if;

  select coalesce(max(allocation_sequence),0)+1 into v_sequence
  from public.patient_lead_assignments
  where patient_request_id=p_request_id;

  with candidates as (
    select
      d.id as dentist_id,
      c.id as clinic_id,
      s.id as service_id,
      public.distance_km(r.latitude,r.longitude,c.latitude,c.longitude) as km,
      (
        case when lower(coalesce(s.name,'')) like '%'||lower(r.treatment)||'%' then 40 else 0 end +
        case when lower(coalesce(s.category,'')) like '%'||lower(r.treatment)||'%' then 25 else 0 end +
        case when lower(coalesce(d.specialty,'')) like '%'||lower(r.treatment)||'%' then 25 else 0 end +
        case when r.budget_max is null or s.default_price is null or s.default_price <= r.budget_max then 5 else 0 end +
        case when r.urgency in ('TODAY','ASAP') then 5 else 0 end
      )::integer as score
    from public.dentists d
    join public.clinics c on c.id=d.clinic_id
    join public.services s on s.clinic_id=c.id and s.active=true
    join public.clinic_subscriptions cs on cs.clinic_id=c.id
      and cs.status in ('TRIAL','ACTIVE')
      and (cs.current_period_end is null or cs.current_period_end >= now())
    where d.active=true
      and c.latitude is not null and c.longitude is not null
      and public.distance_km(r.latitude,r.longitude,c.latitude,c.longitude) <= 10
      and (r.city is null or lower(coalesce(c.city,''))=lower(r.city))
      and (
        lower(coalesce(s.name,'')) like '%'||lower(r.treatment)||'%'
        or lower(coalesce(s.category,'')) like '%'||lower(r.treatment)||'%'
        or lower(coalesce(d.specialty,'')) like '%'||lower(r.treatment)||'%'
        or lower(r.treatment) like '%'||lower(coalesce(s.name,''))||'%'
      )
      and not exists (
        select 1 from public.patient_lead_assignments old
        where old.patient_request_id=p_request_id and old.clinic_id=c.id
      )
  )
  select dentist_id,clinic_id,service_id,least(score,100)
    into v_dentist,v_clinic,v_service,v_score
  from candidates
  order by score desc, km asc, clinic_id
  limit 1;

  if v_clinic is null then
    update public.patient_requests set status='OPEN', clinic_id=null where id=p_request_id;
    return null;
  end if;

  insert into public.patient_lead_assignments(
    patient_request_id,clinic_id,dentist_id,service_id,assignment_score,
    status,first_contact_due_at,response_due_at,allocation_sequence
  ) values (
    p_request_id,v_clinic,v_dentist,v_service,v_score,
    'ASSIGNED',now()+interval '10 minutes',now()+interval '10 minutes',v_sequence
  ) returning id into v_assignment;

  insert into public.lead_ai_actions(
    assignment_id,action_type,priority,reason,suggested_message,scheduled_for
  ) values (
    v_assignment,
    'CONTACT_PATIENT',
    case when r.urgency in ('TODAY','ASAP') or coalesce(r.intent_score,0)>=90 then 'HIGH' else 'MEDIUM' end,
    'Sequential offer '||v_sequence||'. Highest-ranked eligible dentist within 10 km.',
    'Hello '||coalesce(r.name,'')||', we received your enquiry regarding '||coalesce(r.treatment,'dental care')||'. Our clinic would be happy to discuss a consultation. Please let us know a convenient time.',
    now()
  );

  update public.patient_requests
  set clinic_id=v_clinic,status='ASSIGNED'
  where id=p_request_id;

  return v_assignment;
end;
$$;

-- Clinic owner/member can decline an offer. The next eligible clinic is then selected.
create or replace function public.decline_patient_lead_assignment(p_assignment_id uuid, p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  a public.patient_lead_assignments%rowtype;
  v_next uuid;
begin
  select * into a from public.patient_lead_assignments
  where id=p_assignment_id for update;

  if a.id is null or not public.is_clinic_member(a.clinic_id) then
    raise exception 'Assignment not found or access denied.';
  end if;
  if a.status <> 'ASSIGNED' then
    raise exception 'Only an unaccepted offer can be declined.';
  end if;

  update public.patient_lead_assignments
  set status='DECLINED',declined_at=now(),lost_reason=left(coalesce(p_reason,'Declined by clinic'),500)
  where id=p_assignment_id;

  update public.lead_ai_actions set status='COMPLETED',completed_at=now()
  where assignment_id=p_assignment_id and status='PENDING';

  update public.patient_requests set status='OPEN',clinic_id=null
  where id=a.patient_request_id;

  v_next := public.assign_patient_request_to_best_dentist(a.patient_request_id);
  return v_next;
end;
$$;

-- Scheduler entry point: call every minute from Supabase Cron/pg_cron or a trusted
-- scheduled Edge Function. Expired offers are advanced sequentially.
create or replace function public.advance_expired_patient_lead_offers()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  item record;
  v_count integer := 0;
begin
  for item in
    select id,patient_request_id
    from public.patient_lead_assignments
    where status='ASSIGNED'
      and coalesce(response_due_at,first_contact_due_at) <= now()
    order by coalesce(response_due_at,first_contact_due_at)
    for update skip locked
  loop
    update public.patient_lead_assignments
    set status='EXPIRED',expired_at=now(),lost_reason='No response within 10-minute offer window'
    where id=item.id and status='ASSIGNED';

    if found then
      update public.lead_ai_actions set status='COMPLETED',completed_at=now()
      where assignment_id=item.id and status='PENDING';
      update public.patient_requests set status='OPEN',clinic_id=null
      where id=item.patient_request_id;
      perform public.assign_patient_request_to_best_dentist(item.patient_request_id);
      v_count := v_count+1;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.advance_expired_patient_lead_offers() from public, anon, authenticated;
grant execute on function public.advance_expired_patient_lead_offers() to service_role;

revoke all on function public.decline_patient_lead_assignment(uuid,text) from public, anon;
grant execute on function public.decline_patient_lead_assignment(uuid,text) to authenticated;

grant execute on function public.distance_km(numeric,numeric,numeric,numeric) to authenticated;

comment on function public.assign_patient_request_to_best_dentist(uuid) is
  'Offers a consented patient enquiry to one highest-ranked active dentist at a subscribed clinic within 10 km; repeated calls do not create concurrent offers.';
comment on function public.advance_expired_patient_lead_offers() is
  'Trusted scheduler: expire unanswered 10-minute offers and advance to the next eligible clinic.';


-- Browser geolocation hand-off: only an enquiry with recorded contact consent can
-- attach the patient's approximate coordinates and start the 10 km allocation.
create or replace function public.finalize_patient_request_location(
  p_intent_id uuid,
  p_latitude numeric,
  p_longitude numeric
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request uuid;
  v_assignment uuid;
begin
  if p_latitude is null or p_longitude is null
     or p_latitude < -90 or p_latitude > 90
     or p_longitude < -180 or p_longitude > 180 then
    raise exception 'Valid latitude and longitude are required.';
  end if;

  select patient_request_id into v_request
  from public.patient_search_intents
  where id=p_intent_id and consent_to_contact=true;

  if v_request is null then
    raise exception 'Consent-backed patient enquiry not found.';
  end if;

  update public.patient_requests
  set latitude=p_latitude,longitude=p_longitude,
      contact_consent=true,consent_captured_at=coalesce(consent_captured_at,now())
  where id=v_request;

  v_assignment := public.assign_patient_request_to_best_dentist(v_request);
  return v_assignment;
end;
$$;

revoke all on function public.finalize_patient_request_location(uuid,numeric,numeric) from public;
grant execute on function public.finalize_patient_request_location(uuid,numeric,numeric) to anon,authenticated;
