import { supabase } from './supabase';

export async function getCurrentClinicId(): Promise<string | null> {
  if (!supabase) return null;
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return null;

  const { data } = await supabase
    .from('clinic_users')
    .select('clinic_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  return data?.clinic_id ?? null;
}
