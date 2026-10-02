'use client';

import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { getCurrentClinicId } from '../../lib/clinic';

type Dentist={id:string;name:string;specialty:string|null;phone:string|null;active:boolean};
type Service={id:string;name:string;category:string|null;default_price:number|null;active:boolean};

export default function ClinicSetup(){
  const [clinicId,setClinicId]=useState<string|null>(null);
  const [dentists,setDentists]=useState<Dentist[]>([]);
  const [services,setServices]=useState<Service[]>([]);
  const [dentistName,setDentistName]=useState('');
  const [specialty,setSpecialty]=useState('');
  const [dentistPhone,setDentistPhone]=useState('');
  const [serviceName,setServiceName]=useState('');
  const [category,setCategory]=useState('');
  const [price,setPrice]=useState('');
  const [status,setStatus]=useState('');
  const [loading,setLoading]=useState(true);

  async function load(){
    if(!supabase){setLoading(false);return;}
    const id=await getCurrentClinicId();
    setClinicId(id);
    if(!id){setStatus('Please sign in and create your clinic first.');setLoading(false);return;}
    const [{data:d,error:de},{data:s,error:se}]=await Promise.all([
      supabase.from('dentists').select('id,name,specialty,phone,active').eq('clinic_id',id).order('name'),
      supabase.from('services').select('id,name,category,default_price,active').eq('clinic_id',id).order('name')
    ]);
    if(de||se) setStatus((de||se)?.message||'Unable to load clinic setup.');
    setDentists((d||[]) as Dentist[]);
    setServices((s||[]) as Service[]);
    setLoading(false);
  }

  useEffect(()=>{load()},[]);

  async function addDentist(e:FormEvent){
    e.preventDefault();
    if(!supabase||!clinicId||!dentistName.trim()) return;
    const {error}=await supabase.from('dentists').insert({
      clinic_id:clinicId,name:dentistName.trim(),specialty:specialty.trim()||null,phone:dentistPhone.trim()||null
    });
    if(error){setStatus(error.message);return;}
    setDentistName('');setSpecialty('');setDentistPhone('');setStatus('Dentist added.');load();
  }

  async function addService(e:FormEvent){
    e.preventDefault();
    if(!supabase||!clinicId||!serviceName.trim()) return;
    const {error}=await supabase.from('services').insert({
      clinic_id:clinicId,name:serviceName.trim(),category:category.trim()||null,default_price:price?Number(price):null
    });
    if(error){setStatus(error.message);return;}
    setServiceName('');setCategory('');setPrice('');setStatus('Service added.');load();
  }

  async function toggleDentist(d:Dentist){
    if(!supabase) return;
    const {error}=await supabase.from('dentists').update({active:!d.active}).eq('id',d.id);
    if(error)setStatus(error.message);else load();
  }

  async function toggleService(s:Service){
    if(!supabase) return;
    const {error}=await supabase.from('services').update({active:!s.active}).eq('id',s.id);
    if(error)setStatus(error.message);else load();
  }

  return <main className="page">
    <header className="pageHead">
      <div><p className="eyebrow">CLINIC OPERATIONS</p><h1>Clinic Setup</h1><p className="muted">Configure your dentists and services so appointments carry the right operational context.</p></div>
    </header>

    {status&&<div className="toast">{status}</div>}
    {!supabase&&<div className="toast">Configure Supabase environment variables to use clinic setup.</div>}

    <section className="grid2">
      <div className="panel">
        <div className="panelHead"><div><h3>Dental team</h3><p className="muted">Add dentists who can be assigned to appointments.</p></div></div>
        <form className="stackForm" onSubmit={addDentist}>
          <input required placeholder="Dentist name" value={dentistName} onChange={e=>setDentistName(e.target.value)}/>
          <input placeholder="Specialty (e.g. Implantology)" value={specialty} onChange={e=>setSpecialty(e.target.value)}/>
          <input placeholder="Phone" value={dentistPhone} onChange={e=>setDentistPhone(e.target.value)}/>
          <button className="primary small" type="submit">+ Add dentist</button>
        </form>
        <div className="simpleList">
          {loading?<span className="muted">Loading…</span>:dentists.length===0?<span className="muted">No dentists added yet.</span>:dentists.map(d=><div className="simpleRow" key={d.id}><div><strong>{d.name}</strong><small>{d.specialty||'General dentistry'}{d.phone?' · '+d.phone:''}</small></div><button className="tableButton" onClick={()=>toggleDentist(d)}>{d.active?'Active':'Inactive'}</button></div>)}
        </div>
      </div>

      <div className="panel">
        <div className="panelHead"><div><h3>Services</h3><p className="muted">Add treatments and default prices for faster booking.</p></div></div>
        <form className="stackForm" onSubmit={addService}>
          <input required placeholder="Service name (e.g. Dental Implant)" value={serviceName} onChange={e=>setServiceName(e.target.value)}/>
          <input placeholder="Category (e.g. Implantology)" value={category} onChange={e=>setCategory(e.target.value)}/>
          <input type="number" min="0" placeholder="Default price ₹" value={price} onChange={e=>setPrice(e.target.value)}/>
          <button className="primary small" type="submit">+ Add service</button>
        </form>
        <div className="simpleList">
          {loading?<span className="muted">Loading…</span>:services.length===0?<span className="muted">No services added yet.</span>:services.map(s=><div className="simpleRow" key={s.id}><div><strong>{s.name}</strong><small>{s.category||'Dental service'}{s.default_price!=null?' · ₹'+Number(s.default_price).toLocaleString('en-IN'):''}</small></div><button className="tableButton" onClick={()=>toggleService(s)}>{s.active?'Active':'Inactive'}</button></div>)}
        </div>
      </div>
    </section>

    <div className="patientNote"><strong>Next</strong><span>Active dentists and services will appear directly in the appointment booking form.</span></div>
  </main>
}
