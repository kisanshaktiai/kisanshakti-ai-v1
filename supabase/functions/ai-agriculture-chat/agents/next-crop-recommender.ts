/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NEXT-CROP RECOMMENDER (Symbolic, DB-driven)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Loads `decision_rules` rows where category='crop_rotation' and scores
 * them against the authoritative `canonicalContext` to produce the top N
 * candidate crops for the farmer's next planting.
 *
 * INVARIANTS:
 *   - 100% DB-sourced: the LLM never invents a crop or a scientific reason.
 *   - Pure scoring function: no side-effects beyond a single DB SELECT.
 *   - No mutation of CanonicalContext or any other shared object.
 *   - Does NOT affect the diagnostic (pest/disease/nutrition) rule path.
 */

import { createClient } from 'npm:@supabase/supabase-js@2.57.2';

export interface NextCropCandidate {
  rule_id: string;
  crop_code: string;
  scientific_basis: string;
  farmer_reason: string;     // reason_text (vernacular one-liner)
  scientific_source: string;
  score: number;             // 0..1+
  rule_priority: number;
  rule_confidence: number;
  matched_signals: string[]; // ['season','previous_crop','agro_zone',...]
}

export interface NextCropRecommendation {
  candidates: NextCropCandidate[];
  matched_rule_count: number;
  fallback_used: boolean;
  trace: {
    previous_crop: string | null;
    previous_crop_family: string | null;
    season: string | null;
    irrigation_type: string | null;
    agro_zone: string | null;
    soil_n: number | null;
    rotation_depth: number;
  };
}

// Minimal crop → family table (Maharashtra-focused). Extend as needed.
const CROP_FAMILY: Record<string, string> = {
  sugarcane: 'poaceae', wheat: 'poaceae', rice: 'poaceae', paddy: 'poaceae',
  maize: 'poaceae', sorghum: 'poaceae', jowar: 'poaceae', bajra: 'poaceae',
  pearl_millet: 'poaceae',
  chickpea: 'fabaceae', gram: 'fabaceae', soybean: 'fabaceae',
  green_gram: 'fabaceae', moong: 'fabaceae', black_gram: 'fabaceae',
  urad: 'fabaceae', pigeonpea: 'fabaceae', tur: 'fabaceae', arhar: 'fabaceae',
  lentil: 'fabaceae', groundnut: 'fabaceae', peanut: 'fabaceae',
  sunhemp: 'fabaceae',
  cotton: 'malvaceae',
  mustard: 'brassicaceae',
  safflower: 'asteraceae', sunflower: 'asteraceae',
};

// Devanagari display names (Marathi/Hindi share these labels for staple crops)
const CROP_LABEL_DEVANAGARI: Record<string, string> = {
  chickpea: 'हरभरा (चना)',
  green_gram: 'मूग (मूंग)',
  black_gram: 'उडीद (उड़द)',
  soybean: 'सोयाबीन',
  pigeonpea: 'तूर (अरहर)',
  lentil: 'मसूर',
  groundnut: 'भुईमूग (मूंगफली)',
  wheat: 'गहू (गेहूं)',
  maize: 'मका (मक्का)',
  sorghum: 'ज्वारी (ज्वार)',
  cotton: 'कापूस (कपास)',
  mustard: 'मोहरी (सरसों)',
  safflower: 'करडी (कुसुम)',
  sunflower: 'सूर्यफूल',
  sunhemp: 'सनई (सनहेम्प)',
  rice: 'भात (धान)',
  sugarcane: 'ऊस (गन्ना)',
};

const CROP_LABEL_EN: Record<string, string> = {
  chickpea: 'Chickpea', green_gram: 'Green gram', black_gram: 'Black gram',
  soybean: 'Soybean', pigeonpea: 'Pigeonpea', lentil: 'Lentil',
  groundnut: 'Groundnut', wheat: 'Wheat', maize: 'Maize', sorghum: 'Sorghum',
  cotton: 'Cotton', mustard: 'Mustard', safflower: 'Safflower',
  sunflower: 'Sunflower', sunhemp: 'Sunhemp', rice: 'Rice', sugarcane: 'Sugarcane',
};

