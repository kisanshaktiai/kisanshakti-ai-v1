// KNOWLEDGE LOOKUP GATE — deterministic DB-backed fact retrieval.
// This lane is intentionally separate from diagnosis/advisory rule evaluation.
// It answers taxonomy/list questions without manufacturing farmer observations.

import { getCropDisplayName, getCropCanonical, getAllCropNames, loadCropNames } from '../utils/crop-names-cache.ts';

export type KnowledgeKind = 'PEST_LIST' | 'DISEASE_LIST' | 'GROWTH_STAGE_LIST';

export interface KnowledgeLookupInput {
  farmer_message: string;
  language: string;
  crop_code?: string | null;
  cultivation_method?: string | null;
  supabase: any;
}

export interface KnowledgeLookupOutput {
  handled: boolean;
  kind?: KnowledgeKind;
  crop_code?: string | null;
  crop_name?: string | null;
  items?: Array<Record<string, any>>;
  source_tables?: string[];
  fallback_text?: string;
  response_by_language?: Record<string, string>;
  confidence: number;
  processing_time_ms: number;
}

const PEST_QUERY = /\b(?:which|what)\s+(?:pests?|insects?|bugs?)\b|\b(?:common|major)\s+(?:pests?|insects?|bugs?)\b|(?:कोणत्या|कुठल्या|कोणते)\s*(?:किडी|किडे|किड|कीटक)\b|(?:कुठल्या|कोणत्या)\s*(?:किडी|किडे)\s*(?:पीकावर|भातावर|तांदळावर)/iu;
const DISEASE_QUERY = /\b(?:which|what)\s+(?:diseases?|disease)\b|\b(?:common|major)\s+diseases?\b|(?:कोणते|कुठले|कोणते)\s*(?:रोग|बीमारी)\b/iu;
const STAGE_QUERY = /\b(?:which|what|list)\s+(?:are\s+)?(?:the\s+)?(?:growth\s+)?stages?\b|\bgrowth\s+stages?\b|(?:वाढीचे|वाढीचा|पिकाचे)\s*(?:टप्पे|अवस्थ|टप्पा)\b|(?:फसल|धान|चावल)\s*(?:की\s*)?(?:अवस्था|चरण)/iu;

function norm(v: unknown): string {
  return String(v ?? '').normalize('NFC').trim().toLowerCase();
}

function detectKind(message: string): KnowledgeKind | null {
  if (PEST_QUERY.test(message)) return 'PEST_LIST';
  if (DISEASE_QUERY.test(message)) return 'DISEASE_LIST';
  if (STAGE_QUERY.test(message)) return 'GROWTH_STAGE_LIST';
  return null;
}

async function resolveCropCode(message: string, explicitCrop: string | null | undefined, supabase: any): Promise<string | null> {
  const direct = norm(explicitCrop);
  if (direct) return direct;

  try {
    await loadCropNames(supabase);
    const rows = getAllCropNames();
    const text = norm(message);
    let best: { code: string; score: number } | null = null;

    for (const row of rows) {
      const labels = [row.code, row.label, ...Object.values(row.translations ?? {})]
        .map(norm)
        .filter(Boolean);
      for (const label of labels) {
        if (label.length < 2) continue;
        if (text.split(/[^\p{L}\p{N}]+/u).includes(label)) {
          const score = label.length + 1000;
          if (!best || score > best.score) best = { code: row.code, score };
        } else if (text.includes(label) && label.length >= 4) {
          const score = label.length;
          if (!best || score > best.score) best = { code: row.code, score };
        }
      }
    }
    return best?.code ?? null;
  } catch (e) {
    console.warn('[KNOWLEDGE_LOOKUP] crop resolution failed', e instanceof Error ? e.message : e);
    return null;
  }
}

