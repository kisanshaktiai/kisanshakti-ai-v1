import { useEffect, useState } from 'react';
import { supabase, getSessionToken } from '@/integrations/supabase/client';

/** One variety × cultivation-method suitability row, exactly as stored in the agronomy DB. */
export interface VarietyMethodSuitability {
  id: string;
  cultivation_method: string;
  is_suitable: boolean;
  suitability_note: string | null;
  source: string | null;
  evidence_tier: string | null;
  suitability_grade: string | null;
  limiting_factor: string | null;
}

export interface VarietyMethodConsent { accepted: true; evidenceIds: string[] }

/** Reads variety_cultivation_agronomy through the verified schedule service (no client-side agronomy). */
export function useVarietyMethodSuitability(varietyId: string | null) {
  const [rows, setRows] = useState<VarietyMethodSuitability[]>([]);
  useEffect(() => {
    let alive = true;
    setRows([]);
    if (!varietyId) return;
    supabase.functions.invoke('ai-smart-schedule', {
      body: { action: 'method_suitability', varietyId },
      headers: { 'x-session-token': getSessionToken() || '' },
    }).then(({ data, error }) => {
      if (!alive || error || !data?.success) return;
      setRows((data.rows || []) as VarietyMethodSuitability[]);
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [varietyId]);
  return rows;
}
