create extension if not exists pgcrypto;

create type public.user_role as enum ('CLINIC_OWNER','DENTIST','RECEPTIONIST','MARKETING_USER');
create type public.lead_status as enum ('NEW','CONTACTED','QUALIFIED','BOOKED','LOST','CONVERTED');
create type public.opportunity_type as enum ('HIGH_INTENT_LEAD','PENDING_TREATMENT','NO_SHOW','CANCELLATION','DORMANT_PATIENT','RECALL_DUE');
create type public.opportunity_status as enum ('OPEN','IN_PROGRESS','SNOOZED','CONVERTED','DISMISSED');

create table public.profiles (id uuid primary key references auth.users(id) on delete cascade, full_name text, phone text, created_at timestamptz not null default now());
create table public.clinics (id uuid primary key default gen_random_uuid(), name text not null, phone text, email text, timezone text not null default 'Asia/Kolkata', currency text not null default 'INR', created_at timestamptz not null default now());
create table public.clinic_users (clinic_id uuid references public.clinics(id) on delete cascade, user_id uuid references public.profiles(id) on delete cascade, role public.user_role not null default 'RECEPTIONIST', created_at timestamptz not null default now(), primary key(clinic_id,user_id));
create table public.dentists (id uuid primary key default gen_random_uuid(), clinic_id uuid not null references public.clinics(id) on delete cascade, name text not null, specialty text, phone text, active boolean not null default true);
create table public.services (id uuid primary key default gen_random_uuid(), clinic_id uuid not null references public.clinics(id) on delete cascade, name text not null, category text, default_price numeric(12,2), active boolean not null default true);
create table public.patients (id uuid primary key default gen_random_uuid(), clinic_id uuid not null references public.clinics(id) on delete cascade, full_name text not null, phone text, email text, last_visit_at timestamptz, next_recall_at timestamptz, total_revenue numeric(12,2) not null default 0, notes text, created_at timestamptz not null default now());
create table public.leads (id uuid primary key default gen_random_uuid(), clinic_id uuid not null references public.clinics(id) on delete cascade, patient_id uuid references public.patients(id) on delete set null, name text not null, phone text, source text, enquiry text, estimated_value numeric(12,2) not null default 0, status public.lead_status not null default 'NEW', last_contacted_at timestamptz, created_at timestamptz not null default now());
create table public.opportunities (id uuid primary key default gen_random_uuid(), clinic_id uuid not null references public.clinics(id) on delete cascade, patient_id uuid references public.patients(id) on delete cascade, lead_id uuid references public.leads(id) on delete cascade, type public.opportunity_type not null, status public.opportunity_status not null default 'OPEN', score integer not null default 0 check(score between 0 and 100), potential_value numeric(12,2) not null default 0, title text not null, detail text, recommended_action text, due_at timestamptz, converted_revenue numeric(12,2), created_at timestamptz not null default now());
create table public.appointments (id uuid primary key default gen_random_uuid(), clinic_id uuid not null references public.clinics(id) on delete cascade, patient_id uuid references public.patients(id) on delete set null, dentist_id uuid references public.dentists(id) on delete set null, service_id uuid references public.services(id) on delete set null, scheduled_at timestamptz not null, status text not null default 'SCHEDULED', estimated_value numeric(12,2) not null default 0, notes text);
create table public.conversations (id uuid primary key default gen_random_uuid(), clinic_id uuid not null references public.clinics(id) on delete cascade, patient_id uuid references public.patients(id) on delete set null, lead_id uuid references public.leads(id) on delete set null, channel text not null, status text not null default 'OPEN', created_at timestamptz not null default now());
create table public.messages (id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.conversations(id) on delete cascade, direction text not null, sender_type text not null, body text not null, sent_at timestamptz not null default now());
create table public.followups (id uuid primary key default gen_random_uuid(), clinic_id uuid not null references public.clinics(id) on delete cascade, patient_id uuid references public.patients(id) on delete set null, lead_id uuid references public.leads(id) on delete set null, opportunity_id uuid references public.opportunities(id) on delete set null, channel text not null default 'WHATSAPP', scheduled_for timestamptz not null, status text not null default 'PENDING', message_template text);
create table public.campaigns (id uuid primary key default gen_random_uuid(), clinic_id uuid not null references public.clinics(id) on delete cascade, name text not null, channel text not null, status text not null default 'DRAFT', created_at timestamptz not null default now());
create table public.audit_logs (id uuid primary key default gen_random_uuid(), clinic_id uuid references public.clinics(id) on delete cascade, user_id uuid references auth.users(id) on delete set null, action text not null, entity_type text, entity_id uuid, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());

