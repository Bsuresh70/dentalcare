import { NextResponse } from 'next/server';
import { discoverHyderabadDentists } from '../../../../lib/dentist-directory';
export const dynamic='force-dynamic';
export async function GET(){
  try{
    const places=await discoverHyderabadDentists();
    return NextResponse.json({city:'Hyderabad',state:'Telangana',count:places.length,refreshed_at:new Date().toISOString(),places});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to discover dental providers.'},{status:503});
  }
}