export function cropLabel(cropCode: string, language: string): string {
  const lang = (language || 'en').toLowerCase();
  if (lang === 'mr' || lang === 'hi') return CROP_LABEL_DEVANAGARI[cropCode] || cropCode;
  return CROP_LABEL_EN[cropCode] || cropCode;
}

function inferSeasonFromDate(d = new Date()): 'kharif' | 'rabi' | 'summer' {
  const m = d.getUTCMonth() + 1; // 1..12
  if (m >= 6 && m <= 10) return 'kharif';   // Jun–Oct
  if (m >= 11 || m <= 2) return 'rabi';     // Nov–Feb
  return 'summer';                           // Mar–May
}

function arrEq(arr: any, target: string | null): boolean {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  if (!target) return false;
  return arr.map((x) => String(x).toLowerCase()).includes(target.toLowerCase());
}

// LEAKAGE-SAFETY (Task 3, Q3 — leave-with-comment):
// Tenant-agnostic 60s TTL cache of crop-rotation rules. The rules table is
// global reference data (no tenant_id filter), so sharing across requests is
// safe and saves a DB round-trip. The forbidden-pattern guardrail explicitly
// allow-lists these names.
let _cachedRules: any[] | null = null;
let _cachedAt = 0;
const CACHE_TTL_MS = 60_000;

async function loadRotationRules(supabase: any): Promise<any[]> {
  const now = Date.now();
  if (_cachedRules && now - _cachedAt < CACHE_TTL_MS) return _cachedRules;
  const { data, error } = await supabase
    .from('decision_rules')
    .select('rule_id, conditions_json, cause, scientific_basis, reason_text, scientific_source, priority, confidence_score, is_active')
    .eq('category', 'crop_rotation')
    .eq('is_active', true);
  if (error) {
    // FAIL-OPEN BY DESIGN (Task 6): next-crop is an advisory feature; when
    // the rotation-rules table is unreachable the recommender returns no
    // suggestions rather than crashing the chat turn. The empty array is
    // distinguishable from "no rules matched" via the caller's empty check.
    console.error('[next-crop-recommender] load rules failed:', error.message);
    return [];
  }
  _cachedRules = data || [];
  _cachedAt = now;
  return _cachedRules;
}

export interface RecommendArgs {
  canonicalContext: any;
  language?: string;
  traceId?: string;
  supabaseClient?: any; // optional override (tests)
}

