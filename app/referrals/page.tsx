'use client';

import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { getCurrentClinicId } from '../../lib/clinic';

type Patient={id:string;full_name:string;phone:string|null};
type Dentist={id:string;name:string;specialty:string|null};
type Clinic={clinic_id:string;clinic_name:string;city:string|null;pincode:string|null};
type Referral={id:string;treatment:string;reason:string|null;status:string;created_at:string;target_clinic_id:string;target?:Clinic};

export default function Referrals(){
  const [clinicId,setClinicId]=useState<string|null>(null);
  const [patients,setPatients]=useState<Patient[]>([]);
  const [dentists,setDentists]=useState<Dentist[]>([]);
  const [clinics,setClinics]=useState<Clinic[]>([]);
  const [referrals,setReferrals]=useState<Referral[]>([]);
  const [form,setForm]=useState({patientId:'',targetClinic:'',treatment:'',reason:'',dentistId:'',notes:''});
  const [status,setStatus]=useState('');

  async function load(){
    if(!supabase)return;
    const id=await getCurrentClinicId();setClinicId(id);
    if(!id)return;
    const [{data:ps},{data:ds},{data:cs},{data:rs,error}]=await Promise.all([
      supabase.from('patients').select('id,full_name,phone').eq('clinic_id',id).order('full_name'),
      supabase.from('dentists').select('id,name,specialty').eq('clinic_id',id).eq('active',true).order('name'),
      supabase.rpc('get_network_clinics',{p_exclude_clinic:id}),
      supabase.from('referrals').select('id,treatment,reason,status,created_at,target_clinic_id').eq('source_clinic_id',id).order('created_at',{ascending:false})
    ]);
    if(error)setStatus(error.message);
    setPatients((ps||[]) as Patient[]);setDentists((ds||[]) as Dentist[]);setClinics((cs||[]) as Clinic[]);setReferrals((rs||[]) as Referral[]);
  }
  useEffect(()=>{load()},[]);

  async function create(e:FormEvent){
    e.preventDefault();
    if(!supabase||!clinicId||!form.patientId||!form.targetClinic||!form.treatment){setStatus('Select a patient, destination clinic and treatment.');return;}
    const {error}=await supabase.rpc('create_referral',{
      p_source_clinic_id:clinicId,p_target_clinic_id:form.targetClinic,p_patient_id:form.patientId,
      p_patient_request_id:null,p_treatment:form.treatment,p_reason:form.reason||null,
      p_referring_dentist_id:form.dentistId||null,p_receiving_dentist_id:null,p_notes:form.notes||null
    });
    if(error){setStatus(error.message);return;}
    setStatus('Referral created and sent to the destination clinic.');setForm({patientId:'',targetClinic:'',treatment:'',reason:'',dentistId:'',notes:''});load();
  }

  return <main className="page">
    <header className="pageHead"><div><p className="eyebrow">DENTAL PROFESSIONAL NETWORK</p><h1>Patient Referrals</h1><p className="muted">Refer cases you cannot handle to another DentalConnect clinic and keep the patient journey connected.</p></div></header>
    {status&&<div className="toast">{status}</div>}
    <section className="panel">
      <div className="panelHead"><div><h3>Create referral</h3><p className="muted">The receiving clinic can accept and continue the case.</p></div></div>
      <form className="formGrid referralForm" onSubmit={create}>
        <select required value={form.patientId} onChange={e=>setForm({...form,patientId:e.target.value})}><option value="">Select patient</option>{patients.map(p=><option key={p.id} value={p.id}>{p.full_name}{p.phone?' · '+p.phone:''}</option>)}</select>
        <select required value={form.targetClinic} onChange={e=>setForm({...form,targetClinic:e.target.value})}><option value="">Refer to clinic</option>{clinics.map(c=><option key={c.clinic_id} value={c.clinic_id}>{c.clinic_name}{c.city?' · '+c.city:''}</option>)}</select>
        <select value={form.dentistId} onChange={e=>setForm({...form,dentistId:e.target.value})}><option value="">Referring dentist</option>{dentists.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <input required placeholder="Treatment required" value={form.treatment} onChange={e=>setForm({...form,treatment:e.target.value})}/>
        <input placeholder="Reason for referral" value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})}/>
        <input placeholder="Notes for receiving clinic" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/>
        <button className="primary small" type="submit">Send referral</button>
      </form>
    </section>
    <section className="panel"><div className="panelHead"><div><h3>Referral history</h3><p className="muted">Track cases sent to other clinics.</p></div></div>
      <div className="tableWrap"><table><thead><tr><th>Treatment</th><th>Destination</th><th>Reason</th><th>Date</th><th>Status</th></tr></thead><tbody>
        {referrals.length===0?<tr><td colSpan={5}>No referrals yet.</td></tr>:referrals.map(r=>{const c=clinics.find(x=>x.clinic_id===r.target_clinic_id);return <tr key={r.id}><td><strong>{r.treatment}</strong></td><td>{c?.clinic_name||r.target_clinic_id}</td><td>{r.reason||'—'}</td><td>{new Date(r.created_at).toLocaleDateString('en-IN')}</td><td><span className="badge open">{r.status}</span></td></tr>})}
      </tbody></table></div>
    </section>
  </main>
}
