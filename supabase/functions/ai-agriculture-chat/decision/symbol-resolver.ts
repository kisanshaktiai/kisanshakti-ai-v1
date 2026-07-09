/**
 * DB-backed graph symbol resolver.
 *
 * Authority lives in public.observation_aliases and public.observation_master.
 * This module performs identity resolution only; it contains no agronomic
 * mappings, crop branches, pest rules, or text-derived diagnosis logic.
 */

import { SymbolContract } from '../runtime/symbol-contract.ts';

export interface ResolvedObservationSymbol {
  raw_symbol: string;
  graph_symbol: string | null;
  canonical_observation_id: string | null;
  canonical_observation_code: string | null;
  resolved: boolean;
  source: 'observation_aliases' | 'observation_master' | 'unresolved';
  reason?: string;
}

function formatVariants(input: unknown): string[] {
  const raw = String(input ?? '').trim();
  const graph = SymbolContract.normalizeOrEmpty(raw);
  const lower = raw.toLowerCase().replace(/[\s-]+/g, '_');
  const variants = [raw, graph, graph.toLowerCase(), lower]
    .map((v) => String(v || '').trim())
    .filter(Boolean);
  return Array.from(new Set(variants));
}

export async function resolveObservationSymbol(
  supabase: any,
  input: unknown,
): Promise<ResolvedObservationSymbol> {
  const extracted = SymbolContract.extract(input);
  const raw = extracted.symbol ?? String(input ?? '').trim();
  const graph = extracted.symbol;

  if (!graph || !supabase) {
    return {
      raw_symbol: raw,
      graph_symbol: graph,
      canonical_observation_id: null,
      canonical_observation_code: null,
      resolved: false,
      source: 'unresolved',
      reason: extracted.violation || 'missing_supabase_or_symbol',
    };
  }

  const variants = formatVariants(raw);

  try {
    let aliasRows: any[] = [];
    const aliasByCode = await supabase
      .from('observation_aliases')
      .select('alias_code, alias_normalized, alias_text, canonical_code, active')
      .eq('active', true)
      .in('alias_code', variants);

    if (aliasByCode.error) {
      console.warn(`[SYMBOL_RESOLVER] alias_code lookup failed symbol=${graph} error=${aliasByCode.error.message}`);
    } else if (Array.isArray(aliasByCode.data)) {
      aliasRows = aliasByCode.data;
    }

    if (aliasRows.length === 0) {
      const aliasByNormalized = await supabase
        .from('observation_aliases')
        .select('alias_code, alias_normalized, alias_text, canonical_code, active')
        .eq('active', true)
        .in('alias_normalized', variants);
      if (aliasByNormalized.error) {
        console.warn(`[SYMBOL_RESOLVER] alias_normalized lookup failed symbol=${graph} error=${aliasByNormalized.error.message}`);
      } else if (Array.isArray(aliasByNormalized.data)) {
        aliasRows = aliasByNormalized.data;
      }
    }

    if (aliasRows.length === 0) {
      const aliasByText = await supabase
        .from('observation_aliases')
        .select('alias_code, alias_normalized, alias_text, canonical_code, active')
        .eq('active', true)
        .in('alias_text', variants);
      if (aliasByText.error) {
        console.warn(`[SYMBOL_RESOLVER] alias_text lookup failed symbol=${graph} error=${aliasByText.error.message}`);
      } else if (Array.isArray(aliasByText.data)) {
        aliasRows = aliasByText.data;
      }
    }

    if (Array.isArray(aliasRows) && aliasRows.length > 0) {
      const canonical = String(aliasRows[0]?.canonical_code || '').trim();
      if (canonical) {
        const master = await resolveMasterRow(supabase, canonical);
        return {
          raw_symbol: raw,
          graph_symbol: SymbolContract.normalize(canonical),
          canonical_observation_id: master?.observation_code ?? canonical,
          canonical_observation_code: master?.observation_code ?? canonical,
          resolved: true,
          source: 'observation_aliases',
        };
      }
    }
  } catch (e) {
    console.warn(`[SYMBOL_RESOLVER] alias exception symbol=${graph} error=${(e as Error).message}`);
  }

  const master = await resolveMasterRow(supabase, raw);
  if (master?.observation_code) {
    return {
      raw_symbol: raw,
      graph_symbol: SymbolContract.normalize(master.observation_code),
      canonical_observation_id: master.observation_code,
      canonical_observation_code: master.observation_code,
      resolved: true,
      source: 'observation_master',
    };
  }

  console.warn(`[SYMBOL_RESOLVER] unresolved symbol=${graph}`);
  return {
    raw_symbol: raw,
    graph_symbol: graph,
    canonical_observation_id: null,
    canonical_observation_code: null,
    resolved: false,
    source: 'unresolved',
    reason: 'no_observation_master_or_alias_node',
  };
}

async function resolveMasterRow(
  supabase: any,
  code: unknown,
): Promise<{ observation_code: string } | null> {
  const variants = formatVariants(code);
  if (variants.length === 0) return null;
  try {
    const { data, error } = await supabase
      .from('observation_master')
      .select('observation_code')
      .in('observation_code', variants)
      .limit(1);
    if (error) {
      console.warn(`[SYMBOL_RESOLVER] master lookup failed error=${error.message}`);
      return null;
    }
    const row = Array.isArray(data) ? data[0] : null;
    return row?.observation_code ? row : null;
  } catch (e) {
    console.warn(`[SYMBOL_RESOLVER] master exception error=${(e as Error).message}`);
    return null;
  }
}

export async function resolveObservationSymbols(
  supabase: any,
  inputs: ReadonlyArray<unknown>,
): Promise<ResolvedObservationSymbol[]> {
  const out: ResolvedObservationSymbol[] = [];
  const seen = new Set<string>();
  for (const input of inputs ?? []) {
    const resolved = await resolveObservationSymbol(supabase, input);
    const key = resolved.canonical_observation_code || resolved.graph_symbol || resolved.raw_symbol;
    const norm = SymbolContract.normalizeOrEmpty(key);
    if (norm && seen.has(norm)) continue;
    if (norm) seen.add(norm);
    out.push(resolved);
  }
  return out;
}

export async function sameNode(
  supabase: any,
  a: unknown,
  b: unknown,
): Promise<boolean> {
  const [ra, rb] = await Promise.all([
    resolveObservationSymbol(supabase, a),
    resolveObservationSymbol(supabase, b),
  ]);
  const ca = ra.canonical_observation_code || ra.graph_symbol;
  const cb = rb.canonical_observation_code || rb.graph_symbol;
  return !!ca && !!cb && SymbolContract.equals(ca, cb);
}