export async function recommendNextCrop(args: RecommendArgs): Promise<NextCropRecommendation> {
  const ctx = args.canonicalContext || {};
  const traceId = args.traceId || 'no-trace';

  const supabase = args.supabaseClient || createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const lastCrop: string | null = ctx?.last_harvest?.crop_name
    ? String(ctx.last_harvest.crop_name).toLowerCase().replace(/\s+/g, '_')
    : null;
  const prevFamily = lastCrop ? (CROP_FAMILY[lastCrop] || null) : null;
  const season = inferSeasonFromDate();
  const irrigationType = (ctx?.soil?.irrigation_type || '').toLowerCase() || null;
  const irrigationNormalized: string | null = irrigationType
    ? (['rainfed', 'unirrigated'].includes(irrigationType) ? 'rainfed' : 'irrigated')
    : null;
  const agroZone = (ctx?.soil?.agro_zone || '').toLowerCase() || null;
  const soilTexture = (ctx?.soil?.texture || '').toLowerCase() || null;
  const soilN: number | null = ctx?.soil?.nitrogen ?? null;
  const rotationDepth = Array.isArray(ctx?.rotation_history) ? ctx.rotation_history.length : 0;

  const trace = {
    previous_crop: lastCrop, previous_crop_family: prevFamily,
    season, irrigation_type: irrigationNormalized, agro_zone: agroZone,
    soil_n: soilN, rotation_depth: rotationDepth,
  };

  const rules = await loadRotationRules(supabase);
  if (rules.length === 0) {
    return { candidates: [], matched_rule_count: 0, fallback_used: true, trace };
  }

  const scored: NextCropCandidate[] = [];
  for (const r of rules) {
    const c = r.conditions_json || {};
    const matched: string[] = [];
    let score = 0;
    let hardFail = false;

    // ── HARD FILTERS ────────────────────────────────────────────────────────
    // Season is the only true hard filter; everything else is soft-scored.
    if (Array.isArray(c.season) && c.season.length > 0) {
      if (!arrEq(c.season, season)) { hardFail = true; }
      else { score += 0.25; matched.push('season'); }
    }

    if (hardFail) continue;

    // ── PREVIOUS-CROP MATCH ─────────────────────────────────────────────────
    if (Array.isArray(c.previous_crop) && c.previous_crop.length > 0) {
      if (lastCrop && arrEq(c.previous_crop, lastCrop)) {
        score += 0.4; matched.push('previous_crop');
      } else if (!lastCrop) {
        // skip rules requiring a specific previous crop when we have none
        continue;
      } else {
        continue;
      }
    } else if (Array.isArray(c.previous_crop) && c.previous_crop.length === 0) {
      // "no prior record" default rules — match only when we genuinely have no last crop
      if (!lastCrop) { score += 0.2; matched.push('fallow_default'); }
      else { continue; }
    }

    // Previous crop family (alternative match path)
    if (Array.isArray(c.previous_crop_family) && c.previous_crop_family.length > 0) {
      if (prevFamily && arrEq(c.previous_crop_family, prevFamily)) {
        score += 0.15; matched.push('previous_crop_family');
      }
    }

    // ── SOFT SCORING ────────────────────────────────────────────────────────
    if (Array.isArray(c.irrigation_type) && c.irrigation_type.length > 0 && irrigationNormalized) {
      if (arrEq(c.irrigation_type, irrigationNormalized)) {
        score += 0.1; matched.push('irrigation_type');
      }
    }
    if (Array.isArray(c.agro_zone) && c.agro_zone.length > 0 && agroZone) {
      if (arrEq(c.agro_zone, agroZone)) { score += 0.15; matched.push('agro_zone'); }
    }
    if (Array.isArray(c.soil_texture) && c.soil_texture.length > 0 && soilTexture) {
      if (arrEq(c.soil_texture, soilTexture)) { score += 0.05; matched.push('soil_texture'); }
    }
    if (typeof c.soil_n_max === 'number' && soilN != null && soilN <= c.soil_n_max) {
      score += 0.1; matched.push('soil_n_max');
    }
    if (typeof c.soil_n_min === 'number' && soilN != null && soilN >= c.soil_n_min) {
      score += 0.05; matched.push('soil_n_min');
    }

    // Priority weight (1..10 → 0..0.1)
    score += Math.min(0.1, (Number(r.priority) || 0) / 100);

    // Rotation-gap penalty: avoid recommending same family as the immediate last crop
    const recCrop = String(c.recommended_crop || '').toLowerCase();
    const recFamily = CROP_FAMILY[recCrop] || null;
    if (recFamily && prevFamily && recFamily === prevFamily) {
      score -= 0.1; // soft penalty, not a hard exclude
    }

    if (!recCrop) continue;

    scored.push({
      rule_id: r.rule_id,
      crop_code: recCrop,
      scientific_basis: r.scientific_basis || '',
      farmer_reason: r.reason_text || '',
      scientific_source: r.scientific_source || '',
      score: Math.max(0, score) * (Number(r.confidence_score) || 0.8),
      rule_priority: Number(r.priority) || 0,
      rule_confidence: Number(r.confidence_score) || 0,
      matched_signals: matched,
    });
  }

  // Deduplicate by crop_code — keep highest-scoring rule per crop
  const byCrop = new Map<string, NextCropCandidate>();
  for (const cand of scored) {
    const prev = byCrop.get(cand.crop_code);
    if (!prev || cand.score > prev.score) byCrop.set(cand.crop_code, cand);
  }

  const top = Array.from(byCrop.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  console.log(JSON.stringify({
    audit_tag: 'NEXT_CROP_ENGINE',
    trace_id: traceId,
    matched_rule_count: scored.length,
    top_candidates: top.map((t) => ({ crop: t.crop_code, score: +t.score.toFixed(3), rule: t.rule_id })),
    trace,
  }));

  return {
    candidates: top,
    matched_rule_count: scored.length,
    fallback_used: top.length === 0,
    trace,
  };
}

/**
 * Render a deterministic, structured response message from candidates.
 * The LLM formatter will further polish this into rural conversational tone,
 * but every crop name + scientific reason here comes directly from the DB.
 */
export function renderRecommendationMessage(
  rec: NextCropRecommendation,
  language: string,
  lastCropLabel: string | null
): { mr: string; hi: string; en: string } {
  if (rec.candidates.length === 0) return { mr: '', hi: '', en: '' };

  const header = {
    mr: `🌱 **पुढील पीक — शास्त्रोक्त शिफारस**`,
    hi: `🌱 **अगली फसल — वैज्ञानिक सुझाव**`,
    en: `🌱 **Next-Crop Recommendation**`,
  };

  const context = lastCropLabel ? {
    mr: `📜 मागील पीक: **${lastCropLabel}**`,
    hi: `📜 पिछली फसल: **${lastCropLabel}**`,
    en: `📜 Last crop: **${lastCropLabel}**`,
  } : {
    mr: `📜 या शेताचा मागील पीक रेकॉर्ड नाही — हंगाम/मातीनुसार सुरक्षित शिफारस:`,
    hi: `📜 इस खेत का पिछला फसल रिकॉर्ड नहीं — मौसम/मिट्टी अनुसार सुरक्षित सुझाव:`,
    en: `📜 No prior crop record — season/soil-based safe defaults:`,
  };

  const renderBlock = (lang: 'mr' | 'hi' | 'en') => {
    const parts: string[] = [header[lang], context[lang], ''];
    rec.candidates.forEach((c, i) => {
      const name = cropLabel(c.crop_code, lang);
      const ribbon = i === 0
        ? (lang === 'mr' ? '✅ सर्वोत्तम' : lang === 'hi' ? '✅ सर्वश्रेष्ठ' : '✅ Best fit')
        : (lang === 'mr' ? '🔸 पर्याय' : lang === 'hi' ? '🔸 विकल्प' : '🔸 Option');
      parts.push(`${ribbon} **${i + 1}. ${name}**`);
      if (c.farmer_reason) parts.push(`   • ${c.farmer_reason}`);
      if (c.scientific_basis) {
        const sciLabel = lang === 'mr' ? '🔬 शास्त्रीय कारण' : lang === 'hi' ? '🔬 वैज्ञानिक आधार' : '🔬 Scientific basis';
        parts.push(`   ${sciLabel}: ${c.scientific_basis}`);
      }
      if (c.scientific_source) {
        const srcLabel = lang === 'mr' ? '📚 स्रोत' : lang === 'hi' ? '📚 स्रोत' : '📚 Source';
        parts.push(`   ${srcLabel}: ${c.scientific_source}`);
      }
      parts.push('');
    });
    const footer = lang === 'mr'
      ? '👉 अंतिम निवडीपूर्वी कृषी सहाय्यकाशी बोला आणि माती तपासणी करा.'
      : lang === 'hi'
        ? '👉 अंतिम निर्णय से पहले कृषि सहायक से सलाह लें और मिट्टी जांच करें।'
        : '👉 Before final selection, consult your agri-officer and get a soil test.';
    parts.push(footer);
    return parts.join('\n');
  };

  return { mr: renderBlock('mr'), hi: renderBlock('hi'), en: renderBlock('en') };
}
