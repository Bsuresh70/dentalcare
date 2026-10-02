-- DentalGrowth AI Phase 5: appointments, follow-ups and revenue attribution
-- Run after supabase/schema.sql in Supabase SQL Editor.

alter table public.followups add column if not exists created_at timestamptz not null default now();
alter table public.followups add column if not exists sent_at timestamptz;
alter table public.followups add column if not exists completed_at timestamptz;
alter table public.followups add column if not exists attempts integer not null default 0;
alter table public.followups add column if not exists last_error text;

create index if not exists idx_followups_patient on public.followups(patient_id, scheduled_for);
create index if not exists idx_appointments_patient on public.appointments(patient_id, scheduled_at);

create or replace function public.sync_completed_appointment()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare delta numeric := 0;
begin
  if NEW.status = 'COMPLETED' and coalesce(OLD.status,'') <> 'COMPLETED' then
    delta := coalesce(NEW.estimated_value,0);
    if NEW.patient_id is not null then
      update public.patients
      set total_revenue = total_revenue + delta,
          last_visit_at = NEW.scheduled_at
      where id = NEW.patient_id;
    end if;
  elsif NEW.status = 'COMPLETED' and OLD.status = 'COMPLETED'
        and coalesce(NEW.estimated_value,0) <> coalesce(OLD.estimated_value,0)
        and NEW.patient_id is not null then
    delta := coalesce(NEW.estimated_value,0) - coalesce(OLD.estimated_value,0);
    update public.patients
    set total_revenue = greatest(0,total_revenue + delta)
    where id = NEW.patient_id;
  elsif OLD.status = 'COMPLETED' and NEW.status <> 'COMPLETED'
        and NEW.patient_id is not null then
    update public.patients
    set total_revenue = greatest(0,total_revenue - coalesce(OLD.estimated_value,0))
    where id = NEW.patient_id;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_sync_completed_appointment on public.appointments;
create trigger trg_sync_completed_appointment
after insert or update of status, estimated_value, patient_id on public.appointments
for each row execute function public.sync_completed_appointment();

create or replace function public.convert_opportunity(
  p_opportunity_id uuid,
  p_revenue numeric default 0
)
returns public.opportunities
language plpgsql
security definer
set search_path=public
as $$
declare result public.opportunities;
begin
  if not exists (
    select 1 from public.opportunities o
    where o.id=p_opportunity_id and public.is_clinic_member(o.clinic_id)
  ) then
    raise exception 'Opportunity not found or access denied';
  end if;

  update public.opportunities
  set status='CONVERTED',
      converted_revenue=greatest(coalesce(p_revenue,0),0)
  where id=p_opportunity_id
  returning * into result;

  return result;
end;
$$;

create or replace function public.create_followup_from_appointment(
  p_appointment_id uuid,
  p_channel text default 'WHATSAPP'
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare a public.appointments;
declare new_id uuid;
declare patient_name text;
begin
  select * into a from public.appointments where id=p_appointment_id;
  if a.id is null or not public.is_clinic_member(a.clinic_id) then
    raise exception 'Appointment not found or access denied';
  end if;

  select full_name into patient_name from public.patients where id=a.patient_id;

  insert into public.followups(
    clinic_id, patient_id, opportunity_id, channel, scheduled_for, status, message_template
  )
  values(
    a.clinic_id,
    a.patient_id,
    null,
    upper(coalesce(p_channel,'WHATSAPP')),
    now(),
    'PENDING',
    case
      when a.status='NO_SHOW' then 'Hello '||coalesce(patient_name,'')||', we missed you at your dental appointment. We would be happy to help you reschedule. Please reply with a convenient day and time.'
      when a.status='CANCELLED' then 'Hello '||coalesce(patient_name,'')||', we noticed your dental appointment was cancelled. If you would like to reschedule, please reply with a convenient day and time.'
      else 'Hello '||coalesce(patient_name,'')||', this is a friendly follow-up from our dental clinic. Please let us know if you need any assistance.'
    end
  )
  returning id into new_id;

  return new_id;
end;
$$;

create or replace function public.mark_followup_status(
  p_followup_id uuid,
  p_status text
)
returns public.followups
language plpgsql
security definer
set search_path=public
as $$
declare result public.followups;
begin
  if not exists (
    select 1 from public.followups f
    where f.id=p_followup_id and public.is_clinic_member(f.clinic_id)
  ) then
    raise exception 'Follow-up not found or access denied';
  end if;

  update public.followups
  set status=upper(p_status),
      attempts=case when upper(p_status)='SENT' then attempts+1 else attempts end,
      sent_at=case when upper(p_status)='SENT' then now() else sent_at end,
      completed_at=case when upper(p_status) in ('COMPLETED','CANCELLED') then now() else completed_at end
  where id=p_followup_id
  returning * into result;

  return result;
end;
$$;

grant execute on function public.convert_opportunity(uuid,numeric) to authenticated;
grant execute on function public.create_followup_from_appointment(uuid,text) to authenticated;
grant execute on function public.mark_followup_status(uuid,text) to authenticated;


-- Clinic onboarding: atomically create a clinic and make the signed-in user its owner.
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

  return v_clinic;
end;
$$;

grant execute on function public.create_clinic_for_current_user(text,text) to authenticated;
