/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INTERCROPPING RULES SYSTEM (GAP 3.2)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Intercropping synergy rules for:
 * - Pest interaction modifiers
 * - Nitrogen fixation benefits
 * - Water sharing dynamics
 * - Companion planting effects
 * 
 * Reference: ICAR-IARI, ICRISAT Intercropping Guidelines
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface IntercroppingSystem {
  main_crop: string;
  intercrop: string;
  row_ratio: string;  // e.g., "2:1" (2 rows main : 1 row intercrop)
  compatibility_score: number;  // 0-100
  region_suitable: string[];
}

export interface PestInteraction {
  pest_code: string;
  effect: 'REDUCED' | 'INCREASED' | 'NEUTRAL';
  reduction_percent?: number;
  mechanism: string;
}

export interface NutrientInteraction {
  nutrient: 'N' | 'P' | 'K';
  effect: 'FIXATION' | 'SHARING' | 'COMPETITION';
  benefit_kg_ha?: number;
  mechanism: string;
}

export interface IntercroppingProfile {
  system: IntercroppingSystem;
  pest_interactions: PestInteraction[];
  nutrient_interactions: NutrientInteraction[];
  water_sharing: {
    effect: 'POSITIVE' | 'NEUTRAL' | 'COMPETITION';
    deep_rooted_crop: string;
    water_sharing_mechanism?: string;
  };
  yield_impact: {
    main_crop_yield_percent: number;  // e.g., 85 means 85% of monocrop yield
    intercrop_yield_percent: number;
    ler: number;  // Land Equivalent Ratio (>1 = beneficial)
  };
  management_notes: string[];
  scientific_source: string;
}

