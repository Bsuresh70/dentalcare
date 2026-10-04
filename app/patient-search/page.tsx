'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';

const treatments=[
  {label:'Dental implant',keywords:['implant','implants','missing tooth','missing teeth']},
  {label:'Root canal',keywords:['root canal','rct','tooth infection','infected tooth']},
  {label:'Braces / aligners',keywords:['braces','aligner','aligners','invisalign','crooked teeth']},
  {label:'Tooth pain',keywords:['tooth pain','toothache','pain in tooth','severe pain','dental pain']},
  {label:'Crown / bridge',keywords:['crown','bridge','broken tooth','cap for tooth']},
  {label:'Teeth cleaning',keywords:['cleaning','scaling','yellow teeth','tartar']},
  {label:'Wisdom tooth',keywords:['wisdom tooth','wisdom teeth']},
  {label:'Gum treatment',keywords:['gum','bleeding gums','gum pain','periodontal']},
  {label:'Cosmetic dentistry',keywords:['veneers','smile design','cosmetic','whitening','teeth whitening']},
  {label:'Pediatric dentistry',keywords:['child','children','kid','kids','pediatric']},
  {label:'Denture',keywords:['denture','dentures','false teeth']},
  {label:'Second opinion',keywords:['second opinion','review my treatment','another opinion']}
];

