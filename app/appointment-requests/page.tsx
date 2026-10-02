'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { getCurrentClinicId } from '../../lib/clinic';

type Request={id:string;patient_name:string;patient_phone:string|null;requested_date:string|null;requested_period:string|null;notes:string|null;status:string;created_at:string;dentist_id:string|null;service_id:string|null};
type Dentist={id:string;name:string};
type Service={id:string;name:string};

export default function AppointmentRequests(){
  const [clinicId,setClinicId]=useState<string|null>(null);
  const [requests,setRequests]=useState<Request[]>([]);
  const [dentists,setDentists]=useState<Dentist[]>([]);
  const [services,setServices]=useState<Service[]>([]);
  const [status,setStatus]=useState('');
  const [filter,setFilter]=useState('PENDING');
  const [schedule,setSchedule]=useState<Record<string,{date:string;time:string}>>({});

  async function load(){
    if(!supabase)return;
    const id=await getCurrentClinicId();setClinicId(id);
    if(!id)return;
    const [{data:r,error},{data:d},{data:s}]=await Promise.all([
      supabase.from('appointment_requests').select('id,patient_name,patient_phone,requested_date,requested_period,notes,status,created_at,dentist_id,service_id').eq('clinic_id',id).order('created_at',{ascending:false}),
      supabase.from('dentists').select('id,name').eq('clinic_id',id).eq('active',true).order('name'),
      supabase.from('services').select('id,name').eq('clinic_id',id).eq('active',true).order('name')
    ]);
    if(error)setStatus(error.message);
    setRequests((r||[]) as Request[]);setDentists((d||[]) as Dentist[]);setServices((s||[]) as Service[]);
  }
  useEffect(()=>{load()},[]);

  function scheduleFor(r:Request){
    return schedule[r.id]||{date:r.requested_date||'',time:'10:00'};
  }

  async function respond(id:string,next:'ACCEPTED'|'DECLINED'){

    if(!supabase)return;
    const current=visible.find(r=>r.id===id);
    if(next==='ACCEPTED' && current){
      const s=scheduleFor(current);
      if(!s.date||!s.time){setStatus('Please select an appointment date and time.');return;}
      const scheduledAt=new Date(s.date+'T'+s.time).toISOString();
      const {error}=await supabase.rpc('respond_to_appointment_request',{p_request_id:id,p_status:next,p_scheduled_at:scheduledAt});
      setStatus(error?error.message:'Request accepted and appointment scheduled.');
      if(!error)load();
      return;
    }
    const {error}=await supabase.rpc('respond_to_appointment_request',{p_request_id:id,p_status:next,p_scheduled_at:null});
    setStatus(error?error.message:'Request '+next.toLowerCase()+'.');
    if(!error)load();
  }

  const visible=requests.filter(r=>filter==='ALL'||r.status===filter);

  return <main className="page">
    <header className="pageHead"><div><p className="eyebrow">PATIENT DEMAND</p><h1>Appointment Requests</h1><p className="muted">Review requests generated through DentalConnect patient matching.</p></div></header>
    {status&&<div className="toast">{status}</div>}
    <section className="statsRow">
      <div><span>Pending</span><strong>{requests.filter(r=>r.status==='PENDING').length}</strong></div>
      <div><span>Accepted</span><strong>{requests.filter(r=>r.status==='ACCEPTED').length}</strong></div>
      <div><span>Declined</span><strong>{requests.filter(r=>r.status==='DECLINED').length}</strong></div>
    </section>
    <section className="panel">
      <div className="panelHead"><div><h3>Incoming requests</h3><p className="muted">Patients have already expressed interest in your clinic.</p></div><select value={filter} onChange={e=>setFilter(e.target.value)}><option>PENDING</option><option>ACCEPTED</option><option>DECLINED</option><option>ALL</option></select></div>
      <div className="requestGrid">
        {visible.length===0?<div className="emptyCalendar">No requests in this view.</div>:visible.map(r=>{
          const d=dentists.find(x=>x.id===r.dentist_id);
          const s=services.find(x=>x.id===r.service_id);
          return <article className="requestCard" key={r.id}>
            <div><strong>{r.patient_name}</strong><small>{r.patient_phone||'Phone not provided'}</small></div>
            <div className="requestFacts"><span>🦷 {s?.name||'Service requested'}</span><span>👨‍⚕️ {d?.name||'Any dentist'}</span><span>📅 {r.requested_date?new Date(r.requested_date+'T00:00:00').toLocaleDateString('en-IN'):'Flexible'} · {r.requested_period||'Any time'}</span></div>
            {r.notes&&<p className="muted">{r.notes}</p>}
            <div className="matchActions">{r.status==='PENDING'?<><button className="primary small" onClick={()=>respond(r.id,'ACCEPTED')}>Accept</button><button className="tableButton" onClick={()=>respond(r.id,'DECLINED')}>Decline</button></>:<span className="badge open">{r.status}</span>}</div>
          </article>
        })}
      </div>
    </section>
  </main>
}
