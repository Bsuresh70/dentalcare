'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { getCurrentClinicId } from '../../lib/clinic';

type Assignment={id:string;patient_request_id:string;clinic_id:string;dentist_id:string|null;service_id:string|null;assignment_score:number;status:string;assigned_at:string;first_contact_due_at:string|null;first_contact_at:string|null;appointment_at:string|null;converted_at:string|null;converted_revenue:number|null;};
type Request={id:string;name:string;phone:string|null;treatment:string;problem_description:string|null;urgency:string;city:string|null;pincode:string|null;budget_max:number|null;intent_score:number;source:string;created_at:string;};
type Dentist={id:string;name:string;specialty:string|null};
type Service={id:string;name:string;default_price:number|null};
type Action={id:string;assignment_id:string;action_type:string;priority:string;reason:string|null;suggested_message:string|null;scheduled_for:string|null;status:string};

export default function PatientLeads(){
  const [clinicId,setClinicId]=useState<string|null>(null);
  const [assignments,setAssignments]=useState<Assignment[]>([]);
  const [requests,setRequests]=useState<Request[]>([]);
  const [dentists,setDentists]=useState<Dentist[]>([]);
  const [services,setServices]=useState<Service[]>([]);
  const [actions,setActions]=useState<Action[]>([]);
  const [subscription,setSubscription]=useState<any>(null);
  const [status,setStatus]=useState('');
  const [filter,setFilter]=useState('ACTIVE');
  const [loading,setLoading]=useState(true);

  async function load(){
    if(!supabase)return;
    setLoading(true);
    const id=await getCurrentClinicId();
    setClinicId(id);
    if(!id){setLoading(false);return;}

    await supabase.rpc('ensure_clinic_trial_subscription',{p_clinic_id:id});

    const [a,r,d,s,sub]=await Promise.all([
      supabase.from('patient_lead_assignments').select('*').eq('clinic_id',id).order('assigned_at',{ascending:false}),
      supabase.from('patient_requests').select('id,name,phone,treatment,problem_description,urgency,city,pincode,budget_max,intent_score,source,created_at').eq('clinic_id',id).order('created_at',{ascending:false}),
      supabase.from('dentists').select('id,name,specialty').eq('clinic_id',id).eq('active',true).order('name'),
      supabase.from('services').select('id,name,default_price').eq('clinic_id',id).eq('active',true).order('name'),
      supabase.from('clinic_subscriptions').select('*').eq('clinic_id',id).maybeSingle()
    ]);
    if(a.error)setStatus(a.error.message);
    setAssignments((a.data||[]) as Assignment[]);
    setRequests((r.data||[]) as Request[]);
    setDentists((d.data||[]) as Dentist[]);
    setServices((s.data||[]) as Service[]);
    setSubscription(sub.data);
    const ids=(a.data||[]).map((x:any)=>x.id);
    if(ids.length){
      const {data:aa,error:ae}=await supabase.from('lead_ai_actions').select('*').in('assignment_id',ids).order('scheduled_for',{ascending:true});
      if(ae)setStatus(ae.message);
      setActions((aa||[]) as Action[]);
    }else setActions([]);
    setLoading(false);
  }

  useEffect(()=>{load()},[]);

  const reqById=useMemo(()=>new Map(requests.map(x=>[x.id,x])),[requests]);
  const dentistById=useMemo(()=>new Map(dentists.map(x=>[x.id,x])),[dentists]);
  const serviceById=useMemo(()=>new Map(services.map(x=>[x.id,x])),[services]);

  const visible=assignments.filter(a=>filter==='ALL'||(filter==='ACTIVE'?!['CONVERTED','LOST'].includes(a.status):a.status===filter));

  async function update(id:string,next:string){
    if(!supabase)return;
    const revenue=next==='CONVERTED'?Number(prompt('Actual treatment revenue (₹):')||0):null;
    const {error}=await supabase.rpc('update_patient_lead_assignment',{p_assignment_id:id,p_status:next,p_revenue:revenue});
    setStatus(error?error.message:'Patient lead updated.');
    await load();
  }

  function wa(phone:string|null,message:string|null){
    if(!phone)return;
    let d=phone.replace(/\D/g,'');
    if(d.length===10)d='91'+d;
    else if(d.length===11&&d.startsWith('0'))d='91'+d.slice(1);
    window.open('https://wa.me/'+d+'?text='+encodeURIComponent(message||''),'_blank','noopener,noreferrer');
  }

  function actionFor(id:string){return actions.find(a=>a.assignment_id===id&&a.status==='PENDING')||actions.find(a=>a.assignment_id===id)||null;}

  return <main className="page">
    <header className="pageHead">
      <div><p className="eyebrow">AI PATIENT ACQUISITION</p><h1>Patient Leads</h1><p className="muted">Only DentalCare-registered clinics receive these enquiries. AI prioritizes the next action to turn enquiries into booked and paid patients.</p></div>
      <select value={filter} onChange={e=>setFilter(e.target.value)}><option value="ACTIVE">ACTIVE</option><option value="ASSIGNED">ASSIGNED</option><option value="CONTACTED">CONTACTED</option><option value="BOOKED">BOOKED</option><option value="CONVERTED">CONVERTED</option><option value="LOST">LOST</option><option value="ALL">ALL</option></select>
    </header>

    {status&&<div className="toast">{status}</div>}

    <section className="statsRow">
      <div><span>Registered dentists</span><strong>{dentists.length}</strong></div>
      <div><span>Active services</span><strong>{services.length}</strong></div>
      <div><span>Patient enquiries assigned</span><strong>{assignments.length}</strong></div>
      <div><span>Subscription</span><strong>{subscription?.status||'—'}</strong></div>
    </section>

    {(dentists.length===0||services.length===0)&&<section className="patientNote"><strong>Ready to receive patient enquiries</strong><span>{dentists.length===0?'Add at least one active dentist in Clinic Setup. ':''}{services.length===0?'Add services such as Root Canal, Dental Implant, Braces, Cleaning, etc. ':' '}Once the clinic is subscribed/active and has matching services, AI can assign eligible enquiries automatically.</span></section>}

    <section className="panel">
      <div className="panelHead"><div><h3>AI-assigned patient enquiries</h3><p className="muted">Fast response matters. High-intent enquiries should be contacted immediately.</p></div></div>
      <div className="leadCards">
      {loading?<p className="muted">Loading patient growth engine…</p>:visible.length===0?<div className="emptyCalendar">No patient enquiries in this view yet.</div>:visible.map(a=>{
        const r=reqById.get(a.patient_request_id);
        const d=a.dentist_id?dentistById.get(a.dentist_id):null;
        const s=a.service_id?serviceById.get(a.service_id):null;
        const ai=actionFor(a.id);
        const hot=(r?.intent_score||0)>=85||a.assignment_score>=85;
        return <article className="growthLead" key={a.id}>
          <div className="growthLeadTop">
            <div><span className={hot?'hotBadge':'scoreBadge'}>{hot?'🔥 HIGH INTENT':'AI MATCH'} {r?.intent_score||a.assignment_score}/100</span><h3>{r?.name||'Patient'}</h3><small>{r?.phone||'No phone provided'} · {r?.city||'Location not provided'} {r?.pincode||''}</small></div>
            <span className="badge open">{a.status}</span>
          </div>
          <div className="growthFacts">
            <span><b>Treatment</b>{r?.treatment||s?.name||'—'}</span>
            <span><b>Urgency</b>{r?.urgency||'FLEXIBLE'}</span>
            <span><b>Budget</b>{r?.budget_max?money(r.budget_max):'Not specified'}</span>
            <span><b>Assigned dentist</b>{d?.name||'—'}</span>
          </div>
          {r?.problem_description&&<p className="growthProblem">“{r.problem_description}”</p>}
          {ai&&<div className="aiCopilot"><strong>🤖 AI recommended next action: {ai.action_type.replaceAll('_',' ')}</strong><span>{ai.reason}</span>{ai.suggested_message&&<em>{ai.suggested_message}</em>}</div>}
          <div className="growthActions">
            {r?.phone&&<button className="primary small" onClick={()=>{window.open('tel:'+r.phone);}}>Call patient</button>}
            {r?.phone&&ai?.suggested_message&&<button className="tableButton" onClick={()=>wa(r.phone,ai.suggested_message)}>WhatsApp</button>}
            {a.status==='ASSIGNED'&&<button className="tableButton" onClick={()=>update(a.id,'CONTACTED')}>Mark contacted</button>}
            {['ASSIGNED','CONTACTED'].includes(a.status)&&<button className="tableButton" onClick={()=>update(a.id,'BOOKED')}>Appointment booked</button>}
            {a.status==='BOOKED'&&<button className="tableButton" onClick={()=>update(a.id,'CONVERTED')}>Convert to paid patient</button>}
            {!['CONVERTED','LOST'].includes(a.status)&&<button className="tableButton" onClick={()=>update(a.id,'LOST')}>Lost</button>}
          </div>
        </article>
      })}
      </div>
    </section>

    <div className="patientNote"><strong>AI conversion boundary</strong><span>DentalCare can prioritize enquiries, draft communication and automate operational follow-up. Diagnosis, treatment selection, clinical claims and final patient consent remain with the licensed dentist and patient.</span></div>
  </main>
}

function money(n:number){return new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n)}
