alter table public.automation_runs add column if not exists opportunities_created integer not null default 0;

-- DentalCare Phase 9B: Periodic Intelligence Scan + Diagnostics
-- Run after phase9_automation.sql.

create or replace function public.scan_clinic_intelligence(p_clinic_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_opportunities_before integer;
  v_opportunities_after integer;
  v_followups_before integer;
  v_followups_after integer;
  v_created_opportunities integer;
  v_created_actions integer;
  v_leads integer;
  v_patients integer;
  v_appointments integer;
  v_due_recalls integer;
  v_dormant integer;
  v_open_leads integer;
  v_missed integer;
begin
  if not public.is_clinic_member(p_clinic_id) then
    raise exception 'Not authorized.';
  end if;

  select count(*) into v_opportunities_before
  from public.opportunities where clinic_id=p_clinic_id and status='OPEN';

  select count(*) into v_followups_before
  from public.followups where clinic_id=p_clinic_id and status='PENDING';

  select count(*) into v_leads from public.leads where clinic_id=p_clinic_id;
  select count(*) into v_patients from public.patients where clinic_id=p_clinic_id;
  select count(*) into v_appointments from public.appointments where clinic_id=p_clinic_id;

  select count(*) into v_due_recalls
  from public.patients
  where clinic_id=p_clinic_id and next_recall_at is not null and next_recall_at <= now();

  select count(*) into v_dormant
  from public.patients
  where clinic_id=p_clinic_id and last_visit_at is not null and last_visit_at <= now()-interval '180 days';

  select count(*) into v_open_leads
  from public.leads
  where clinic_id=p_clinic_id and status in ('NEW','CONTACTED','QUALIFIED');

  select count(*) into v_missed
  from public.appointments
  where clinic_id=p_clinic_id and status in ('NO_SHOW','CANCELLED')
    and scheduled_at >= now()-interval '30 days';

  perform public.install_default_automation_rules(p_clinic_id);
  perform public.generate_clinic_opportunities(p_clinic_id);

  -- Create safe operational actions from the newly/currently open opportunities.
  insert into public.followups(clinic_id,patient_id,opportunity_id,channel,scheduled_for,status,message_template)
  select o.clinic_id,o.patient_id,o.id,'WHATSAPP',now(),'PENDING',
         'Your dental recall is due. Would you like us to arrange your next visit?'
  from public.opportunities o
  where o.clinic_id=p_clinic_id and o.type='RECALL_DUE' and o.status='OPEN'
    and o.patient_id is not null
    and not exists(select 1 from public.followups f where f.opportunity_id=o.id and f.status in ('PENDING','SENT'));

  insert into public.followups(clinic_id,lead_id,opportunity_id,channel,scheduled_for,status,message_template)
  select o.clinic_id,o.lead_id,o.id,'WHATSAPP',now(),'PENDING',
         'Thanks for contacting our clinic. We can help with your dental enquiry. Would you like to choose an appointment time?'
  from public.opportunities o
  where o.clinic_id=p_clinic_id and o.type='HIGH_INTENT_LEAD'
    and o.score>=80 and o.status='OPEN' and o.lead_id is not null
    and not exists(select 1 from public.followups f where f.opportunity_id=o.id and f.status in ('PENDING','SENT'));

  insert into public.followups(clinic_id,patient_id,opportunity_id,channel,scheduled_for,status,message_template)
  select o.clinic_id,o.patient_id,o.id,'WHATSAPP',now(),'PENDING',
         case when o.type='DORMANT_PATIENT'
           then 'We have not seen you for a while. Would you like us to arrange your next dental visit?'
           else 'Your dental appointment needs attention. Would you like us to help arrange a new time?'
         end
  from public.opportunities o
  where o.clinic_id=p_clinic_id
    and o.type in ('DORMANT_PATIENT','NO_SHOW','CANCELLATION')
    and o.status='OPEN' and o.patient_id is not null
    and not exists(select 1 from public.followups f where f.opportunity_id=o.id and f.status in ('PENDING','SENT'));

  select count(*) into v_opportunities_after
  from public.opportunities where clinic_id=p_clinic_id and status='OPEN';

  select count(*) into v_followups_after
  from public.followups where clinic_id=p_clinic_id and status='PENDING';

  v_created_opportunities := greatest(v_opportunities_after-v_opportunities_before,0);
  v_created_actions := greatest(v_followups_after-v_followups_before,0);

  perform public.log_automation_event(
    p_clinic_id,'INTELLIGENCE_SCAN',null,null,
    jsonb_build_object(
      'leads',v_leads,'patients',v_patients,'appointments',v_appointments,
      'open_leads',v_open_leads,'due_recalls',v_due_recalls,
      'dormant_patients',v_dormant,'missed_appointments',v_missed,
      'new_opportunities',v_created_opportunities,'new_actions',v_created_actions
    ),
    'INTELLIGENCE_SCAN'
  );

  return jsonb_build_object(
    'status','COMPLETED',
    'leads',v_leads,
    'patients',v_patients,
    'appointments',v_appointments,
    'open_leads',v_open_leads,
    'due_recalls',v_due_recalls,
    'dormant_patients',v_dormant,
    'missed_appointments',v_missed,
    'new_opportunities',v_created_opportunities,
    'new_actions',v_created_actions
  );
end $$;

grant execute on function public.scan_clinic_intelligence(uuid) to authenticated;

-- Replace the manual/periodic automation pass so it always performs a full scan.
create or replace function public.run_clinic_automation(p_clinic_id uuid)
returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_run uuid;
  v_scan jsonb;
  v_events integer := 0;
begin
  if not public.is_clinic_member(p_clinic_id) then raise exception 'Not authorized.'; end if;

  insert into public.automation_runs(clinic_id,status)
  values(p_clinic_id,'RUNNING') returning id into v_run;

  v_scan := public.scan_clinic_intelligence(p_clinic_id);

  select count(*) into v_events
  from public.automation_events
  where clinic_id=p_clinic_id and created_at >= (
    select started_at from public.automation_runs where id=v_run
  );

  update public.automation_runs
  set completed_at=now(),
      status='COMPLETED',
      events_processed=v_events,
      actions_created=coalesce((v_scan->>'new_actions')::integer,0),
      opportunities_created=coalesce((v_scan->>'new_opportunities')::integer,0)
  where id=v_run;

  return jsonb_build_object(
    'run_id',v_run,
    'status','COMPLETED',
    'events_processed',v_events,
    'actions_created',coalesce((v_scan->>'new_actions')::integer,0),
    'opportunities_created',coalesce((v_scan->>'new_opportunities')::integer,0),
    'scan',v_scan
  );
exception when others then
  if v_run is not null then
    update public.automation_runs set completed_at=now(),status='FAILED',error_message=sqlerrm where id=v_run;
  end if;
  raise;
end $$;

grant execute on function public.run_clinic_automation(uuid) to authenticated;

create or replace function public.get_automation_diagnostics(p_clinic_id uuid)
returns jsonb
language sql security definer set search_path=public as $$
  select jsonb_build_object(
    'leads',(select count(*) from public.leads where clinic_id=p_clinic_id),
    'patients',(select count(*) from public.patients where clinic_id=p_clinic_id),
    'appointments',(select count(*) from public.appointments where clinic_id=p_clinic_id),
    'open_leads',(select count(*) from public.leads where clinic_id=p_clinic_id and status in ('NEW','CONTACTED','QUALIFIED')),
    'due_recalls',(select count(*) from public.patients where clinic_id=p_clinic_id and next_recall_at is not null and next_recall_at<=now()),
    'dormant_patients',(select count(*) from public.patients where clinic_id=p_clinic_id and last_visit_at is not null and last_visit_at<=now()-interval '180 days'),
    'recent_missed_appointments',(select count(*) from public.appointments where clinic_id=p_clinic_id and status in ('NO_SHOW','CANCELLED') and scheduled_at>=now()-interval '30 days'),
    'open_opportunities',(select count(*) from public.opportunities where clinic_id=p_clinic_id and status='OPEN'),
    'pending_actions',(select count(*) from public.followups where clinic_id=p_clinic_id and status='PENDING'),
    'last_scan',(select max(created_at) from public.automation_events where clinic_id=p_clinic_id and event_type='INTELLIGENCE_SCAN')
  );
$$;

grant execute on function public.get_automation_diagnostics(uuid) to authenticated;
