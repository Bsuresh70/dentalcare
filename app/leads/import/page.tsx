'use client';
import { useState } from 'react';
export default function ImportLeads(){
 const [file,setFile]=useState<File|null>(null); const [status,setStatus]=useState('');
 return <main className="page"><header className="pageHead"><div><p className="eyebrow">DATA IMPORT</p><h1>Import leads</h1><p className="muted">Bring existing enquiries into DentalGrowth AI using CSV.</p></div></header>
 <section className="panel importPanel"><h3>CSV format</h3><p className="muted">Recommended columns: name, phone, source, enquiry, estimated_value, status.</p><div className="drop"><input type="file" accept=".csv,text/csv" onChange={e=>setFile(e.target.files?.[0]||null)}/>{file&&<strong>{file.name}</strong>}</div><button className="primary" onClick={()=>setStatus(file?'File selected. Supabase import processing will be connected next.':'Select a CSV file first.')}>Import CSV</button>{status&&<div className="toast">{status}</div>}</section>
 <section className="panel"><h3>Example</h3><pre>{'name,phone,source,enquiry,estimated_value,status\nPriya Sharma,+919000010001,Google,Dental implant,45000,NEW\nRahul Verma,+919000010002,WhatsApp,Root canal,18000,QUALIFIED'}</pre></section>
 </main>
}
