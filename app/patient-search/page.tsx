'use client';

import { FormEvent, useState } from 'react';
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

async function detectIntent(query:string){
  const response=await fetch('/api/patient-intent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query})});
  if(!response.ok) throw new Error('Intent analysis failed');
  return response.json();
}

export default function PatientSearch(){
  const [query,setQuery]=useState('');
  const [name,setName]=useState('');
  const [phone,setPhone]=useState('');
  const [city,setCity]=useState('Hyderabad');
  const [pincode,setPincode]=useState('');
  const [budget,setBudget]=useState('');
  const [consent,setConsent]=useState(false);\n  const [locationConsent,setLocationConsent]=useState(false);
  const [status,setStatus]=useState('');
  const [loading,setLoading]=useState(false);
  const [submitted,setSubmitted]=useState(false);

  const [intent,setIntent]=useState({treatment:'',urgency:'FLEXIBLE',intentScore:0,summary:'',ai:false,provider:''});

  async function submit(e:FormEvent){
    e.preventDefault();
    if(!supabase){setStatus('Patient search is not configured yet.');return;}
    if(query.trim().length<8){setStatus('Please describe your dental need in a little more detail.');return;}
    if(!name.trim()||!phone.trim()){setStatus('Please enter your name and mobile number so a clinic can contact you.');return;}
    if(!consent){setStatus('Please allow DentalGrowth AI to share your enquiry with a suitable registered clinic.');return;}\n    if(!locationConsent){setStatus('Please allow location access so we can verify which registered dentists are within 10 km.');return;}

    setLoading(true);
    setStatus('AI is understanding your requirement and preparing suitable dentist options…');
    let detected;
    try{ detected=await detectIntent(query); setIntent(detected); }
    catch{ setStatus('AI analysis was unavailable. Please try again.'); setLoading(false); return; }

    const {data:intentId,error}=await supabase.rpc('capture_patient_search_intent',{
      p_search_query:query,
      p_detected_treatment:detected.treatment||'Dental consultation',
      p_detected_urgency:detected.urgency,
      p_name:name,
      p_phone:phone,
      p_city:city,
      p_pincode:pincode,
      p_budget_max:budget?Number(budget):null,
      p_intent_score:detected.intentScore,
      p_source:'ORGANIC',
      p_landing_page:'/patient-search',
      p_consent_to_contact:consent
    });

    if(error){setStatus(error.message);setLoading(false);return;}

    // capture_patient_search_intent returns the search-intent id. The database
    // creates one patient request; geolocation then triggers strict 10 km matching.
    const intentIdValue=intentId as string|undefined;
    if(!intentIdValue){
      setStatus('Your enquiry was captured, but its reference could not be confirmed. Please contact support.');
      setLoading(false);
      return;
    }

    if(!navigator.geolocation){
      setStatus('Your enquiry was captured, but this browser cannot provide location for 10 km matching. Please use a location-enabled browser.');
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(async position=>{
      const {data:assignmentId,error:locationError}=await supabase.rpc('finalize_patient_request_location',{
        p_intent_id:intentIdValue,
        p_latitude:position.coords.latitude,
        p_longitude:position.coords.longitude
      });
      if(locationError){
        setStatus('Your enquiry was captured, but location matching could not be completed: '+locationError.message);
      }else if(assignmentId){
        setStatus('Your enquiry has been offered to the highest-ranked eligible registered dentist within 10 km. If the clinic does not respond within 10 minutes, the system will offer it to the next eligible clinic.');
      }else{
        setStatus('Your enquiry is safely recorded. No eligible subscribed dentist with verified location and matching treatment was found within 10 km yet.');
      }
      setLoading(false);
      setSubmitted(true);
    },()=>{
      setStatus('Your enquiry was captured, but location permission was not granted. We need your location to enforce the 10 km dentist radius. Please try again and allow location access.');
      setLoading(false);
    },{enableHighAccuracy:false,timeout:12000,maximumAge:300000});
    return;
  }

  if(submitted){
    return <main className="page">
      <header className="pageHead"><div>
        <p className="eyebrow">DENTALCARE · PATIENT ENQUIRY</p>
        <h1>Thank you, {name}. Your enquiry has been received.</h1>
        <p className="muted">{status}</p>
      </div></header>
      <section className="panel" style={{maxWidth:900}}>
        <h3>Enquiry summary</h3>
        <p><strong>Likely treatment:</strong> {intent.treatment||'Dental consultation'}</p>
        <p><strong>Urgency identified by AI:</strong> {intent.urgency.replace('_',' ')}</p>
        <p><strong>Preferred treatment city:</strong> {city||'Not provided'} {pincode ? '· '+pincode : ''}</p>
        <p className="muted">A clinic may contact you to discuss availability. An appointment is not booked until the clinic confirms it. DentalCare does not diagnose conditions; seek prompt professional care for severe or worsening symptoms.</p>
        <button className="primary" onClick={()=>{setSubmitted(false);setStatus('');setQuery('');setName('');setPhone('');setPincode('');setBudget('');setConsent(false);setLocationConsent(false);setIntent({treatment:'',urgency:'FLEXIBLE',intentScore:0,summary:'',ai:false,provider:''});}}>Submit another enquiry</button>
      </section>
    </main>;
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
          <h3>2. Where do you want treatment, and how can we contact you?</h3>
          <p className="muted">DentalCare is designed for people worldwide seeking dental care in Hyderabad. Enter the city where you want treatment—not necessarily where you currently live.</p>
          <div className="formGrid">
            <input required placeholder="Your name" value={name} onChange={e=>setName(e.target.value)}/>
            <input required type="tel" autoComplete="tel" placeholder="Phone with country code (e.g. +1, +44, +91)" value={phone} onChange={e=>setPhone(e.target.value)}/>
            <input required placeholder="City where you want treatment (e.g. Hyderabad)" value={city} onChange={e=>setCity(e.target.value)}/>
            <input placeholder="PIN code" value={pincode} onChange={e=>setPincode(e.target.value)}/>
            <input type="number" min="0" placeholder="Maximum budget ₹ (optional)" value={budget} onChange={e=>setBudget(e.target.value)}/>
          </div>
        </div>

        <label style={{display:'flex',gap:10,alignItems:'flex-start',margin:'18px 0'}}>
          <input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>
          <span className="muted">I consent to DentalGrowth AI sharing my enquiry and contact details with one suitable registered clinic at a time, and contacting me about this enquiry by phone or message. If the clinic does not respond within 10 minutes, my enquiry may be offered to the next suitable clinic. I understand that an appointment is not confirmed until the clinic confirms it.</span>
        </label>
        <label style={{display:'flex',gap:10,alignItems:'flex-start',margin:'10px 0 18px'}}>
          <input type="checkbox" checked={locationConsent} onChange={e=>setLocationConsent(e.target.checked)}/>
          <span className="muted">I consent to sharing my device location once for matching registered dentists within 10 km of me. My location is used for matching this enquiry.</span>
        </label>

        {status&&!submitted&&<div className="patientNote" role="status"><strong>Status</strong><span>{status}</span></div>}
        <button className="primary" type="submit" disabled={loading}>
          {loading?'Understanding your requirement…':'Find my dentist with AI'}
        </button>
      </form>
    </section>

    <section className="grid2" style={{marginTop:18,maxWidth:900}}>
      <div className="panel">
        <h3>What happens next?</h3>
        <div className="action"><span className="actionIcon">1</span><div><strong>Understand</strong><small>Natural-language enquiry is converted into a structured patient need.</small></div></div>
        <div className="action"><span className="actionIcon">2</span><div><strong>Match</strong><small>DentalCare considers your requested treatment city, eligible clinic services, budget and urgency.</small></div></div>
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
