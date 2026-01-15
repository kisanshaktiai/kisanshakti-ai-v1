/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIAGNOSTIC WEIGHT REGISTRY - GAP #2 FIX
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Assign evidence-weighted confidence boosts instead of fixed +15%.
 * "Dead heart present" should boost confidence more than "leaf yellow".
 * 
 * AGRONOMIC RATIONALE:
 * Not all observations are equal in diagnostic power.
 * - HIGH_POWER (pathognomonic): Unique to 1-2 conditions → +25%
 * - MEDIUM_POWER (suggestive): Narrows to 3-5 conditions → +12%
 * - LOW_POWER (non-specific): Common across many conditions → +5%
 * 
 * VERSION: 1.0.0
 */

export const DIAGNOSTIC_WEIGHT_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// DIAGNOSTIC POWER LEVELS
// ═══════════════════════════════════════════════════════════════════════════

export type DiagnosticPower = 'HIGH' | 'MEDIUM' | 'LOW';

export interface DiagnosticWeight {
  power: DiagnosticPower;
  boost: number; // Confidence boost (0-1)
  description: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// WEIGHT BOOST VALUES (ICAR-ALIGNED)
// ═══════════════════════════════════════════════════════════════════════════

export const DIAGNOSTIC_BOOST: Record<DiagnosticPower, number> = {
  HIGH: 0.25,   // +25% - Pathognomonic symptoms (unique to 1-2 conditions)
  MEDIUM: 0.12, // +12% - Suggestive symptoms (narrows to 3-5 conditions)
  LOW: 0.05     // +5%  - Non-specific symptoms (common across many conditions)
};

// ═══════════════════════════════════════════════════════════════════════════
// HIGH POWER OBSERVATIONS (PATHOGNOMONIC)
// These are unique identifiers - seeing them strongly suggests a specific cause
// ═══════════════════════════════════════════════════════════════════════════

const HIGH_POWER_OBSERVATIONS: Set<string> = new Set([
  // Borer-specific
  'DEAD_HEART', 'DEAD_HEART_PRESENT', 'DEADHEART',
  'TUNNELS_IN_STEM', 'STEM_TUNNELING', 'INTERNAL_TUNNEL',
  'FRASS_VISIBLE', 'FRASS', 'SAWDUST_LIKE_MATERIAL',
  'ENTRY_HOLE', 'EXIT_HOLE', 'BORE_HOLE',
  
  // Termite-specific
  'MUD_TUNNELS', 'MUD_TUBES', 'TERMITE_MUD_TUBES',
  'WHITE_ANT_VISIBLE', 'TERMITE_VISIBLE',
  
  // Aphid/Mealybug-specific
  'HONEYDEW_PRESENT', 'HONEYDEW', 'STICKY_SUBSTANCE',
  'SOOTY_MOULD', 'SOOTY_MOLD', 'BLACK_COATING',
  'WHITE_WOOLLY_MASS', 'WOOLLY_COATING',
  
  // Disease-specific
  'POWDERY_COATING', 'WHITE_POWDER_ON_LEAVES',
  'WATER_SOAKED_LESIONS', 'WATER_SOAKED_SPOTS',
  'CONCENTRIC_RINGS', 'TARGET_BOARD_PATTERN',
  
  // Larvae/Caterpillar
  'PINK_LARVAE_VISIBLE', 'PINK_LARVAE', 'PINK_BOLLWORM_LARVAE',
  'GREEN_CATERPILLAR_VISIBLE', 'CATERPILLAR_VISIBLE',
  'WEBBING_ON_LEAVES', 'WEBBING_PRESENT',
  
  // Specific pest indicators
  'ROSETTE_FLOWER', 'ROSETTED_FLOWERS', // Pink bollworm specific
  'HOLES_IN_BOLL', 'BOLL_DAMAGE',
  'LEAF_MINER_TRAILS', 'SERPENTINE_MINES',
  
  // Root-specific
  'ROOT_DAMAGE_VISIBLE', 'ROTTED_ROOTS',
  'GALLS_ON_ROOTS', 'ROOT_KNOT'
]);

// ═══════════════════════════════════════════════════════════════════════════
// MEDIUM POWER OBSERVATIONS (SUGGESTIVE)
// These narrow diagnosis but are shared by multiple conditions
// ═══════════════════════════════════════════════════════════════════════════

const MEDIUM_POWER_OBSERVATIONS: Set<string> = new Set([
  // Insect presence
  'SMALL_INSECTS_VISIBLE', 'WHITE_INSECTS', 'BLACK_INSECTS',
  'FLYING_INSECTS_VISIBLE', 'CRAWLING_INSECTS_VISIBLE',
  'JUMPING_INSECTS', 'HOPPING_INSECTS',
  
  // Damage patterns
  'STEM_BORING_MARKS', 'BORING_DAMAGE',
  'LEAF_CURLING', 'CURLED_LEAVES', 'LEAF_CURL',
  'LEAF_ROLLING', 'ROLLED_LEAVES',
  'SKELETONIZED_LEAVES', 'VEINS_ONLY_REMAINING',
  'IRREGULAR_HOLES', 'SHOT_HOLES',
  
  // Color symptoms (suggestive)
  'LEAF_SPOTS', 'BROWN_SPOTS', 'BLACK_SPOTS',
  'INTERVEINAL_YELLOWING', 'VEINAL_CHLOROSIS',
  'PURPLE_COLORING', 'RED_COLORING',
  'MARGINAL_NECROSIS', 'LEAF_EDGE_BROWNING',
  
  // Growth abnormalities
  'STUNTED_PLANTS', 'POOR_GROWTH', 'REDUCED_TILLERING',
  'DRYING_FROM_TIP', 'TIP_BURN',
  
  // Distribution
  'PATCHY_DISTRIBUTION', 'LOCALIZED_DAMAGE',
  'ROW_PATTERN', 'BORDER_EFFECT'
]);

// ═══════════════════════════════════════════════════════════════════════════
// LOW POWER OBSERVATIONS (NON-SPECIFIC)
// These are common across many conditions - need more info
// ═══════════════════════════════════════════════════════════════════════════

const LOW_POWER_OBSERVATIONS: Set<string> = new Set([
  // General yellowing
  'YELLOWING', 'LEAF_YELLOWING', 'YELLOW_LEAVES',
  'GENERAL_YELLOWING', 'CHLOROSIS',
  
  // General wilting
  'WILTING', 'WILTED_LEAVES', 'DROOPING',
  'LEAF_DROOPING', 'PLANT_WILTING',
  
  // General symptoms
  'STUNTED_GROWTH', 'POOR_VIGOR', 'WEAK_PLANTS',
  'DRYING', 'DRIED_LEAVES', 'LEAF_DRYING',
  'BROWNING', 'LEAF_BROWNING',
  
  // Vague descriptions
  'SOMETHING_WRONG', 'NOT_LOOKING_GOOD',
  'CROP_PROBLEM', 'PLANT_STRESS',
  'UNHEALTHY', 'DAMAGED',
  
  // Generic field observations
  'GAPS_IN_FIELD', 'MISSING_PLANTS',
  'UNEVEN_GROWTH', 'PATCHY_GERMINATION'
]);

// ═══════════════════════════════════════════════════════════════════════════
// MAIN LOOKUP FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get diagnostic weight for an observation key.
 * Returns power level and confidence boost value.
 */
export function getDiagnosticWeight(observationKey: string): DiagnosticWeight {
  const normalized = observationKey.toUpperCase().replace(/[\s-]/g, '_');
  
  // Check HIGH power first (most specific)
  if (HIGH_POWER_OBSERVATIONS.has(normalized)) {
    return {
      power: 'HIGH',
      boost: DIAGNOSTIC_BOOST.HIGH,
      description: 'Pathognomonic symptom - highly specific to 1-2 conditions'
    };
  }
  
  // Check MEDIUM power
  if (MEDIUM_POWER_OBSERVATIONS.has(normalized)) {
    return {
      power: 'MEDIUM',
      boost: DIAGNOSTIC_BOOST.MEDIUM,
      description: 'Suggestive symptom - narrows to 3-5 conditions'
    };
  }
  
  // Check LOW power
  if (LOW_POWER_OBSERVATIONS.has(normalized)) {
    return {
      power: 'LOW',
      boost: DIAGNOSTIC_BOOST.LOW,
      description: 'Non-specific symptom - common across many conditions'
    };
  }
  
  // Default to MEDIUM for unknown observations
  // This is a safe middle ground
  return {
    power: 'MEDIUM',
    boost: DIAGNOSTIC_BOOST.MEDIUM,
    description: 'Unclassified observation - using default medium weight'
  };
}

/**
 * Calculate total weighted confidence boost from multiple observations.
 * Returns the combined boost (capped at 0.40 to prevent over-confidence).
 */
export function calculateWeightedBoost(observationKeys: string[]): {
  totalBoost: number;
  breakdown: Array<{ key: string; power: DiagnosticPower; boost: number }>;
} {
  const breakdown: Array<{ key: string; power: DiagnosticPower; boost: number }> = [];
  let totalBoost = 0;
  
  for (const key of observationKeys) {
    const weight = getDiagnosticWeight(key);
    breakdown.push({
      key,
      power: weight.power,
      boost: weight.boost
    });
    totalBoost += weight.boost;
  }
  
  // Cap total boost to prevent over-confidence
  const cappedBoost = Math.min(totalBoost, 0.40);
  
  // Log the calculation
  console.log(`📊 [DiagnosticWeight] Weighted boost calculation:`);
  breakdown.forEach(b => {
    console.log(`   ${b.key}: +${(b.boost * 100).toFixed(0)}% (${b.power})`);
  });
  console.log(`   Total: +${(cappedBoost * 100).toFixed(0)}% (capped from ${(totalBoost * 100).toFixed(0)}%)`);
  
  return {
    totalBoost: cappedBoost,
    breakdown
  };
}

/**
 * Check if an observation is high-power (pathognomonic)
 */
export function isHighPowerObservation(observationKey: string): boolean {
  const normalized = observationKey.toUpperCase().replace(/[\s-]/g, '_');
  return HIGH_POWER_OBSERVATIONS.has(normalized);
}

/**
 * Get all high-power observations for a given list
 */
export function filterHighPowerObservations(observationKeys: string[]): string[] {
  return observationKeys.filter(key => {
    const normalized = key.toUpperCase().replace(/[\s-]/g, '_');
    return HIGH_POWER_OBSERVATIONS.has(normalized);
  });
}
