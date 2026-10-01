import { NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabase';

export async function POST(request: Request) {
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const clinicId = body.clinicId as string | undefined;
  if (!clinicId) return NextResponse.json({ error: 'clinicId is required.' }, { status: 400 });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const { data: membership } = await supabase
    .from('clinic_users')
    .select('clinic_id')
    .eq('clinic_id', clinicId)
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (!membership) return NextResponse.json({ error: 'You are not a member of this clinic.' }, { status: 403 });

  const { data, error } = await supabase.rpc('generate_clinic_opportunities', { p_clinic_id: clinicId });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ created: data ?? 0 });
}
