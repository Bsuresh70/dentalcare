# DentalGrowth AI

AI Patient Growth & Revenue Recovery platform for dental clinics.

## v0.1 — GitHub foundation
This repository contains the first runnable application foundation and the production-oriented Supabase schema for the Revenue Opportunity Engine.

### Product direction
DentalGrowth AI is a growth layer rather than another dental PMS. It identifies:
- high-intent leads that were not booked
- pending treatments
- no-shows and cancellations
- dormant patients
- recall opportunities

and prioritizes the next revenue-recovery action.

## Run locally
```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000

## Environment
Set:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY

## Supabase
Apply supabase/schema.sql to a new Supabase project. The schema is designed for multi-tenant clinic isolation using Row Level Security.

## Roadmap
1. Database + RLS + authentication
2. Live clinic/patient/lead data
3. Deterministic Revenue Opportunity Engine
4. Appointments and follow-ups
5. WhatsApp/n8n automation
6. AI opportunity scoring and assistant
7. Dentist-to-dentist referral network


## Phase 5 — Appointment & Follow-up Automation

Run these SQL files in Supabase SQL Editor in this order:

1. `supabase/schema.sql`
2. `supabase/opportunity_engine.sql`
3. `supabase/phase5.sql`

Then configure:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Phase 5 adds:

- appointment creation and status tracking
- completed/no-show/cancelled appointment handling
- automatic follow-up creation for no-shows and cancellations
- patient revenue attribution when an appointment becomes COMPLETED
- opportunity-to-revenue conversion
- follow-up queue with WhatsApp deep links
- follow-up history/status tracking
- clinic-level RLS inherited from the core schema

Start locally:

```bash
npm install
npm run dev
```

Open `/login`, create a clinic through onboarding, then use **Appointments** and **Follow-ups**.

> WhatsApp API/n8n delivery is intentionally the next integration layer. Phase 5 does not pretend that a browser WhatsApp deep link is an API integration.


## Deployment

This repository is connected to Vercel for deployment from the `main` branch.
