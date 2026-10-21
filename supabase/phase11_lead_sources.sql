-- DentalCare Phase 11: lawful external lead-source foundation
-- Apply in Supabase SQL Editor after phase10_growth_engine.sql.
-- This migration does NOT scrape private search data or initiate outreach.
-- External integrations must use permitted APIs/partners and record provenance + contact permission.

create table if not exists public.lead_source_connectors (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  display_name text not null,
  source_type text not null check (source_type in (
    'AUTHORISED_PARTNER','OPT_IN_FORM','PUBLIC_PLATFORM_API','REFERRAL','MANUAL_REVIEW'
  )),
  enabled boolean not null default false,
  terms_reviewed_at timestamptz,
  privacy_reviewed_at timestamptz,
  contact_permission_required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint enabled_sources_reviewed check (
    enabled = false or (terms_reviewed_at is not null and privacy_reviewed_at is not null)
  )
);

create table if not exists public.external_dental_leads (
  id uuid primary key default gen_random_uuid(),
  source_connector_id uuid not null references public.lead_source_connectors(id),
  source_record_id text,
  source_url text,
  captured_at timestamptz not null default now(),
  source_published_at timestamptz,
  source_country text,
  treatment_interest text,
  treatment_location text not null default 'Hyderabad',
  intent_summary text,
  intent_score integer not null default 0 check (intent_score between 0 and 100),
  urgency text not null default 'FLEXIBLE'
    check (urgency in ('FLEXIBLE','THIS_WEEK','TODAY','ASAP')),
  budget_min numeric(12,2),
  budget_max numeric(12,2),
  currency text,
  preferred_language text,
  contact_name text,
  contact_email text,
  contact_phone text,
  contact_permission_status text not null default 'UNKNOWN'
    check (contact_permission_status in ('UNKNOWN','GRANTED','DENIED','WITHDRAWN','NOT_REQUIRED_FOR_REVIEW')),
  permission_scope text,
  permission_captured_at timestamptz,
  permission_evidence_ref text,
  do_not_contact boolean not null default false,
  review_status text not null default 'NEEDS_REVIEW'
    check (review_status in ('NEEDS_REVIEW','APPROVED','REJECTED','DUPLICATE')),
  assigned_patient_request_id uuid references public.patient_requests(id) on delete set null,
  dedupe_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint permission_grant_has_evidence check (
    contact_permission_status <> 'GRANTED'
    or (permission_captured_at is not null and permission_scope is not null)
  ),
  constraint no_contact_without_permission check (
    review_status <> 'APPROVED'
    or do_not_contact = true
    or contact_permission_status in ('GRANTED','NOT_REQUIRED_FOR_REVIEW')
  )
);

create unique index if not exists ux_external_dental_lead_source_record
  on public.external_dental_leads(source_connector_id, source_record_id)
  where source_record_id is not null;

create unique index if not exists ux_external_dental_lead_dedupe
  on public.external_dental_leads(dedupe_key)
  where dedupe_key is not null;

create index if not exists idx_external_dental_leads_review
  on public.external_dental_leads(review_status, intent_score desc, captured_at desc);

create index if not exists idx_external_dental_leads_permission
  on public.external_dental_leads(contact_permission_status, do_not_contact);

alter table public.lead_source_connectors enable row level security;
alter table public.external_dental_leads enable row level security;

-- No browser/client access to connector configuration or external lead records.
-- Trusted server-side integrations use Supabase service-role credentials only.
drop policy if exists lead_source_connectors_no_client_access on public.lead_source_connectors;
create policy lead_source_connectors_no_client_access
  on public.lead_source_connectors for all
  using (false) with check (false);

drop policy if exists external_dental_leads_no_client_access on public.external_dental_leads;
create policy external_dental_leads_no_client_access
  on public.external_dental_leads for all
  using (false) with check (false);

comment on table public.lead_source_connectors is
  'Approved source registry. Enable only after source terms and privacy review.';
comment on table public.external_dental_leads is
  'Restricted staging area for externally sourced leads; do not contact without recorded permission or documented lawful exception.';
