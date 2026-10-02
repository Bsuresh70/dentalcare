-- DentalConnect test cleanup
-- Removes duplicate PENDING appointment requests while keeping the earliest one.

with ranked as (
  select
    id,
    row_number() over (
      partition by patient_request_id, clinic_id, dentist_id, service_id
      order by created_at asc
    ) as rn
  from public.appointment_requests
  where status='PENDING'
)
delete from public.appointment_requests ar
using ranked r
where ar.id=r.id
  and r.rn>1;
