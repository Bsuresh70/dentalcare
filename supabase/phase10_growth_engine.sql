-- DentalCare Phase 10: AI Patient Growth Engine
-- Patient is free. Only registered, subscribed DentalCare clinics can receive assigned enquiries.
-- Safe to run after the existing Phase 7/8/9 SQL.

alter table public.patient_requests add column if not exists intent_score integer not null default 0 check(intent_score between 0 and 100);
alter table public.patient_requests add column if not exists source text default 'ORGANIC';

create table if not exists public.clinic_subscriptions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null unique references public.clinics(id) on delete cascade,
  plan text not null default 'TRIAL',
  status text not null default 'TRIAL',
  monthly_price numeric(12,2) not null default 0,
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz,
  provider text,
  external_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_clinic_subscriptions_status
on public.clinic_subscriptions(status, current_period_end);

alter table public.clinic_subscriptions enable row level security;
drop policy if exists clinic_subscriptions_member on public.clinic_subscriptions;
create policy clinic_subscriptions_member
on public.clinic_subscriptions for select
using (public.is_clinic_member(clinic_id));

create table if not exists public.patient_lead_assignments (
  id uuid primary key default gen_random_uuid(),
  patient_request_id uuid not null references public.patient_requests(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  dentist_id uuid references public.dentists(id) on delete set null,
  service_id uuid references public.services(id) on delete set null,
  assignment_score integer not null default 0 check(assignment_score between 0 and 100),
  status text not null default 'ASSIGNED',
  assigned_at timestamptz not null default now(),
  first_contact_due_at timestamptz,
  first_contact_at timestamptz,
  appointment_at timestamptz,
  converted_at timestamptz,
  converted_revenue numeric(12,2),
  lost_reason text,
  created_at timestamptz not null default now()
);

create unique index if not exists ux_patient_lead_assignment_request_clinic
on public.patient_lead_assignments(patient_request_id, clinic_id);

create index if not exists idx_patient_lead_assignments_clinic_status
on public.patient_lead_assignments(clinic_id,status,assigned_at desc);

create table if not exists public.lead_ai_actions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.patient_lead_assignments(id) on delete cascade,
  action_type text not null,
  priority text not null default 'MEDIUM',
  reason text,
  suggested_message text,
  scheduled_for timestamptz,
  status text not null default 'PENDING',
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_lead_ai_actions_assignment
on public.lead_ai_actions(assignment_id,status,scheduled_for);

alter table public.patient_lead_assignments enable row level security;
alter table public.lead_ai_actions enable row level security;

drop policy if exists patient_lead_assignments_member on public.patient_lead_assignments;
create policy patient_lead_assignments_member
on public.patient_lead_assignments for all
using (public.is_clinic_member(clinic_id))
with check (public.is_clinic_member(clinic_id));

drop policy if exists lead_ai_actions_member on public.lead_ai_actions;
create policy lead_ai_actions_member
on public.lead_ai_actions for all
using (exists(
  select 1 from public.patient_lead_assignments a
  where a.id=assignment_id and public.is_clinic_member(a.clinic_id)
))
with check (exists(
  select 1 from public.patient_lead_assignments a
  where a.id=assignment_id and public.is_clinic_member(a.clinic_id)
));

-- Recreate onboarding so every new clinic starts with a free trial.
create or replace function public.create_clinic_for_current_user(
  p_name text,
  p_phone text default null
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user uuid := auth.uid();
  v_clinic uuid;
begin
  if v_user is null then
    raise exception 'You must be signed in to create a clinic.';
  end if;

  if exists(select 1 from public.clinic_users where user_id=v_user) then
    raise exception 'Your account is already linked to a clinic.';
  end if;

  insert into public.clinics(name, phone)
  values(trim(p_name), nullif(trim(coalesce(p_phone,'')), ''))
  returning id into v_clinic;

  insert into public.profiles(id, full_name)
  values(v_user, coalesce(split_part((select email from auth.users where id=v_user),'@',1),'Clinic Owner'))
  on conflict (id) do nothing;

  insert into public.clinic_users(clinic_id,user_id,role)
  values(v_clinic,v_user,'CLINIC_OWNER');

  insert into public.clinic_subscriptions(
    clinic_id,plan,status,monthly_price,current_period_start,current_period_end
  )
  values(
    v_clinic,'TRIAL','TRIAL',0,now(),now()+interval '30 days'
  )
  on conflict (clinic_id) do nothing;

  return v_clinic;
end;
$$;

grant execute on function public.create_clinic_for_current_user(text,text) to authenticated;

-- Existing clinics can safely receive a trial record once, without changing paid status.
create or replace function public.ensure_clinic_trial_subscription(p_clinic_id uuid)
returns public.clinic_subscriptions
language plpgsql
security definer
set search_path=public
as $$
declare r public.clinic_subscriptions;
begin
  if not public.is_clinic_admin(p_clinic_id) then
    raise exception 'Only the clinic owner can initialize the subscription.';
  end if;

  insert into public.clinic_subscriptions(
    clinic_id,plan,status,monthly_price,current_period_start,current_period_end
  )
  values(p_clinic_id,'TRIAL','TRIAL',0,now(),now()+interval '30 days')
  on conflict (clinic_id) do nothing;

  select * into r from public.clinic_subscriptions where clinic_id=p_clinic_id;
  return r;
end;
$$;

grant execute on function public.ensure_clinic_trial_subscription(uuid) to authenticated;

-- Automatic assignment: only active/trial/paid DentalCare clinics qualify.
-- Among eligible dentists, treatment, city, availability and budget determine the score.
create or replace function public.assign_patient_request_to_best_dentist(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_assignment uuid;
begin
  if exists(select 1 from public.patient_lead_assignments where patient_request_id=p_request_id) then
    select id into v_assignment
    from public.patient_lead_assignments
    where patient_request_id=p_request_id
    order by assigned_at asc
    limit 1;
    return v_assignment;
  end if;

  with req as (
    select * from public.patient_requests where id=p_request_id
  ),
  candidates as (
    select
      d.id as dentist_id,
      c.id as clinic_id,
      s.id as service_id,
      (
        (case when lower(coalesce(s.name,'')) like '%'||lower(r.treatment)||'%' then 40 else 0 end) +
        (case when lower(coalesce(s.category,'')) like '%'||lower(r.treatment)||'%' then 25 else 0 end) +
        (case when lower(coalesce(d.specialty,'')) like '%'||lower(r.treatment)||'%' then 25 else 0 end) +
        (case when r.city is null or c.city is null or lower(c.city)=lower(r.city) then 10 else 0 end) +
        (case when r.budget_max is null or s.default_price is null or s.default_price<=r.budget_max then 5 else 0 end)
      )::integer as score
    from public.patient_requests r
    join public.dentists d on d.active=true
    join public.clinics c on c.id=d.clinic_id
    join public.services s on s.clinic_id=c.id and s.active=true
    join public.clinic_subscriptions cs on cs.clinic_id=c.id
      and cs.status in ('TRIAL','ACTIVE')
      and (cs.current_period_end is null or cs.current_period_end>=now())
    where r.id=p_request_id
      and (r.city is null or c.city is null or lower(c.city)=lower(r.city))
  ),
  winner as (
    select * from candidates order by score desc limit 1
  )
  insert into public.patient_lead_assignments(
    patient_request_id,clinic_id,dentist_id,service_id,
    assignment_score,status,first_contact_due_at
  )
  select p_request_id,clinic_id,dentist_id,service_id,least(score,100),'ASSIGNED',
         now()+interval '10 minutes'
  from winner
  returning id into v_assignment;

  if v_assignment is not null then
    insert into public.lead_ai_actions(
      assignment_id,action_type,priority,reason,suggested_message,scheduled_for
    )
    select
      v_assignment,
      'CONTACT_PATIENT',
      case when pr.urgency in ('TODAY','ASAP') or pr.intent_score>=90 then 'HIGH' else 'MEDIUM' end,
      'New patient enquiry requires rapid human contact. AI has prioritized treatment, urgency and intent.',
      'Hello '||coalesce(pr.name,'')||', this is the dental clinic team. We received your enquiry regarding '||coalesce(pr.treatment,'dental care')||'. We would be happy to help with the next available consultation. Please let us know a convenient time.',
      now()
    from public.patient_requests pr
    left join public.patient_search_intents psi on psi.patient_request_id=pr.id
    where pr.id=p_request_id;

    update public.patient_requests
    set clinic_id=(select clinic_id from public.patient_lead_assignments where id=v_assignment),
        status='ASSIGNED'
    where id=p_request_id;
  end if;

  return v_assignment;
end;
$$;

grant execute on function public.assign_patient_request_to_best_dentist(uuid) to anon,authenticated;

-- Ensure captured AI demand immediately enters the assignment engine.
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
      trim(p_name),trim(p_phone),trim(p_detected_treatment),trim(p_search_query),
      coalesce(nullif(trim(p_detected_urgency),''),'FLEXIBLE'),
      nullif(trim(coalesce(p_city,'')),''),
      nullif(trim(coalesce(p_pincode,'')),''),
      null,p_budget_max,null,null,'BALANCED'
    );
  end if;

  insert into public.patient_search_intents(
    patient_request_id,name,phone,search_query,detected_treatment,detected_urgency,
    city,pincode,budget_max,intent_score,source,landing_page,consent_to_contact
  )
  values(
    v_request,nullif(trim(coalesce(p_name,'')),''),
    nullif(trim(coalesce(p_phone,'')),''),trim(p_search_query),
    nullif(trim(coalesce(p_detected_treatment,'')),''),
    coalesce(nullif(trim(p_detected_urgency),''),'FLEXIBLE'),
    nullif(trim(coalesce(p_city,'')),''),
    nullif(trim(coalesce(p_pincode,'')),''),
    p_budget_max,greatest(0,least(coalesce(p_intent_score,0),100)),
    coalesce(nullif(trim(p_source),''),'ORGANIC'),p_landing_page,
    coalesce(p_consent_to_contact,false)
  )
  returning id into v_id;

  if v_request is not null then
    update public.patient_requests set intent_score=greatest(0,least(coalesce(p_intent_score,0),100)), source=coalesce(nullif(trim(p_source),''),'ORGANIC') where id=v_request;
    perform public.assign_patient_request_to_best_dentist(v_request);
  end if;

  return v_id;
end;
$$;

grant execute on function public.capture_patient_search_intent(
  text,text,text,text,text,text,text,numeric,integer,text,text,boolean
) to anon,authenticated;

-- Operational conversion updates.
create or replace function public.update_patient_lead_assignment(
  p_assignment_id uuid,
  p_status text,
  p_revenue numeric default null
) returns public.patient_lead_assignments
language plpgsql
security definer
set search_path=public
as $$
declare r public.patient_lead_assignments;
begin
  select * into r from public.patient_lead_assignments
  where id=p_assignment_id
  and public.is_clinic_member(clinic_id)
  for update;

  if r.id is null then raise exception 'Assignment not found or access denied.'; end if;

  update public.patient_lead_assignments
  set status=upper(p_status),
      first_contact_at=case when upper(p_status)='CONTACTED' and first_contact_at is null then now() else first_contact_at end,
      appointment_at=case when upper(p_status)='BOOKED' then now() else appointment_at end,
      converted_at=case when upper(p_status)='CONVERTED' then now() else converted_at end,
      converted_revenue=case when upper(p_status)='CONVERTED' then greatest(coalesce(p_revenue,0),0) else converted_revenue end
  where id=p_assignment_id
  returning * into r;

  update public.lead_ai_actions
  set status='COMPLETED',completed_at=now()
  where assignment_id=p_assignment_id and status='PENDING'
    and upper(p_status) in ('CONTACTED','BOOKED','CONVERTED');

  return r;
end;
$$;

grant execute on function public.update_patient_lead_assignment(uuid,text,numeric) to authenticated;

create or replace function public.get_growth_summary(p_clinic_id uuid)
returns table(
  assigned_leads bigint,
  hot_leads bigint,
  appointments bigint,
  converted_patients bigint,
  converted_revenue numeric,
  pending_ai_actions bigint
)
language sql
security definer
set search_path=public
as $$
  select
    count(*)::bigint,
    count(*) filter (where assignment_score>=85 and status in ('ASSIGNED','CONTACTED'))::bigint,
    count(*) filter (where status='BOOKED')::bigint,
    count(*) filter (where status='CONVERTED')::bigint,
    coalesce(sum(converted_revenue) filter (where status='CONVERTED'),0),
    (select count(*) from public.lead_ai_actions a join public.patient_lead_assignments x on x.id=a.assignment_id
      where x.clinic_id=p_clinic_id and a.status='PENDING')
  from public.patient_lead_assignments
  where clinic_id=p_clinic_id;
$$;

grant execute on function public.get_growth_summary(uuid) to authenticated;
