/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ORGANIC INTELLIGENCE LAYER - PRODUCTION GRADE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Scientific organic farming equivalents and mode-based filtering.
 * Based on ICAR-NPOF, OFAI, and certification standards.
 * 
 * CRITICAL RULES:
 * - Organic-only farmers NEVER receive chemical advice
 * - Organic advice must clearly state limitations & slower response
 * - Cost & labour impact must be visible to farmer
 * - No placeholders, no optimistic assumptions
 * - Farmer trust must be preserved
 * 
 * Scientific Sources:
 * - ICAR-National Project on Organic Farming (NPOF)
 * - Organic Farming Association of India (OFAI)
 * - APEDA-NPOP Certification Standards
 * - ICAR-IARI Organic Package of Practices
 * 
 * Version: 2.0.0 (Production)
 */

import { Action, FarmingMode } from '../types.ts';

// ═══════════════════════════════════════════════════════════════════════════
// ORGANIC ALTERNATIVE CLASSIFICATION
// ═══════════════════════════════════════════════════════════════════════════

export enum OrganicActionType {
  PREVENTIVE = 'PREVENTIVE',     // Applied before problem occurs
  CURATIVE = 'CURATIVE',         // Applied after problem detected
  SUPPORTIVE = 'SUPPORTIVE'      // General health/growth support
}

export enum LabourIntensity {
  LOW = 'LOW',           // < 2 hours/ha
  MEDIUM = 'MEDIUM',     // 2-8 hours/ha
  HIGH = 'HIGH',         // 8-20 hours/ha
  VERY_HIGH = 'VERY_HIGH' // > 20 hours/ha
}

// ═══════════════════════════════════════════════════════════════════════════
// ORGANIC ALTERNATIVE INTERFACE - PRODUCTION GRADE
// ═══════════════════════════════════════════════════════════════════════════

export interface OrganicAlternative {
  // ─────────────────────────────────────────────────────────────────────────
  // IDENTIFICATION
  // ─────────────────────────────────────────────────────────────────────────
  input_name: string;
  local_names: {
    hindi?: string;
    tamil?: string;
    telugu?: string;
    kannada?: string;
  };
  
  // ─────────────────────────────────────────────────────────────────────────
  // CLASSIFICATION
  // ─────────────────────────────────────────────────────────────────────────
  action_type: OrganicActionType;
  
  // ─────────────────────────────────────────────────────────────────────────
  // APPLICATION DETAILS
  // ─────────────────────────────────────────────────────────────────────────
  dose: string;
  application_method: string;
  preparation_method?: string;
  
  // ─────────────────────────────────────────────────────────────────────────
  // TIMING & FREQUENCY
  // ─────────────────────────────────────────────────────────────────────────
  application_frequency: string;       // e.g., "Every 7-10 days", "Once at sowing"
  time_to_effect_days: number;         // Days until visible effect
  effect_duration_days: number;        // How long effect lasts
  application_timing: string;          // Best time of day/crop stage
  
  // ─────────────────────────────────────────────────────────────────────────
  // EFFECTIVENESS
  // ─────────────────────────────────────────────────────────────────────────
  effectiveness_pct: number;           // Relative to chemical (%)
  effectiveness_conditions: string[];  // When it works best
  effectiveness_limitations: string[]; // When it fails or underperforms
  
  // ─────────────────────────────────────────────────────────────────────────
  // CERTIFICATION
  // ─────────────────────────────────────────────────────────────────────────
  npop_certified: boolean;             // APEDA-NPOP compliant
  usda_organic_certified: boolean;     // USDA NOP compliant
  eu_organic_certified: boolean;       // EU organic compliant
  certification_notes?: string;
  
  // ─────────────────────────────────────────────────────────────────────────
  // COST & LABOUR
  // ─────────────────────────────────────────────────────────────────────────
  cost_inr_per_ha: number;
  cost_breakdown?: string;
  labour_hours_per_ha: number;
  labour_intensity: LabourIntensity;
  equipment_needed: string[];
  skill_level_required: 'low' | 'medium' | 'high';
  
  // ─────────────────────────────────────────────────────────────────────────
  // STORAGE & SHELF LIFE
  // ─────────────────────────────────────────────────────────────────────────
  shelf_life_days: number;
  storage_conditions: string;
  can_prepare_in_advance: boolean;
  
  // ─────────────────────────────────────────────────────────────────────────
  // SCIENTIFIC REFERENCE
  // ─────────────────────────────────────────────────────────────────────────
  scientific_source: string;
  scientific_basis: string;
}

export interface OrganicEquivalent {
  chemical_input: string;
  chemical_category: 'fertilizer' | 'insecticide' | 'fungicide' | 'herbicide' | 'growth_regulator';
  organic_alternatives: OrganicAlternative[];
  
