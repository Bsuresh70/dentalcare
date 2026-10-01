'use client';
import { useState } from 'react';

const demoLeads=[
 {name:'Priya Sharma',phone:'+91 90000 10001',source:'Google',enquiry:'Dental implant',value:45000,status:'QUALIFIED'},
 {name:'Rahul Verma',phone:'+91 90000 10002',source:'WhatsApp',enquiry:'Root canal + crown',value:18000,status:'NEW'},
 {name:'Anita Rao',phone:'+91 90000 10003',source:'Website',enquiry:'Teeth whitening',value:9000,status:'CONTACTED'}
];

export default function Leads(){
 const [leads,setLeads]=useState(demoLeads); const [show,setShow]=useState(false);
 const [status,setStatus]=useState('');
 function advance(i:number){setLeads(ls=>ls.map((l,n)=>n===i?{...l,status:l.status==='NEW'?'CONTACTED':l.status==='CONTACTED'?'QUALIFIED':l.status==='QUALIFIED'?'BOOKED':'CONVERTED'}:l));setStatus('Lead status updated.')}
 return <main className="page"><header className="pageHead"><div><p className="eyebrow">PATIENT ACQUISITION</p><h1>Leads</h1><p className="muted">Capture, qualify and convert every enquiry.</p></div><button className="primary small" onClick={()=>setShow(!show)}>+ Add lead</button></header>
 {show&&<div className="formPanel"><input placeholder="Patient / lead name"/><input placeholder="Phone"/><input placeholder="Enquiry"/><input placeholder="Estimated value"/><button className="primary small" onClick={()=>{setShow(false);setStatus('Lead form ready — connect Supabase to save records.')}}>Save lead</button></div>}
 <section className="statsRow"><div><span>New</span><strong>{leads.filter(x=>x.status==='NEW').length}</strong></div><div><span>Qualified</span><strong>{leads.filter(x=>x.status==='QUALIFIED').length}</strong></div><div><span>Booked</span><strong>{leads.filter(x=>x.status==='BOOKED').length}</strong></div><div><span>Pipeline value</span><strong>₹{leads.reduce((s,x)=>s+x.value,0).toLocaleString('en-IN')}</strong></div></section>
 <section className="panel"><div className="tableWrap"><table><thead><tr><th>Lead</th><th>Source</th><th>Enquiry</th><th>Value</th><th>Status</th><th>Action</th></tr></thead><tbody>{leads.map((l,i)=><tr key={l.phone}><td><strong>{l.name}</strong><small>{l.phone}</small></td><td>{l.source}</td><td>{l.enquiry}</td><td>₹{l.value.toLocaleString('en-IN')}</td><td><span className={'badge '+l.status.toLowerCase()}>{l.status}</span></td><td><button className="tableButton" onClick={()=>advance(i)}>Advance</button></td></tr>)}</tbody></table></div></section>{status&&<div className="toast">{status}</div>}</main>
}
