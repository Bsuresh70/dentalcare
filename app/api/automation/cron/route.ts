import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: Request){
  const secret=process.env.CRON_SECRET;
  const supplied=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
  if(!secret || supplied!==secret) return NextResponse.json({error:'Unauthorized'},{status:401});

  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url || !serviceKey) return NextResponse.json({error:'Scheduler is not configured. Add SUPABASE_SERVICE_ROLE_KEY.'},{status:503});

  const admin=createClient(url,serviceKey,{auth:{persistSession:false}});
  const {data,error}=await admin.rpc('run_all_clinic_automation');
  if(error) return NextResponse.json({error:error.message},{status:500});
  return NextResponse.json(data);
}
