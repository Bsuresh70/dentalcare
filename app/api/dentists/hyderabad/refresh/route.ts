import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { discoverHyderabadDentists } from '../../../../../lib/dentist-directory';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  const secret=process.env.CRON_SECRET;
  const supplied=request.headers.get('authorization')?.replace(/^Bearer\\s+/i,'');
  if(!secret || supplied!==secret) return NextResponse.json({error:'Unauthorized'},{status:401});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url || !serviceKey) return NextResponse.json({error:'Scheduler is not configured.'},{status:503});
  const admin=createClient(url,serviceKey,{auth:{persistSession:false}});
  const {data:run,error:runError}=await admin.from('dentist_directory_refresh_runs').insert({city:'Hyderabad',source:'GOOGLE_PLACES'}).select('id').single();
  if(runError) return NextResponse.json({error:runError.message},{status:500});
  try{
    const places=await discoverHyderabadDentists();
    if(places.length){
      const rows=places.map(p=>({place_id:p.id,city:'Hyderabad',state:'Telangana',source:'GOOGLE_PLACES',last_seen_at:new Date().toISOString(),active:true}));
      const {error}=await admin.from('dentist_directory_sources').upsert(rows,{onConflict:'place_id'});
      if(error) throw new Error(error.message);
    }
    await admin.from('dentist_directory_refresh_runs').update({completed_at:new Date().toISOString(),status:'COMPLETED',discovered:places.length}).eq('id',run.id);
    return NextResponse.json({status:'COMPLETED',discovered:places.length});
  }catch(error){
    await admin.from('dentist_directory_refresh_runs').update({completed_at:new Date().toISOString(),status:'FAILED',error_message:error instanceof Error?error.message:'Unknown error'}).eq('id',run.id);
    return NextResponse.json({error:error instanceof Error?error.message:'Refresh failed'},{status:500});
  }
}
