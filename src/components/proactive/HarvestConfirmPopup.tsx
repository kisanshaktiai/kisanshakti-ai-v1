/**
 * HarvestConfirmPopup — opens the harvest card when the app opens (2026-11-19).
 *
 * Reads the farmer's live harvest cards (rule HARVEST_CONFIRM_QUESTION, seeded daily by
 * the proactive evaluator from public.crop_cycle_close_plan) and shows them one at a
 * time: only after a crop's harvest date and before its land is freed. "Remind me
 * tomorrow" or closing the card puts that land off until the next day on this phone.
 * Checked again when the app comes back to the screen on a new day.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { HarvestConfirmDialog } from '@/components/proactive/HarvestConfirmDialog';
import {
  HARVEST_QUESTION_RULE_CODE, localDayIso, pickHarvestCards, putOffUntilTomorrow, readPutOff,
  type HarvestCard, type HarvestCardAlert,
} from '@/lib/harvestCard';

const LIVE_STATUSES = ['PENDING', 'DELIVERED', 'SEEN'];

export function HarvestConfirmPopup({ hidden = false }: { hidden?: boolean }) {
  const { user } = useAuthStore();
  const farmerId = user?.id ?? null;
  const tenantId = (user as { tenantId?: string | null } | null)?.tenantId ?? null;
  const [queue, setQueue] = useState<HarvestCard[]>([]);
  const checkedDay = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!farmerId || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
    const today = localDayIso();
    checkedDay.current = today;
    try {
      let query = supabase
        .from('proactive_alerts')
        .select('id, land_id, rule_id, status, created_at, expires_at, trigger_data')
        .eq('farmer_id', farmerId)
        .eq('rule_id', HARVEST_QUESTION_RULE_CODE)
        .in('status', LIVE_STATUSES)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(50);
      // Defensive tenant scoping (in addition to RLS), as useProactiveAlerts does
      if (tenantId) query = query.eq('tenant_id', tenantId);
      const { data, error } = await query;
      if (error) {
        console.warn('[harvest-card] read failed', error.message);
        return;
      }
      const putOff = readPutOff(today);
      setQueue(pickHarvestCards((data || []) as HarvestCardAlert[], today, (land) => putOff.has(land)));
    } catch (e) {
      console.warn('[harvest-card] read failed', e);
    }
  }, [farmerId, tenantId]);

  // app open
  useEffect(() => { void load(); }, [load]);

  // back on screen on a new day
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && checkedDay.current !== localDayIso()) void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const next = () => setQueue((q) => q.slice(1));
  const putOff = (card: HarvestCard) => {
    putOffUntilTomorrow(card.landId, localDayIso());
    next();
  };

  const current = queue[0] ?? null;
  return (
    <HarvestConfirmDialog
      card={current}
      open={!hidden && !!current}
      onClose={() => { if (current) putOff(current); }}
      onAnswered={next}
      onPutOff={putOff}
    />
  );
}
