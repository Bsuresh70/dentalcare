'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { getCurrentClinicId } from '../../lib/clinic';

type Followup={id:string;patient_id:string|null;lead_id:string|null;opportunity_id:string|null;channel:string;scheduled_for:string;status:string;message_template:string|null;attempts:number;patients?:{full_name:string;phone:string|null}|null};

const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n);

function whatsappUrl(phone:string|null,message:string|null){
  if(!phone) return null;
  const digits=phone.replace(/\D/g,'');
  if(!digits) return null;
  return 'https://wa.me/'+digits+'?text='+encodeURIComponent(message||'');
}

export default function FollowUps(){
  const [items,setItems]=useState<Followup[]>([]);
  const [clinicId,setClinicId]=useState<string|null>(null);
  const [status,setStatus]=useState('');
  const [filter,setFilter]=useState('PENDING');

  async function load(){
    if(!supabase)return;
    const id=await getCurrentClinicId();setClinicId(id);
    if(!id)return;
    const {data,error}=await supabase.from('followups').select('id,patient_id,lead_id,opportunity_id,channel,scheduled_for,status,message_template,attempts').eq('clinic_id',id).order('scheduled_for',{ascending:true});
    if(error)setStatus(error.message);
    const {data:patientRows}=await supabase.from('patients').select('id,full_name,phone').eq('clinic_id',id);
    const patientById=new Map((patientRows||[]).map(p=>[p.id,p]));
    const followupRows=(data||[]) as Omit<Followup,'patients'>[];
    setItems(followupRows.map(f=>({...f,patients:f.patient_id?patientById.get(f.patient_id)||null:null})));
  }
  useEffect(()=>{load()},[]);

  const visible=useMemo(()=>filter==='ALL'?items:items.filter(x=>x.status===filter),[items,filter]);

  async function mark(id:string,next:string){
    if(!supabase)return;
    const {error}=await supabase.rpc('mark_followup_status',{p_followup_id:id,p_status:next});
    setStatus(error?error.message:'Follow-up updated.');
    load();
  }

  async function sendViaWhatsApp(f:Followup){
    const url=whatsappUrl(f.patients?.phone||null,f.message_template);
    if(!url){setStatus('No valid patient phone number is available.');return;}
    window.open(url,'_blank','noopener,noreferrer');
    await mark(f.id,'SENT');
  }

  return <main className="page">
    <header className="pageHead"><div><p className="eyebrow">PATIENT RETENTION</p><h1>Follow-ups</h1><p className="muted">Turn missed appointments, recalls and opportunities into conversations.</p></div>
      <select value={filter} onChange={e=>setFilter(e.target.value)}><option>PENDING</option><option>SENT</option><option>COMPLETED</option><option>CANCELLED</option><option>ALL</option></select>
    </header>
    {status&&<div className="toast">{status}</div>}
    {!supabase&&<div className="toast">Configure Supabase environment variables to use live follow-ups.</div>}
    <section className="statsRow">
      <div><span>Pending</span><strong>{items.filter(x=>x.status==='PENDING').length}</strong></div>
      <div><span>Sent</span><strong>{items.filter(x=>x.status==='SENT').length}</strong></div>
      <div><span>Completed</span><strong>{items.filter(x=>x.status==='COMPLETED').length}</strong></div>
      <div><span>WhatsApp actions</span><strong>{items.filter(x=>x.channel==='WHATSAPP'&&x.status==='PENDING').length}</strong></div>
    </section>
    <section className="panel"><div className="tableWrap"><table><thead><tr><th>Patient</th><th>Due</th><th>Channel</th><th>Message</th><th>Status</th><th>Action</th></tr></thead><tbody>
      {visible.length===0?<tr><td colSpan={6}>No follow-ups in this view.</td></tr>:visible.map(f=><tr key={f.id}>
        <td><strong>{f.patients?.full_name||'Patient'}</strong><small>{f.patients?.phone||'No phone'}</small></td>
        <td>{new Date(f.scheduled_for).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})}</td>
        <td>{f.channel}</td>
        <td style={{whiteSpace:'normal',minWidth:280}}>{f.message_template||'No message template'}</td>
        <td><span className="badge open">{f.status}</span></td>
        <td>
          {f.status==='PENDING'&&<div style={{display:'flex',gap:6}}>
            <button className="tableButton" onClick={()=>sendViaWhatsApp(f)}>WhatsApp</button>
            <button className="tableButton" onClick={()=>mark(f.id,'COMPLETED')}>Done</button>
          </div>}
          {f.status==='SENT'&&<button className="tableButton" onClick={()=>mark(f.id,'COMPLETED')}>Mark complete</button>}
        </td>
      </tr>)}</tbody></table></div></section>
    <div className="patientNote"><strong>Automation boundary</strong><span>Phase 5 prepares and records the action. WhatsApp API/n8n automation can be connected next without changing the clinic data model.</span></div>
  </main>
}