create index idx_patients_clinic on public.patients(clinic_id);
create index idx_leads_clinic_status on public.leads(clinic_id,status);
create index idx_opportunities_clinic_score on public.opportunities(clinic_id,status,score desc);
create index idx_appointments_clinic_date on public.appointments(clinic_id,scheduled_at);
create index idx_followups_clinic_due on public.followups(clinic_id,scheduled_for,status);

create or replace function public.is_clinic_member(target uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.clinic_users where clinic_id=target and user_id=auth.uid()); $$;
create or replace function public.is_clinic_admin(target uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.clinic_users where clinic_id=target and user_id=auth.uid() and role='CLINIC_OWNER'); $$;

alter table public.profiles enable row level security;
alter table public.clinics enable row level security;
alter table public.clinic_users enable row level security;
alter table public.dentists enable row level security;
alter table public.services enable row level security;
alter table public.patients enable row level security;
alter table public.leads enable row level security;
alter table public.opportunities enable row level security;
alter table public.appointments enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.followups enable row level security;
alter table public.campaigns enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_self on public.profiles for all using(id=auth.uid()) with check(id=auth.uid());
create policy clinics_member on public.clinics for select using(public.is_clinic_member(id));
create policy clinic_users_member on public.clinic_users for select using(public.is_clinic_member(clinic_id));
create policy clinic_users_admin on public.clinic_users for all using(public.is_clinic_admin(clinic_id)) with check(public.is_clinic_admin(clinic_id));

create policy dentists_member on public.dentists for all using(public.is_clinic_member(clinic_id)) with check(public.is_clinic_member(clinic_id));
create policy services_member on public.services for all using(public.is_clinic_member(clinic_id)) with check(public.is_clinic_member(clinic_id));
create policy patients_member on public.patients for all using(public.is_clinic_member(clinic_id)) with check(public.is_clinic_member(clinic_id));
create policy leads_member on public.leads for all using(public.is_clinic_member(clinic_id)) with check(public.is_clinic_member(clinic_id));
create policy opportunities_member on public.opportunities for all using(public.is_clinic_member(clinic_id)) with check(public.is_clinic_member(clinic_id));
create policy appointments_member on public.appointments for all using(public.is_clinic_member(clinic_id)) with check(public.is_clinic_member(clinic_id));
create policy conversations_member on public.conversations for all using(public.is_clinic_member(clinic_id)) with check(public.is_clinic_member(clinic_id));
create policy messages_member on public.messages for all using(exists(select 1 from public.conversations c where c.id=conversation_id and public.is_clinic_member(c.clinic_id))) with check(exists(select 1 from public.conversations c where c.id=conversation_id and public.is_clinic_member(c.clinic_id)));
create policy followups_member on public.followups for all using(public.is_clinic_member(clinic_id)) with check(public.is_clinic_member(clinic_id));
create policy campaigns_member on public.campaigns for all using(public.is_clinic_member(clinic_id)) with check(public.is_clinic_member(clinic_id));
create policy audit_member on public.audit_logs for select using(clinic_id is null or public.is_clinic_member(clinic_id));

create or replace function public.calculate_opportunity_score(p_type public.opportunity_type,p_days integer default 0,p_value numeric default 0) returns integer language plpgsql immutable as $$
declare s integer:=case p_type when 'HIGH_INTENT_LEAD' then 70 when 'PENDING_TREATMENT' then 75 when 'NO_SHOW' then 80 when 'CANCELLATION' then 72 when 'DORMANT_PATIENT' then 55 when 'RECALL_DUE' then 45 end;
begin s:=s+least(greatest(coalesce(p_days,0),0)*2,15); if coalesce(p_value,0)>=25000 then s:=s+10; elsif coalesce(p_value,0)>=10000 then s:=s+5; end if; return least(s,100); end; $$;
