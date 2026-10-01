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
