'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { getCurrentClinicId } from '../../lib/clinic';

type Summary={pending_actions:number;open_opportunities:number;opportunity_value:number;events_24h:number;last_run:string|null};

export default function Autopilot(){
  const [clinicId,setClinicId]=useState<string|null>(null);
  const [summary,setSummary]=useState<Summary|null>(null);
  const [diagnostics,setDiagnostics]=useState<any|null>(null);
  const [runs,setRuns]=useState<any[]>([]);
  const [events,setEvents]=useState<any[]>([]);
  const [message,setMessage]=useState('');

  async function load(){
    if(!supabase)return;
    const id=await getCurrentClinicId(); setClinicId(id);
    if(!id)return;
    const [s,diagnosticsResult,r,e]=await Promise.all([
      supabase.rpc('get_automation_summary',{p_clinic_id:id}),
      supabase.rpc('get_automation_diagnostics',{p_clinic_id:id}),
      supabase.from('automation_runs').select('id,started_at,completed_at,status,events_processed,actions_created,error_message').eq('clinic_id',id).order('started_at',{ascending:false}).limit(8),
      supabase.from('automation_events').select('id,event_type,entity_type,source,created_at').eq('clinic_id',id).order('created_at',{ascending:false}).limit(12)
    ]);
    if(s.error)setMessage(s.error.message); else setSummary(s.data as Summary);
    if(diagnosticsResult.error)setMessage(diagnosticsResult.error.message); else setDiagnostics(diagnosticsResult.data);
    setRuns(r.data||[]); setEvents(e.data||[]);
  }

  useEffect(()=>{load()},[]);

  async function run(){
    if(!supabase||!clinicId)return;
    setMessage('DentalCare Autopilot is running a full intelligence scan…');
    const {data,error}=await supabase.rpc('run_clinic_automation',{p_clinic_id:clinicId});
    setMessage(error ? error.message : 'Autopilot completed. New actions have been prepared where rules matched.');
    await load();
    if(data) console.log(data);
  }

  return <main className="page">
    <header className="pageHead">
      <div><p className="eyebrow">AUTONOMOUS OPERATIONS</p><h1>DentalCare Autopilot</h1><p className="muted">Events become opportunities, follow-ups and next actions without manual data chasing.</p></div>
      <button className="primaryButton" onClick={run} disabled={!clinicId}>Run Autopilot Now</button>
    </header>
    {message&&<div className="toast">{message}</div>}
    {!supabase&&<div className="toast">Configure Supabase environment variables first.</div>}

    <section className="statsRow">
      <div><span>Open leads</span><strong>{diagnostics?.open_leads??'—'}</strong></div>
      <div><span>Due recalls</span><strong>{diagnostics?.due_recalls??'—'}</strong></div>
      <div><span>Dormant patients</span><strong>{diagnostics?.dormant_patients??'—'}</strong></div>
      <div><span>Missed / cancelled · 30d</span><strong>{diagnostics?.recent_missed_appointments??'—'}</strong></div>
    </section>
    <section className="statsRow">
      <div><span>Pending actions</span><strong>{summary?.pending_actions??'—'}</strong></div>
      <div><span>Open opportunities</span><strong>{summary?.open_opportunities??'—'}</strong></div>
      <div><span>Opportunity value</span><strong>₹{Number(summary?.opportunity_value||0).toLocaleString('en-IN')}</strong></div>
      <div><span>Events · 24h</span><strong>{summary?.events_24h??'—'}</strong></div>
    </section>

    <section className="grid2">
      <div className="panel">
        <div className="panelHead"><div><h3>What Autopilot does</h3><p className="muted">Safe operational rules currently enabled.</p></div></div>
        <div className="action"><span className="actionIcon">1</span><div><strong>Detect</strong><small>Leads, appointments, patients and NRI cases create system events.</small></div></div>
        <div className="action"><span className="actionIcon">2</span><div><strong>Prioritize</strong><small>High-intent leads, no-shows, cancellations, recalls and dormant patients become opportunities.</small></div></div>
        <div className="action"><span className="actionIcon">3</span><div><strong>Prepare</strong><small>Follow-up actions are created only when a matching action does not already exist.</small></div></div>
        <div className="action"><span className="actionIcon">4</span><div><strong>Execute</strong><small>WhatsApp/email connectors can consume the action queue without changing the core data model.</small></div></div>
      </div>
      <div className="panel">
        <div className="panelHead"><div><h3>Recent automation runs</h3><p className="muted">Last 8 runs for this clinic.</p></div></div>
        {runs.length===0?<p className="muted">No runs yet. Click Run Autopilot Now.</p>:runs.map(r=><div className="action" key={r.id}><span className="actionIcon">✓</span><div><strong>{r.status}</strong><small>{new Date(r.started_at).toLocaleString('en-IN')} · {r.actions_created||0} actions · {r.events_processed||0} events</small></div></div>)}
      </div>
    </section>

    <section className="panel" style={{marginTop:18}}>
      <div className="panelHead"><div><h3>Event stream</h3><p className="muted">The activity layer that will feed future AI decisions.</p></div></div>
      <div className="tableWrap"><table><thead><tr><th>Time</th><th>Event</th><th>Entity</th><th>Source</th></tr></thead><tbody>
      {events.length===0?<tr><td colSpan={4}>No events yet.</td></tr>:events.map(e=><tr key={e.id}><td>{new Date(e.created_at).toLocaleString('en-IN')}</td><td><span className="badge open">{e.event_type}</span></td><td>{e.entity_type||'—'}</td><td>{e.source}</td></tr>)}
      </tbody></table></div>
    </section>

    <div className="patientNote"><strong>Automation safety</strong><span>Autopilot currently prepares operational actions. Clinical diagnosis, treatment decisions and final patient consent remain with licensed dental professionals and patients.</span></div>
  </main>
}
