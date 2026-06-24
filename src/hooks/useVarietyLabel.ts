import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Tiny module-scoped cache so a list of cards doesn't hammer the DB.
const cache = new Map<string, { label: string | null; completeness: number | null }>();
const inflight = new Map<string, Promise<{ label: string | null; completeness: number | null }>>();

async function fetchVarietyMeta(id: string) {
  if (cache.has(id)) return cache.get(id)!;
  if (inflight.has(id)) return inflight.get(id)!;
  const p = (async () => {
    const { data } = await supabase
      .from("master_products")
      .select("name, name_local, variety_completeness_score")
      .eq("id", id)
      .maybeSingle();
    const result = {
      label: (data as any)?.name_local || (data as any)?.name || null,
      completeness: (data as any)?.variety_completeness_score ?? null,
    };
    cache.set(id, result);
    inflight.delete(id);
    return result;
  })();
  inflight.set(id, p);
  return p;
}

export function useVarietyLabel(varietyId?: string | null) {
  const [meta, setMeta] = useState<{ label: string | null; completeness: number | null }>({
    label: null,
    completeness: null,
  });
  useEffect(() => {
    let alive = true;
    if (!varietyId) {
      setMeta({ label: null, completeness: null });
      return;
    }
    fetchVarietyMeta(varietyId).then((m) => { if (alive) setMeta(m); });
    return () => { alive = false; };
  }, [varietyId]);
  return meta;
}
