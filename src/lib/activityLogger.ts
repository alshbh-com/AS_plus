import { supabase } from '@/integrations/supabase/client';

export async function logActivity(action: string, details: Record<string, any> = {}) {
  try {
    await supabase.rpc('log_activity', {
      _action: action,
      _entity_type: (details.entity_type as string) || '',
      _entity_id: (details.entity_id as string) || '00000000-0000-0000-0000-000000000000',
      _details: details as any,
    });
  } catch (err) {
    console.error('Failed to log activity:', err);
  }
}
