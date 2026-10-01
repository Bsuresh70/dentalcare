-- DentalGrowth AI: deterministic Revenue Opportunity Engine
-- Run after schema.sql. Safe to re-run.

create or replace function public.generate_clinic_opportunities(p_clinic_id uuid)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  created_count integer := 0;
begin
  -- New/high-intent leads that have not converted or been booked.
  insert into public.opportunities
    (clinic_id, lead_id, type, score, potential_value, title, detail, recommended_action)
  select l.clinic_id, l.id, 'HIGH_INTENT_LEAD',
         public.calculate_opportunity_score('HIGH_INTENT_LEAD', extract(day from now()-l.created_at)::integer, l.estimated_value),
         l.estimated_value,
         'High-intent lead needs contact',
         coalesce(l.enquiry,'Lead has not yet converted to an appointment.'),
         case when l.phone is not null then 'CONTACT' else 'REVIEW' end
  from public.leads l
  where l.clinic_id=p_clinic_id
    and l.status in ('NEW','CONTACTED','QUALIFIED')
    and l.created_at >= now()-interval '30 days'
    and not exists (
      select 1 from public.opportunities o
      where o.lead_id=l.id and o.type='HIGH_INTENT_LEAD' and o.status in ('OPEN','IN_PROGRESS')
    );

  -- Patients whose next recall date has arrived.
  insert into public.opportunities
    (clinic_id, patient_id, type, score, potential_value, title, detail, recommended_action, due_at)
  select p.clinic_id, p.id, 'RECALL_DUE',
         public.calculate_opportunity_score('RECALL_DUE', greatest(extract(day from now()-p.next_recall_at),0)::integer, 2500),
         2500,
         'Recall is due',
         'Patient is due for a preventive/recall visit.',
         case when p.phone is not null then 'WHATSAPP' else 'REVIEW' end,
         p.next_recall_at
  from public.patients p
  where p.clinic_id=p_clinic_id
    and p.next_recall_at is not null
    and p.next_recall_at <= now()
    and not exists (
      select 1 from public.opportunities o
      where o.patient_id=p.id and o.type='RECALL_DUE' and o.status in ('OPEN','IN_PROGRESS')
    );

  -- Dormant patients: no visit for at least 180 days.
  insert into public.opportunities
    (clinic_id, patient_id, type, score, potential_value, title, detail, recommended_action)
  select p.clinic_id, p.id, 'DORMANT_PATIENT',
         public.calculate_opportunity_score('DORMANT_PATIENT', extract(day from now()-p.last_visit_at)::integer, 6000),
         6000,
         'Dormant patient',
         'No recorded visit in the last 180 days.',
         case when p.phone is not null then 'WHATSAPP' else 'REVIEW' end
  from public.patients p
  where p.clinic_id=p_clinic_id
    and p.last_visit_at is not null
    and p.last_visit_at <= now()-interval '180 days'
    and not exists (
      select 1 from public.opportunities o
      where o.patient_id=p.id and o.type='DORMANT_PATIENT' and o.status in ('OPEN','IN_PROGRESS')
    );

  -- Appointments missed or cancelled in the recent past.
  insert into public.opportunities
    (clinic_id, patient_id, type, score, potential_value, title, detail, recommended_action, due_at)
  select a.clinic_id, a.patient_id,
         case when a.status='NO_SHOW' then 'NO_SHOW'::public.opportunity_type else 'CANCELLATION'::public.opportunity_type end,
         public.calculate_opportunity_score(case when a.status='NO_SHOW' then 'NO_SHOW'::public.opportunity_type else 'CANCELLATION'::public.opportunity_type end, extract(day from now()-a.scheduled_at)::integer, a.estimated_value),
         a.estimated_value,
         case when a.status='NO_SHOW' then 'No-show recovery' else 'Cancellation recovery' end,
         'Appointment requires recovery and rescheduling.',
         'RESCHEDULE',
         a.scheduled_at
  from public.appointments a
  where a.clinic_id=p_clinic_id
    and a.patient_id is not null
    and a.status in ('NO_SHOW','CANCELLED')
    and a.scheduled_at >= now()-interval '30 days'
    and not exists (
      select 1 from public.opportunities o
      where o.patient_id=a.patient_id
        and o.type=case when a.status='NO_SHOW' then 'NO_SHOW'::public.opportunity_type else 'CANCELLATION'::public.opportunity_type end
        and o.created_at >= a.scheduled_at
        and o.status in ('OPEN','IN_PROGRESS')
    );

  get diagnostics created_count = row_count;
  return created_count;
end;
$$;

-- Pending-treatment opportunities are intentionally data-driven.
-- When the treatment/clinical-plan module is added, it should insert these
-- opportunities with the actual estimated value instead of inventing value here.

revoke all on function public.generate_clinic_opportunities(uuid) from public;
grant execute on function public.generate_clinic_opportunities(uuid) to authenticated;
