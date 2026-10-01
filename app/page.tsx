'use client';

import { useMemo, useState } from 'react';

type Opportunity = {
  patient: string; type: string; detail: string; score: number; value: number; action: string;
};

const opportunities: Opportunity[] = [
  { patient: 'Rahul Kumar', type: 'Pending treatment', detail: 'Crown pending after RCT', score: 96, value: 18000, action: 'WhatsApp' },
  { patient: 'Priya Sharma', type: 'Lost high-intent lead', detail: 'Implant enquiry · no booking', score: 94, value: 45000, action: 'Call' },
  { patient: 'Arjun Rao', type: 'No-show recovery', detail: 'Missed consultation yesterday', score: 91, value: 8000, action: 'Reschedule' },
  { patient: 'Meena Devi', type: 'Dormant patient', detail: 'Last visit 8 months ago', score: 84, value: 6000, action: 'Recall' },
  { patient: 'Suresh Reddy', type: 'Recall due', detail: 'Cleaning due this month', score: 71, value: 2500, action: 'WhatsApp' }
];

const money = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

export default function Home() {
  const [filter, setFilter] = useState('All');
  const [message, setMessage] = useState('');
  const filtered = useMemo(() => filter === 'All' ? opportunities : opportunities.filter(o => o.type === filter), [filter]);
  const recoverable = opportunities.reduce((sum, o) => sum + o.value, 0);

  return <main className="shell">
    <aside className="sidebar">
      <div className="brand"><span className="brandMark">D</span><div><strong>DentalGrowth</strong><small>AI</small></div></div>
      <nav>{['Dashboard','Leads','Patients','Conversations','Appointments','Follow-ups','Reactivation','Campaigns','Analytics','AI Assistant'].map((item, i) =>
        <button className={i === 0 ? 'nav active' : 'nav'} key={item}>{item}</button>
      )}</nav>
      <button className="settings">Settings</button>
    </aside>
    <section className="content">
      <header className="topbar"><div><p className="eyebrow">DENTAL AI GROWTH OS</p><h1>Good evening, Doctor</h1><p className="muted">Patient opportunities that deserve attention.</p></div><div className="clinic">SmileCare Dental <span>●</span></div></header>
      <section className="heroCard"><div><p className="eyebrow">REVENUE OPPORTUNITY ENGINE</p><h2>Find the patients your clinic may be losing.</h2><p>Prioritize leads, no-shows, pending treatments, dormant patients and recalls so your team knows what to act on next.</p></div><div className="heroMetric"><strong>{money(recoverable)}</strong><span>opportunity value identified</span></div></section>
      <div className="kpis">
        <Kpi title="New leads" value="38" note="+12% vs last week" />
        <Kpi title="Qualified appointments" value="21" note="55% of new leads" />
        <Kpi title="Today's visits" value="15" note="3 remaining" />
        <Kpi title="Follow-ups due" value="17" note="5 high priority" />
      </div>
      <section className="grid2">
        <div className="panel"><div className="panelHead"><div><h3>Revenue opportunities</h3><p className="muted">Prioritized actions from patient and lead data.</p></div><select value={filter} onChange={e => setFilter(e.target.value)}><option>All</option>{[...new Set(opportunities.map(o => o.type))].map(x => <option key={x}>{x}</option>)}</select></div>
          <div className="opps">{filtered.map(o => <div className="opp" key={o.patient}><div className="score">{o.score}</div><div className="oppMain"><strong>{o.patient}</strong><span>{o.type}</span><small>{o.detail}</small></div><div className="oppValue"><strong>{money(o.value)}</strong><small>potential value</small></div><button onClick={() => setMessage(o.action + ' action queued for ' + o.patient)}>{o.action}</button></div>)}</div>
        </div>
        <div className="panel"><div className="panelHead"><div><h3>Today's action list</h3><p className="muted">Recommended next steps.</p></div></div>
          <Action icon="!" title="Contact 5 hot leads" detail="High intent, no confirmed appointment" />
          <Action icon="R" title="Recover 3 no-shows" detail="Offer the next available slot" />
          <Action icon="M" title="Reactivate 12 dormant patients" detail="Due for recall based on clinic rules" />
          <Action icon="T" title="Review 4 pending treatments" detail="Treatment started but not completed" />
          {message && <div className="toast">Done: {message}</div>}
        </div>
      </section>
      <section className="panel funnel"><div className="panelHead"><div><h3>Patient growth funnel</h3><p className="muted">Illustrative dashboard data — Supabase will provide live clinic data.</p></div></div><div className="bars">{[['Leads',100],['Qualified',62],['Booked',42],['Visited',35],['Treatment',23]].map(([name,val]) => <div className="barRow" key={String(name)}><span>{name}</span><div><i style={{ width: String(val) + '%' }} /></div><strong>{val}</strong></div>)}</div></section>
      <footer>DentalGrowth AI · v0.1 · Revenue Recovery MVP foundation</footer>
    </section>
  </main>;
}

function Kpi({ title, value, note }: { title: string; value: string; note: string }) { return <div className="kpi"><span>{title}</span><strong>{value}</strong><small>{note}</small></div>; }
function Action({ icon, title, detail }: { icon: string; title: string; detail: string }) { return <div className="action"><span className="actionIcon">{icon}</span><div><strong>{title}</strong><small>{detail}</small></div><button>Review</button></div>; }
