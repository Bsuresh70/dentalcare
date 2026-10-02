'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { getCurrentClinicId } from '../../../lib/clinic';

type Patient = { id:string; full_name:string; phone:string|null; email:string|null; last_visit_at:string|null; next_recall_at:string|null; total_revenue:number; notes:string|null; created_at:string };
type Appointment = { id:string; scheduled_at:string; status:string; estimated_value:number; notes:string|null };
const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n);

export default function PatientProfile(){
  const params=useParams();
  const patientId=String(params.id||'');
  const [patient,setPatient]=useState<Patient|null>(null);
  const [appointments,setAppointments]=useState<Appointment[]>([]);
  const [status,setStatus]=useState('');
  const [loading,setLoading]=useState(true);

  async function load(){
    if(!supabase||!patientId){setLoading(false);return;}
    const clinicId=await getCurrentClinicId();
    if(!clinicId){setStatus('Please sign in and create your clinic first.');setLoading(false);return;}
    const [{data:p,error:pe},{data:a,error:ae}]=await Promise.all([
      supabase.from('patients').select('id,full_name,phone,email,last_visit_at,next_recall_at,total_revenue,notes,created_at').eq('id',patientId).eq('clinic_id',clinicId).single(),
      supabase.from('appointments').select('id,scheduled_at,status,estimated_value,notes').eq('patient_id',patientId).eq('clinic_id',clinicId).order('scheduled_at',{ascending:false})
    ]);
    if(pe){setStatus(pe.message);setLoading(false);return;}
    if(ae)setStatus(ae.message);
    setPatient(p as Patient); setAppointments((a||[]) as Appointment[]); setLoading(false);
  }
  useEffect(()=>{load();},[patientId]);

  if(loading) return <main className="page"><div className="toast">Loading patient profile…</div></main>;
  if(!patient) return <main className="page"><div className="toast">{status||'Patient not found.'} <Link href="/patients">Back to patients</Link></div></main>;

  return <main className="page">
    <header className="pageHead"><div><p className="eyebrow">PATIENT PROFILE</p><h1>{patient.full_name}</h1><p className="muted">{patient.phone||'No phone'}{patient.email?' · '+patient.email:''}</p></div><Link className="primary small" href="/appointments">+ Book appointment</Link></header>
    {status&&<div className="toast">{status}</div>}
    <section className="statsRow">
      <div><span>Lifetime revenue</span><strong>{money(Number(patient.total_revenue||0))}</strong></div>
      <div><span>Last visit</span><strong>{patient.last_visit_at?new Date(patient.last_visit_at).toLocaleDateString('en-IN'):'—'}</strong></div>
      <div><span>Next recall</span><strong>{patient.next_recall_at?new Date(patient.next_recall_at).toLocaleDateString('en-IN'):'Not set'}</strong></div>
      <div><span>Appointments</span><strong>{appointments.length}</strong></div>
    </section>
    <section className="panel"><div className="panelHead"><h3>Appointment history</h3><Link className="tableButton" href="/appointments">Manage appointments</Link></div><div className="tableWrap">
      <table><thead><tr><th>Date / time</th><th>Status</th><th>Value</th><th>Notes</th></tr></thead><tbody>
      {appointments.length===0?<tr><td colSpan={4}>No appointments yet.</td></tr>:appointments.map(a=><tr key={a.id}><td>{new Date(a.scheduled_at).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})}</td><td><span className={'badge '+a.status.toLowerCase()}>{a.status}</span></td><td>{money(Number(a.estimated_value||0))}</td><td>{a.notes||'—'}</td></tr>)}
      </tbody></table>
    </div></section>
    <section className="panel"><h3>Patient notes</h3><p className="muted">{patient.notes||'No notes yet.'}</p></section>
    <Link href="/patients" className="muted">← Back to patients</Link>
  </main>;
}
