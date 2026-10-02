'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';

export default function Onboarding(){
  const router=useRouter();
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [name,setName]=useState('');
  const [phone,setPhone]=useState('');
  const [userEmail,setUserEmail]=useState('');
  const [status,setStatus]=useState('');

  useEffect(()=>{
    if(!supabase){setStatus('Supabase is not configured.');return;}
    supabase.auth.getUser().then(({data:{user}})=>{
      if(user) setUserEmail(user.email||'');
    });
  },[]);

  async function signIn(e:FormEvent){
    e.preventDefault();
    if(!supabase)return;
    setStatus('Signing in…');
    const {error}=await supabase.auth.signInWithPassword({email,password});
    if(error){setStatus(error.message);return;}
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){setStatus('Sign-in succeeded but the session was not loaded. Please try again.');return;}
    setUserEmail(user.email||email);
    setStatus('Signed in. Now create your clinic.');
  }

  async function submit(e:FormEvent){
    e.preventDefault();
    if(!supabase){setStatus('Supabase is not configured.');return;}
    setStatus('Creating your clinic…');
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){setStatus('Please sign in above first.');return;}
    const {error}=await supabase.rpc('create_clinic_for_current_user',{p_name:name,p_phone:phone||null});
    if(error){setStatus(error.message);return;}
    setStatus('Clinic created successfully. Opening your dashboard…');
    setTimeout(()=>router.replace('/'),500);
  }

  return <main className="authPage"><div className="authCard">
    <div className="brand authBrand"><span className="brandMark">D</span><div><strong>DentalGrowth</strong><small>AI</small></div></div>
    <h1>Set up your clinic</h1>
    <p className="muted">First sign in, then create your clinic workspace.</p>
    {!userEmail ? <form onSubmit={signIn}>
      <label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="doctor@example.com"/></label>
      <label>Password<input type="password" required minLength={6} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Your password"/></label>
      <button className="primary" type="submit">Sign in</button>
      <p className="muted" style={{marginTop:14}}>New to DentalGrowth? <a href="/login">Create an account</a></p>
    </form> : <form onSubmit={submit}>
      <div className="authStatus" style={{marginBottom:18}}>Signed in as <strong>{userEmail}</strong></div>
      <label>Clinic name<input required value={name} onChange={e=>setName(e.target.value)} placeholder="SmileCare Dental Clinic"/></label>
      <label>Clinic phone<input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+91"/></label>
      <button className="primary" type="submit">Create clinic</button>
    </form>}
    {status&&<div className="authStatus">{status}</div>}
  </div></main>;
}
