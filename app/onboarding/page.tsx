'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';

export default function Onboarding(){
  const router=useRouter();
  const [name,setName]=useState(''); const [phone,setPhone]=useState(''); const [status,setStatus]=useState('');
  useEffect(()=>{
    if(!supabase){setStatus('Connect Supabase first.');return;}
    supabase.auth.getUser().then(({data:{user}})=>{
      if(!user) router.replace('/login');
    });
  },[router]);
  async function submit(e:FormEvent){
    e.preventDefault();
    if(!supabase){setStatus('Connect Supabase first.');return;}
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){setStatus('Please sign in first.');return;}
    const {data:clinic,error}=await supabase.from('clinics').insert({name,phone}).select().single();
    if(error){setStatus(error.message);return;}
    await supabase.from('profiles').upsert({id:user.id,full_name:user.email?.split('@')[0]||'Clinic Owner'});
    const {error:memberError}=await supabase.from('clinic_users').insert({clinic_id:clinic.id,user_id:user.id,role:'CLINIC_OWNER'});
    if(memberError){setStatus(memberError.message);return;}
    setStatus('Clinic created successfully. Your DentalGrowth workspace is ready.');
    setTimeout(()=>router.replace('/'),600);
  }
  return <main className="authPage"><div className="authCard"><div className="brand authBrand"><span className="brandMark">D</span><div><strong>DentalGrowth</strong><small>AI</small></div></div><h1>Set up your clinic</h1><p className="muted">This creates the first clinic workspace for your account.</p><form onSubmit={submit}><label>Clinic name<input required value={name} onChange={e=>setName(e.target.value)} placeholder="SmileCare Dental Clinic"/></label><label>Clinic phone<input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+91"/></label><button className="primary" type="submit">Create clinic</button></form>{status&&<div className="authStatus">{status}</div>}<p className="muted" style={{marginTop:18}}>Already have an account? <a href="/login">Sign in</a></p></div></main>
}
