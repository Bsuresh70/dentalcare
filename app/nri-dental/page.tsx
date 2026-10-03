'use client';

import { FormEvent, useState } from 'react';
import { supabase } from '../../lib/supabase';

const treatments=['Dental implant','Full mouth rehabilitation','Root canal','Crown / bridge','Braces / aligners','Wisdom tooth','Teeth cleaning','Gum treatment','Denture','Cosmetic dentistry','Second opinion','Other'];
const urgency=[['FLEXIBLE','I can plan ahead'],['MEDIUM','Within 1–3 months'],['HIGH','Within a few weeks'],['ASAP','As soon as possible']];
const contact=[['WHATSAPP','WhatsApp'],['EMAIL','Email'],['PHONE','Phone call']];

export default function NRIDental(){
  const [form,setForm]=useState({
    name:'',email:'',phone:'',whatsapp:'',usCity:'',usState:'',
    indiaCity:'',indiaState:'',treatment:'',problem:'',urgency:'FLEXIBLE',
    diagnosis:'',usCost:'',indiaBudget:'',visit:'',travelStart:'',travelEnd:'',
    contact:'WHATSAPP',consentContact:false,consentShare:false
  });
  const [status,setStatus]=useState('');
  const [busy,setBusy]=useState(false);

  async function submit(e:FormEvent){
    e.preventDefault();
    if(!supabase)return;
    if(!form.name||!form.treatment||!form.consentContact){setStatus('Please complete your name, treatment and contact consent.');return;}
    setBusy(true);setStatus('Sending your dental care request…');
    const {error}=await supabase.rpc('create_nri_dental_case',{
      p_full_name:form.name,p_email:form.email,p_phone:form.phone,p_whatsapp:form.whatsapp,
      p_us_city:form.usCity,p_us_state:form.usState,p_preferred_india_city:form.indiaCity,p_preferred_india_state:form.indiaState,
      p_treatment_need:form.treatment,p_problem_description:form.problem,p_urgency:form.urgency,
      p_us_dentist_diagnosis:form.diagnosis,p_us_estimated_cost:form.usCost?Number(form.usCost):null,
      p_india_budget:form.indiaBudget?Number(form.indiaBudget):null,p_planned_india_visit:form.visit,
      p_travel_start:form.travelStart||null,p_travel_end:form.travelEnd||null,
      p_preferred_contact:form.contact,p_source:'NRI_LANDING_PAGE',
      p_consent_to_contact:form.consentContact,p_consent_to_share_case:form.consentShare
    });
    setBusy(false);
    setStatus(error?error.message:'Thank you. Your case has been received. A suitable DentalConnect clinic can review your request.');
    if(!error)setForm({...form,name:'',email:'',phone:'',whatsapp:'',problem:'',diagnosis:'',consentContact:false,consentShare:false});
  }

  return <main className="publicPage">
    <section className="publicHero">
      <div>
        <p className="eyebrow">DENTALCONNECT · NRI DENTAL CARE</p>
        <h1>Plan your dental treatment in India before you travel.</h1>
        <p className="lead">Tell us what dental treatment you need, where you live in the USA, when you expect to visit India, and what matters to you. We can help you find participating Indian dental clinics that fit your requirements.</p>
      </div>
      <div className="nriProof"><strong>Care delayed because of cost is a documented U.S. access issue.</strong><span>We focus on helping you plan care—not diagnosing you online.</span></div>
    </section>
    <form className="publicForm" onSubmit={submit}>
      <section><h2>1. Your contact</h2><div className="formGrid"><input required placeholder="Full name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/><input type="email" placeholder="Email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/><input placeholder="U.S. phone" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/><input placeholder="WhatsApp number" value={form.whatsapp} onChange={e=>setForm({...form,whatsapp:e.target.value})}/></div></section>
      <section><h2>2. Where are you?</h2><div className="formGrid"><input placeholder="U.S. city" value={form.usCity} onChange={e=>setForm({...form,usCity:e.target.value})}/><input placeholder="U.S. state" value={form.usState} onChange={e=>setForm({...form,usState:e.target.value})}/><input placeholder="Preferred India city" value={form.indiaCity} onChange={e=>setForm({...form,indiaCity:e.target.value})}/><input placeholder="India state" value={form.indiaState} onChange={e=>setForm({...form,indiaState:e.target.value})}/></div></section>
      <section><h2>3. Dental requirement</h2><div className="formGrid"><select required value={form.treatment} onChange={e=>setForm({...form,treatment:e.target.value})}><option value="">Treatment needed</option>{treatments.map(x=><option key={x}>{x}</option>)}</select><select value={form.urgency} onChange={e=>setForm({...form,urgency:e.target.value})}>{urgency.map(x=><option key={x[0]} value={x[0]}>{x[1]}</option>)}</select><input placeholder="U.S. dentist's diagnosis (optional)" value={form.diagnosis} onChange={e=>setForm({...form,diagnosis:e.target.value})}/><input placeholder="Approx. U.S. estimate ($) optional" type="number" value={form.usCost} onChange={e=>setForm({...form,usCost:e.target.value})}/></div><textarea placeholder="Tell us briefly about the problem or treatment you are considering" value={form.problem} onChange={e=>setForm({...form,problem:e.target.value})}/></section>
      <section><h2>4. India visit planning</h2><div className="formGrid"><input placeholder="Approx. India treatment budget (₹)" type="number" value={form.indiaBudget} onChange={e=>setForm({...form,indiaBudget:e.target.value})}/><input placeholder="When are you visiting India?" value={form.visit} onChange={e=>setForm({...form,visit:e.target.value})}/><input type="date" value={form.travelStart} onChange={e=>setForm({...form,travelStart:e.target.value})}/><input type="date" value={form.travelEnd} onChange={e=>setForm({...form,travelEnd:e.target.value})}/></div><select value={form.contact} onChange={e=>setForm({...form,contact:e.target.value})}>{contact.map(x=><option key={x[0]} value={x[0]}>Preferred contact: {x[1]}</option>)}</select></section>
      <section className="consentBox"><label><input type="checkbox" checked={form.consentContact} onChange={e=>setForm({...form,consentContact:e.target.checked})}/> I agree that DentalConnect and a participating clinic may contact me about this request.</label><label><input type="checkbox" checked={form.consentShare} onChange={e=>setForm({...form,consentShare:e.target.checked})}/> I agree that the information I provide may be shared with participating DentalConnect clinics for the purpose of responding to my request.</label></section>
      <button className="primary" disabled={busy}>{busy?'Sending…':'Find suitable dental care in India'}</button>
      {status&&<div className="toast">{status}</div>}
      <p className="muted tiny">DentalConnect does not diagnose dental conditions through this form. Treatment suitability and final pricing must be confirmed by a licensed dentist.</p>
    </form>
  </main>
}
