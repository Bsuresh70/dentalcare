'use client';

import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

type Match={
  dentist_id:string;dentist_name:string;specialty:string|null;clinic_id:string;clinic_name:string;
  city:string|null;pincode:string|null;service_id:string;service_name:string;price:number|null;
  distance_km:number;available:boolean;specialty_match:boolean;budget_fit:boolean;match_score:number;
  earliest_slot:string|null;
};

const treatments=['Tooth pain','Dental implant','Root canal','Braces / aligners','Crown / bridge','Teeth cleaning','Wisdom tooth','Cosmetic dentistry','Pediatric dentistry','Gum treatment','Denture','Second opinion'];
const priorities=[['BALANCED','Balanced'],['EARLIEST','Earliest appointment'],['NEAREST','Nearest clinic'],['LOWEST_PRICE','Lowest price'],['EXPERTISE','Specialist expertise']];

export default function FindDentist(){
  const [form,setForm]=useState({name:'',phone:'',treatment:'',problem:'',urgency:'FLEXIBLE',city:'',pincode:'',budgetMin:'',budgetMax:'',date:'',period:'Any time',priority:'BALANCED'});
  const [matches,setMatches]=useState<Match[]>([]);
  const [status,setStatus]=useState('');
  const [loading,setLoading]=useState(false);
  const [selected,setSelected]=useState<Match[]>([]);
  const [requesting,setRequesting]=useState<string|null>(null);
  const [requestId,setRequestId]=useState<string|null>(null);
  const [autoAssigned,setAutoAssigned]=useState(false);

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    const id=params.get('requestId');
    const treatment=params.get('treatment')||'';
    if(!id||!treatment)return;
    const assigned=params.get('autoAssigned')==='1';
    setAutoAssigned(assigned);
    const next={
      name:params.get('name')||'',
      phone:params.get('phone')||'',
      treatment,
      problem:params.get('problem')||'',
      urgency:params.get('urgency')||'FLEXIBLE',
      city:params.get('city')||'',
      pincode:params.get('pincode')||'',
      budgetMin:'',
      budgetMax:params.get('budgetMax')||'',
      date:'',
      period:'Any time',
      priority:'BALANCED'
    };
    setForm(next);
    setRequestId(id);
    if(assigned){
      setLoading(false);
      setStatus('Your enquiry has been sent to the best eligible DentalCare dentist. The clinic can now contact you.');
      return;
    }
    setLoading(true);
    setStatus('AI has understood your requirement. Finding suitable dentists…');
    supabase?.rpc('find_patient_matches',{p_request_id:id}).then(({data,error})=>{
      if(error){setStatus(error.message);}
      else{
        setMatches((data||[]) as Match[]);
        setStatus(data?.length?data.length+' suitable options found.':'No exact matches found. Try a wider location, budget or date.');
      }
      setLoading(false);
    });
  },[]);

  async function search(e:FormEvent){
    e.preventDefault();
    if(!supabase){setStatus('Patient matching is not configured yet.');return;}
    if(!form.name||!form.treatment){setStatus('Please enter your name and treatment need.');return;}
    setLoading(true);setStatus('Finding suitable dentists…');setMatches([]);setSelected([]);
    const {data:id,error}=await supabase.rpc('create_public_patient_request',{
      p_name:form.name,p_phone:form.phone,p_treatment:form.treatment,p_problem_description:form.problem,
      p_urgency:form.urgency,p_city:form.city,p_pincode:form.pincode,
      p_budget_min:form.budgetMin?Number(form.budgetMin):null,p_budget_max:form.budgetMax?Number(form.budgetMax):null,
      p_preferred_date:form.date||null,p_preferred_period:form.period,p_preference_priority:form.priority
    });
    if(error){setStatus(error.message);setLoading(false);return;}
    setRequestId(id);
    const {data:rows,error:me}=await supabase.rpc('find_patient_matches',{p_request_id:id});
    if(me){setStatus(me.message);setLoading(false);return;}
    setMatches((rows||[]) as Match[]);
    setStatus(rows?.length?rows.length+' suitable options found.':'No exact matches found. Try a wider location, budget or date.');
    setLoading(false);
  }

  async function requestAppointment(m:Match){
    if(!supabase)return;
    setRequesting(m.dentist_id);
    let activeRequestId=requestId;
    if(!activeRequestId){
      const {data:newRequestId,error:createError}=await supabase.rpc('create_public_patient_request',{
        p_name:form.name,p_phone:form.phone,p_treatment:form.treatment,p_problem_description:form.problem,
        p_urgency:form.urgency,p_city:form.city,p_pincode:form.pincode,
        p_budget_min:form.budgetMin?Number(form.budgetMin):null,p_budget_max:form.budgetMax?Number(form.budgetMax):null,
        p_preferred_date:form.date||null,p_preferred_period:form.period,p_preference_priority:form.priority
      });
      if(createError){setStatus(createError.message);setRequesting(null);return;}
      activeRequestId=newRequestId;
      setRequestId(newRequestId);
    }
    const {error}=await supabase.rpc('create_appointment_request',{
      p_patient_request_id:activeRequestId,p_clinic_id:m.clinic_id,p_dentist_id:m.dentist_id,p_service_id:m.service_id,
      p_patient_name:form.name,p_patient_phone:form.phone,p_requested_date:form.date||null,
      p_requested_period:form.period,p_notes:form.problem||null
    });
    setStatus(error?error.message:'Appointment request sent to '+m.dentist_name+'. The clinic can now accept or decline the request.');
    setRequesting(null);
  }

  function toggle(m:Match){
    setSelected(x=>x.some(a=>a.dentist_id===m.dentist_id)?x.filter(a=>a.dentist_id!==m.dentist_id):x.length<3?[...x,m]:x);
  }

  return <main className="page">
    <header className="pageHead">
      <div><p className="eyebrow">PATIENT DISCOVERY</p><h1>Find a Dentist</h1><p className="muted">Tell us what you need. DentalConnect finds suitable options based on treatment, availability, location, budget and your preferences.</p></div>
    </header>

    <section className="panel matchingPanel">
      <form className="matchingForm" onSubmit={search}>
        <div className="formSection"><h3>1. Your requirement</h3>
          <div className="formGrid">
            <input required placeholder="Your name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/>
            <input placeholder="Mobile number" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/>
            <select required value={form.treatment} onChange={e=>setForm({...form,treatment:e.target.value})}><option value="">What do you need?</option>{treatments.map(x=><option key={x}>{x}</option>)}</select>
            <select value={form.urgency} onChange={e=>setForm({...form,urgency:e.target.value})}><option value="FLEXIBLE">Flexible</option><option value="ASAP">As soon as possible</option><option value="TODAY">Today</option><option value="THIS_WEEK">This week</option></select>
          </div>
          <textarea placeholder="Briefly describe your problem (optional)" value={form.problem} onChange={e=>setForm({...form,problem:e.target.value})}/>
        </div>
        <div className="formSection"><h3>2. Location & budget</h3>
          <div className="formGrid">
            <input placeholder="City" value={form.city} onChange={e=>setForm({...form,city:e.target.value})}/>
            <input placeholder="PIN code" value={form.pincode} onChange={e=>setForm({...form,pincode:e.target.value})}/>
            <input type="number" min="0" placeholder="Minimum budget ₹" value={form.budgetMin} onChange={e=>setForm({...form,budgetMin:e.target.value})}/>
            <input type="number" min="0" placeholder="Maximum budget ₹" value={form.budgetMax} onChange={e=>setForm({...form,budgetMax:e.target.value})}/>
          </div>
        </div>
        <div className="formSection"><h3>3. Appointment preference</h3>
          <div className="formGrid">
            <input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/>
            <select value={form.period} onChange={e=>setForm({...form,period:e.target.value})}><option>Any time</option><option>Morning</option><option>Afternoon</option><option>Evening</option></select>
            <select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}>{priorities.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
          </div>
          <button className="primary" type="submit" disabled={loading}>{loading?'Finding dentists…':'Find suitable dentists'}</button>
        </div>
      </form>
    </section>

    {status&&<div className="toast">{status}</div>}

    {autoAssigned&&<section className="panel" style={{border:'1px solid #b8e6df',background:'#f0fbf9'}}>
      <div className="panelHead">
        <div>
          <p className="eyebrow">REQUEST RECEIVED</p>
          <h2>Your dental enquiry has been sent</h2>
          <p className="muted">DentalCare automatically selected an eligible registered dentist based on your treatment requirement and enquiry details. You do not need to choose a dentist from a directory.</p>
        </div>
      </div>
      <div className="patientNote"><strong>What happens next?</strong><span>The registered clinic can contact you to discuss the consultation and appointment. Diagnosis, treatment and final pricing remain with the dentist.</span></div>
    </section>}

    {!autoAssigned&&matches.length>0&&<section className="panel">
      <div className="panelHead"><div><h3>Suitable dentists</h3><p className="muted">Matches are ranked from your stated requirements. Prices are indicative; confirm the final treatment plan with the dentist.</p></div>{selected.length>0&&<span className="badge open">{selected.length}/3 selected</span>}</div>
      <div className="matchGrid">{matches.map((m,i)=><article className="matchCard" key={m.dentist_id+'-'+m.service_id}>
        <div className="matchTop"><span className="matchRank">{i+1}</span><span className="matchScore">{m.match_score}% match</span></div>
        <h3>{m.dentist_name}</h3><p className="muted">{m.specialty||'Dental practitioner'}</p>
        <strong>{m.clinic_name}</strong><small>{m.city||'Location not listed'}{m.pincode?' · '+m.pincode:''}{(m.city||m.pincode)?' · approx. '+m.distance_km+' km':''}</small>
        <div className="matchFacts"><span>🦷 {m.service_name}</span><span>💰 {m.price!=null?'₹'+Number(m.price).toLocaleString('en-IN'):'Price on consultation'}</span><span>🕐 {m.available?'Availability indicated':'Check availability'}</span></div>
        <div className="matchActions"><button className="tableButton" onClick={()=>toggle(m)}>{selected.some(x=>x.dentist_id===m.dentist_id)?'Remove compare':'Compare'}</button><button className="primary small" disabled={requesting===m.dentist_id} onClick={()=>requestAppointment(m)}>{requesting===m.dentist_id?'Sending…':'Request appointment'}</button></div>
      </article>)}</div>
    </section>}

    {selected.length>=2&&<section className="panel"><div className="panelHead"><div><h3>Compare selected options</h3><p className="muted">Compare the factors that matter to you before choosing.</p></div></div>
      <div className="tableWrap"><table><thead><tr><th>Factor</th>{selected.map(m=><th key={m.dentist_id}>{m.dentist_name}</th>)}</tr></thead><tbody>
        <tr><td>Match score</td>{selected.map(m=><td key={m.dentist_id}><strong>{m.match_score}%</strong></td>)}</tr>
        <tr><td>Clinic</td>{selected.map(m=><td key={m.dentist_id}>{m.clinic_name}</td>)}</tr>
        <tr><td>Distance</td>{selected.map(m=><td key={m.dentist_id}>{m.distance_km} km approx.</td>)}</tr>
        <tr><td>Service</td>{selected.map(m=><td key={m.dentist_id}>{m.service_name}</td>)}</tr>
        <tr><td>Indicative price</td>{selected.map(m=><td key={m.dentist_id}>{m.price!=null?'₹'+Number(m.price).toLocaleString('en-IN'):'On consultation'}</td>)}</tr>
        <tr><td>Availability</td>{selected.map(m=><td key={m.dentist_id}>{m.available?'Available':'Needs confirmation'}</td>)}</tr>
      </tbody></table></div>
    </section>}

    <div className="patientNote"><strong>Important</strong><span>DentalConnect matching does not diagnose dental conditions. A dentist must examine the patient and confirm the diagnosis, treatment and final cost.</span></div>
  </main>
}
