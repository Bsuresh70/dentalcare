import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { discoverHyderabadDentists } from '../../../../lib/dentist-directory';

export async function GET(request: Request){
  const secret=process.env.CRON_SECRET;
  const supplied=request.headers.get('authorization')?.replace(/^Bearer\\s+/i,'');
  if(!secret || supplied!==secret) return NextResponse.json({error:'Unauthorized'},{status:401});

  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url || !serviceKey) return NextResponse.json({error:'Scheduler is not configured. Add SUPABASE_SERVICE_ROLE_KEY.'},{status:503});

  const admin=createClient(url,serviceKey,{auth:{persistSession:false}});
  const {data:automation,error:automationError}=await admin.rpc('run_all_clinic_automation');
  if(automationError) return NextResponse.json({error:automationError.message},{status:500});

  let directory:any={status:'SKIPPED',reason:'Google Places not configured'};
  if(process.env.GOOGLE_PLACES_API_KEY){
    try{
      const places=await discoverHyderabadDentists();
      if(places.length){
        const rows=places.map(p=>({
          place_id:p.id,city:'Hyderabad',state:'Telangana',source:'GOOGLE_PLACES',
          last_seen_at:new Date().toISOString(),active:true
        }));
        const {error}=await admin.from('dentist_directory_sources').upsert(rows,{onConflict:'place_id'});
        if(error) throw new Error(error.message);
      }
      directory={status:'COMPLETED',discovered:places.length};
    }catch(error){
      directory={status:'FAILED',error:error instanceof Error?error.message:'Directory refresh failed'};
    }
  }

  return NextResponse.json({status:'COMPLETED',automation,directory});
}
