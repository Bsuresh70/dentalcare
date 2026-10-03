-- DentalCare Phase 9: Autonomous Automation Engine
-- Event-driven foundation + safe clinic automation rules.

create table if not exists public.automation_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics(id) on delete cascade,
  event_type text not null,
  entity_type text,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  source text not null default 'SYSTEM',
  created_at timestamptz not null default now()
);

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics(id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'RUNNING',
  events_processed integer not null default 0,
  actions_created integer not null default 0,
  opportunities_created integer not null default 0,
  error_message text
);

create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics(id) on delete cascade,
  rule_key text not null,
  name text not null,
  description text,
  enabled boolean not null default true,
  action_channel text,
  created_at timestamptz not null default now(),
  unique(clinic_id,rule_key)
);

create index if not exists idx_automation_events_clinic_time
on public.automation_events(clinic_id,created_at desc);

create index if not exists idx_automation_events_entity
on public.automation_events(entity_type,entity_id);

create index if not exists idx_automation_runs_clinic_time
on public.automation_runs(clinic_id,started_at desc);

alter table public.automation_events enable row level security;
alter table public.automation_runs enable row level security;
alter table public.automation_rules enable row level security;

drop policy if exists automation_events_clinic on public.automation_events;
create policy automation_events_clinic on public.automation_events
for select using (clinic_id is not null and public.is_clinic_member(clinic_id));

drop policy if exists automation_runs_clinic on public.automation_runs;
create policy automation_runs_clinic on public.automation_runs
for select using (clinic_id is not null and public.is_clinic_member(clinic_id));

drop policy if exists automation_rules_clinic on public.automation_rules;
create policy automation_rules_clinic on public.automation_rules
for select using (clinic_id is not null and public.is_clinic_member(clinic_id));

