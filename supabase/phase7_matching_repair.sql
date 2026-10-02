-- DentalConnect Phase 7 repair
-- Run ONLY this SQL block to replace the faulty matching function.

create or replace function public.find_patient_matches(p_request_id uuid)
returns table(
  dentist_id uuid,
  dentist_name text,
  specialty text,
  clinic_id uuid,
  clinic_name text,
  city text,
  pincode text,
  service_id uuid,
  service_name text,
  price numeric,
  distance_km numeric,
  available boolean,
  specialty_match boolean,
  budget_fit boolean,
  match_score integer,
  earliest_slot timestamptz
)
language sql
security definer
set search_path=public
as $$
with req as (
  select
    pr.id,
    pr.treatment,
    pr.urgency,
    pr.preference_priority,
    pr.city,
    pr.pincode,
    pr.budget_min,
    pr.budget_max,
    pr.preferred_date
  from public.patient_requests pr
  where pr.id=p_request_id
),
candidates as (
  select
    d.id as dentist_id,
    d.name as dentist_name,
    d.specialty as specialty,
    c.id as clinic_id,
    c.name as clinic_name,
    c.city as city,
    c.pincode as pincode,
    s.id as service_id,
    s.name as service_name,
    s.default_price as price,
    case
      when r.pincode is not null and c.pincode=r.pincode then 0
      when r.city is not null and lower(c.city)=lower(r.city) then 5
      else 15
    end::numeric as distance_km,
    (
      not exists (
        select 1
        from public.appointments a
        where a.dentist_id=d.id
          and a.status in ('SCHEDULED','CONFIRMED')
          and r.preferred_date is not null
          and a.scheduled_at::date=r.preferred_date
      )
    ) as available,
    (
      lower(coalesce(s.name,'')) like '%'||lower(r.treatment)||'%'
      or lower(coalesce(s.category,'')) like '%'||lower(r.treatment)||'%'
      or lower(coalesce(d.specialty,'')) like '%'||lower(r.treatment)||'%'
      or lower(r.treatment) like '%'||lower(coalesce(s.name,''))||'%'
    ) as specialty_match,
    (
      (r.budget_min is null or s.default_price is null or s.default_price>=r.budget_min)
      and
      (r.budget_max is null or s.default_price is null or s.default_price<=r.budget_max)
    ) as budget_fit,
    r.urgency as request_urgency,
    r.preference_priority as request_priority,
    r.preferred_date as request_date
  from public.dentists d
  join public.clinics c
    on c.id=d.clinic_id
   and d.active=true
  join public.services s
    on s.clinic_id=c.id
   and s.active=true
  cross join req r
  where
    (r.city is null or c.city is null or lower(c.city)=lower(r.city))
    and (r.pincode is null or c.pincode is null or c.pincode=r.pincode)
),
ranked as (
  select
    x.dentist_id,
    x.dentist_name,
    x.specialty,
    x.clinic_id,
    x.clinic_name,
    x.city,
    x.pincode,
    x.service_id,
    x.service_name,
    x.price,
    x.distance_km,
    x.available,
    x.specialty_match,
    x.budget_fit,
    public.calculate_match_score(
      x.request_urgency,
      x.request_priority,
      x.distance_km,
      x.budget_fit,
      x.available,
      x.specialty_match
    ) as match_score,
    case
      when x.request_date is not null and x.available
        then x.request_date::timestamptz + interval '10 hours'
      when x.request_date is null
        then now()
      else null
    end as earliest_slot
  from candidates x
  where x.specialty_match
)
select
  r.dentist_id,
  r.dentist_name,
  r.specialty,
  r.clinic_id,
  r.clinic_name,
  r.city,
  r.pincode,
  r.service_id,
  r.service_name,
  r.price,
  r.distance_km,
  r.available,
  r.specialty_match,
  r.budget_fit,
  r.match_score,
  r.earliest_slot
from ranked r
order by r.match_score desc, r.distance_km asc, r.price asc nulls last
limit 20;
$$;

grant execute on function public.find_patient_matches(uuid) to anon, authenticated;
