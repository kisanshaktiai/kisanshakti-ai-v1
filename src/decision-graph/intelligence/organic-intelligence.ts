/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ORGANIC INTELLIGENCE LAYER
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Scientific organic farming equivalents and mode-based filtering.
 * Based on ICAR-NPOF, OFAI, and certification standards.
 * 
 * Scientific Sources:
 * - ICAR-National Project on Organic Farming (NPOF)
 * - Organic Farming Association of India (OFAI)
 * - APEDA-NPOP Certification Standards
 * - ICAR-IARI Organic Package of Practices
 * 
 * Version: 1.0.0
 */

import { Action, FarmingMode } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// ORGANIC EQUIVALENT INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export interface OrganicAlternative {
  input: string;
  dose: string;
  effectiveness_pct: number;  // Relative effectiveness vs chemical (%)
  certification_safe: boolean;  // NPOP/USDA Organic compliant
  preparation_method?: string;
  application_timing?: string;
  scientific_source: string;
}

export interface OrganicEquivalent {
  chemical_input: string;
  chemical_category: 'fertilizer' | 'insecticide' | 'fungicide' | 'herbicide' | 'growth_regulator';
  organic_alternatives: OrganicAlternative[];
}

// ═══════════════════════════════════════════════════════════════════════════
// FERTILIZER ORGANIC EQUIVALENTS (15+ alternatives)
// ═══════════════════════════════════════════════════════════════════════════

