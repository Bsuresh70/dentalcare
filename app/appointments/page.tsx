'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { getCurrentClinicId } from '../../lib/clinic';

type Patient={id:string;full_name:string;phone:string|null};
type Appointment={id:string;patient_id:string|null;scheduled_at:string;status:string;estimated_value:number;notes:string|null;patients?:Patient|null};

const STATUSES=['SCHEDULED','CONFIRMED','COMPLETED','NO_SHOW','CANCELLED'];

const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n);

export default function Appointments(){
  const [clinicId,setClinicId]=useState<string|null>(null);
  const [patients,setPatients]=useState<Patient[]>([]);
  const [appointments,setAppointments]=useState<Appointment[]>([]);
  const [status,setStatus]=useState('');
  const [loading,setLoading]=useState(true);
  const [form,setForm]=useState({patientId:'',date:'',time:'10:00',value:'0',notes:''});

  async function load(){
    if(!supabase) return;
    setLoading(true);
    const id=await getCurrentClinicId();
    setClinicId(id);
    if(!id){setLoading(false);return;}
    const [{data:ps},{data:as,error}] = await Promise.all([
      supabase.from('patients').select('id,full_name,phone').eq('clinic_id',id).order('full_name'),
      supabase.from('appointments').select('id,patient_id,scheduled_at,status,estimated_value,notes,patients(id,full_name,phone)').eq('clinic_id',id).order('scheduled_at',{ascending:false})
    ]);
    if(error) setStatus(error.message);
    setPatients((ps||[]) as Patient[]);
    setAppointments((as||[]) as Appointment[]);
    setLoading(false);
  }

  useEffect(()=>{load()},[]);

  const metrics=useMemo(()=>({
    today:appointments.filter(a=>new Date(a.scheduled_at).toDateString()===new Date().toDateString()).length,
    noShows:appointments.filter(a=>a.status==='NO_SHOW').length,
    cancelled:appointments.filter(a=>a.status==='CANCELLED').length,
    completedValue:appointments.filter(a=>a.status==='COMPLETED').reduce((s,a)=>s+Number(a.estimated_value||0),0)
  }),[appointments]);

  async function createAppointment(){
    if(!supabase||!clinicId||!form.patientId||!form.date||!form.time){setStatus('Select a patient, date and time.');return;}
    const scheduledAt=new Date(form.date+'T'+form.time).toISOString();
    const {error}=await supabase.from('appointments').insert({
      clinic_id:clinicId,patient_id:form.patientId,scheduled_at:scheduledAt,status:'SCHEDULED',
      estimated_value:Number(form.value)||0,notes:form.notes||null
    });
    if(error) setStatus(error.message);
    else {setStatus('Appointment created.');setForm({patientId:'',date:'',time:'10:00',value:'0',notes:''});load();}
  }

  async function updateStatus(a:Appointment,next:string){
    if(!supabase) return;
    const {error}=await supabase.from('appointments').update({status:next}).eq('id',a.id);
    if(error){setStatus(error.message);return;}
    if(next==='NO_SHOW'||next==='CANCELLED'){
      await supabase.rpc('create_followup_from_appointment',{p_appointment_id:a.id,p_channel:'WHATSAPP'});
    }
    setStatus(next==='NO_SHOW'||next==='CANCELLED'?'Follow-up queued for recovery.':'Appointment updated.');
    load();
  }

  async function convertFromAppointment(a:Appointment){
    if(!supabase||!clinicId) return;
    const {data:opps,error}=await supabase.from('opportunities').select('id').eq('clinic_id',clinicId).eq('patient_id',a.patient_id).in('status',['OPEN','IN_PROGRESS','SNOOZED']).order('score',{ascending:false}).limit(1);
    if(error||!opps?.[0]){setStatus('No open opportunity is linked to this patient.');return;}
    const {error:e}=await supabase.rpc('convert_opportunity',{p_opportunity_id:opps[0].id,p_revenue:Number(a.estimated_value||0)});
    setStatus(e?e.message:'Opportunity converted and revenue attributed.');
    load();
  }

  return <main className="page">
    <header className="pageHead"><div><p className="eyebrow">APPOINTMENT OPERATIONS</p><h1>Appointments</h1><p className="muted">Book, track and recover every appointment.</p></div></header>

    {!supabase&&<div className="toast">Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to use live data.</div>}
    {status&&<div className="toast">{status}</div>}

    <section className="statsRow">
      <div><span>Today's appointments</span><strong>{metrics.today}</strong></div>
      <div><span>No-shows</span><strong>{metrics.noShows}</strong></div>
      <div><span>Cancellations</span><strong>{metrics.cancelled}</strong></div>
      <div><span>Completed value</span><strong>{money(metrics.completedValue)}</strong></div>
    </section>

    <section className="panel formPanel">
      <h3 style={{width:'100%',margin:0}}>Create appointment</h3>
      <select value={form.patientId} onChange={e=>setForm({...form,patientId:e.target.value})}>
        <option value="">Select patient</option>
        {patients.map(p=><option key={p.id} value={p.id}>{p.full_name}{p.phone?' · '+p.phone:''}</option>)}
      </select>
      <input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/>
      <input type="time" value={form.time} onChange={e=>setForm({...form,time:e.target.value})}/>
      <input type="number" min="0" placeholder="Estimated value" value={form.value} onChange={e=>setForm({...form,value:e.target.value})}/>
      <input placeholder="Notes" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/>
      <button className="primary small" onClick={createAppointment}>Create appointment</button>
    </section>

    <section className="panel"><div className="tableWrap">
      <table><thead><tr><th>Patient</th><th>Date / time</th><th>Value</th><th>Status</th><th>Recovery</th></tr></thead>
      <tbody>{loading?<tr><td colSpan={5}>Loading appointments…</td></tr>:appointments.length===0?<tr><td colSpan={5}>No appointments yet. Create your first appointment above.</td></tr>:appointments.map(a=><tr key={a.id}>
        <td><strong>{a.patients?.full_name||'Unassigned'}</strong><small>{a.patients?.phone||''}</small></td>
        <td>{new Date(a.scheduled_at).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})}</td>
        <td>{money(Number(a.estimated_value||0))}</td>
        <td><select value={a.status} onChange={e=>updateStatus(a,e.target.value)}>{STATUSES.map(s=><option key={s}>{s}</option>)}</select></td>
        <td>{a.status==='COMPLETED'?<button className="tableButton" onClick={()=>convertFromAppointment(a)}>Attribute revenue</button>:a.status==='NO_SHOW'||a.status==='CANCELLED'?<span className="badge open">FOLLOW-UP QUEUED</span>:<span className="muted">—</span>}</td>
      </tr>)}</tbody></table>
    </div></section>
  </main>
}
