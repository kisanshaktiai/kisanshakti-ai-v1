/**
 * HarvestConfirmPopup — opens the harvest card when the app opens (2026-11-19).
 *
 * Reads the farmer's live harvest cards (rule HARVEST_CONFIRM_QUESTION, seeded daily by
 * the proactive evaluator from public.crop_cycle_close_plan) and shows them one at a
 * time: only after a crop's harvest date and before its land is freed. "Remind me
 * tomorrow" or closing the card puts that land off until the next day on this phone.
 * Checked again when the app comes back to the screen on a new day.
 * 2026-11-20: with no network the cards come from the phone's offline copy of the
 * farmer's alerts (localDB, the same cache useProactiveAlerts reads offline), so a
 * farmer opening the app in the field still sees his countdown.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { localDB } from '@/services/localDB';
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
    if (!farmerId) return;
    const today = localDayIso();
    checkedDay.current = today;
    const show = (rows: HarvestCardAlert[]) => {
      const putOff = readPutOff(today);
      setQueue(pickHarvestCards(rows, today, (land) => putOff.has(land)));
    };
    // Offline: the phone's copy of the farmer's live alerts (same filters as the query below).
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      try {
        const nowIso = new Date().toISOString();
        const cached = await localDB.getProactiveAlerts(farmerId);
        show(cached
          .filter((a) => a.rule_id === HARVEST_QUESTION_RULE_CODE)
          .filter((a) => !tenantId || a.tenant_id === tenantId)
          .filter((a) => {
            const exp = (a as { expires_at?: string | null }).expires_at;
            return !exp || exp > nowIso;
          })
          .map((a) => ({
            id: a.id, land_id: a.land_id, rule_id: a.rule_id, status: a.status, created_at: a.created_at,
            expires_at: (a as { expires_at?: string | null }).expires_at ?? null, trigger_data: a.trigger_data,
          })));
      } catch (e) {
        console.warn('[harvest-card] offline read failed', e);
      }
      return;
    }
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
      show((data || []) as HarvestCardAlert[]);
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
