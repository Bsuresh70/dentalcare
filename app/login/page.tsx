'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';

export default function LoginPage(){
  const router=useRouter();
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [mode,setMode]=useState<'login'|'signup'>('login');
  const [status,setStatus]=useState('');
  async function submit(e:FormEvent){
    e.preventDefault();
    if(!supabase){setStatus('Supabase is not configured yet. Add the values from .env.example.');return;}
    setStatus('Working…');
    const result=mode==='login'
      ? await supabase.auth.signInWithPassword({email,password})
      : await supabase.auth.signUp({email,password});
    if(result.error){setStatus(result.error.message);return;}
    if(mode==='signup'){setStatus('Account created. Check your email if confirmation is enabled, then sign in.');return;}
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){setStatus('Signed in, but the session could not be loaded. Please try again.');return;}
    const {data:membership}=await supabase.from('clinic_users').select('clinic_id').eq('user_id',user.id).limit(1).maybeSingle();
    router.push(membership?.clinic_id?'/':'/onboarding');
  }
  return <main className="authPage"><div className="authCard"><div className="brand authBrand"><span className="brandMark">D</span><div><strong>DentalGrowth</strong><small>AI</small></div></div><h1>{mode==='login'?'Welcome back':'Create your clinic account'}</h1><p className="muted">{mode==='login'?'Sign in to manage your patient growth engine.':'Start building your clinic growth workspace.'}</p><form onSubmit={submit}><label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} /></label><label>Password<input type="password" required minLength={6} value={password} onChange={e=>setPassword(e.target.value)} /></label><button className="primary" type="submit">{mode==='login'?'Sign in':'Create account'}</button></form>{status&&<div className="authStatus">{status}</div>}<button className="linkButton" onClick={()=>setMode(mode==='login'?'signup':'login')}>{mode==='login'?'New clinic? Create an account':'Already have an account? Sign in'}</button></div></main>
}
