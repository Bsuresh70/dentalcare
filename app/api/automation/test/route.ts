import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { runScheduledAutomation } from '../../../../lib/run-scheduled-automation';

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.replace(/^Bearer\s+/i, '');

  if (!accessToken) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceKey) {
    return NextResponse.json({ error: 'Scheduler test is not configured.' }, { status: 503 });
  }

  const authClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: userData, error: userError } = await authClient.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return NextResponse.json({ error: 'Your login session is not valid.' }, { status: 401 });
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: membership, error: membershipError } = await admin
    .from('clinic_users')
    .select('clinic_id')
    .eq('user_id', userData.user.id)
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    return NextResponse.json({ error: membershipError.message }, { status: 500 });
  }

  if (!membership) {
    return NextResponse.json({ error: 'No DentalCare clinic membership found for this account.' }, { status: 403 });
  }

  try {
    const result = await runScheduledAutomation(admin);
    return NextResponse.json({ ...result, triggered_by: 'authenticated_dashboard_test' });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Scheduled automation test failed' },
      { status: 500 }
    );
  }
}
