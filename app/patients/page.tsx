'use client';
import { useMemo, useState } from 'react';
const patients=[
 {name:'Rahul Kumar',phone:'+91 90000 20001',last:'12 Jan 2026',recall:'Due',revenue:42000},
 {name:'Meena Devi',phone:'+91 90000 20002',last:'18 Jan 2026',recall:'Due',revenue:18000},
 {name:'Arjun Rao',phone:'+91 90000 20003',last:'22 Sep 2026',recall:'20 Dec 2026',revenue:65000},
 {name:'Suresh Reddy',phone:'+91 90000 20004',last:'05 Aug 2026',recall:'Due',revenue:12500}
];
export default function Patients(){
 const [q,setQ]=useState('');
 const filtered=useMemo(()=>patients.filter(p=>(p.name+' '+p.phone).toLowerCase().includes(q.toLowerCase())),[q]);
 return <main className="page"><header className="pageHead"><div><p className="eyebrow">PATIENT RELATIONSHIP</p><h1>Patients</h1><p className="muted">Maintain the relationship beyond the first appointment.</p></div><button className="primary small">+ Add patient</button></header>
 <div className="search"><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search patient name or phone…"/></div>
 <section className="panel"><div className="tableWrap"><table><thead><tr><th>Patient</th><th>Last visit</th><th>Recall</th><th>Lifetime revenue</th><th>Growth action</th></tr></thead><tbody>{filtered.map(p=><tr key={p.phone}><td><strong>{p.name}</strong><small>{p.phone}</small></td><td>{p.last}</td><td>{p.recall==='Due'?<span className="badge open">DUE</span>:p.recall}</td><td>₹{p.revenue.toLocaleString('en-IN')}</td><td><button className="tableButton">View patient</button></td></tr>)}</tbody></table></div></section>
 <div className="patientNote"><strong>Growth insight</strong><span>Patients are not just records. DentalGrowth uses visit history, recall dates and revenue history to identify reactivation opportunities.</span></div>
 </main>
}