  // Honest comparison note
  honest_comparison: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// FERTILIZER ORGANIC EQUIVALENTS - PRODUCTION GRADE
// ═══════════════════════════════════════════════════════════════════════════

export const FERTILIZER_EQUIVALENTS: OrganicEquivalent[] = [
  {
    chemical_input: 'Urea (46% N)',
    chemical_category: 'fertilizer',
    honest_comparison: 'Organic nitrogen sources release slower (2-8 weeks vs immediate). Expect 15-25% lower yield in first 2-3 years until soil biology improves. Long-term soil health benefits may offset initial losses.',
    organic_alternatives: [
      {
        input_name: 'Jeevamrut',
        local_names: {
          hindi: 'Jeevamrut',
          tamil: 'Jeevamrut',
          telugu: 'Jeevamrut',
          kannada: 'Jeevamrut'
        },
        action_type: OrganicActionType.SUPPORTIVE,
        dose: '500 L/ha in 500 L water',
        application_method: 'Foliar spray or soil drench through irrigation',
        preparation_method: '10 kg fresh cow dung + 10 L cow urine + 2 kg jaggery + 2 kg pulse flour (besan/dal powder) + handful of forest/bund soil in 200 L water. Ferment 5-7 days with daily stirring. Use within 7 days.',
        application_frequency: 'Every 15 days during crop growth',
        time_to_effect_days: 7,
        effect_duration_days: 15,
        application_timing: 'Early morning or late evening. Start from 7 DAS.',
        effectiveness_pct: 55,
        effectiveness_conditions: [
          'Works best in soils with existing organic matter',
          'More effective in warm weather (25-35°C)',
          'Better results when combined with mulching'
        ],
        effectiveness_limitations: [
          'SLOWER than urea - visible effect takes 7+ days',
          'Nutrient content varies with preparation',
          'Not suitable as sole N source for high-demand crops',
          'Rain within 6 hours reduces efficacy',
          'May not meet N demand during peak growth'
        ],
        npop_certified: true,
        usda_organic_certified: true,
        eu_organic_certified: true,
        certification_notes: 'Cow must not be treated with antibiotics. Use indigenous cow dung/urine for best results.',
        cost_inr_per_ha: 500,
        cost_breakdown: 'Cow dung ₹50, Jaggery ₹100, Pulse flour ₹50, Labour ₹300',
        labour_hours_per_ha: 4,
        labour_intensity: LabourIntensity.MEDIUM,
        equipment_needed: ['200 L drum/tank', 'Stirring stick', 'Sprayer or irrigation system', 'Strainer'],
        skill_level_required: 'low',
        shelf_life_days: 7,
        storage_conditions: 'Keep covered in shade. Use fresh for best results.',
        can_prepare_in_advance: false,
        scientific_source: 'ICAR-IARI ZBNF, Subhash Palekar Natural Farming',
        scientific_basis: 'Jeevamrut contains beneficial microorganisms that enhance soil microbial activity and nutrient cycling. Does NOT directly supply N like urea but improves N availability from soil organic matter. Expect 2-4 kg N/ha equivalent per application.'
      },
      {
        input_name: 'Vermicompost',
        local_names: {
          hindi: 'Kechua Khad',
          tamil: 'Mun Puzu Uram',
          telugu: 'Verm Compost',
          kannada: 'Huluva Gombari'
        },
        action_type: OrganicActionType.SUPPORTIVE,
        dose: '2-3 tonnes/ha',
        application_method: 'Broadcast and incorporate before sowing OR band placement near seed rows',
        preparation_method: 'Purchase ready-made or prepare using Eisenia fetida earthworms with agri-waste',
        application_frequency: 'Once before sowing + optional 1 tonne/ha at 30 DAS',
        time_to_effect_days: 14,
        effect_duration_days: 90,
        application_timing: 'Basal application 2-3 days before sowing. Incorporate into soil.',
        effectiveness_pct: 70,
        effectiveness_conditions: [
          'High-quality vermicompost with 1.5-2% N',
          'Moist soil conditions for microbial activity',
          'Combined with Jeevamrut for faster nutrient release'
        ],
        effectiveness_limitations: [
          'N content only 1.5-2% vs 46% in urea',
          'Large volumes needed (2-3 tonnes vs 50-100 kg urea)',
          'Transport cost significant for large farms',
          'Quality varies widely between sources',
          'Slow release may not meet peak N demand'
        ],
        npop_certified: true,
        usda_organic_certified: true,
        eu_organic_certified: true,
        certification_notes: 'Must be from organic waste. Verify source for certification.',
        cost_inr_per_ha: 12000,
        cost_breakdown: '₹4000/tonne x 3 tonnes = ₹12000. Transport ₹2000-4000 extra.',
        labour_hours_per_ha: 8,
        labour_intensity: LabourIntensity.MEDIUM,
        equipment_needed: ['Tractor-trolley for transport', 'Broadcast spreader or manual labour'],
        skill_level_required: 'low',
        shelf_life_days: 180,
        storage_conditions: 'Keep moist (30-40% moisture). Covered storage in shade.',
        can_prepare_in_advance: true,
        scientific_source: 'ICAR-NPOF Ghaziabad, TNAU Coimbatore',
        scientific_basis: 'Vermicompost contains 1.5-2% N, 0.5-1% P, 0.5-1% K plus micronutrients and beneficial microbes. Slow-release nature reduces leaching. Provides ~30-40 kg N/ha with 2 tonnes application vs 23-46 kg N from 50-100 kg urea.'
      },
      {
        input_name: 'Green Manure (Dhaincha)',
        local_names: {
          hindi: 'Dhaincha',
          tamil: 'Sannai',
          telugu: 'Giliricidia',
          kannada: 'Dhaincha'
        },
        action_type: OrganicActionType.PREVENTIVE,
        dose: '25-30 kg seed/ha, incorporate at 45-55 DAS',
        application_method: 'Sow dhaincha 45-55 days before main crop. Incorporate in situ at 50% flowering.',
        preparation_method: 'Broadcast seed, irrigate, allow growth for 45-55 days, incorporate with disc harrow',
        application_frequency: 'Once per season as pre-sowing crop',
        time_to_effect_days: 55,
        effect_duration_days: 120,
        application_timing: '45-55 days before main crop sowing. Incorporate before flowering.',
        effectiveness_pct: 75,
        effectiveness_conditions: [
          'Adequate moisture for dhaincha growth',
          'Incorporation at 50% flowering (max N)',
          'Decomposition period of 10-15 days before sowing'
        ],
        effectiveness_limitations: [
          'Delays main crop sowing by 55-70 days',
          'Requires extra irrigation for green manure crop',
          'Not suitable for late sowing windows',
          'Occupies land that could have cash crop'
        ],
        npop_certified: true,
        usda_organic_certified: true,
        eu_organic_certified: true,
        cost_inr_per_ha: 2500,
        cost_breakdown: 'Seed ₹800, Irrigation ₹500, Incorporation ₹1200',
        labour_hours_per_ha: 12,
        labour_intensity: LabourIntensity.MEDIUM,
        equipment_needed: ['Seed broadcaster', 'Disc harrow/rotavator', 'Irrigation'],
        skill_level_required: 'medium',
        shelf_life_days: 0,
        storage_conditions: 'N/A - grown in situ',
        can_prepare_in_advance: false,
        scientific_source: 'ICAR-IARI, ICAR-IISS Bhopal',
        scientific_basis: 'Sesbania aculeata (Dhaincha) fixes 60-80 kg N/ha in 45-55 days through rhizobial symbiosis. Biomass incorporation adds 4-6 tonnes organic matter/ha. N release occurs over 8-12 weeks post-incorporation.'
      },
      {
        input_name: 'FYM (Well-decomposed)',
        local_names: {
          hindi: 'Gober Ki Khad',
          tamil: 'Thozhu Uram',
          telugu: 'Peeru Eda',
          kannada: 'Kombu Gombari'
        },
        action_type: OrganicActionType.SUPPORTIVE,
        dose: '10-12 tonnes/ha',
        application_method: 'Broadcast and incorporate 2-3 weeks before sowing',
        preparation_method: 'Compost cow dung for 3-4 months with turning. Dark brown, crumbly, earthy smell indicates readiness.',
        application_frequency: 'Once before sowing each season',
        time_to_effect_days: 21,
        effect_duration_days: 180,
        application_timing: '2-3 weeks before sowing to allow initial decomposition',
        effectiveness_pct: 60,
        effectiveness_conditions: [
          'Well-decomposed (C:N ratio <20:1)',
          'Incorporated into moist soil',
          'Combined with biofertilizers for faster nutrient cycling'
        ],
        effectiveness_limitations: [
          'N content only 0.5-0.8% (vs 46% urea)',
          'Very large volumes needed - transport intensive',
          'Incompletely decomposed FYM causes N immobilization',
          'Weed seeds if not properly composted',
          'Variable quality between sources'
        ],
        npop_certified: true,
        usda_organic_certified: true,
        eu_organic_certified: true,
        certification_notes: 'Must be from animals not fed GM feed or treated with prohibited substances in organic systems.',
        cost_inr_per_ha: 6000,
        cost_breakdown: 'FYM ₹400/tonne x 12 = ₹4800, Transport ₹1200',
        labour_hours_per_ha: 16,
        labour_intensity: LabourIntensity.HIGH,
        equipment_needed: ['Tractor-trolley', 'Spreader or manual labour', 'Disc harrow'],
        skill_level_required: 'low',
        shelf_life_days: 365,
        storage_conditions: 'Store in heaps, covered to prevent nutrient loss. Keep moist.',
        can_prepare_in_advance: true,
        scientific_source: 'ICAR-IARI, ICAR-NPOF',
        scientific_basis: 'FYM contains 0.5-0.8% N, 0.2-0.3% P, 0.5-0.6% K. At 12 tonnes/ha, provides 60-100 kg N, but only 30-40% available in first season. Builds soil organic matter long-term.'
      }
    ]
  },
  {
    chemical_input: 'DAP (18-46-0)',
    chemical_category: 'fertilizer',
    honest_comparison: 'Organic P sources are less soluble and slower to act. Response visible in 3-4 weeks vs 7-10 days for DAP. P availability strongly pH-dependent - works best in acidic soils.',
    organic_alternatives: [
      {
        input_name: 'Rock Phosphate',
        local_names: {
          hindi: 'Rock Phosphate',
          tamil: 'Rock Phosphate',
          telugu: 'Rock Phosphate',
          kannada: 'Rock Phosphate'
        },
        action_type: OrganicActionType.SUPPORTIVE,
        dose: '400-500 kg/ha',
        application_method: 'Broadcast and incorporate before sowing. Mix with organic matter for better availability.',
        preparation_method: 'Mix rock phosphate with equal volume of FYM or compost. Apply together.',
        application_frequency: 'Once every 2-3 years as soil amendment',
        time_to_effect_days: 30,
        effect_duration_days: 730,
        application_timing: 'Basal application 30 days before sowing for acidic soils',
        effectiveness_pct: 55,
        effectiveness_conditions: [
          'Acidic soils (pH < 6.5) for best solubility',
          'Mixed with organic matter for PSB colonization',
          'Applied well in advance for dissolution'
        ],
        effectiveness_limitations: [
          'Very slow release - may take season to show effect',
          'Poor availability in alkaline soils (pH > 7.5)',
          'Not suitable for immediate P deficiency correction',
          'Heavy metals in some sources - verify quality'
        ],
        npop_certified: true,
        usda_organic_certified: true,
        eu_organic_certified: true,
        certification_notes: 'Check for heavy metal contamination. Udaipur/Jhamarkotra rock phosphate is certified.',
        cost_inr_per_ha: 5000,
        cost_breakdown: '₹10/kg x 500 kg = ₹5000',
        labour_hours_per_ha: 6,
        labour_intensity: LabourIntensity.MEDIUM,
        equipment_needed: ['Spreader', 'Disc harrow'],
        skill_level_required: 'low',
        shelf_life_days: 1825,
        storage_conditions: 'Keep dry. Indefinite shelf life if dry.',
        can_prepare_in_advance: true,
        scientific_source: 'ICAR-IARI, ICAR-IISS',
        scientific_basis: 'Rock phosphate contains 18-20% P2O5 but only 2-5% is immediately available. PSB inoculation increases availability 2-3x. Works best when applied with organic matter in acidic soils.'
      },
      {
        input_name: 'PSB (Phosphate Solubilizing Bacteria)',
        local_names: {
          hindi: 'PSB',
          tamil: 'PSB',
          telugu: 'PSB',
          kannada: 'PSB'
        },
        action_type: OrganicActionType.SUPPORTIVE,
        dose: '5 kg/ha or 10 g/kg seed treatment',
        application_method: 'Seed treatment OR soil application with FYM',
        preparation_method: 'Mix PSB culture with FYM at 1:100 ratio for soil application. For seed treatment, make slurry with jaggery solution.',
        application_frequency: 'Once at sowing',
        time_to_effect_days: 21,
        effect_duration_days: 90,
        application_timing: 'At sowing time for seed treatment. Before sowing for soil application.',
        effectiveness_pct: 45,
        effectiveness_conditions: [
          'Sufficient soil organic matter present',
          'Soil temperature 25-35°C',
          'Adequate soil moisture',
          'Combined with rock phosphate for best results'
        ],
        effectiveness_limitations: [
          'Does NOT add P - only solubilizes existing soil P',
          'Effect limited in low-organic matter soils',
          'High soil P may reduce PSB activity',
          'Requires living organisms - storage sensitive'
        ],
        npop_certified: true,
        usda_organic_certified: true,
        eu_organic_certified: true,
        cost_inr_per_ha: 500,
        cost_breakdown: '₹100/kg x 5 kg = ₹500',
        labour_hours_per_ha: 2,
        labour_intensity: LabourIntensity.LOW,
        equipment_needed: ['Seed treatment drum', 'Mixing container'],
        skill_level_required: 'low',
        shelf_life_days: 180,
        storage_conditions: 'Store at 15-25°C away from sunlight. Check expiry date.',
        can_prepare_in_advance: false,
        scientific_source: 'ICAR-NBAIM Mau',
        scientific_basis: 'Bacillus, Pseudomonas, and Aspergillus species produce organic acids that solubilize fixed soil P. Can mobilize 15-30 kg P/ha from soil reserves. Most effective when combined with rock phosphate application.'
      },
      {
        input_name: 'Bone Meal',
        local_names: {
          hindi: 'Haddi Ka Churna',
          tamil: 'Elumbu Podi',
          telugu: 'Emuka Podi',
          kannada: 'Moole Pudi'
        },
        action_type: OrganicActionType.SUPPORTIVE,
        dose: '300-500 kg/ha',
        application_method: 'Broadcast and incorporate OR band placement near rows',
        preparation_method: 'Use steamed bone meal (processed at high temperature)',
        application_frequency: 'Once before sowing',
        time_to_effect_days: 21,
        effect_duration_days: 180,
        application_timing: 'Basal application, incorporate 2-3 weeks before sowing',
        effectiveness_pct: 65,
        effectiveness_conditions: [
          'Acidic to neutral soils for better availability',
          'Moist soil conditions',
          'Incorporated well into root zone'
        ],
        effectiveness_limitations: [
          'Slow P release vs DAP',
          'Less effective in alkaline soils',
          'Some certifications restrict animal products',
          'Strong odor during application'
        ],
        npop_certified: true,
        usda_organic_certified: true,
        eu_organic_certified: false,
        certification_notes: 'Must be from organically raised animals in some standards. EU restricts animal-origin fertilizers.',
        cost_inr_per_ha: 6000,
        cost_breakdown: '₹15/kg x 400 kg = ₹6000',
        labour_hours_per_ha: 6,
        labour_intensity: LabourIntensity.MEDIUM,
        equipment_needed: ['Spreader', 'Gloves', 'Mask'],
        skill_level_required: 'low',
        shelf_life_days: 365,
        storage_conditions: 'Keep dry. Store away from pests.',
        can_prepare_in_advance: true,
        scientific_source: 'ICAR-NPOF',
        scientific_basis: 'Bone meal contains 20-24% P2O5 and 3-4% N. P release is slower than DAP but more sustained. Also provides calcium (20-25%) beneficial for acidic soils.'
      }
    ]
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// INSECTICIDE ORGANIC EQUIVALENTS - PRODUCTION GRADE
// ═══════════════════════════════════════════════════════════════════════════

export const INSECTICIDE_EQUIVALENTS: OrganicEquivalent[] = [
  {
    chemical_input: 'Imidacloprid (for sucking pests)',
    chemical_category: 'insecticide',
    honest_comparison: 'Organic options require 3-4x more applications. Control is 60-70% vs 90%+ for chemicals. Early detection is critical - organic methods fail against heavy infestations. Expect some crop damage even with best organic management.',
    organic_alternatives: [
      {
        input_name: 'Neem Oil (Azadirachtin)',
        local_names: {
          hindi: 'Neem Tel',
          tamil: 'Vembu Ennai',
          telugu: 'Vepa Noone',
          kannada: 'Bevu Enne'
        },
        action_type: OrganicActionType.CURATIVE,
        dose: '5 mL/L water (10000 ppm) or 2 mL/L (50000 ppm)',
        application_method: 'Foliar spray with hand-held or knapsack sprayer. Cover undersides of leaves.',
        preparation_method: 'Dilute neem oil in water. Add 1 mL liquid soap as emulsifier. Mix well before spraying.',
        application_frequency: 'Every 7-10 days during pest activity',
        time_to_effect_days: 3,
        effect_duration_days: 7,
        application_timing: 'Early morning or late evening. Avoid midday heat. Apply at first sign of pest.',
        effectiveness_pct: 65,
        effectiveness_conditions: [
          'Applied at early infestation (< 10 pests/plant)',
          'Good spray coverage including leaf undersides',
          'No rain for 4-6 hours after application',
          'Temperature below 30°C during application'
        ],
        effectiveness_limitations: [
          'SLOWER action than imidacloprid - 2-3 days vs hours',
          'Requires REPEATED applications (4-6 per season)',
          'Less effective against heavy infestations',
          'Breaks down in sunlight - reapply after 7 days',
          'Some pest populations show reduced sensitivity',
          'May cause phytotoxicity in hot weather'
        ],
        npop_certified: true,
        usda_organic_certified: true,
        eu_organic_certified: true,
        certification_notes: 'Use cold-pressed neem oil. Azadirachtin content should be certified.',
        cost_inr_per_ha: 1200,
        cost_breakdown: 'Neem oil ₹800/L, 1.5 L needed = ₹1200 per spray. 4-6 sprays needed.',
        labour_hours_per_ha: 6,
        labour_intensity: LabourIntensity.MEDIUM,
        equipment_needed: ['Knapsack sprayer', 'Liquid soap/emulsifier', 'Measuring cup', 'Protective gear'],
        skill_level_required: 'medium',
        shelf_life_days: 365,
        storage_conditions: 'Store in cool, dark place. Keep sealed. Away from direct sunlight.',
        can_prepare_in_advance: false,
        scientific_source: 'ICAR-NBAIR Bangalore',
        scientific_basis: 'Azadirachtin disrupts insect growth hormones (ecdysone), causing molting failure. Also acts as antifeedant and repellent. Effective against aphids, whiteflies, thrips, jassids at early stages. Does NOT kill adults immediately but prevents reproduction.'
      },
      {
        input_name: 'Beauveria bassiana',
        local_names: {
          hindi: 'Beauveria',
          tamil: 'Beauveria',
          telugu: 'Beauveria',
          kannada: 'Beauveria'
        },
        action_type: OrganicActionType.CURATIVE,
        dose: '2.5 kg/ha (1 x 10^8 cfu/g)',
        application_method: 'Foliar spray in evening. High humidity increases efficacy.',
        preparation_method: 'Mix powder in water with sticker. Spray within 2 hours of mixing.',
        application_frequency: 'Every 10-15 days, 3-4 applications',
        time_to_effect_days: 7,
        effect_duration_days: 15,
        application_timing: 'Evening spray when humidity is high. Avoid hot, dry conditions.',
        effectiveness_pct: 55,
        effectiveness_conditions: [
          'High humidity (>80% RH) for spore germination',
          'Temperature 20-28°C optimal',
          'Applied to young pest stages',
          'No fungicide spray for 7 days before/after'
        ],
        effectiveness_limitations: [
          'VERY SLOW - takes 5-10 days to kill',
          'Requires high humidity - fails in dry conditions',
          'Incompatible with fungicides',
          'Sunlight kills spores - evening application only',
          'Living organism - proper storage critical'
        ],
        npop_certified: true,
        usda_organic_certified: true,
        eu_organic_certified: true,
        cost_inr_per_ha: 1500,
        cost_breakdown: '₹600/kg x 2.5 kg = ₹1500 per application',
        labour_hours_per_ha: 4,
        labour_intensity: LabourIntensity.MEDIUM,
        equipment_needed: ['Sprayer', 'Sticker/spreader'],
        skill_level_required: 'medium',
        shelf_life_days: 180,
        storage_conditions: 'Refrigerate at 4-8°C. Check viability before use. Use before expiry.',
        can_prepare_in_advance: false,
        scientific_source: 'ICAR-NBAIR',
        scientific_basis: 'Beauveria bassiana is an entomopathogenic fungus. Spores attach to insect cuticle, germinate, and penetrate body causing death in 5-10 days. Most effective on soft-bodied insects in humid conditions. White fungal growth visible on dead insects.'
      },
      {
        input_name: 'Yellow Sticky Traps',
        local_names: {
          hindi: 'Peela Chipkane Wala Trap',
          tamil: 'Manjal Ottum Pori',
          telugu: 'Pasupu Trap',
          kannada: 'Haladi Trap'
        },
        action_type: OrganicActionType.PREVENTIVE,
        dose: '20-25 traps/ha',
        application_method: 'Install at crop canopy level. Replace when covered.',
        preparation_method: 'Purchase ready-made or make with yellow plastic sheets + castor oil/grease',
        application_frequency: 'Replace every 7-10 days or when 50% covered',
        time_to_effect_days: 1,
        effect_duration_days: 10,
        application_timing: 'Install at crop emergence. Monitor and replace regularly.',
        effectiveness_pct: 35,
        effectiveness_conditions: [
          'Used as MONITORING tool primarily',
          'Effective for early detection',
          'Reduces flying adult population',
          'Works best for whiteflies and aphids'
        ],
        effectiveness_limitations: [
          'MONITORING tool - NOT primary control',
          'Does not control larvae or eggs',
          'Requires regular replacement',
          'May trap beneficial insects',
          'Ineffective for heavy infestations'
        ],
        npop_certified: true,
        usda_organic_certified: true,
        eu_organic_certified: true,
        cost_inr_per_ha: 1000,
        cost_breakdown: '₹40/trap x 25 = ₹1000. Replace 4-5 times per season.',
        labour_hours_per_ha: 4,
        labour_intensity: LabourIntensity.LOW,
        equipment_needed: ['Traps', 'Support stakes', 'Wires/strings'],
        skill_level_required: 'low',
        shelf_life_days: 180,
        storage_conditions: 'Store flat in dry conditions. Protect from dust.',
        can_prepare_in_advance: true,
        scientific_source: 'ICAR-NBAIR',
        scientific_basis: 'Yellow attracts whiteflies, aphids, leaf miners, and thrips. Used for population monitoring (ETL determination) and mass trapping. Cannot control heavy infestations alone - use as part of IPM strategy.'
      }
    ]
  },
  {
    chemical_input: 'Chlorpyriphos (for borers)',
    chemical_category: 'insecticide',
    honest_comparison: 'Organic borer control is challenging. Bt is effective but requires precise timing. Expect 15-25% more borer damage in organic vs chemical systems. Prevention through trap crops and egg parasitoids is critical.',
    organic_alternatives: [
      {
        input_name: 'Bacillus thuringiensis (Bt)',
        local_names: {
          hindi: 'Bt',
          tamil: 'Bt',
          telugu: 'Bt',
          kannada: 'Bt'
        },
        action_type: OrganicActionType.CURATIVE,
        dose: '1-1.5 kg/ha (Bt kurstaki for caterpillars)',
        application_method: 'Foliar spray targeting young larvae. Spray into whorls/growing points.',
        preparation_method: 'Mix powder in water. Add sticker. Use immediately.',
        application_frequency: 'Every 7-10 days during pest window, 3-4 applications',
        time_to_effect_days: 3,
        effect_duration_days: 5,
        application_timing: 'Evening spray when larvae are feeding. Target 1st-2nd instar larvae.',
        effectiveness_pct: 70,
        effectiveness_conditions: [
          'Applied to YOUNG larvae (1st-2nd instar)',
          'Larvae must ingest Bt on treated surfaces',
          'Applied before larvae bore into stems/fruits',
          'Repeated applications at 7-10 day intervals'
        ],
        effectiveness_limitations: [
          'ONLY kills larvae that eat treated surfaces',
          'Ineffective on older larvae and pupae',
          'Once larvae bore inside, Bt cannot reach them',
          'UV degrades Bt - reapply after 5-7 days',
          'Requires precise timing - miss window and fails'
        ],
        npop_certified: true,
        usda_organic_certified: true,
        eu_organic_certified: true,
        cost_inr_per_ha: 800,
        cost_breakdown: '₹500/kg x 1.5 kg = ₹750 + application = ₹800',
        labour_hours_per_ha: 4,
        labour_intensity: LabourIntensity.MEDIUM,
        equipment_needed: ['Sprayer', 'Sticker'],
        skill_level_required: 'high',
        shelf_life_days: 365,
        storage_conditions: 'Store cool, dry, dark. Avoid heat and moisture.',
        can_prepare_in_advance: false,
        scientific_source: 'ICAR-NBAIR',
        scientific_basis: 'Bt produces crystal proteins (Cry toxins) that destroy larval gut when ingested. Death occurs in 2-5 days. Must be eaten to work - no contact action. Timing is CRITICAL - apply when young larvae are actively feeding on surfaces.'
      },
      {
        input_name: 'Trichogramma (Egg Parasitoid)',
        local_names: {
          hindi: 'Trichogramma',
          tamil: 'Trichogramma',
          telugu: 'Trichogramma',
          kannada: 'Trichogramma'
        },
        action_type: OrganicActionType.PREVENTIVE,
        dose: '1-1.5 lakh eggs/ha, 6-8 releases',
        application_method: 'Release tricho-cards at 10-15 points per hectare at weekly intervals',
        preparation_method: 'Order fresh cards from biocontrol labs. Use within 2-3 days of receipt.',
        application_frequency: 'Weekly release for 6-8 weeks during egg-laying period',
        time_to_effect_days: 7,
        effect_duration_days: 7,
        application_timing: 'Start release at first moth trap catch or egg sighting. Release in evening.',
        effectiveness_pct: 60,
        effectiveness_conditions: [
          'Released when pest eggs are present',
          'Adequate Trichogramma numbers (150,000+/ha)',
          'Multiple releases (6-8) at weekly intervals',
          'No broad-spectrum insecticide use'
        ],
        effectiveness_limitations: [
          'ONLY parasitizes eggs - not larvae',
          'Requires consistent weekly releases',
          'Supply chain dependent - fresh cards needed',
          'Cannot control existing larvae',
          'Hot/dry weather reduces wasp activity'
        ],
        npop_certified: true,
        usda_organic_certified: true,
        eu_organic_certified: true,
        cost_inr_per_ha: 4500,
        cost_breakdown: '₹750/release x 6 releases = ₹4500',
        labour_hours_per_ha: 8,
        labour_intensity: LabourIntensity.MEDIUM,
        equipment_needed: ['Tricho-cards', 'Stapler/pins for attaching'],
        skill_level_required: 'medium',
        shelf_life_days: 2,
        storage_conditions: 'Use immediately. Keep in shade during transport. Refrigerate if delay.',
        can_prepare_in_advance: false,
        scientific_source: 'ICAR-NBAIR, State Biocontrol Labs',
        scientific_basis: 'Trichogramma chilonis lays eggs inside pest eggs, killing the embryo. Each Trichogramma female parasitizes 40-50 pest eggs. PREVENTIVE measure - must be in field before pest egg-laying peak. Combine with pheromone traps for monitoring.'
      },
      {
        input_name: 'NPV (Nuclear Polyhedrosis Virus)',
        local_names: {
          hindi: 'NPV',
          tamil: 'NPV',
          telugu: 'NPV',
          kannada: 'NPV'
        },
        action_type: OrganicActionType.CURATIVE,
        dose: '250-500 LE (Larval Equivalents)/ha',
        application_method: 'Foliar spray in evening. Add 0.1% Tinopal (optical brightener) as UV protectant.',
        preparation_method: 'Dilute NPV concentrate in water. Add Tinopal and jaggery solution. Spray same day.',
        application_frequency: 'Every 10-15 days, 2-3 applications during pest window',
        time_to_effect_days: 5,
        effect_duration_days: 14,
        application_timing: 'Evening spray. Target young larvae. Use at low-moderate infestation.',
        effectiveness_pct: 65,
        effectiveness_conditions: [
          'Applied to young larvae (1st-3rd instar)',
          'UV protection (Tinopal) used',
          'Applied in evening for overnight activity',
          'Population not too high (not rescue treatment)'
        ],
        effectiveness_limitations: [
          'Species-specific - HaNPV for Helicoverpa only',
          'Takes 5-10 days to kill larvae',
          'UV light degrades virus rapidly',
          'Cannot control heavy infestations',
          'Requires cold chain for storage'
        ],
        npop_certified: true,
        usda_organic_certified: true,
        eu_organic_certified: true,
        cost_inr_per_ha: 1200,
        cost_breakdown: '₹400/250 LE x 2-3 applications',
        labour_hours_per_ha: 4,
        labour_intensity: LabourIntensity.MEDIUM,
        equipment_needed: ['Sprayer', 'Tinopal', 'Jaggery'],
        skill_level_required: 'high',
        shelf_life_days: 180,
        storage_conditions: 'Refrigerate at 4°C. Protect from heat and light.',
        can_prepare_in_advance: false,
        scientific_source: 'ICAR-NBAIR, ICRISAT',
        scientific_basis: 'NPV is species-specific virus. HaNPV for Helicoverpa, SlNPV for Spodoptera. Larvae die in 5-10 days, liquefy, and release virus to infect others. Epizootics can develop. Tinopal protects virus from UV for 2-3 days longer.'
      }
    ]
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// FUNGICIDE ORGANIC EQUIVALENTS - PRODUCTION GRADE
// ═══════════════════════════════════════════════════════════════════════════

export const FUNGICIDE_EQUIVALENTS: OrganicEquivalent[] = [
  {
    chemical_input: 'Mancozeb (broad-spectrum)',
    chemical_category: 'fungicide',
    honest_comparison: 'Organic fungicides are primarily PREVENTIVE. Once infection is established, control is very limited. Expect 20-30% more disease in organic systems. Prevention through resistant varieties and cultural practices is essential.',
    organic_alternatives: [
      {
        input_name: 'Trichoderma viride/harzianum',
        local_names: {
          hindi: 'Trichoderma',
          tamil: 'Trichoderma',
          telugu: 'Trichoderma',
          kannada: 'Trichoderma'
        },
        action_type: OrganicActionType.PREVENTIVE,
        dose: '4-5 kg/ha (soil application) or 10 g/kg seed',
        application_method: 'Seed treatment OR soil application with FYM carrier',
        preparation_method: 'Mix Trichoderma with FYM at 1:100 ratio. Broadcast and incorporate OR treat seed with slurry.',
        application_frequency: 'Once at sowing + one soil drench at 30 DAS if needed',
        time_to_effect_days: 14,
        effect_duration_days: 60,
        application_timing: 'Apply before disease onset. Soil application 7 days before sowing.',
        effectiveness_pct: 60,
        effectiveness_conditions: [
          'Applied BEFORE disease establishment',
          'Adequate soil organic matter',
          'Moist soil conditions (25-35°C)',
          'No fungicide use for 15 days before/after'
        ],
        effectiveness_limitations: [
          'PREVENTIVE only - will NOT cure established disease',
          'Slow to establish in soil (7-14 days)',
          'Killed by chemical fungicides',
          'Requires moist conditions to survive',
          'Less effective in low-organic-matter soils'
        ],
        npop_certified: true,
        usda_organic_certified: true,
        eu_organic_certified: true,
        cost_inr_per_ha: 1000,
        cost_breakdown: '₹200/kg x 5 kg = ₹1000',
        labour_hours_per_ha: 4,
        labour_intensity: LabourIntensity.LOW,
        equipment_needed: ['Mixing container', 'FYM carrier', 'Seed treatment drum'],
        skill_level_required: 'low',
        shelf_life_days: 180,
        storage_conditions: 'Cool, dry, dark. Check viability before use.',
        can_prepare_in_advance: false,
        scientific_source: 'ICAR-NBAIR, ICAR-IARI',
        scientific_basis: 'Trichoderma is antagonistic fungus that parasitizes pathogens and produces antibiotics. Colonizes rhizosphere protecting roots. Also induces systemic resistance in plants. MUST be applied before disease for effectiveness.'
      },
      {
        input_name: 'Bordeaux Mixture',
        local_names: {
          hindi: 'Bordeaux Mixture',
          tamil: 'Bordeaux Mixture',
          telugu: 'Bordeaux Mixture',
          kannada: 'Bordeaux Mixture'
        },
        action_type: OrganicActionType.PREVENTIVE,
        dose: '1% solution (1 kg CuSO4 + 1 kg lime in 100 L water)',
        application_method: 'Foliar spray. Good coverage essential. Avoid runoff.',
        preparation_method: 'Dissolve CuSO4 in 50 L water. Slake lime in 50 L water separately. Pour CuSO4 into lime solution (NOT reverse). Test pH with knife - no corrosion.',
        application_frequency: 'Every 10-15 days during disease-prone weather',
        time_to_effect_days: 0,
        effect_duration_days: 10,
        application_timing: 'Apply before rain/infection period. Prophylactic use only.',
        effectiveness_pct: 70,
        effectiveness_conditions: [
          'Applied BEFORE infection',
          'Good spray coverage',
          'Freshly prepared mixture',
          'pH 7-8 (neutral to slightly alkaline)'
        ],
        effectiveness_limitations: [
          'PREVENTIVE only - no curative action',
          'Copper accumulation in soil with repeated use',
          'Phytotoxicity in acidic conditions',
          'Stains fruit - cosmetic issue',
          'Must prepare fresh (use within 24 hours)'
        ],
        npop_certified: true,
        usda_organic_certified: true,
        eu_organic_certified: true,
        certification_notes: 'Copper use limited to 6 kg/ha/year in EU organic. Cumulative soil loading concerns.',
        cost_inr_per_ha: 600,
        cost_breakdown: 'CuSO4 ₹300 + Lime ₹100 + Labour ₹200',
        labour_hours_per_ha: 6,
        labour_intensity: LabourIntensity.MEDIUM,
        equipment_needed: ['Two containers', 'Sprayer', 'Gloves', 'Testing knife'],
        skill_level_required: 'medium',
        shelf_life_days: 1,
        storage_conditions: 'Prepare fresh. Cannot store mixed solution.',
        can_prepare_in_advance: false,
        scientific_source: 'ICAR-IIHR, ICAR-CPCRI',
        scientific_basis: 'Copper ions disrupt fungal enzyme systems. Contact fungicide - must be on leaf surface before spore germination. Does NOT move into plant. Rain washes off - reapply after heavy rain.'
      },
      {
        input_name: 'Pseudomonas fluorescens',
        local_names: {
          hindi: 'Pseudomonas',
          tamil: 'Pseudomonas',
          telugu: 'Pseudomonas',
          kannada: 'Pseudomonas'
        },
        action_type: OrganicActionType.PREVENTIVE,
        dose: '2.5-5 kg/ha (10 g/kg seed treatment)',
        application_method: 'Seed treatment OR soil drench OR foliar spray',
        preparation_method: 'Seed treatment: slurry with jaggery solution. Soil: mix with FYM. Foliar: 5 g/L water.',
        application_frequency: 'Seed treatment + foliar at 15-day intervals if needed',
        time_to_effect_days: 14,
        effect_duration_days: 45,
        application_timing: 'Seed treatment before sowing. Soil drench at transplanting.',
        effectiveness_pct: 55,
        effectiveness_conditions: [
          'Applied preventively before disease',
          'Moist conditions for establishment',
          'No antibiotic/fungicide use'
        ],
        effectiveness_limitations: [
          'PREVENTIVE - limited curative action',
          'Requires establishment period (14 days)',
          'Effectiveness varies by strain',
          'Moisture-dependent survival'
        ],
        npop_certified: true,
        usda_organic_certified: true,
        eu_organic_certified: true,
        cost_inr_per_ha: 800,
        cost_breakdown: '₹200/kg x 4 kg = ₹800',
        labour_hours_per_ha: 3,
        labour_intensity: LabourIntensity.LOW,
        equipment_needed: ['Seed treatment drum', 'Sprayer'],
        skill_level_required: 'low',
        shelf_life_days: 180,
        storage_conditions: 'Store at 15-25°C. Check viability.',
        can_prepare_in_advance: false,
        scientific_source: 'ICAR-IARI, ICAR-NBAIR',
        scientific_basis: 'Pseudomonas produces siderophores, HCN, and antibiotics that suppress pathogens. Also induces systemic resistance (ISR). Effective against bacterial and fungal diseases when applied preventively.'
      }
    ]
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// COMBINED ORGANIC EQUIVALENTS
// ═══════════════════════════════════════════════════════════════════════════

export const ALL_ORGANIC_EQUIVALENTS: OrganicEquivalent[] = [
  ...FERTILIZER_EQUIVALENTS,
  ...INSECTICIDE_EQUIVALENTS,
  ...FUNGICIDE_EQUIVALENTS
];

// ═══════════════════════════════════════════════════════════════════════════
// ACTION CLASSIFICATION FOR FARMING MODE
// ═══════════════════════════════════════════════════════════════════════════

const CHEMICAL_ONLY_ACTIONS: Action[] = [
  Action.APPLY_INSECTICIDE,
  Action.APPLY_FUNGICIDE,
  Action.HERBICIDE_PRE_EMERGENCE,
  Action.HERBICIDE_POST_EMERGENCE
];

const SYNTHETIC_FERTILIZER_ACTIONS: Action[] = [
  Action.APPLY_NITROGEN,
  Action.APPLY_PHOSPHORUS,
  Action.APPLY_POTASSIUM,
  Action.APPLY_ZINC,
  Action.APPLY_GYPSUM,
  Action.APPLY_LIME
];

// ═══════════════════════════════════════════════════════════════════════════
// CONFLICT DETECTION & VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

export interface OrganicValidationResult {
  is_allowed: boolean;
  violations: string[];
  warnings: string[];
  organic_alternatives: OrganicAlternative[];
  honest_assessment: string;
}

/**
 * CRITICAL: Validate that organic farmers NEVER receive chemical advice
 */
export function validateOrganicCompliance(
  recommendedAction: Action,
  farmingMode: FarmingMode,
  actionDescription: string = ''
): OrganicValidationResult {
  const result: OrganicValidationResult = {
    is_allowed: true,
    violations: [],
    warnings: [],
    organic_alternatives: [],
    honest_assessment: ''
  };

  // ─────────────────────────────────────────────────────────────────────────
  // ORGANIC_ONLY MODE - ABSOLUTE BLOCKS
  // ─────────────────────────────────────────────────────────────────────────
  if (farmingMode === FarmingMode.ORGANIC_ONLY) {
    // Block chemical pesticides
    if (CHEMICAL_ONLY_ACTIONS.includes(recommendedAction)) {
      result.is_allowed = false;
      result.violations.push(
        `BLOCKED: ${recommendedAction} is a CHEMICAL action - strictly prohibited for organic farmers`,
        'Organic certification would be VOID if chemical inputs are used',
        'See organic alternatives below'
      );
      
      // Find organic alternatives
      const equivalent = ALL_ORGANIC_EQUIVALENTS.find(eq => 
        eq.organic_alternatives.length > 0
      );
      if (equivalent) {
        result.organic_alternatives = equivalent.organic_alternatives;
        result.honest_assessment = equivalent.honest_comparison;
      }
    }

    // Block synthetic fertilizers
    if (SYNTHETIC_FERTILIZER_ACTIONS.includes(recommendedAction)) {
      result.is_allowed = false;
      result.violations.push(
        `BLOCKED: ${recommendedAction} implies synthetic fertilizer - prohibited for organic farmers`,
        'Use organic nutrient sources only'
      );
      
      const fertEquivalent = FERTILIZER_EQUIVALENTS[0];
      if (fertEquivalent) {
        result.organic_alternatives = fertEquivalent.organic_alternatives;
        result.honest_assessment = fertEquivalent.honest_comparison;
      }
    }

    // Add honest assessment for organic mode
    if (result.is_allowed) {
      result.honest_assessment = 'Organic inputs work slower and may provide 60-70% effectiveness compared to chemicals. Expect some yield reduction but soil health improves over time.';
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ORGANIC_FERTILIZER MODE - Synthetic fertilizers OK, pesticides blocked
  // ─────────────────────────────────────────────────────────────────────────
  if (farmingMode === FarmingMode.ORGANIC_FERTILIZER) {
    if (CHEMICAL_ONLY_ACTIONS.includes(recommendedAction)) {
      result.is_allowed = false;
      result.violations.push(
        `BLOCKED: ${recommendedAction} is a chemical pesticide - not allowed in organic fertilizer mode`,
        'Synthetic fertilizers are allowed, but chemical pesticides are not'
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // KEYWORD CHECK IN DESCRIPTION
  // ─────────────────────────────────────────────────────────────────────────
  if (farmingMode === FarmingMode.ORGANIC_ONLY && actionDescription) {
    const chemicalKeywords = [
      'urea', 'dap', 'mop', 'npk', 'imidacloprid', 'chlorpyriphos',
      'cypermethrin', 'carbofuran', 'monocrotophos', 'mancozeb',
      'carbendazim', 'metalaxyl', 'pendimethalin', '2,4-d', 'atrazine',
      'glyphosate', 'paraquat', 'isoproturon', 'fipronil', 'thiamethoxam'
    ];

    const lowerDesc = actionDescription.toLowerCase();
    const foundChemicals = chemicalKeywords.filter(kw => lowerDesc.includes(kw));

    if (foundChemicals.length > 0) {
      result.is_allowed = false;
      result.violations.push(
        `BLOCKED: Description contains chemical keywords: ${foundChemicals.join(', ')}`,
        'Organic farmers must NEVER receive chemical recommendations'
      );
    }
  }

  return result;
}

/**
 * Filter actions based on farming mode - CRITICAL function
 */
export function filterByFarmingMode(
  actions: Action[],
  mode: FarmingMode
): Action[] {
  switch (mode) {
    case FarmingMode.ORGANIC_ONLY:
      return actions.filter(action => 
        !CHEMICAL_ONLY_ACTIONS.includes(action) && 
        !SYNTHETIC_FERTILIZER_ACTIONS.includes(action)
      );
    
    case FarmingMode.ORGANIC_FERTILIZER:
      return actions.filter(action => !CHEMICAL_ONLY_ACTIONS.includes(action));
    
    case FarmingMode.CONVENTIONAL:
    default:
      return actions;
  }
}

/**
 * Get organic alternatives with full cost/labour/effectiveness info
 */
export function getOrganicAlternativesWithDetails(
  chemicalAction: Action,
  farmingMode: FarmingMode
): {
  alternatives: OrganicAlternative[];
  honest_comparison: string;
  total_cost_inr: number;
  total_labour_hours: number;
  expected_effectiveness: number;
} {
  if (farmingMode === FarmingMode.CONVENTIONAL) {
    return {
      alternatives: [],
      honest_comparison: 'Conventional farming - chemical options available',
      total_cost_inr: 0,
      total_labour_hours: 0,
      expected_effectiveness: 100
    };
  }

  // Map action to equivalent
  let equivalent: OrganicEquivalent | undefined;

  if (chemicalAction === Action.APPLY_NITROGEN) {
    equivalent = FERTILIZER_EQUIVALENTS.find(e => e.chemical_input.includes('Urea'));
  } else if (chemicalAction === Action.APPLY_PHOSPHORUS) {
    equivalent = FERTILIZER_EQUIVALENTS.find(e => e.chemical_input.includes('DAP'));
  } else if (chemicalAction === Action.APPLY_INSECTICIDE) {
    equivalent = INSECTICIDE_EQUIVALENTS[0];
  } else if (chemicalAction === Action.APPLY_FUNGICIDE) {
    equivalent = FUNGICIDE_EQUIVALENTS[0];
  }

  if (!equivalent) {
    return {
      alternatives: [],
      honest_comparison: 'No organic equivalent found for this action',
      total_cost_inr: 0,
      total_labour_hours: 0,
      expected_effectiveness: 0
    };
  }

  const alternatives = equivalent.organic_alternatives;
  const totalCost = alternatives.reduce((sum, alt) => sum + alt.cost_inr_per_ha, 0);
  const totalLabour = alternatives.reduce((sum, alt) => sum + alt.labour_hours_per_ha, 0);
  const avgEffectiveness = alternatives.length > 0
    ? alternatives.reduce((sum, alt) => sum + alt.effectiveness_pct, 0) / alternatives.length
    : 0;

  return {
    alternatives,
    honest_comparison: equivalent.honest_comparison,
    total_cost_inr: totalCost,
    total_labour_hours: totalLabour,
    expected_effectiveness: Math.round(avgEffectiveness)
  };
}

/**
 * Generate honest organic advisory with clear limitations
 */
export function generateOrganicAdvisory(
  alternative: OrganicAlternative,
  isPrimaryRecommendation: boolean = false
): string {
  const lines: string[] = [];

  // Header
  lines.push(`📗 ORGANIC: ${alternative.input_name}`);
  if (alternative.local_names.hindi) {
    lines.push(`   (${alternative.local_names.hindi})`);
  }

  // Classification
  const typeEmoji = {
    [OrganicActionType.PREVENTIVE]: '🛡️ PREVENTIVE',
    [OrganicActionType.CURATIVE]: '💊 CURATIVE',
    [OrganicActionType.SUPPORTIVE]: '🌱 SUPPORTIVE'
  };
  lines.push(`   Type: ${typeEmoji[alternative.action_type]}`);

  // Application
  lines.push(`   Dose: ${alternative.dose}`);
  lines.push(`   Timing: ${alternative.application_timing}`);
  lines.push(`   Frequency: ${alternative.application_frequency}`);

  // Effectiveness - HONEST
  lines.push('');
  lines.push(`   ⚡ Effectiveness: ${alternative.effectiveness_pct}% vs chemical`);
  lines.push(`   ⏱️ Time to Effect: ${alternative.time_to_effect_days} days`);
  lines.push(`   📅 Lasts: ${alternative.effect_duration_days} days`);

  // Cost & Labour - VISIBLE
  lines.push('');
  lines.push(`   💰 Cost: ₹${alternative.cost_inr_per_ha}/ha`);
  lines.push(`   👷 Labour: ${alternative.labour_hours_per_ha} hours/ha (${alternative.labour_intensity})`);

  // Limitations - NEVER HIDE THESE
  if (alternative.effectiveness_limitations.length > 0) {
    lines.push('');
    lines.push('   ⚠️ LIMITATIONS (Read Carefully):');
    alternative.effectiveness_limitations.forEach(lim => {
      lines.push(`   • ${lim}`);
    });
  }

  // Certification
  lines.push('');
  const certs: string[] = [];
  if (alternative.npop_certified) certs.push('NPOP');
  if (alternative.usda_organic_certified) certs.push('USDA');
  if (alternative.eu_organic_certified) certs.push('EU');
  lines.push(`   ✅ Certified: ${certs.join(', ') || 'Check local standards'}`);

  return lines.join('\n');
}
