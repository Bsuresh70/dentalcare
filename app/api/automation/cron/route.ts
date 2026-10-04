import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { runScheduledAutomation } from '../../../../lib/run-scheduled-automation';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

  if (!secret || supplied !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: 'Scheduler is not configured. Add SUPABASE_SERVICE_ROLE_KEY.' },
      { status: 503 }
    );
  }

  try {
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const result = await runScheduledAutomation(admin);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Scheduled automation failed' },
      { status: 500 }
    );
  }
}
