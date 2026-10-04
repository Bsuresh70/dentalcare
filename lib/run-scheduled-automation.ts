import { createClient } from '@supabase/supabase-js';
import { discoverHyderabadDentists } from './dentist-directory';

export async function runScheduledAutomation(admin: ReturnType<typeof createClient>) {
  const { data: automation, error: automationError } = await admin.rpc('run_all_clinic_automation');
  if (automationError) throw new Error(automationError.message);

  let directory: any = { status: 'SKIPPED', reason: 'Google Places not configured' };

  if (process.env.GOOGLE_PLACES_API_KEY) {
    try {
      const places = await discoverHyderabadDentists();

      if (places.length) {
        const rows = places.map((p) => ({
          place_id: p.id,
          city: 'Hyderabad',
          state: 'Telangana',
          source: 'GOOGLE_PLACES',
          last_seen_at: new Date().toISOString(),
          active: true,
        }));

        const { error } = await admin
          .from('dentist_directory_sources')
          .upsert(rows, { onConflict: 'place_id' });

        if (error) throw new Error(error.message);
      }

      directory = { status: 'COMPLETED', discovered: places.length };
    } catch (error) {
      directory = {
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Directory refresh failed',
      };
    }
  }

  return { status: 'COMPLETED', automation, directory };
}
