import { supabase } from './supabase';
import type { Opportunity } from './types';

export async function getClinicOpportunities(clinicId:string):Promise<Opportunity[]>{
  if(!supabase) return [];
  const {data,error}=await supabase.from('opportunities').select('*').eq('clinic_id',clinicId).eq('status','OPEN').order('score',{ascending:false});
  if(error) throw error;
  return (data||[]) as Opportunity[];
}

export async function getClinicStats(clinicId:string){
  if(!supabase) return {leads:0,appointments:0,followups:0,opportunityValue:0};
  const [leads,appointments,followups,opps]=await Promise.all([
    supabase.from('leads').select('id',{count:'exact',head:true}).eq('clinic_id',clinicId),
    supabase.from('appointments').select('id',{count:'exact',head:true}).eq('clinic_id',clinicId),
    supabase.from('followups').select('id',{count:'exact',head:true}).eq('clinic_id',clinicId).eq('status','PENDING'),
    supabase.from('opportunities').select('potential_value').eq('clinic_id',clinicId).eq('status','OPEN')
  ]);
  return {
    leads:leads.count||0,
    appointments:appointments.count||0,
    followups:followups.count||0,
    opportunityValue:(opps.data||[]).reduce((s:any,row:any)=>s+Number(row.potential_value||0),0)
  };
}
