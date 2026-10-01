-- Optional demo data for development only.
-- Do not use in a production clinic database.

do $$
declare
  c uuid;
  p1 uuid;
  p2 uuid;
  l1 uuid;
begin
  insert into public.clinics(name,phone,email)
  values ('Demo Smile Dental','+91 9000000000','demo@example.com')
  returning id into c;

  insert into public.patients(clinic_id,full_name,phone,last_visit_at,next_recall_at,total_revenue)
  values
    (c,'Demo Patient One','+91 9000000001',now()-interval '220 days',now()-interval '2 days',12000),
    (c,'Demo Patient Two','+91 9000000002',now()-interval '30 days',now()+interval '20 days',18000)
  returning id into p1;

  insert into public.leads(clinic_id,name,phone,enquiry,estimated_value,status)
  values (c,'Demo Implant Lead','+91 9000000003','Implant consultation',45000,'QUALIFIED')
  returning id into l1;

  insert into public.appointments(clinic_id,patient_id,scheduled_at,status,estimated_value)
  values (c,p1,now()-interval '1 day','NO_SHOW',8000);
end $$;
