-- DentalCare hotfix: connect AI patient leads to the clinic patient register.
-- Run once in Supabase SQL Editor. Safe to re-run.

alter table public.patient_lead_assignments
  add column if not exists patient_id uuid references public.patients(id) on delete set null;

create index if not exists idx_patient_lead_assignments_patient
  on public.patient_lead_assignments(patient_id);

create or replace function public.book_patient_lead_assignment(p_assignment_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_assignment public.patient_lead_assignments;
  v_request public.patient_requests;
  v_patient_id uuid;
  v_phone_digits text;
begin
  select * into v_assignment
  from public.patient_lead_assignments
  where id = p_assignment_id
  for update;

  if v_assignment.id is null
     or not public.is_clinic_member(v_assignment.clinic_id) then
    raise exception 'Patient enquiry not found or access denied.';
  end if;

  -- Idempotency: repeated clicks reuse the same linked patient.
  if v_assignment.patient_id is not null then
    update public.patient_lead_assignments
      set status = 'BOOKED',
          appointment_at = coalesce(appointment_at, now())
    where id = p_assignment_id;
    return v_assignment.patient_id;
  end if;

  select * into v_request
  from public.patient_requests
  where id = v_assignment.patient_request_id;

  if v_request.id is null then
    raise exception 'The original patient enquiry could not be found.';
  end if;

  v_phone_digits := regexp_replace(coalesce(v_request.phone, ''), '[^0-9]', '', 'g');

  -- Reuse an existing patient in this clinic with the same normalized phone.
  if v_phone_digits <> '' then
    select p.id into v_patient_id
    from public.patients p
    where p.clinic_id = v_assignment.clinic_id
      and regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g') = v_phone_digits
    order by p.created_at asc
    limit 1;
  end if;

  if v_patient_id is null then
    insert into public.patients(
      clinic_id, full_name, phone, total_revenue, notes
    )
    values (
      v_assignment.clinic_id,
      coalesce(nullif(trim(v_request.name), ''), 'DentalCare patient'),
      nullif(trim(coalesce(v_request.phone, '')), ''),
      0,
      'Created from a DentalCare AI patient enquiry. Treatment requested: '
        || coalesce(v_request.treatment, 'Dental care')
        || '. This record does not imply treatment was completed or revenue received.'
    )
    returning id into v_patient_id;
  end if;

  update public.patient_lead_assignments
  set patient_id = v_patient_id,
      status = 'BOOKED',
      appointment_at = coalesce(appointment_at, now())
  where id = p_assignment_id;

  update public.lead_ai_actions
  set status = 'COMPLETED',
      completed_at = now()
  where assignment_id = p_assignment_id
    and status = 'PENDING';

  return v_patient_id;
end;
$$;

grant execute on function public.book_patient_lead_assignment(uuid) to authenticated;
