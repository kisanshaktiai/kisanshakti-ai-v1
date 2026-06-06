import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface CropVariety {
  id: string;
  name: string;
  variety_code: string | null;
  brand: string | null;
  season: string | null;
  maturity_days_min: number | null;
  maturity_days_max: number | null;
  yield_potential_qtl_per_acre: number | null;
  released_by: string | null;
  is_featured: boolean | null;
  label_hi: string | null;
  label_mr: string | null;
  parentage: string | null;
  seed_rate_kg_per_acre: number | null;
  spacing: string | null;
  state_suitability: string[] | null;
  agro_ecological_suitability: any;
  data_confidence_score: number | null;
  variety_completeness_score: number | null;
  disease_resistance: any;
  pest_tolerance: any;
}

export interface VarietyResistanceRow {
  pathogen: string;
  level: string;
  notes: string | null;
}

const varietyCache = new Map<string, CropVariety[]>();
const inflightVarieties = new Map<string, Promise<CropVariety[]>>();
const resistanceCache = new Map<string, VarietyResistanceRow[]>();
const inflightResistance = new Map<string, Promise<VarietyResistanceRow[]>>();

async function fetchVarieties(cropId: string): Promise<CropVariety[]> {
  if (varietyCache.has(cropId)) return varietyCache.get(cropId)!;
  if (inflightVarieties.has(cropId)) return inflightVarieties.get(cropId)!;
  const p = (async () => {
    const { data, error } = await supabase
      .from('master_products')
      .select(
        'id,name,variety_code,brand,season,maturity_days_min,maturity_days_max,yield_potential_qtl_per_acre,released_by,is_featured,label_hi,label_mr,parentage,seed_rate_kg_per_acre,spacing,state_suitability,agro_ecological_suitability,data_confidence_score,variety_completeness_score,disease_resistance,pest_tolerance'
      )
      .eq('product_type', 'seed')
      .eq('status', 'active')
      .eq('crop_id', cropId)
      .order('is_featured', { ascending: false })
      .order('recommendation_priority', { ascending: false, nullsFirst: false })
      .order('name', { ascending: true });
    if (error) {
      console.error('[useCropVarieties] load error', error);
      inflightVarieties.delete(cropId);
      return [];
    }
    const rows = (data ?? []) as CropVariety[];
    varietyCache.set(cropId, rows);
    inflightVarieties.delete(cropId);
    return rows;
  })();
  inflightVarieties.set(cropId, p);
  return p;
}

async function fetchResistance(varietyId: string): Promise<VarietyResistanceRow[]> {
  if (resistanceCache.has(varietyId)) return resistanceCache.get(varietyId)!;
  if (inflightResistance.has(varietyId)) return inflightResistance.get(varietyId)!;
  const p = (async () => {
    const { data, error } = await supabase
      .from('variety_resistance')
      .select('pathogen, level, notes')
      .eq('variety_id', varietyId);
    if (error) {
      console.error('[useCropVarieties] resistance error', error);
      inflightResistance.delete(varietyId);
      return [];
    }
    const rows = (data ?? []) as VarietyResistanceRow[];
    resistanceCache.set(varietyId, rows);
    inflightResistance.delete(varietyId);
    return rows;
  })();
  inflightResistance.set(varietyId, p);
  return p;
}

export function useCropVarieties(cropId?: string | null) {
  const [varieties, setVarieties] = useState<CropVariety[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let alive = true;
    if (!cropId) {
      setVarieties([]);
      return;
    }
    setLoading(true);
    fetchVarieties(cropId).then((rows) => {
      if (!alive) return;
      setVarieties(rows);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [cropId]);
  return { varieties, loading };
}

export function useVarietyResistance(varietyId?: string | null) {
  const [rows, setRows] = useState<VarietyResistanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let alive = true;
    if (!varietyId) { setRows([]); return; }
    setLoading(true);
    fetchResistance(varietyId).then((r) => {
      if (!alive) return;
      setRows(r);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [varietyId]);
  return { rows, loading };
}