function dedupeSortedStages(rows: any[], cultivationMethod: string | null): any[] {
  const lane = norm(cultivationMethod);
  const eligible = rows.filter((r) => {
    const method = norm(r?.cultivation_method);
    if (!method || !lane) return !method || !lane;
    return method === lane;
  });

  const pool = eligible.length > 0 ? eligible : rows;
  const seen = new Set<string>();
  return [...pool]
    .sort((a, b) => {
      const ap = Number(a?.phenology_index);
      const bp = Number(b?.phenology_index);
      if (Number.isFinite(ap) && Number.isFinite(bp) && ap !== bp) return ap - bp;
      return Number(a?.das_min ?? 999999) - Number(b?.das_min ?? 999999);
    })
    .filter((r) => {
      const key = norm(r?.growth_stage);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function buildLocalizedResponses(
  kind: KnowledgeKind,
  cropCode: string,
  items: Array<Record<string, any>>,
): Record<string, string> {
  const langs = ['en', 'hi', 'mr'];
  const out: Record<string, string> = {};
  for (const lang of langs) {
    const crop = getCropDisplayName(cropCode, lang) || getCropCanonical(cropCode);
    if (kind === 'PEST_LIST') {
      const names = items.map((x: any) => {
        const byLang = x?.localized_names ?? {};
        return byLang[lang] || x?.english_name || x?.name;
      }).filter(Boolean);
      out[lang] = crop + ': ' + names.join(', ') + '.';
    } else if (kind === 'DISEASE_LIST') {
      out[lang] = crop + ': ' + items.map((x: any) => x?.name).filter(Boolean).join(', ') + '.';
    } else {
      out[lang] = crop + ': ' + items.map((x: any) => String(x?.stage ?? '').replace(/_/g, ' ')).filter(Boolean).join(', ') + '.';
    }
  }
  return out;
}

function localizedPestName(row: any, language: string): string {
  const lang = norm(language).slice(0, 2);
  return (lang === 'mr' ? row?.pest_name_mr : lang === 'hi' ? row?.pest_name_hi : row?.pest_name_en)
    || row?.pest_name_en || row?.pest_code || 'Unknown';
}

export async function resolveKnowledgeLookup(input: KnowledgeLookupInput): Promise<KnowledgeLookupOutput> {
  const start = performance.now();
  const kind = detectKind(input.farmer_message);
  if (!kind) return { handled: false, confidence: 0, processing_time_ms: performance.now() - start };

  const cropCode = await resolveCropCode(input.farmer_message, input.crop_code, input.supabase);
  if (!cropCode) {
    return {
      handled: false,
      kind,
      confidence: 0,
      processing_time_ms: performance.now() - start
    };
  }

  const cropName = getCropCanonical(cropCode);
  const displayCrop = getCropDisplayName(cropCode, input.language) || cropName;

  try {
    if (kind === 'GROWTH_STAGE_LIST') {
      const { data, error } = await input.supabase
        .from('crop_stage_master')
        .select('growth_stage,das_min,das_max,stage_description,phenology_index,cultivation_method,is_active')
        .eq('is_active', true)
        .ilike('crop_code', cropCode);

      if (error || !Array.isArray(data) || data.length === 0) {
        return { handled: false, kind, crop_code: cropCode, crop_name: displayCrop, confidence: 0, processing_time_ms: performance.now() - start };
      }

      const stages = dedupeSortedStages(data, input.cultivation_method);
      const stageNames = stages.map((s) => String(s.growth_stage).replace(/_/g, ' '));
      return {
        handled: true,
        kind,
        crop_code: cropCode,
        crop_name: displayCrop,
        items: stages.map((s) => ({
          stage: s.growth_stage,
          das_min: s.das_min,
          das_max: s.das_max,
          description: s.stage_description ?? null,
          cultivation_method: s.cultivation_method ?? null
        })),
        source_tables: ['crop_stage_master'],
        fallback_text: displayCrop + ': ' + stageNames.join(', ') + '.',
        response_by_language: buildLocalizedResponses('GROWTH_STAGE_LIST', cropCode, stages.map((s) => ({
          stage: s.growth_stage
        }))),
        confidence: 0.99,
        processing_time_ms: performance.now() - start
      };
    }

    const baseline = await input.supabase
      .from('crop_baseline_guidelines')
      .select('common_pests,common_diseases,source,confidence_level')
      .ilike('crop_name', cropCode)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    const key = kind === 'PEST_LIST' ? 'common_pests' : 'common_diseases';
    const raw = baseline?.data?.[key];
    const baselineItems = Array.isArray(raw) ? raw : [];

    // Baseline is the preferred taxonomy source. When it is absent, fall back
    // to active crop-scoped graph entities rather than fabricating a list.
    let effectiveBaselineItems = baselineItems;
    if (effectiveBaselineItems.length === 0 && kind === 'PEST_LIST') {
      const rules = await input.supabase
        .from('decision_rules')
        .select('pest_code,stage_applicable,etl_threshold,etl_unit')
        .eq('is_active', true)
        .ilike('crop_code', cropCode)
        .not('pest_code', 'is', null);
      const codes = [...new Set((Array.isArray(rules?.data) ? rules.data : [])
        .map((r: any) => String(r?.pest_code ?? '').trim()).filter(Boolean))];
      if (codes.length > 0) {
        const master = await input.supabase
          .from('pest_master')
          .select('pest_code,pest_name_en,pest_name_hi,pest_name_mr')
          .in('pest_code', codes)
          .eq('is_active', true);
        const byCode = new Map((Array.isArray(master?.data) ? master.data : [])
          .map((r: any) => [norm(r.pest_code), r]));
        effectiveBaselineItems = codes.map((code) => ({
          pest: byCode.get(norm(code))?.pest_name_en ?? code,
          pest_code: code,
        }));
      }
    }
    if (kind === 'PEST_LIST' && effectiveBaselineItems.length > 0) {
      const master = await input.supabase
        .from('pest_master')
        .select('pest_code,pest_name_en,pest_name_hi,pest_name_mr')
        .eq('is_active', true);
      const byName = new Map((Array.isArray(master?.data) ? master.data : []).map((r: any) => [norm(r.pest_name_en), r]));
      const items = effectiveBaselineItems.map((p: any) => {
        const row = byName.get(norm(p?.pest));
        return {
          name: row ? localizedPestName(row, input.language) : String(p?.pest ?? ''),
          localized_names: {
            en: row?.pest_name_en ?? p?.pest ?? null,
            hi: row?.pest_name_hi ?? p?.pest ?? null,
            mr: row?.pest_name_mr ?? p?.pest ?? null,
          },
          english_name: p?.pest ?? null,
          scientific_name: p?.scientific_name ?? null,
          critical_stage: p?.critical_stage ?? null,
          etl: p?.etl ?? null
        };
      }).filter((x: any) => x.name);

      return {
        handled: items.length > 0,
        kind,
        crop_code: cropCode,
        crop_name: displayCrop,
        items,
        source_tables: ['crop_baseline_guidelines', 'pest_master'],
        fallback_text: displayCrop + ': ' + items.map((x: any) => x.name).join(', ') + '.',
        response_by_language: buildLocalizedResponses('PEST_LIST', cropCode, items),
        confidence: items.length > 0 ? 0.99 : 0,
        processing_time_ms: performance.now() - start
      };
    }

    if (kind === 'DISEASE_LIST' && baselineItems.length > 0) {
      const items = baselineItems
        .map((d: any) => ({
          name: d?.disease ?? null,
          pathogen: d?.pathogen ?? null,
          critical_stage: d?.critical_stage ?? null,
          favorable_conditions: d?.favorable_conditions ?? null
        }))
        .filter((x: any) => x.name);

      return {
        handled: items.length > 0,
        kind,
        crop_code: cropCode,
        crop_name: displayCrop,
        items,
        source_tables: ['crop_baseline_guidelines'],
        fallback_text: displayCrop + ': ' + items.map((x: any) => x.name).join(', ') + '.',
        response_by_language: buildLocalizedResponses('DISEASE_LIST', cropCode, items),
        confidence: items.length > 0 ? 0.99 : 0,
        processing_time_ms: performance.now() - start
      };
    }

    return {
      handled: false,
      kind,
      crop_code: cropCode,
      crop_name: displayCrop,
      confidence: 0,
      processing_time_ms: performance.now() - start
    };
  } catch (e) {
    console.warn('[KNOWLEDGE_LOOKUP] query failed', e instanceof Error ? e.message : e);
    return {
      handled: false,
      kind,
      crop_code: cropCode,
      crop_name: displayCrop,
      confidence: 0,
      processing_time_ms: performance.now() - start
    };
  }
}
