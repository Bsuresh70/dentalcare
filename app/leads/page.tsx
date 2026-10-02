'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { getCurrentClinicId } from '../../lib/clinic';

type Lead={id:string;name:string;phone:string|null;source:string|null;enquiry:string|null;estimated_value:number;status:string};

const STATUSES=['NEW','CONTACTED','QUALIFIED','BOOKED','LOST','CONVERTED'];

export default function Leads(){
  const [leads,setLeads]=useState<Lead[]>([]);
  const [clinicId,setClinicId]=useState<string|null>(null);
  const [show,setShow]=useState(false);
  const [status,setStatus]=useState('');
  const [loading,setLoading]=useState(true);
  const [form,setForm]=useState({name:'',phone:'',source:'Website',enquiry:'',value:''});

  async function load(){
    if(!supabase){setLoading(false);return;}
    setLoading(true);
    const id=await getCurrentClinicId();
    setClinicId(id);
    if(!id){setLoading(false);return;}
    const {data,error}=await supabase.from('leads').select('id,name,phone,source,enquiry,estimated_value,status').eq('clinic_id',id).order('created_at',{ascending:false});
    if(error)setStatus(error.message);
    setLeads((data||[]) as Lead[]);
    setLoading(false);
  }

  useEffect(()=>{load();},[]);

  const pipelineValue=useMemo(()=>leads.reduce((sum,l)=>sum+Number(l.estimated_value||0),0),[leads]);

  async function saveLead(e:FormEvent){
    e.preventDefault();
    if(!supabase){setStatus('Supabase is not configured.');return;}
    if(!clinicId){setStatus('Please sign in and create your clinic first.');return;}
    if(!form.name.trim()){setStatus('Enter the patient / lead name.');return;}
    const {error}=await supabase.from('leads').insert({
      clinic_id:clinicId,
      name:form.name.trim(),
      phone:form.phone.trim()||null,
      source:form.source.trim()||null,
      enquiry:form.enquiry.trim()||null,
      estimated_value:Number(form.value)||0,
      status:'NEW'
    });
    if(error){setStatus(error.message);return;}
    setForm({name:'',phone:'',source:'Website',enquiry:'',value:''});
    setShow(false);
    setStatus('Lead saved successfully.');
    load();
  }

  async function advance(lead:Lead){
    if(!supabase)return;
    const next=lead.status==='NEW'?'CONTACTED':lead.status==='CONTACTED'?'QUALIFIED':lead.status==='QUALIFIED'?'BOOKED':lead.status==='BOOKED'?'CONVERTED':lead.status;
    if(next===lead.status)return;
    if(next==='CONVERTED'){
      const {error}=await supabase.rpc('convert_lead_to_patient',{p_lead_id:lead.id});
      if(error){setStatus(error.message);return;}
      setStatus('Lead converted to patient successfully.');
      load();
      return;
    }
    const {error}=await supabase.from('leads').update({status:next,last_contacted_at:new Date().toISOString()}).eq('id',lead.id);
    if(error){setStatus(error.message);return;}
    setStatus('Lead status updated.');
    load();
  }

  return <main className="page">
    <header className="pageHead">
      <div><p className="eyebrow">PATIENT ACQUISITION</p><h1>Leads</h1><p className="muted">Capture, qualify and convert every enquiry.</p></div>
      <button className="primary small" onClick={()=>setShow(!show)}>+ Add lead</button>
    </header>

    {!clinicId&&!loading&&<div className="toast">Sign in and create your clinic to save real leads. <Link href="/login">Go to login</Link> · <Link href="/onboarding">Set up clinic</Link></div>}
    {status&&<div className="toast">{status}</div>}

    {show&&<form className="formPanel" onSubmit={saveLead}>
      <input required placeholder="Patient / lead name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/>
      <input placeholder="Phone" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/>
      <input placeholder="Source" value={form.source} onChange={e=>setForm({...form,source:e.target.value})}/>
      <input placeholder="Enquiry" value={form.enquiry} onChange={e=>setForm({...form,enquiry:e.target.value})}/>
      <input type="number" min="0" placeholder="Estimated value" value={form.value} onChange={e=>setForm({...form,value:e.target.value})}/>
      <button className="primary small" type="submit">Save lead</button>
    </form>}

    <section className="statsRow">
      <div><span>New</span><strong>{leads.filter(x=>x.status==='NEW').length}</strong></div>
      <div><span>Qualified</span><strong>{leads.filter(x=>x.status==='QUALIFIED').length}</strong></div>
      <div><span>Booked</span><strong>{leads.filter(x=>x.status==='BOOKED').length}</strong></div>
      <div><span>Pipeline value</span><strong>₹{pipelineValue.toLocaleString('en-IN')}</strong></div>
    </section>

    <section className="panel"><div className="tableWrap"><table><thead><tr><th>Lead</th><th>Source</th><th>Enquiry</th><th>Value</th><th>Status</th><th>Action</th></tr></thead><tbody>
      {loading?<tr><td colSpan={6}>Loading leads…</td></tr>:!clinicId?<tr><td colSpan={6}>Sign in and create a clinic to load real lead data.</td></tr>:leads.length===0?<tr><td colSpan={6}>No leads yet. Click + Add lead to create your first lead.</td></tr>:leads.map(l=><tr key={l.id}>
        <td><strong>{l.name}</strong><small>{l.phone||'No phone'}</small></td>
        <td>{l.source||'—'}</td><td>{l.enquiry||'—'}</td><td>₹{Number(l.estimated_value||0).toLocaleString('en-IN')}</td>
        <td><span className={'badge '+l.status.toLowerCase()}>{l.status}</span></td>
        <td>{l.status==='CONVERTED' ? <Link className="tableButton" href="/patients">View patient</Link> : <button className="tableButton" onClick={()=>advance(l)} disabled={!['NEW','CONTACTED','QUALIFIED','BOOKED'].includes(l.status)}>{l.status==='BOOKED'?'Convert to patient':'Advance'}</button>}</td>
      </tr>)}</tbody></table></div></section>
  </main>
}