export const FERTILIZER_EQUIVALENTS: OrganicEquivalent[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // NITROGEN SOURCES
  // ─────────────────────────────────────────────────────────────────────────
  {
    chemical_input: 'Urea (46% N)',
    chemical_category: 'fertilizer',
    organic_alternatives: [
      {
        input: 'Jeevamrut',
        dose: '500 L/ha every 15 days',
        effectiveness_pct: 55,
        certification_safe: true,
        preparation_method: '10 kg cow dung + 10 L cow urine + 2 kg jaggery + 2 kg pulse flour + handful soil in 200 L water, ferment 5-7 days',
        application_timing: 'Foliar or soil drench during vegetative growth',
        scientific_source: 'ICAR-IARI Zero Budget Natural Farming'
      },
      {
        input: 'Vermicompost',
        dose: '2-3 tonnes/ha',
        effectiveness_pct: 70,
        certification_safe: true,
        application_timing: 'Basal application during field preparation',
        scientific_source: 'ICAR-NPOF Ghaziabad'
      },
      {
        input: 'FYM (Well-decomposed)',
        dose: '10-12 tonnes/ha',
        effectiveness_pct: 60,
        certification_safe: true,
        application_timing: '2-3 weeks before sowing, incorporate in soil',
        scientific_source: 'ICAR-IARI'
      },
      {
        input: 'Neem Cake',
        dose: '250-500 kg/ha',
        effectiveness_pct: 50,
        certification_safe: true,
        application_timing: 'Basal application, also has pest deterrent properties',
        scientific_source: 'ICAR-NPOF'
      },
      {
        input: 'Green Manure (Dhaincha/Sesbania)',
        dose: '25 kg seed/ha, incorporate at 45-50 DAS',
        effectiveness_pct: 75,
        certification_safe: true,
        preparation_method: 'Sow dhaincha 45-50 days before main crop, incorporate in situ',
        application_timing: 'Pre-sowing green manure',
        scientific_source: 'ICAR-IARI'
      },
      {
        input: 'Azolla',
        dose: '8-10 tonnes fresh/ha',
        effectiveness_pct: 65,
        certification_safe: true,
        application_timing: 'Dual cropping in rice - fixes 40-60 kg N/ha',
        scientific_source: 'ICAR-CRRI Cuttack'
      },
      {
        input: 'Panchagavya',
        dose: '30 L/ha as foliar spray (3% solution)',
        effectiveness_pct: 45,
        certification_safe: true,
        preparation_method: 'Cow dung + cow urine + milk + curd + ghee, ferment 21 days',
        application_timing: 'Foliar spray at critical growth stages',
        scientific_source: 'TNAU Organic Farming'
      }
    ]
  },
  {
    chemical_input: 'DAP (18-46-0)',
    chemical_category: 'fertilizer',
    organic_alternatives: [
      {
        input: 'Bone Meal',
        dose: '300-500 kg/ha',
        effectiveness_pct: 70,
        certification_safe: true,
        application_timing: 'Basal application, slow-release P source',
        scientific_source: 'ICAR-NPOF'
      },
      {
        input: 'Rock Phosphate',
        dose: '400-500 kg/ha',
        effectiveness_pct: 60,
        certification_safe: true,
        application_timing: 'Basal application, better in acidic soils',
        scientific_source: 'ICAR-IARI'
      },
      {
        input: 'Vermicompost (P-enriched)',
        dose: '3-4 tonnes/ha',
        effectiveness_pct: 55,
        certification_safe: true,
        preparation_method: 'Add rock phosphate to vermicomposting process',
        application_timing: 'Basal application',
        scientific_source: 'ICAR-NPOF'
      },
      {
        input: 'PSB (Phosphate Solubilizing Bacteria)',
        dose: '5 kg/ha with carrier or 1 L liquid culture',
        effectiveness_pct: 50,
        certification_safe: true,
        application_timing: 'Seed treatment or soil application',
        scientific_source: 'ICAR-NBAIM'
      }
    ]
  },
  {
    chemical_input: 'MOP (Muriate of Potash 60% K2O)',
    chemical_category: 'fertilizer',
    organic_alternatives: [
      {
        input: 'Wood Ash',
        dose: '500-1000 kg/ha',
        effectiveness_pct: 60,
        certification_safe: true,
        application_timing: 'Basal or top-dressing, also provides Ca and Mg',
        scientific_source: 'ICAR-NPOF'
      },
      {
        input: 'Banana Pseudostem Ash',
        dose: '300-500 kg/ha',
        effectiveness_pct: 55,
        certification_safe: true,
        application_timing: 'Basal application',
        scientific_source: 'ICAR-NRC Banana'
      },
      {
        input: 'Tobacco Dust/Ash',
        dose: '200-300 kg/ha',
        effectiveness_pct: 50,
        certification_safe: true,
        application_timing: 'Basal application',
        scientific_source: 'ICAR-CTRI'
      },
      {
        input: 'K-Solubilizing Bacteria',
        dose: '5 kg/ha',
        effectiveness_pct: 45,
        certification_safe: true,
        application_timing: 'Soil application at sowing',
        scientific_source: 'ICAR-NBAIM'
      }
    ]
  },
  {
    chemical_input: 'Zinc Sulphate',
    chemical_category: 'fertilizer',
    organic_alternatives: [
      {
        input: 'Zinc-enriched Compost',
        dose: '2-3 tonnes/ha',
        effectiveness_pct: 60,
        certification_safe: true,
        preparation_method: 'Add ZnSO4 during composting (permitted under organic)',
        scientific_source: 'ICAR-IARI'
      },
      {
        input: 'Zinc Solubilizing Bacteria',
        dose: '2 kg/ha',
        effectiveness_pct: 50,
        certification_safe: true,
        application_timing: 'Seed treatment or soil application',
        scientific_source: 'ICAR-NBAIM'
      }
    ]
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// INSECTICIDE ORGANIC EQUIVALENTS (20+ alternatives)
// ═══════════════════════════════════════════════════════════════════════════

export const INSECTICIDE_EQUIVALENTS: OrganicEquivalent[] = [
  {
    chemical_input: 'Imidacloprid (for sucking pests)',
    chemical_category: 'insecticide',
    organic_alternatives: [
      {
        input: 'Neem Oil (Azadirachtin)',
        dose: '5 mL/L (10,000 ppm) or 2 mL/L (50,000 ppm)',
        effectiveness_pct: 70,
        certification_safe: true,
        application_timing: 'Evening spray, repeat every 7-10 days',
        scientific_source: 'ICAR-NBAIR Bangalore'
      },
      {
        input: 'NSKE (Neem Seed Kernel Extract)',
        dose: '5% solution (50 g neem seed powder/L)',
        effectiveness_pct: 65,
        certification_safe: true,
        preparation_method: 'Soak crushed neem seeds overnight, filter and spray',
        application_timing: 'Early morning or evening',
        scientific_source: 'ICAR-IARI'
      },
      {
        input: 'Yellow Sticky Traps',
        dose: '20-25 traps/ha',
        effectiveness_pct: 40,
        certification_safe: true,
        application_timing: 'Install at crop canopy level',
        scientific_source: 'ICAR-NBAIR'
      },
      {
        input: 'Beauveria bassiana',
        dose: '2.5 kg/ha (1 x 10^8 cfu/g)',
        effectiveness_pct: 60,
        certification_safe: true,
        application_timing: 'Evening spray in high humidity conditions',
        scientific_source: 'ICAR-NBAIR'
      },
      {
        input: 'Verticillium lecanii',
        dose: '2.5 kg/ha',
        effectiveness_pct: 55,
        certification_safe: true,
        application_timing: 'Effective against whitefly, aphids in humid conditions',
        scientific_source: 'ICAR-NBAIR'
      }
    ]
  },
  {
    chemical_input: 'Chlorpyriphos (for borers)',
    chemical_category: 'insecticide',
    organic_alternatives: [
      {
        input: 'Bt (Bacillus thuringiensis)',
        dose: '1-1.5 kg/ha',
        effectiveness_pct: 75,
        certification_safe: true,
        application_timing: 'Spray when larvae are young (1st-2nd instar)',
        scientific_source: 'ICAR-NBAIR'
      },
      {
        input: 'NPV (Nuclear Polyhedrosis Virus)',
        dose: '250-500 LE/ha (Helicoverpa/Spodoptera)',
        effectiveness_pct: 70,
        certification_safe: true,
        preparation_method: 'Mix with 0.1% Tinopal as UV protectant',
        application_timing: 'Evening spray on young larvae',
        scientific_source: 'ICAR-NBAIR'
      },
      {
        input: 'Trichogramma chilonis',
        dose: '1-1.5 lakh eggs/ha, 6-8 releases',
        effectiveness_pct: 65,
        certification_safe: true,
        application_timing: 'Release at egg-laying stage of pest',
        scientific_source: 'ICAR-NBAIR'
      },
      {
        input: 'Pheromone Traps',
        dose: '5-8 traps/ha',
        effectiveness_pct: 40,
        certification_safe: true,
        application_timing: 'Install at 1 month after sowing, monitor weekly',
        scientific_source: 'ICAR-NBAIR'
      }
    ]
  },
  {
    chemical_input: 'Cypermethrin (for caterpillars)',
    chemical_category: 'insecticide',
    organic_alternatives: [
      {
        input: 'Bt kurstaki',
        dose: '1-2 kg/ha',
        effectiveness_pct: 80,
        certification_safe: true,
        application_timing: 'Spray on young caterpillars',
        scientific_source: 'ICAR-NBAIR'
      },
      {
        input: 'Spinosad (Saccharopolyspora spinosa)',
        dose: '75-100 mL/ha',
        effectiveness_pct: 85,
        certification_safe: true,
        application_timing: 'Evening spray, avoid mixing with alkaline pesticides',
        scientific_source: 'ICAR-NBAIR'
      },
      {
        input: 'Metarhizium anisopliae',
        dose: '2.5 kg/ha',
        effectiveness_pct: 55,
        certification_safe: true,
        application_timing: 'Soil application for soil-dwelling pests',
        scientific_source: 'ICAR-NBAIR'
      }
    ]
  },
  {
    chemical_input: 'Carbofuran (for soil insects)',
    chemical_category: 'insecticide',
    organic_alternatives: [
      {
        input: 'Neem Cake',
        dose: '250-500 kg/ha',
        effectiveness_pct: 55,
        certification_safe: true,
        application_timing: 'Incorporate in soil during field preparation',
        scientific_source: 'ICAR-IARI'
      },
      {
        input: 'Metarhizium anisopliae',
        dose: '2.5 kg/ha (soil application)',
        effectiveness_pct: 60,
        certification_safe: true,
        application_timing: 'Mix with FYM and broadcast',
        scientific_source: 'ICAR-NBAIR'
      },
      {
        input: 'Entomopathogenic Nematodes (EPN)',
        dose: '1-2 billion IJs/ha',
        effectiveness_pct: 65,
        certification_safe: true,
        application_timing: 'Soil application in moist conditions',
        scientific_source: 'ICAR-NBAIR'
      }
    ]
  },
  {
    chemical_input: 'Monocrotophos (for mites)',
    chemical_category: 'insecticide',
    organic_alternatives: [
      {
        input: 'Sulphur 80% WP',
        dose: '2-3 g/L',
        effectiveness_pct: 75,
        certification_safe: true,
        application_timing: 'Avoid in hot weather (>35°C)',
        scientific_source: 'ICAR-IIHR'
      },
      {
        input: 'Neem Oil',
        dose: '5 mL/L',
        effectiveness_pct: 60,
        certification_safe: true,
        application_timing: 'Cover undersides of leaves',
        scientific_source: 'ICAR-NBAIR'
      },
      {
        input: 'Predatory Mites (Phytoseiulus)',
        dose: '50,000-100,000/ha',
        effectiveness_pct: 70,
        certification_safe: true,
        application_timing: 'Release when pest population is low-moderate',
        scientific_source: 'ICAR-NBAIR'
      }
    ]
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// FUNGICIDE ORGANIC EQUIVALENTS (15+ alternatives)
// ═══════════════════════════════════════════════════════════════════════════

export const FUNGICIDE_EQUIVALENTS: OrganicEquivalent[] = [
  {
    chemical_input: 'Mancozeb (broad-spectrum)',
    chemical_category: 'fungicide',
    organic_alternatives: [
      {
        input: 'Trichoderma viride/harzianum',
        dose: '4-5 kg/ha (seed treatment 10g/kg seed)',
        effectiveness_pct: 65,
        certification_safe: true,
        application_timing: 'Seed treatment or soil application with FYM',
        scientific_source: 'ICAR-NBAIR'
      },
      {
        input: 'Pseudomonas fluorescens',
        dose: '2.5 kg/ha (10g/kg seed treatment)',
        effectiveness_pct: 60,
        certification_safe: true,
        application_timing: 'Seed treatment, soil drench, or foliar spray',
        scientific_source: 'ICAR-IARI'
      },
      {
        input: 'Bordeaux Mixture',
        dose: '1% (1 kg each CuSO4 + lime in 100 L water)',
        effectiveness_pct: 75,
        certification_safe: true,
        preparation_method: 'Prepare fresh, use within 24 hours',
        application_timing: 'Prophylactic spray before disease onset',
        scientific_source: 'ICAR-IIHR'
      },
      {
        input: 'Copper Hydroxide',
        dose: '2.5 g/L',
        effectiveness_pct: 70,
        certification_safe: true,
        application_timing: 'Preventive spray, avoid excess use (Cu accumulation)',
        scientific_source: 'ICAR-IIHR'
      }
    ]
  },
  {
    chemical_input: 'Carbendazim (for wilt/rot)',
    chemical_category: 'fungicide',
    organic_alternatives: [
      {
        input: 'Trichoderma harzianum',
        dose: '5 kg/ha with 100 kg FYM',
        effectiveness_pct: 65,
        certification_safe: true,
        application_timing: 'Soil application at sowing',
        scientific_source: 'ICAR-NBAIR'
      },
      {
        input: 'Pseudomonas fluorescens',
        dose: '2.5-5 kg/ha',
        effectiveness_pct: 60,
        certification_safe: true,
        application_timing: 'Soil drench at 15-20 DAS',
        scientific_source: 'ICAR-IARI'
      },
      {
        input: 'Beejamrut',
        dose: 'Seed treatment (dip for 30 min)',
        effectiveness_pct: 50,
        certification_safe: true,
        preparation_method: '5 kg cow dung + 5 L cow urine + 50 g lime + 20 L water',
        application_timing: 'Before sowing',
        scientific_source: 'ZBNF Standards'
      }
    ]
  },
  {
    chemical_input: 'Sulphur 80% WP (for powdery mildew)',
    chemical_category: 'fungicide',
    organic_alternatives: [
      {
        input: 'Wettable Sulphur',
        dose: '2-3 g/L',
        effectiveness_pct: 90,
        certification_safe: true,
        application_timing: 'Avoid in temperatures >32°C',
        scientific_source: 'ICAR-IIHR'
      },
      {
        input: 'Milk Spray',
        dose: '10% solution (100 mL milk/L water)',
        effectiveness_pct: 55,
        certification_safe: true,
        application_timing: 'Weekly spray as preventive',
        scientific_source: 'OFAI'
      },
      {
        input: 'Baking Soda (Sodium bicarbonate)',
        dose: '5 g/L + 5 mL soap',
        effectiveness_pct: 50,
        certification_safe: true,
        application_timing: 'At first sign of infection',
        scientific_source: 'OFAI'
      },
      {
        input: 'Ampelomyces quisqualis',
        dose: 'Commercial formulation as per label',
        effectiveness_pct: 60,
        certification_safe: true,
        application_timing: 'Mycoparasite of powdery mildew fungi',
        scientific_source: 'ICAR-NBAIR'
      }
    ]
  },
  {
    chemical_input: 'Metalaxyl (for downy mildew)',
    chemical_category: 'fungicide',
    organic_alternatives: [
      {
        input: 'Bordeaux Mixture',
        dose: '1%',
        effectiveness_pct: 70,
        certification_safe: true,
        application_timing: 'Prophylactic spray',
        scientific_source: 'ICAR-IIHR'
      },
      {
        input: 'Copper Oxychloride',
        dose: '2.5 g/L',
        effectiveness_pct: 65,
        certification_safe: true,
        application_timing: 'At disease initiation',
        scientific_source: 'ICAR-IIHR'
      }
    ]
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// HERBICIDE ORGANIC EQUIVALENTS (limited options)
// ═══════════════════════════════════════════════════════════════════════════

export const HERBICIDE_EQUIVALENTS: OrganicEquivalent[] = [
  {
    chemical_input: 'Pendimethalin (pre-emergence)',
    chemical_category: 'herbicide',
    organic_alternatives: [
      {
        input: 'Stale Seedbed Technique',
        dose: 'N/A',
        effectiveness_pct: 60,
        certification_safe: true,
        preparation_method: 'Pre-sowing irrigation, allow weeds to germinate, destroy by tillage/flame',
        application_timing: '15-20 days before actual sowing',
        scientific_source: 'ICAR-DWR'
      },
      {
        input: 'Black Polythene Mulch',
        dose: '400-500 kg/ha (25-50 micron)',
        effectiveness_pct: 85,
        certification_safe: true,
        application_timing: 'Lay before transplanting, make planting holes',
        scientific_source: 'ICAR-IIHR'
      },
      {
        input: 'Organic Mulch (Straw/Leaves)',
        dose: '5-8 tonnes/ha',
        effectiveness_pct: 55,
        certification_safe: true,
        application_timing: 'After crop emergence, 10-15 cm thickness',
        scientific_source: 'ICAR-NPOF'
      }
    ]
  },
  {
    chemical_input: '2,4-D (post-emergence)',
    chemical_category: 'herbicide',
    organic_alternatives: [
      {
        input: 'Hand Weeding',
        dose: '2-3 weedings/season',
        effectiveness_pct: 90,
        certification_safe: true,
        application_timing: 'At critical weed competition periods',
        scientific_source: 'ICAR-DWR'
      },
      {
        input: 'Mechanical Weeding (Cono-weeder)',
        dose: '2-3 operations',
        effectiveness_pct: 75,
        certification_safe: true,
        application_timing: '20 and 40 DAT in transplanted crops',
        scientific_source: 'ICAR-CRRI'
      },
      {
        input: 'Inter-cultivation',
        dose: '2-3 operations',
        effectiveness_pct: 70,
        certification_safe: true,
        application_timing: 'At 15-20 and 30-35 DAS',
        scientific_source: 'ICAR-DWR'
      },
      {
        input: 'Flame Weeding',
        dose: 'N/A',
        effectiveness_pct: 75,
        certification_safe: true,
        application_timing: 'Before crop emergence (stale seedbed) or in orchards',
        scientific_source: 'ICAR-NPOF'
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
  ...FUNGICIDE_EQUIVALENTS,
  ...HERBICIDE_EQUIVALENTS
];

// ═══════════════════════════════════════════════════════════════════════════
// ACTION CLASSIFICATION FOR FARMING MODE
// ═══════════════════════════════════════════════════════════════════════════

/** Actions that are ONLY allowed in conventional farming */
const CHEMICAL_ONLY_ACTIONS: Action[] = [
  Action.APPLY_INSECTICIDE,
  Action.APPLY_FUNGICIDE,
  Action.HERBICIDE_PRE_EMERGENCE,
  Action.HERBICIDE_POST_EMERGENCE
];

/** Actions that are ONLY allowed in conventional + organic_fertilizer modes */
const SYNTHETIC_FERTILIZER_ACTIONS: Action[] = [
  Action.APPLY_NITROGEN,
  Action.APPLY_PHOSPHORUS,
  Action.APPLY_POTASSIUM,
  Action.APPLY_ZINC,
  Action.APPLY_GYPSUM,
  Action.APPLY_LIME
];

/** Actions allowed in ALL farming modes */
const UNIVERSAL_ACTIONS: Action[] = [
  Action.IRRIGATE_IMMEDIATELY,
  Action.IRRIGATE_LIGHT,
  Action.IRRIGATE_HEAVY,
  Action.DELAY_IRRIGATION,
  Action.SKIP_IRRIGATION,
  Action.DRAIN_FIELD,
  Action.DRAIN_EXCESS_WATER,
  Action.APPLY_ORGANIC_MANURE,
  Action.APPLY_NEEM_OIL,
  Action.APPLY_BIO_CONTROL,
  Action.APPLY_BT_SPRAY,
  Action.APPLY_TRICHODERMA,
  Action.INSTALL_TRAPS,
  Action.INSTALL_PHEROMONE_TRAPS,
  Action.RELEASE_BIOAGENT,
  Action.MECHANICAL_WEEDING,
  Action.HAND_WEEDING,
  Action.APPLY_MULCH,
  Action.STALE_SEEDBED,
  Action.SHADE_COVER,
  Action.FROST_PROTECTION,
  Action.WINDBREAK,
  Action.LIGHT_IRRIGATION_COOLING,
  Action.DELAYED_SOWING,
  Action.EARLY_HARVEST,
  Action.MONITOR_CLOSELY,
  Action.WAIT_AND_WATCH,
  Action.CONSULT_EXPERT,
  Action.SOIL_TEST,
  Action.TISSUE_TEST,
  Action.CONTINUE_CURRENT,
  Action.SCOUT_FIELD,
  Action.EMERGENCY_IRRIGATION,
  Action.SALVAGE_HARVEST,
  Action.INSURANCE_CLAIM,
  Action.CROP_DESTRUCTION,
  Action.FOLIAR_SPRAY,
  Action.SKIP_NITROGEN,
  Action.DELAY_SPRAY,
  Action.APPLY_MICRONUTRIENTS
];

// ═══════════════════════════════════════════════════════════════════════════
// FARMING MODE FILTER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if an action is compatible with organic farming
 */
export function isOrganicCompatible(action: Action): boolean {
  // Chemical-only actions are NOT organic compatible
  if (CHEMICAL_ONLY_ACTIONS.includes(action)) {
    return false;
  }
  
  // Synthetic fertilizer actions are NOT purely organic compatible
  if (SYNTHETIC_FERTILIZER_ACTIONS.includes(action)) {
    return false;
  }
  
  return true;
}

/**
 * Check if an action is compatible with organic_fertilizer mode
 * (synthetic fertilizers allowed, but no pesticides)
 */
export function isOrganicFertilizerCompatible(action: Action): boolean {
  // Chemical pesticide actions are NOT allowed
  if (CHEMICAL_ONLY_ACTIONS.includes(action)) {
    return false;
  }
  
  // Synthetic fertilizer actions ARE allowed
  // Universal actions ARE allowed
  return true;
}

/**
 * Filter actions based on farming mode
 * CRITICAL: This function MUST be called before returning recommendations
 */
export function filterByFarmingMode(
  actions: Action[],
  mode: FarmingMode
): Action[] {
  switch (mode) {
    case FarmingMode.ORGANIC_ONLY:
      return actions.filter(action => isOrganicCompatible(action));
    
    case FarmingMode.ORGANIC_FERTILIZER:
      return actions.filter(action => isOrganicFertilizerCompatible(action));
    
    case FarmingMode.CONVENTIONAL:
    default:
      return actions; // All actions allowed
  }
}

/**
 * Get organic alternatives for a recommended action
 */
export function getOrganicAlternatives(
  action: Action,
  mode: FarmingMode
): OrganicAlternative[] {
  // If mode is conventional, no alternatives needed
  if (mode === FarmingMode.CONVENTIONAL) {
    return [];
  }
  
  // Map action to chemical input
  const actionToChemical: Record<string, string> = {
    [Action.APPLY_NITROGEN]: 'Urea (46% N)',
    [Action.APPLY_PHOSPHORUS]: 'DAP (18-46-0)',
    [Action.APPLY_POTASSIUM]: 'MOP (Muriate of Potash 60% K2O)',
    [Action.APPLY_ZINC]: 'Zinc Sulphate',
    [Action.APPLY_INSECTICIDE]: 'Imidacloprid (for sucking pests)',
    [Action.APPLY_FUNGICIDE]: 'Mancozeb (broad-spectrum)',
    [Action.HERBICIDE_PRE_EMERGENCE]: 'Pendimethalin (pre-emergence)',
    [Action.HERBICIDE_POST_EMERGENCE]: '2,4-D (post-emergence)'
  };
  
  const chemicalInput = actionToChemical[action];
  if (!chemicalInput) {
    return [];
  }
  
  const equivalent = ALL_ORGANIC_EQUIVALENTS.find(
    eq => eq.chemical_input === chemicalInput
  );
  
  if (!equivalent) {
    return [];
  }
  
  // Filter based on mode
  if (mode === FarmingMode.ORGANIC_ONLY) {
    return equivalent.organic_alternatives.filter(alt => alt.certification_safe);
  }
  
  return equivalent.organic_alternatives;
}

/**
 * Get best organic alternative (highest effectiveness)
 */
export function getBestOrganicAlternative(
  action: Action,
  mode: FarmingMode
): OrganicAlternative | null {
  const alternatives = getOrganicAlternatives(action, mode);
  
  if (alternatives.length === 0) {
    return null;
  }
  
  // Sort by effectiveness and return best
  return alternatives.sort((a, b) => b.effectiveness_pct - a.effectiveness_pct)[0];
}

/**
 * Convert chemical action to organic action description
 */
export function convertToOrganicRecommendation(
  action: Action,
  mode: FarmingMode
): string {
  const bestAlt = getBestOrganicAlternative(action, mode);
  
  if (!bestAlt) {
    return `Manual/mechanical alternative for ${action}`;
  }
  
  let recommendation = `Apply ${bestAlt.input} @ ${bestAlt.dose}`;
  
  if (bestAlt.application_timing) {
    recommendation += `. Timing: ${bestAlt.application_timing}`;
  }
  
  if (bestAlt.preparation_method) {
    recommendation += `. Preparation: ${bestAlt.preparation_method}`;
  }
  
  return recommendation;
}

/**
 * Validate that no chemical inputs are in organic recommendation
 * CRITICAL: This is a safety check before returning to AI layer
 */
export function validateOrganicRecommendation(
  recommendation: string,
  mode: FarmingMode
): boolean {
  if (mode !== FarmingMode.ORGANIC_ONLY) {
    return true; // No validation needed for non-organic
  }
  
  const chemicalKeywords = [
    'urea', 'dap', 'mop', 'npk', 'imidacloprid', 'chlorpyriphos',
    'cypermethrin', 'carbofuran', 'monocrotophos', 'mancozeb',
    'carbendazim', 'metalaxyl', 'pendimethalin', '2,4-d', 'atrazine',
    'glyphosate', 'paraquat', 'isoproturon'
  ];
  
  const lowerRec = recommendation.toLowerCase();
  
  return !chemicalKeywords.some(keyword => lowerRec.includes(keyword));
}