create or replace function public.log_automation_event(
  p_clinic_id uuid,
  p_event_type text,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_source text default 'SYSTEM'
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare v_id uuid;
begin
  insert into public.automation_events(clinic_id,event_type,entity_type,entity_id,payload,source)
  values(p_clinic_id,p_event_type,p_entity_type,p_entity_id,coalesce(p_payload,'{}'::jsonb),coalesce(p_source,'SYSTEM'))
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.log_automation_event(uuid,text,text,uuid,jsonb,text) to authenticated;

-- Automatically record important business events.
create or replace function public.trg_log_lead_event()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.log_automation_event(
    new.clinic_id,
    case when tg_op='INSERT' then 'LEAD_CREATED' else 'LEAD_UPDATED' end,
    'LEAD',new.id,
    jsonb_build_object('status',new.status,'estimated_value',new.estimated_value,'source',new.source),
    'DATABASE'
  );
  return new;
end $$;

drop trigger if exists trg_automation_leads on public.leads;
create trigger trg_automation_leads after insert or update on public.leads
for each row execute function public.trg_log_lead_event();

create or replace function public.trg_log_appointment_event()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.log_automation_event(
    new.clinic_id,
    case
      when tg_op='INSERT' then 'APPOINTMENT_CREATED'
      when new.status='NO_SHOW' then 'APPOINTMENT_NO_SHOW'
      when new.status='CANCELLED' then 'APPOINTMENT_CANCELLED'
      when new.status='COMPLETED' then 'APPOINTMENT_COMPLETED'
      else 'APPOINTMENT_UPDATED'
    end,
    'APPOINTMENT',new.id,
    jsonb_build_object('patient_id',new.patient_id,'status',new.status,'scheduled_at',new.scheduled_at,'estimated_value',new.estimated_value),
    'DATABASE'
  );
  return new;
end $$;

drop trigger if exists trg_automation_appointments on public.appointments;
create trigger trg_automation_appointments after insert or update on public.appointments
for each row execute function public.trg_log_appointment_event();

create or replace function public.trg_log_patient_event()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.log_automation_event(
    new.clinic_id,
    case when tg_op='INSERT' then 'PATIENT_CREATED' else 'PATIENT_UPDATED' end,
    'PATIENT',new.id,
    jsonb_build_object('last_visit_at',new.last_visit_at,'next_recall_at',new.next_recall_at,'total_revenue',new.total_revenue),
    'DATABASE'
  );
  return new;
end $$;

drop trigger if exists trg_automation_patients on public.patients;
create trigger trg_automation_patients after insert or update on public.patients
for each row execute function public.trg_log_patient_event();

create or replace function public.trg_log_nri_event()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.log_automation_event(
    new.assigned_clinic_id,
    case when tg_op='INSERT' then 'NRI_CASE_CREATED' else 'NRI_CASE_UPDATED' end,
    'NRI_CASE',new.id,
    jsonb_build_object('status',new.status,'treatment_need',new.treatment_need,'lead_score',new.lead_score,'source',new.source),
    'DATABASE'
  );
  return new;
end $$;

drop trigger if exists trg_automation_nri on public.nri_dental_cases;
create trigger trg_automation_nri after insert or update on public.nri_dental_cases
for each row execute function public.trg_log_nri_event();

-- Install default rules for a clinic.
create or replace function public.install_default_automation_rules(p_clinic_id uuid)
returns void
language plpgsql security definer set search_path=public as $$
begin
  if not public.is_clinic_member(p_clinic_id) then raise exception 'Not authorized.'; end if;
  insert into public.automation_rules(clinic_id,rule_key,name,description,action_channel) values
    (p_clinic_id,'HOT_LEAD','Recover hot leads','Create a priority opportunity for qualified/high-intent leads','WHATSAPP'),
    (p_clinic_id,'NO_SHOW_RECOVERY','Recover no-shows','Prepare a rescheduling follow-up after a no-show','WHATSAPP'),
    (p_clinic_id,'CANCELLATION_RECOVERY','Recover cancellations','Prepare a rescheduling follow-up after a cancellation','WHATSAPP'),
    (p_clinic_id,'RECALL_DUE','Recall due patients','Create a recall opportunity and follow-up','WHATSAPP'),
    (p_clinic_id,'DORMANT_PATIENT','Reactivate dormant patients','Create a reactivation opportunity for patients inactive 180+ days','WHATSAPP'),
    (p_clinic_id,'NRI_HIGH_INTENT','Route NRI opportunities','Prioritize consented high-score NRI cases','WHATSAPP')
  on conflict (clinic_id,rule_key) do nothing;
end $$;

grant execute on function public.install_default_automation_rules(uuid) to authenticated;

-- Run the safe, idempotent clinic automation pass.
create or replace function public.run_clinic_automation(p_clinic_id uuid)
returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_run uuid;
  v_before integer;
  v_after integer;
  v_actions integer := 0;
  v_events integer := 0;
begin
  if not public.is_clinic_member(p_clinic_id) then raise exception 'Not authorized.'; end if;

  insert into public.automation_runs(clinic_id,status)
  values(p_clinic_id,'RUNNING') returning id into v_run;

  perform public.install_default_automation_rules(p_clinic_id);

  -- Generate the core opportunity set first.
  perform public.generate_clinic_opportunities(p_clinic_id);

  select count(*) into v_before from public.followups
  where clinic_id=p_clinic_id and status='PENDING';

  -- No-show/cancellation recovery. One pending action per appointment.
  insert into public.followups(clinic_id,patient_id,opportunity_id,channel,scheduled_for,status,message_template)
  select a.clinic_id,a.patient_id,o.id,'WHATSAPP',
         greatest(coalesce(a.scheduled_at,now()) + interval '30 minutes',now()),
         'PENDING',
         case when a.status='NO_SHOW'
           then 'We missed you today. Would you like us to help you choose a new appointment time?'
           else 'We noticed your appointment was cancelled. Would you like us to help you reschedule?'
         end
  from public.appointments a
  join public.opportunities o on o.clinic_id=a.clinic_id
    and o.patient_id=a.patient_id
    and o.type in ('NO_SHOW','CANCELLATION')
    and o.status='OPEN'
  where a.clinic_id=p_clinic_id
    and a.status in ('NO_SHOW','CANCELLED')
    and not exists (
      select 1 from public.followups f
      where f.clinic_id=a.clinic_id and f.opportunity_id=o.id
        and f.status in ('PENDING','SENT')
    );

  -- Recall actions for patients whose recall date has arrived.
  insert into public.followups(clinic_id,patient_id,opportunity_id,channel,scheduled_for,status,message_template)
  select o.clinic_id,o.patient_id,o.id,'WHATSAPP',now(),'PENDING',
         'Your dental recall is due. Would you like us to arrange your next visit?'
  from public.opportunities o
  where o.clinic_id=p_clinic_id
    and o.type='RECALL_DUE'
    and o.status='OPEN'
    and o.patient_id is not null
    and not exists (
      select 1 from public.followups f
      where f.clinic_id=o.clinic_id and f.opportunity_id=o.id
        and f.status in ('PENDING','SENT')
    );

  -- Hot lead actions.
  insert into public.followups(clinic_id,lead_id,opportunity_id,channel,scheduled_for,status,message_template)
  select o.clinic_id,o.lead_id,o.id,'WHATSAPP',now(),'PENDING',
         'Thanks for contacting our clinic. We can help you with your dental enquiry. Would you like to choose an appointment time?'
  from public.opportunities o
  where o.clinic_id=p_clinic_id
    and o.type='HIGH_INTENT_LEAD'
    and o.score>=80
    and o.status='OPEN'
    and o.lead_id is not null
    and not exists (
      select 1 from public.followups f
      where f.clinic_id=o.clinic_id and f.opportunity_id=o.id
        and f.status in ('PENDING','SENT')
    );

  select count(*) into v_after from public.followups
  where clinic_id=p_clinic_id and status='PENDING';
  v_actions := greatest(v_after-v_before,0);

  select count(*) into v_events from public.automation_events
  where clinic_id=p_clinic_id and created_at>=(
    select started_at from public.automation_runs where id=v_run
  );

  update public.automation_runs
  set completed_at=now(),status='COMPLETED',
      events_processed=v_events,actions_created=v_actions
  where id=v_run;

  return jsonb_build_object('run_id',v_run,'status','COMPLETED','events_processed',v_events,'actions_created',v_actions);
exception when others then
  if v_run is not null then
    update public.automation_runs set completed_at=now(),status='FAILED',error_message=sqlerrm where id=v_run;
  end if;
  raise;
end $$;

grant execute on function public.run_clinic_automation(uuid) to authenticated;

create or replace function public.get_automation_summary(p_clinic_id uuid)
returns jsonb
language sql security definer set search_path=public as $$
  select jsonb_build_object(
    'pending_actions',(select count(*) from public.followups where clinic_id=p_clinic_id and status='PENDING'),
    'open_opportunities',(select count(*) from public.opportunities where clinic_id=p_clinic_id and status='OPEN'),
    'opportunity_value',(select coalesce(sum(potential_value),0) from public.opportunities where clinic_id=p_clinic_id and status='OPEN'),
    'events_24h',(select count(*) from public.automation_events where clinic_id=p_clinic_id and created_at>=now()-interval '24 hours'),
    'last_run',(select max(completed_at) from public.automation_runs where clinic_id=p_clinic_id and status='COMPLETED')
  );
$$;

grant execute on function public.get_automation_summary(uuid) to authenticated;
