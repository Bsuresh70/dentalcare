export type Clinic = { id:string; name:string; phone?:string|null; email?:string|null; timezone:string; currency:string };
export type Patient = { id:string; clinic_id:string; full_name:string; phone?:string|null; email?:string|null; last_visit_at?:string|null; next_recall_at?:string|null; total_revenue:number };
export type Lead = { id:string; clinic_id:string; name:string; phone?:string|null; enquiry?:string|null; estimated_value:number; status:string };
export type Opportunity = { id:string; clinic_id:string; patient_id?:string|null; lead_id?:string|null; type:string; status:string; score:number; potential_value:number; title:string; detail?:string|null; recommended_action?:string|null; due_at?:string|null };
