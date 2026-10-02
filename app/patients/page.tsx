'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { getCurrentClinicId } from '../../lib/clinic';

type Patient = {
  id: string;
  full_name: string;
  phone: string | null;
  last_visit_at: string | null;
  next_recall_at: string | null;
  total_revenue: number;
  notes: string | null;
};

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

export default function Patients() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!supabase) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const clinicId = await getCurrentClinicId();

    if (!clinicId) {
      setStatus('Please sign in and create your clinic first.');
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('patients')
      .select('id,full_name,phone,last_visit_at,next_recall_at,total_revenue,notes')
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: false });

    if (error) {
      setStatus(error.message);
      setPatients([]);
    } else {
      setPatients((data || []) as Patient[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(
    () =>
      patients.filter((p) =>
        (p.full_name + ' ' + (p.phone || '')).toLowerCase().includes(q.toLowerCase())
      ),
    [patients, q]
  );

  return (
    <main className="page">
      <header className="pageHead">
        <div>
          <p className="eyebrow">PATIENT RELATIONSHIP</p>
          <h1>Patients</h1>
          <p className="muted">Maintain the relationship beyond the first appointment.</p>
        </div>
        <button className="primary small" disabled>+ Add patient</button>
      </header>

      {status && <div className="toast">{status}</div>}

      <div className="search">
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search patient name or phone…"
        />
      </div>

      <section className="panel">
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Patient</th>
                <th>Last visit</th>
                <th>Recall</th>
                <th>Lifetime revenue</th>
                <th>Growth action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5}>Loading patients…</td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    {q ? 'No matching patients found.' : 'No patients found. Convert a lead to create your first patient.'}
                  </td>
                </tr>
              ) : (
                filtered.map(p => {
                  const recallDue = p.next_recall_at && new Date(p.next_recall_at) <= new Date();

                  return (
                    <tr key={p.id}>
                      <td>
                        <strong>{p.full_name}</strong>
                        <small>{p.phone || 'No phone'}</small>
                      </td>
                      <td>{formatDate(p.last_visit_at)}</td>
                      <td>
                        {recallDue ? (
                          <span className="badge open">DUE</span>
                        ) : (
                          formatDate(p.next_recall_at)
                        )}
                      </td>
                      <td>₹{Number(p.total_revenue || 0).toLocaleString('en-IN')}</td>
                      <td>
                        <Link className="tableButton" href="/appointments">
                          Appointments
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="patientNote">
        <strong>Growth insight</strong>
        <span>
          Patients are not just records. DentalGrowth uses visit history, recall dates and revenue history to identify reactivation opportunities.
        </span>
      </div>
    </main>
  );
}