export interface IntercroppingRecommendation {
  recommended: boolean;
  system: IntercroppingSystem;
  benefits: string[];
  cautions: string[];
  modified_pest_management: Array<{
    original_pest: string;
    modified_recommendation: string;
  }>;
  modified_fertilizer: {
    n_reduction_kg_ha: number;
    reason: string;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERCROPPING DATABASE
// ═══════════════════════════════════════════════════════════════════════════

export const INTERCROPPING_PROFILES: IntercroppingProfile[] = [
  // Cotton + Pigeonpea (Classic Indian intercrop)
  {
    system: {
      main_crop: 'COTTON',
      intercrop: 'PIGEONPEA',
      row_ratio: '6:2',
      compatibility_score: 95,
      region_suitable: ['MAHARASHTRA', 'ANDHRA_PRADESH', 'KARNATAKA', 'TELANGANA', 'MADHYA_PRADESH']
    },
    pest_interactions: [
      {
        pest_code: 'BOLLWORM',
        effect: 'REDUCED',
        reduction_percent: 25,
        mechanism: 'Pigeonpea acts as trap crop, attracting Helicoverpa away from cotton'
      },
      {
        pest_code: 'WHITEFLY',
        effect: 'NEUTRAL',
        mechanism: 'No significant effect on whitefly population'
      },
      {
        pest_code: 'PINK_BOLLWORM',
        effect: 'REDUCED',
        reduction_percent: 15,
        mechanism: 'Breaks pest cycle, provides refugia for natural enemies'
      }
    ],
    nutrient_interactions: [
      {
        nutrient: 'N',
        effect: 'FIXATION',
        benefit_kg_ha: 40,
        mechanism: 'Pigeonpea root nodules fix atmospheric N, benefiting cotton'
      }
    ],
    water_sharing: {
      effect: 'POSITIVE',
      deep_rooted_crop: 'PIGEONPEA',
      water_sharing_mechanism: 'Pigeonpea deep roots access subsoil water, reduce competition'
    },
    yield_impact: {
      main_crop_yield_percent: 85,
      intercrop_yield_percent: 70,
      ler: 1.45
    },
    management_notes: [
      'Sow pigeonpea 15-20 days after cotton',
      'Maintain 6:2 or 8:2 row ratio',
      'Pigeonpea provides bonus income after cotton harvest',
      'Spray cotton rows only to protect pigeonpea'
    ],
    scientific_source: 'ICAR-CICR Cotton + Pigeonpea Intercropping Package'
  },

  // Maize + Beans (Classic Americas)
  {
    system: {
      main_crop: 'MAIZE',
      intercrop: 'BEANS',
      row_ratio: '2:1',
      compatibility_score: 90,
      region_suitable: ['BIHAR', 'JHARKHAND', 'KARNATAKA', 'MAHARASHTRA']
    },
    pest_interactions: [
      {
        pest_code: 'STEM_BORER',
        effect: 'REDUCED',
        reduction_percent: 20,
        mechanism: 'Increased predator habitat, confusion effect'
      },
      {
        pest_code: 'APHID',
        effect: 'REDUCED',
        reduction_percent: 30,
        mechanism: 'Beans attract aphid predators (ladybirds)'
      }
    ],
    nutrient_interactions: [
      {
        nutrient: 'N',
        effect: 'FIXATION',
        benefit_kg_ha: 50,
        mechanism: 'Bean root nodules fix 40-60 kg N/ha'
      }
    ],
    water_sharing: {
      effect: 'POSITIVE',
      deep_rooted_crop: 'MAIZE',
      water_sharing_mechanism: 'Beans shade soil, reduce evaporation'
    },
    yield_impact: {
      main_crop_yield_percent: 90,
      intercrop_yield_percent: 60,
      ler: 1.35
    },
    management_notes: [
      'Sow beans 7-10 days after maize',
      'Bush beans preferred over climbing types',
      'Reduce N fertilizer by 25-30%'
    ],
    scientific_source: 'CIMMYT Maize-Legume Systems'
  },

  // Sugarcane + Soybean
  {
    system: {
      main_crop: 'SUGARCANE',
      intercrop: 'SOYBEAN',
      row_ratio: '1:2',
      compatibility_score: 85,
      region_suitable: ['UTTAR_PRADESH', 'MAHARASHTRA', 'KARNATAKA', 'TAMIL_NADU']
    },
    pest_interactions: [
      {
        pest_code: 'PYRILLA',
        effect: 'REDUCED',
        reduction_percent: 20,
        mechanism: 'Soybean provides habitat for pyrilla predators'
      },
      {
        pest_code: 'TOP_BORER',
        effect: 'NEUTRAL',
        mechanism: 'No significant interaction'
      }
    ],
    nutrient_interactions: [
      {
        nutrient: 'N',
        effect: 'FIXATION',
        benefit_kg_ha: 35,
        mechanism: 'Soybean fixes N for subsequent ratoon'
      }
    ],
    water_sharing: {
      effect: 'COMPETITION',
      deep_rooted_crop: 'SUGARCANE',
      water_sharing_mechanism: 'Mild competition in early stage, soybean harvested before peak sugarcane water demand'
    },
    yield_impact: {
      main_crop_yield_percent: 95,
      intercrop_yield_percent: 65,
      ler: 1.40
    },
    management_notes: [
      'Sow soybean in furrows between sugarcane rows',
      'Harvest soybean before sugarcane canopy closes (60-70 DAS)',
      'Extra income + N benefit for sugarcane'
    ],
    scientific_source: 'ICAR-SBI Sugarcane Intercropping'
  },

  // Wheat + Mustard (Border/Strip cropping)
  {
    system: {
      main_crop: 'WHEAT',
      intercrop: 'MUSTARD',
      row_ratio: '9:3',
      compatibility_score: 80,
      region_suitable: ['PUNJAB', 'HARYANA', 'UTTAR_PRADESH', 'RAJASTHAN']
    },
    pest_interactions: [
      {
        pest_code: 'APHID',
        effect: 'REDUCED',
        reduction_percent: 40,
        mechanism: 'Mustard acts as trap crop for aphids, attracting predators'
      },
      {
        pest_code: 'TERMITE',
        effect: 'NEUTRAL',
        mechanism: 'No significant effect'
      }
    ],
    nutrient_interactions: [
      {
        nutrient: 'N',
        effect: 'SHARING',
        mechanism: 'Both compete for N, but mustard is harvested early'
      }
    ],
    water_sharing: {
      effect: 'NEUTRAL',
      deep_rooted_crop: 'MUSTARD'
    },
    yield_impact: {
      main_crop_yield_percent: 92,
      intercrop_yield_percent: 75,
      ler: 1.25
    },
    management_notes: [
      'Plant mustard as border rows (3 rows every 9 wheat rows)',
      'Acts as aphid trap - spray mustard if needed, protects wheat',
      'Harvest mustard first, wheat continues'
    ],
    scientific_source: 'ICAR-IARI Wheat-Mustard Strip Cropping'
  },

  // Groundnut + Sorghum
  {
    system: {
      main_crop: 'GROUNDNUT',
      intercrop: 'SORGHUM',
      row_ratio: '6:1',
      compatibility_score: 82,
      region_suitable: ['GUJARAT', 'ANDHRA_PRADESH', 'KARNATAKA', 'TAMIL_NADU']
    },
    pest_interactions: [
      {
        pest_code: 'LEAF_MINER',
        effect: 'REDUCED',
        reduction_percent: 25,
        mechanism: 'Sorghum strips break pest spread pattern'
      },
      {
        pest_code: 'THRIPS',
        effect: 'NEUTRAL',
        mechanism: 'No significant effect'
      }
    ],
    nutrient_interactions: [
      {
        nutrient: 'N',
        effect: 'FIXATION',
        benefit_kg_ha: 30,
        mechanism: 'Groundnut fixes N, benefits sorghum'
      }
    ],
    water_sharing: {
      effect: 'POSITIVE',
      deep_rooted_crop: 'SORGHUM',
      water_sharing_mechanism: 'Sorghum deep roots access water unavailable to groundnut'
    },
    yield_impact: {
      main_crop_yield_percent: 88,
      intercrop_yield_percent: 55,
      ler: 1.30
    },
    management_notes: [
      'Plant sorghum as wind break strips',
      'Reduces moisture stress on groundnut',
      'Sorghum provides fodder + grain bonus'
    ],
    scientific_source: 'ICRISAT Groundnut-Sorghum Systems'
  },

  // Rice + Fish (Rice-Fish Farming)
  {
    system: {
      main_crop: 'RICE',
      intercrop: 'FISH',
      row_ratio: '100:0',  // Fish in trenches
      compatibility_score: 88,
      region_suitable: ['WEST_BENGAL', 'ASSAM', 'ODISHA', 'KERALA']
    },
    pest_interactions: [
      {
        pest_code: 'STEM_BORER',
        effect: 'REDUCED',
        reduction_percent: 35,
        mechanism: 'Fish eat stem borer larvae and eggs'
      },
      {
        pest_code: 'RICE_BUG',
        effect: 'REDUCED',
        reduction_percent: 25,
        mechanism: 'Fish eat nymphs falling into water'
      },
      {
        pest_code: 'BROWN_PLANTHOPPER',
        effect: 'REDUCED',
        reduction_percent: 40,
        mechanism: 'Fish predation on hoppers'
      }
    ],
    nutrient_interactions: [
      {
        nutrient: 'N',
        effect: 'SHARING',
        benefit_kg_ha: 20,
        mechanism: 'Fish excreta provides N to rice'
      }
    ],
    water_sharing: {
      effect: 'POSITIVE',
      deep_rooted_crop: 'RICE',
      water_sharing_mechanism: 'Fish trenches maintain water level, refuge during drainage'
    },
    yield_impact: {
      main_crop_yield_percent: 105,  // Often increases yield!
      intercrop_yield_percent: 100,
      ler: 1.60
    },
    management_notes: [
      'Dig trenches (1m wide, 0.5m deep) on field borders',
      'Stock fish 30 days after transplanting',
      'Use no/minimal pesticides - fish act as biocontrol',
      'Harvest fish before rice harvest'
    ],
    scientific_source: 'ICAR-CIFA Rice-Fish Farming Package'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// CORE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get intercropping profile for a crop pair
 */
export function getIntercroppingProfile(
  mainCrop: string,
  intercrop: string
): IntercroppingProfile | null {
  const mainNorm = mainCrop.toUpperCase().replace(/\s+/g, '_');
  const interNorm = intercrop.toUpperCase().replace(/\s+/g, '_');
  
  return INTERCROPPING_PROFILES.find(
    p => p.system.main_crop === mainNorm && p.system.intercrop === interNorm
  ) || INTERCROPPING_PROFILES.find(
    p => p.system.main_crop === interNorm && p.system.intercrop === mainNorm
  ) || null;
}

/**
 * Get all intercrop options for a main crop
 */
export function getIntercroppingOptions(mainCrop: string, region?: string): IntercroppingProfile[] {
  const mainNorm = mainCrop.toUpperCase().replace(/\s+/g, '_');
  
  return INTERCROPPING_PROFILES.filter(p => {
    const cropMatch = p.system.main_crop === mainNorm || p.system.intercrop === mainNorm;
    const regionMatch = !region || p.system.region_suitable.includes(region.toUpperCase());
    return cropMatch && regionMatch;
  }).sort((a, b) => b.system.compatibility_score - a.system.compatibility_score);
}

/**
 * Get modified pest management for intercrop system
 */
export function getModifiedPestManagement(
  profile: IntercroppingProfile,
  pestCode: string
): { modified: boolean; recommendation: string; reduction_percent?: number } {
  const interaction = profile.pest_interactions.find(
    p => p.pest_code === pestCode.toUpperCase()
  );
  
  if (!interaction) {
    return {
      modified: false,
      recommendation: 'Standard pest management applies'
    };
  }
  
  if (interaction.effect === 'REDUCED') {
    return {
      modified: true,
      recommendation: `Pest pressure likely ${interaction.reduction_percent}% lower due to ${profile.system.intercrop}. ` +
        `${interaction.mechanism}. Consider monitoring longer before spray.`,
      reduction_percent: interaction.reduction_percent
    };
  } else if (interaction.effect === 'INCREASED') {
    return {
      modified: true,
      recommendation: `⚠️ Pest pressure may increase in this intercrop. Scout more frequently.`
    };
  }
  
  return {
    modified: false,
    recommendation: 'Standard pest management applies'
  };
}

/**
 * Calculate fertilizer modification for intercrop
 */
export function calculateFertilizerModification(
  profile: IntercroppingProfile,
  baseNDose: number
): {
  modified_n_dose: number;
  reduction_kg_ha: number;
  reason: string;
} {
  const nInteraction = profile.nutrient_interactions.find(i => i.nutrient === 'N');
  
  if (nInteraction?.effect === 'FIXATION' && nInteraction.benefit_kg_ha) {
    const reduction = Math.min(nInteraction.benefit_kg_ha, baseNDose * 0.3);  // Max 30% reduction
    return {
      modified_n_dose: baseNDose - reduction,
      reduction_kg_ha: reduction,
      reason: `${profile.system.intercrop} fixes ~${nInteraction.benefit_kg_ha} kg N/ha. ` +
        `Reduce N application by ${reduction} kg/ha.`
    };
  }
  
  return {
    modified_n_dose: baseNDose,
    reduction_kg_ha: 0,
    reason: 'No N fixation benefit from this intercrop'
  };
}

/**
 * Get intercropping recommendation
 */
export function getIntercroppingRecommendation(
  mainCrop: string,
  region: string,
  soilType?: string,
  irrigationType?: string
): IntercroppingRecommendation | null {
  const options = getIntercroppingOptions(mainCrop, region);
  
  if (options.length === 0) return null;
  
  const best = options[0];
  
  const benefits: string[] = [];
  const cautions: string[] = [];
  
  // Collect benefits
  if (best.yield_impact.ler > 1) {
    benefits.push(`Land Equivalent Ratio: ${best.yield_impact.ler.toFixed(2)} (${Math.round((best.yield_impact.ler - 1) * 100)}% more productive than monocrop)`);
  }
  
  const nFixation = best.nutrient_interactions.find(i => i.effect === 'FIXATION');
  if (nFixation?.benefit_kg_ha) {
    benefits.push(`Nitrogen fixation: ~${nFixation.benefit_kg_ha} kg N/ha saved`);
  }
  
  const reducedPests = best.pest_interactions.filter(p => p.effect === 'REDUCED');
  if (reducedPests.length > 0) {
    benefits.push(`Pest reduction: ${reducedPests.map(p => p.pest_code.toLowerCase().replace('_', ' ')).join(', ')}`);
  }
  
  // Collect cautions
  if (best.water_sharing.effect === 'COMPETITION') {
    cautions.push('Mild water competition - ensure adequate irrigation');
  }
  
  if (best.yield_impact.main_crop_yield_percent < 90) {
    cautions.push(`Main crop yield may be ${100 - best.yield_impact.main_crop_yield_percent}% lower per unit area (compensated by intercrop income)`);
  }
  
  return {
    recommended: best.system.compatibility_score >= 75,
    system: best.system,
    benefits,
    cautions,
    modified_pest_management: best.pest_interactions
      .filter(p => p.effect === 'REDUCED')
      .map(p => ({
        original_pest: p.pest_code,
        modified_recommendation: `Monitor longer before spray. ${p.mechanism}`
      })),
    modified_fertilizer: {
      n_reduction_kg_ha: nFixation?.benefit_kg_ha || 0,
      reason: nFixation?.mechanism || 'No N fixation in this system'
    }
  };
}

/**
 * Check if intercropping modifies a specific rule
 */
export function shouldModifyRuleForIntercrop(
  mainCrop: string,
  intercrop: string | undefined,
  ruleType: 'PEST' | 'FERTILIZER' | 'IRRIGATION',
  targetEntity?: string
): { modified: boolean; modifier?: number; reason?: string } {
  if (!intercrop) {
    return { modified: false };
  }
  
  const profile = getIntercroppingProfile(mainCrop, intercrop);
  if (!profile) {
    return { modified: false };
  }
  
  if (ruleType === 'PEST' && targetEntity) {
    const pestMod = getModifiedPestManagement(profile, targetEntity);
    if (pestMod.modified && pestMod.reduction_percent) {
      return {
        modified: true,
        modifier: (100 - pestMod.reduction_percent) / 100,
        reason: pestMod.recommendation
      };
    }
  }
  
  if (ruleType === 'FERTILIZER') {
    const nInteraction = profile.nutrient_interactions.find(i => i.nutrient === 'N' && i.effect === 'FIXATION');
    if (nInteraction?.benefit_kg_ha) {
      return {
        modified: true,
        modifier: 0.75,  // 25% reduction
        reason: nInteraction.mechanism
      };
    }
  }
  
  return { modified: false };
}
