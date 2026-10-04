'use client';
import { useEffect, useMemo, useState } from 'react';
type Place={id:string;name:string;address:string|null;mapsUri:string|null;latitude:number|null;longitude:number|null;primaryType:string|null;businessStatus:string|null};
export default function DentistsDirectory(){
  const [places,setPlaces]=useState<Place[]>([]);
  const [loading,setLoading]=useState(true);
  const [message,setMessage]=useState('');
  const [query,setQuery]=useState('');
  async function load(){
    setLoading(true); setMessage('');
    try{
      const response=await fetch('/api/dentists/hyderabad',{cache:'no-store'});
      const data=await response.json();
      if(!response.ok) throw new Error(data.error||'Unable to load Hyderabad dentists.');
      setPlaces(data.places||[]);
      setMessage(data.refreshed_at?'Live discovery refreshed '+new Date(data.refreshed_at).toLocaleString('en-IN')+'.':'');
    }catch(error){setMessage(error instanceof Error?error.message:'Unable to load directory.');}
    finally{setLoading(false);}
  }
  useEffect(()=>{load()},[]);
  const visible=useMemo(()=>{const q=query.trim().toLowerCase();if(!q)return places;return places.filter(p=>p.name.toLowerCase().includes(q)||(p.address||'').toLowerCase().includes(q)||(p.primaryType||'').toLowerCase().includes(q));},[places,query]);
  return <main className="page">
    <header className="pageHead"><div><p className="eyebrow">DENTIST NETWORK</p><h1>Hyderabad Dentist Directory</h1><p className="muted">AI-assisted discovery of publicly listed dental providers for patient matching and referral opportunities.</p></div><button className="primaryButton" onClick={load} disabled={loading}>{loading?'Discovering…':'Refresh directory'}</button></header>
    {message&&<div className="toast">{message}</div>}
    <section className="statsRow"><div><span>Providers discovered</span><strong>{places.length}</strong></div><div><span>City</span><strong>Hyderabad</strong></div><div><span>State</span><strong>Telangana</strong></div><div><span>Discovery</span><strong>Public web</strong></div></section>
    <section className="panel"><div className="panelHead"><div><h3>Dental providers</h3><p className="muted">Search by clinic, area or dental specialty.</p></div><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search Hyderabad…" /></div>
      <div className="tableWrap"><table><thead><tr><th>Provider</th><th>Address</th><th>Type</th><th>Status</th><th>Map</th></tr></thead><tbody>
      {loading?<tr><td colSpan={5}>Discovering public dental providers…</td></tr>:visible.length===0?<tr><td colSpan={5}>No matching providers found.</td></tr>:visible.map(p=><tr key={p.id}><td><strong>{p.name}</strong><small>Place ID: {p.id}</small></td><td>{p.address||'—'}</td><td>{p.primaryType||'Dentist / dental clinic'}</td><td>{p.businessStatus||'—'}</td><td>{p.mapsUri?<a href={p.mapsUri} target="_blank" rel="noreferrer">Open Maps</a>:'—'}</td></tr>)}
      </tbody></table></div></section>
    <div className="patientNote"><strong>Weekly intelligence refresh</strong><span>DentalCare will re-check Hyderabad public listings weekly, detect newly discovered providers and keep the directory ready for patient matching. Provider details are fetched live from the configured discovery source.</span></div>
  </main>
}
