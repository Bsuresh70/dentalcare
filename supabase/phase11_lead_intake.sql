-- Phase 11B: server-side intake for externally discovered dental leads.
-- This function stages leads only. It does not contact patients or assign clinics.
-- Call only from trusted server-side code using the Supabase service role.

create or replace function public.stage_external_dental_lead(
  p_source_key text,
  p_source_record_id text default null,
  p_source_url text default null,
  p_source_country text default null,
  p_treatment_interest text default null,
  p_intent_summary text default null,
  p_intent_score integer default 0,
  p_urgency text default 'FLEXIBLE',
  p_budget_min numeric default null,
  p_budget_max numeric default null,
  p_currency text default null,
  p_preferred_language text default null,
  p_contact_name text default null,
  p_contact_email text default null,
  p_contact_phone text default null,
  p_contact_permission_status text default 'UNKNOWN',
  p_permission_scope text default null,
  p_permission_captured_at timestamptz default null,
  p_permission_evidence_ref text default null,
  p_dedupe_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source public.lead_source_connectors%rowtype;
  v_id uuid;
begin
  select * into v_source
  from public.lead_source_connectors
  where source_key = p_source_key and enabled = true;

  if not found then
    raise exception 'Unknown or disabled lead source';
  end if;

  if p_intent_score < 0 or p_intent_score > 100 then
    raise exception 'Intent score must be between 0 and 100';
  end if;

  if p_contact_permission_status not in (
    'UNKNOWN','GRANTED','DENIED','WITHDRAWN','NOT_REQUIRED_FOR_REVIEW'
  ) then
    raise exception 'Invalid contact permission status';
  end if;

  if p_contact_permission_status = 'GRANTED'
     and (p_permission_captured_at is null or nullif(trim(p_permission_scope), '') is null) then
    raise exception 'Granted contact permission requires timestamp and scope';
  end if;

  insert into public.external_dental_leads (
    source_connector_id, source_record_id, source_url, source_country,
    treatment_interest, treatment_location, intent_summary, intent_score,
    urgency, budget_min, budget_max, currency, preferred_language,
    contact_name, contact_email, contact_phone, contact_permission_status,
    permission_scope, permission_captured_at, permission_evidence_ref, dedupe_key
  ) values (
    v_source.id, p_source_record_id, p_source_url, p_source_country,
    p_treatment_interest, 'Hyderabad', p_intent_summary, coalesce(p_intent_score,0),
    coalesce(p_urgency,'FLEXIBLE'), p_budget_min, p_budget_max, p_currency,
    p_preferred_language, p_contact_name, p_contact_email, p_contact_phone,
    coalesce(p_contact_permission_status,'UNKNOWN'), p_permission_scope,
    p_permission_captured_at, p_permission_evidence_ref, p_dedupe_key
  )
  on conflict do nothing
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.stage_external_dental_lead(
  text,text,text,text,text,text,integer,text,numeric,numeric,text,text,
  text,text,text,text,text,timestamptz,text,text
) from public, anon, authenticated;

grant execute on function public.stage_external_dental_lead(
  text,text,text,text,text,text,integer,text,numeric,numeric,text,text,
  text,text,text,text,text,timestamptz,text,text
) to service_role;

comment on function public.stage_external_dental_lead is
  'Trusted server-side intake for permitted external leads; stages records only and never initiates contact.';