function detectIntent(text:string){
  const q=text.toLowerCase();
  const found=treatments.find(t=>t.keywords.some(k=>q.includes(k)));
  let urgency='FLEXIBLE';
  if(/severe|unbearable|swelling|bleeding|emergency|cannot sleep|can't sleep/.test(q)) urgency='ASAP';
  else if(/today|right now|immediately/.test(q)) urgency='TODAY';
  else if(/this week|soon/.test(q)) urgency='THIS_WEEK';

  let score=35;
  if(found) score+=35;
  if(/price|cost|fee|budget|cheap|affordable/.test(q)) score+=5;
  if(/book|appointment|dentist|clinic|doctor|treatment/.test(q)) score+=15;
  if(urgency!=='FLEXIBLE') score+=10;

  return {treatment:found?.label||'',urgency,intentScore:Math.min(score,100)};
}

export default function PatientSearch(){
  const [query,setQuery]=useState('');
  const [name,setName]=useState('');
  const [phone,setPhone]=useState('');
  const [city,setCity]=useState('Hyderabad');
  const [pincode,setPincode]=useState('');
  const [budget,setBudget]=useState('');
  const [consent,setConsent]=useState(false);
  const [status,setStatus]=useState('');
  const [loading,setLoading]=useState(false);

  const intent=useMemo(()=>detectIntent(query),[query]);

  async function submit(e:FormEvent){
    e.preventDefault();
    if(!supabase){setStatus('Patient search is not configured yet.');return;}
    if(query.trim().length<8){setStatus('Please describe your dental need in a little more detail.');return;}
    if(!name.trim()||!phone.trim()){setStatus('Please enter your name and mobile number so a clinic can contact you.');return;}
    if(!consent){setStatus('Please allow DentalCare to contact you about suitable dental options.');return;}

    setLoading(true);
    setStatus('AI is understanding your requirement and preparing suitable dentist options…');

    const {data,error}=await supabase.rpc('capture_patient_search_intent',{
      p_search_query:query,
      p_detected_treatment:intent.treatment||'Dental consultation',
      p_detected_urgency:intent.urgency,
      p_name:name,
      p_phone:phone,
      p_city:city,
      p_pincode:pincode,
      p_budget_max:budget?Number(budget):null,
      p_intent_score:intent.intentScore,
      p_source:'ORGANIC',
      p_landing_page:'/patient-search',
      p_consent_to_contact:consent
    });

    if(error){setStatus(error.message);setLoading(false);return;}

    const treatment=intent.treatment||'dental consultation';
    const {data:reqId}=await supabase.rpc('create_public_patient_request',{
      p_name:name,p_phone:phone,p_treatment:treatment,p_problem_description:query,
      p_urgency:intent.urgency,p_city:city,p_pincode:pincode,
      p_budget_min:null,p_budget_max:budget?Number(budget):null,
      p_preferred_date:null,p_preferred_period:'Any time',p_preference_priority:'BALANCED'
    });

    setStatus(reqId
      ? 'Your request is captured. We are finding suitable dentists for you. Please continue to the matching page.'
      : 'Your enquiry is captured. We will help you find suitable dentists.');
    setLoading(false);

    if(reqId) window.location.href='/find-dentist';
  }

  return <main className="page">
    <header className="pageHead">
      <div>
        <p className="eyebrow">AI PATIENT CONCIERGE</p>
        <h1>Tell us what is wrong. We’ll help you find the right dentist.</h1>
        <p className="muted">Describe your dental problem in your own words. DentalCare identifies your likely treatment need, urgency and preferences, then connects you with suitable dental providers.</p>
      </div>
    </header>

    <section className="panel" style={{maxWidth:900}}>
      <form onSubmit={submit}>
        <div className="formSection">
          <h3>1. Describe your dental problem</h3>
          <textarea
            required
            rows={5}
            placeholder="Example: I have severe pain in my lower right tooth and my face is slightly swollen. I need a dentist in Hyderabad as soon as possible."
            value={query}
            onChange={e=>setQuery(e.target.value)}
          />
          {query&&<div className="patientNote">
            <strong>AI intent detected</strong>
            <span>{intent.treatment||'General dental consultation'} · {intent.urgency.replace('_',' ')} · intent score {intent.intentScore}/100</span>
          </div>}
        </div>

        <div className="formSection">
          <h3>2. How can we contact you?</h3>
          <div className="formGrid">
            <input required placeholder="Your name" value={name} onChange={e=>setName(e.target.value)}/>
            <input required placeholder="Mobile number" value={phone} onChange={e=>setPhone(e.target.value)}/>
            <input placeholder="City" value={city} onChange={e=>setCity(e.target.value)}/>
            <input placeholder="PIN code" value={pincode} onChange={e=>setPincode(e.target.value)}/>
            <input type="number" min="0" placeholder="Maximum budget ₹ (optional)" value={budget} onChange={e=>setBudget(e.target.value)}/>
          </div>
        </div>

        <label style={{display:'flex',gap:10,alignItems:'flex-start',margin:'18px 0'}}>
          <input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>
          <span className="muted">I agree that DentalCare may use my enquiry to find suitable dental providers and contact me about appointment options.</span>
        </label>

        <button className="primary" type="submit" disabled={loading}>
          {loading?'Understanding your requirement…':'Find my dentist with AI'}
        </button>
      </form>
    </section>

    <section className="grid2" style={{marginTop:18,maxWidth:900}}>
      <div className="panel">
        <h3>What happens next?</h3>
        <div className="action"><span className="actionIcon">1</span><div><strong>Understand</strong><small>Natural-language enquiry is converted into a structured patient need.</small></div></div>
        <div className="action"><span className="actionIcon">2</span><div><strong>Match</strong><small>DentalCare considers treatment, location, budget and urgency.</small></div></div>
        <div className="action"><span className="actionIcon">3</span><div><strong>Connect</strong><small>Suitable clinics can receive an appointment request.</small></div></div>
      </div>
      <div className="panel">
        <h3>Looking for a dentist directly?</h3>
        <p className="muted">You can also use the structured dentist matching experience.</p>
        <Link className="primary" href="/find-dentist">Open Find a Dentist</Link>
      </div>
    </section>

    <div className="patientNote"><strong>Important</strong><span>This service does not diagnose dental conditions. Urgent or severe symptoms should be assessed promptly by a qualified dental professional.</span></div>
  </main>
}
