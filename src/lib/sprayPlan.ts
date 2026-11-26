/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SPRAY PLAN CALCULATOR — label dose → pumps and stock solution
 *
 * REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
 * PATH: src/lib/sprayPlan.ts
 *
 * CHANGE LOG (newest first, keep entries short)
 * 2026-11-23 — NEW. The vision model only copies label facts (dose in the
 *   label's own unit, spray water per acre / ha); every number the farmer sees
 *   is computed here, deterministically.
 *
 * How the shop method is made exact
 * - Label dose per acre or per hectare: the amount of product per acre is
 *   fixed (that is what the label sets); pumps = water for the area ÷ pump
 *   size, rounded up, so the water can only go slightly up within one pump.
 * - Label dose per litre: the concentration is fixed; product = dose × water
 *   actually sprayed (pumps × pump size).
 * - Stock solution: all products for the area go into (pumps × stock per pump)
 *   litres; each pump takes that much stock plus (pump size − stock) litres of
 *   water, so every pump holds exactly one pump's dose. If the stock would be
 *   too concentrated (stock volume < products × min dilution), the stock per
 *   pump goes up in whole litres; if it would reach the pump size, the plan
 *   falls back to "measure into each pump".
 * - Mixing order from the formulation type code: dry (WP/WG/SP…) → flowable
 *   (SC/CS…) → emulsion (EC/EW/OD…) → solution and nutrients (SL, no code) →
 *   adjuvant last.
 *
 * Pump sizes, stock litres per pump and minimum dilution come from config
 * (vision_diagnosis_policy.general_scan.spray_plan, returned with the scan).
 * No crop logic, no language words.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { SprayComponent, WaterUnit } from '@/services/cropPhotoService';

/** Physical conversion (international acre and hectare). */
export const ACRES_PER_HECTARE = 2.471053814671653;

export type MixStage = 'dry' | 'flowable' | 'emulsion' | 'solution' | 'adjuvant';
const STAGE_ORDER: MixStage[] = ['dry', 'flowable', 'emulsion', 'solution', 'adjuvant'];

/** Formulation type codes of the international coding system, grouped by tank-mixing order. */
const STAGE_CODES: Array<[Exclude<MixStage, 'adjuvant' | 'solution'>, RegExp]> = [
  ['dry', /\b(WSB|WSP|SP|SG|WP|WG|WDG|DF|WS)\b/i],
  ['flowable', /\b(SC|CS|FS|SE|SU|ZC|ZW|FL|F)\b/i],
  ['emulsion', /\b(EC|EW|ME|OD|EO|DC|OL|UL)\b/i],
];

export function mixStage(c: Pick<SprayComponent, 'role' | 'formulation'>): MixStage {
  if (c.role === 'adjuvant') return 'adjuvant';
  const f = c.formulation ?? '';
  for (const [stage, re] of STAGE_CODES) if (re.test(f)) return stage;
  return 'solution';
}

export interface SprayCalcInput {
  components: SprayComponent[];
  waterVolume: number | null;
  waterUnit: WaterUnit | null;
  /** Area to spray in acres; null → plan for one pump. */
  areaAcres: number | null;
  pumpL: number;
  stockLPerPump: number;
  stockMinDilution: number;
}

export interface SprayCalcLine {
  component: SprayComponent;
  stage: MixStage;
  /** g or ml of the product as sold; null when the label dose is not known. */
  unit: 'g' | 'ml' | null;
  total: number | null;
  perPump: number | null;
}

export interface SprayCalcResult {
  /** area: stock-solution plan; one_pump: amounts for a single pump; label_only: no spray water known. */
  mode: 'area' | 'one_pump' | 'label_only';
  pumps: number | null;
  sprayedL: number | null;
  /** Stock litres per pump; null in one-pump mode or when products must be measured into each pump. */
  stockPerPumpL: number | null;
  stockL: number | null;
  waterPerPumpL: number | null;
  lines: SprayCalcLine[];
}

function unitOf(c: SprayComponent): 'g' | 'ml' | null {
  if (!c.dose_unit) return null;
  return c.dose_unit.startsWith('g_') ? 'g' : 'ml';
}

/** Product for `acres` (per-area labels) or for `litres` sprayed (per-litre labels). */
function productFor(c: SprayComponent, acres: number, litres: number): number | null {
  if (c.dose_value === null || !c.dose_unit) return null;
  if (c.dose_unit.endsWith('_per_acre')) return c.dose_value * acres;
  if (c.dose_unit.endsWith('_per_ha')) return (c.dose_value / ACRES_PER_HECTARE) * acres;
  return c.dose_value * litres;
}

export function computeSprayPlan(input: SprayCalcInput): SprayCalcResult {
  const ordered = [...input.components]
    .map((c, i) => ({ c, i, stage: mixStage(c) }))
    .sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage) || a.i - b.i);
  const waterPerAcre = input.waterVolume && input.waterVolume > 0 && input.waterUnit
    ? (input.waterUnit === 'l_per_ha' ? input.waterVolume / ACRES_PER_HECTARE : input.waterVolume)
    : null;
  const pumpL = input.pumpL;

  if (waterPerAcre === null || !(pumpL > 0)) {
    return {
      mode: 'label_only', pumps: null, sprayedL: null, stockPerPumpL: null, stockL: null, waterPerPumpL: null,
      lines: ordered.map(({ c, stage }) => ({ component: c, stage, unit: unitOf(c), total: null, perPump: null })),
    };
  }

  if (!input.areaAcres || input.areaAcres <= 0) {
    // One pump covers pumpL / waterPerAcre acres.
    const acres = pumpL / waterPerAcre;
    return {
      mode: 'one_pump', pumps: 1, sprayedL: pumpL, stockPerPumpL: null, stockL: null, waterPerPumpL: pumpL,
      lines: ordered.map(({ c, stage }) => {
        const amount = productFor(c, acres, pumpL);
        return { component: c, stage, unit: unitOf(c), total: amount, perPump: amount };
      }),
    };
  }

  const pumps = Math.max(1, Math.ceil(waterPerAcre * input.areaAcres / pumpL - 1e-9));
  const sprayedL = pumps * pumpL;
  const lines: SprayCalcLine[] = ordered.map(({ c, stage }) => {
    const total = productFor(c, input.areaAcres as number, sprayedL);
    return { component: c, stage, unit: unitOf(c), total, perPump: total === null ? null : total / pumps };
  });

  // Stock solution: enough litres per pump that the stock is at least `stockMinDilution` times the products.
  const productVolume = lines.reduce((sum, l) => sum + (l.total ?? 0), 0); // g ≈ ml for this purpose
  const neededPerPump = Math.ceil((productVolume * input.stockMinDilution) / 1000 / pumps - 1e-9);
  let stockPerPumpL: number | null = Math.max(input.stockLPerPump, neededPerPump);
  if (stockPerPumpL >= pumpL) stockPerPumpL = null;
  return {
    mode: 'area',
    pumps,
    sprayedL,
    stockPerPumpL,
    stockL: stockPerPumpL === null ? null : stockPerPumpL * pumps,
    waterPerPumpL: stockPerPumpL === null ? pumpL : pumpL - stockPerPumpL,
    lines,
  };
}

/** Farmer-measurable amount: one decimal below 10, whole numbers from 10 up. */
export function measure(n: number): string {
  return n < 10 ? String(Math.round(n * 10) / 10) : String(Math.round(n));
}
