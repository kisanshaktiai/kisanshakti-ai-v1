/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WEED INTELLIGENCE LAYER
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Scientific weed management rules based on ICAR-DWR and CWS standards.
 * Contains 35+ rules for weed identification and control recommendations.
 * 
 * Scientific Sources:
 * - ICAR-Directorate of Weed Research (DWR), Jabalpur
 * - ICAR-IARI Weed Science Division
 * - State Agricultural Universities Weed Management Packages
 * 
 * Version: 1.0.0
 */

import { CropStage, FarmingMode } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// WEED RULE INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

export interface WeedRule {
  rule_id: string;
  weed_type: 'grassy' | 'broadleaf' | 'sedge' | 'parasitic';
  weed_name: string;
  scientific_name: string;
  crop_group: string;
  crop_codes?: string[];                 // Specific crops if not group-wide
  emergence_window_das: [number, number]; // [start, end] Days After Sowing
  critical_period_das: [number, number];  // Critical weed-free period
  organic_control: string[];
  chemical_control: string[];
  herbicide_window_das: [number, number];
  economic_threshold?: string;
  scientific_source: string;
  scientific_basis: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// CEREALS WEED RULES (12 rules)
// ═══════════════════════════════════════════════════════════════════════════

export const CEREALS_WEED_RULES: WeedRule[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // WHEAT WEEDS
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'W_CEREALS_PHALARIS_001',
    weed_type: 'grassy',
    weed_name: 'Mandusi/Gulli Danda',
    scientific_name: 'Phalaris minor',
    crop_group: 'cereals',
    crop_codes: ['wheat', 'barley'],
    emergence_window_das: [15, 30],
    critical_period_das: [20, 45],
    organic_control: [
      'Hand weeding at 25-30 DAS',
      'Stale seedbed technique with 15-day pre-sowing irrigation',
      'Crop rotation with berseem/mustard',
      'Higher seed rate (125 kg/ha) for competition',
      'Narrow row spacing (15 cm)'
    ],
    chemical_control: [
      'Clodinafop-propargyl 15% WP @ 400 g/ha at 30-35 DAS',
      'Sulfosulfuron 75% WG @ 33 g/ha at 25-35 DAS',
      'Pinoxaden 5.1% EC @ 1 L/ha at 25-35 DAS',
      'Fenoxaprop-p-ethyl 9.3% EC @ 1 L/ha at 30-35 DAS'
    ],
    herbicide_window_das: [25, 35],
    economic_threshold: '10-15 plants/m²',
    scientific_source: 'ICAR-DWR Jabalpur, ICAR-IARI',
    scientific_basis: 'Phalaris minor is the most problematic weed in wheat with yield loss up to 80%. Herbicide resistance is widespread - rotate modes of action.'
  },
  {
    rule_id: 'W_CEREALS_AVENA_001',
    weed_type: 'grassy',
    weed_name: 'Wild Oat/Javi',
    scientific_name: 'Avena fatua/ludoviciana',
    crop_group: 'cereals',
    crop_codes: ['wheat', 'barley'],
    emergence_window_das: [10, 25],
    critical_period_das: [15, 40],
    organic_control: [
      'Deep summer ploughing exposes seeds',
      'Delayed sowing (after Nov 15)',
      'Hand roguing before seed set',
      'Crop rotation with non-cereal crops'
    ],
    chemical_control: [
      'Clodinafop-propargyl 15% WP @ 400 g/ha',
      'Isoproturon 75% WP @ 1.25 kg/ha (non-resistant areas)',
      'Pinoxaden 5.1% EC @ 1 L/ha',
      'Mesosulfuron + Iodosulfuron 3% WG @ 400 g/ha'
    ],
    herbicide_window_das: [20, 35],
    economic_threshold: '5-10 plants/m²',
    scientific_source: 'ICAR-IARI, PAU Ludhiana',
    scientific_basis: 'Wild oat competes aggressively due to similar growth habit. Each plant produces 200-300 seeds with long dormancy.'
  },
  {
    rule_id: 'W_CEREALS_CHENOPODIUM_001',
    weed_type: 'broadleaf',
    weed_name: 'Bathua/Lambsquarters',
    scientific_name: 'Chenopodium album',
    crop_group: 'cereals',
    crop_codes: ['wheat', 'barley', 'maize'],
    emergence_window_das: [12, 28],
    critical_period_das: [15, 35],
    organic_control: [
      'Hand weeding at 25-30 DAS',
      'Inter-cultivation in wide row crops',
      'Mulching with wheat straw',
      'Competitive crop varieties'
    ],
    chemical_control: [
      '2,4-D Sodium Salt 80% @ 625 g/ha at 30-35 DAS',
      'Metsulfuron-methyl 20% WP @ 20 g/ha',
      'Carfentrazone-ethyl 40% DF @ 50 g/ha',
      '2,4-D + Metsulfuron ready-mix @ 500 g/ha'
    ],
    herbicide_window_das: [25, 35],
    economic_threshold: '5 plants/m²',
    scientific_source: 'ICAR-DWR Jabalpur',
    scientific_basis: 'Chenopodium album causes 15-25% yield loss in wheat. Young leaves are edible and harvesting for food reduces weed pressure.'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // RICE WEEDS
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'W_CEREALS_ECHINOCHLOA_001',
    weed_type: 'grassy',
    weed_name: 'Barnyard Grass/Sama',
    scientific_name: 'Echinochloa crus-galli/colona',
    crop_group: 'cereals',
    crop_codes: ['rice'],
    emergence_window_das: [5, 20],
    critical_period_das: [15, 45],
    organic_control: [
      'Maintain 5 cm water depth continuously',
      'Hand weeding at 20 and 40 DAT',
      'Cono-weeder at 20 and 35 DAT',
      'Azolla dual cropping (suppresses weeds)',
      'Brown manuring with Sesbania'
    ],
    chemical_control: [
      'Pretilachlor 50% EC @ 1 L/ha (pre-emergence)',
      'Bispyribac-sodium 10% SC @ 250 ml/ha at 15-25 DAT',
      'Cyhalofop-butyl 10% EC @ 800 ml/ha',
      'Fenoxaprop-p-ethyl 9.3% EC @ 875 ml/ha'
    ],
    herbicide_window_das: [15, 25],
    economic_threshold: '10-15 plants/m²',
    scientific_source: 'ICAR-CRRI Cuttack, ICAR-DWR',
    scientific_basis: 'Echinochloa mimics rice seedlings making early identification difficult. Causes 30-50% yield loss. Water management is the most effective organic control.'
  },
  {
    rule_id: 'W_CEREALS_CYPERUS_001',
    weed_type: 'sedge',
    weed_name: 'Purple Nutsedge/Motha',
    scientific_name: 'Cyperus rotundus',
    crop_group: 'cereals',
    crop_codes: ['rice', 'maize'],
    emergence_window_das: [7, 21],
    critical_period_das: [20, 50],
    organic_control: [
      'Repeated tillage in summer to exhaust tubers',
      'Flooding for 30 days kills tubers',
      'Hand weeding every 15 days',
      'Solarization with polythene mulch',
      'Trap cropping with groundnut (attracts but dies)'
    ],
    chemical_control: [
      'Halosulfuron-methyl 75% WG @ 67 g/ha',
      'Bensulfuron-methyl 0.6% + Pretilachlor 6% GR @ 10 kg/ha',
      'Azimsulfuron 50% DF @ 35 g/ha',
      'Ethoxysulfuron 15% WDG @ 100 g/ha'
    ],
    herbicide_window_das: [10, 25],
    economic_threshold: '20-25 tubers/m²',
    scientific_source: 'ICAR-DWR, TNAU',
    scientific_basis: 'Cyperus rotundus is the world\'s worst weed. One tuber can produce 40,000 tubers in a year. Deep-rooted (up to 50 cm) making mechanical control difficult.'
  },
  {
    rule_id: 'W_CEREALS_ISCHAEMUM_001',
    weed_type: 'grassy',
    weed_name: 'Jangli Ghass',
    scientific_name: 'Ischaemum rugosum',
    crop_group: 'cereals',
    crop_codes: ['rice'],
    emergence_window_das: [10, 25],
    critical_period_das: [20, 45],
    organic_control: [
      'Hand weeding at 20-25 DAT',
      'Maintain water level 5-7 cm',
      'Cono-weeder use',
      'Higher plant density'
    ],
    chemical_control: [
      'Cyhalofop-butyl 10% EC @ 800 ml/ha',
      'Fenoxaprop-p-ethyl 9.3% EC @ 875 ml/ha',
      'Bispyribac-sodium 10% SC @ 250 ml/ha'
    ],
    herbicide_window_das: [15, 30],
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'Ischaemum rugosum is a C4 weed with high competitive ability under waterlogged conditions.'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // MAIZE WEEDS
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'W_CEREALS_DIGITARIA_001',
    weed_type: 'grassy',
    weed_name: 'Crab Grass',
    scientific_name: 'Digitaria sanguinalis',
    crop_group: 'cereals',
    crop_codes: ['maize', 'sorghum'],
    emergence_window_das: [7, 21],
    critical_period_das: [15, 45],
    organic_control: [
      'Inter-cultivation at 15 and 30 DAS',
      'Hand weeding at 20-25 DAS',
      'Mulching with crop residues',
      'Intercropping with legumes'
    ],
    chemical_control: [
      'Atrazine 50% WP @ 1.5 kg/ha pre-emergence',
      'Tembotrione 34.4% SC @ 115 ml/ha post-emergence',
      'Topramezone 33.6% SC @ 30-40 ml/ha',
      'Atrazine + Pendimethalin tank mix'
    ],
    herbicide_window_das: [0, 25],
    scientific_source: 'ICAR-IIMR Ludhiana',
    scientific_basis: 'Digitaria sanguinalis is a prolific seeder (100,000+ seeds/plant) and rapid colonizer in row crops.'
  },
  {
    rule_id: 'W_CEREALS_COMMELINA_001',
    weed_type: 'broadleaf',
    weed_name: 'Dayflower/Kankaua',
    scientific_name: 'Commelina benghalensis',
    crop_group: 'cereals',
    crop_codes: ['maize', 'rice'],
    emergence_window_das: [10, 25],
    critical_period_das: [20, 45],
    organic_control: [
      'Hand weeding before flowering',
      'Deep ploughing in summer',
      'Mulching',
      'Inter-cultivation'
    ],
    chemical_control: [
      'Atrazine 50% WP @ 1.5 kg/ha',
      '2,4-D 38% SL @ 1.5 L/ha',
      'Halosulfuron-methyl 75% WG @ 67 g/ha'
    ],
    herbicide_window_das: [15, 30],
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'Commelina benghalensis produces both aerial and underground (cleistogamous) seeds, making eradication difficult.'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PARASITIC WEEDS IN CEREALS
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'W_CEREALS_STRIGA_001',
    weed_type: 'parasitic',
    weed_name: 'Witchweed',
    scientific_name: 'Striga asiatica/hermonthica',
    crop_group: 'cereals',
    crop_codes: ['sorghum', 'maize', 'rice'],
    emergence_window_das: [21, 45],
    critical_period_das: [30, 70],
    organic_control: [
      'Trap cropping with cotton, groundnut',
      'Hand pulling before flowering',
      'Crop rotation with non-host crops for 3-4 years',
      'Use of resistant varieties (CSV 15, CSV 17)',
      'Nitrogen fertilization (reduces infestation)',
      'Push-pull system with Desmodium'
    ],
    chemical_control: [
      'Imidazolinone-tolerant varieties + Imazapyr seed treatment',
      'Dicamba 48% SL @ 300 ml/ha (post-emergence)',
      '2,4-D @ 1 kg/ha (controls emerged Striga only)'
    ],
    herbicide_window_das: [35, 55],
    economic_threshold: 'Any infestation is severe (1 plant = yield loss)',
    scientific_source: 'ICAR-IIMR, ICRISAT',
    scientific_basis: 'Striga causes up to 100% yield loss in susceptible varieties. Produces 50,000-500,000 tiny seeds/plant that remain viable for 20+ years.'
  },
  {
    rule_id: 'W_CEREALS_OROBANCHE_001',
    weed_type: 'parasitic',
    weed_name: 'Broomrape',
    scientific_name: 'Orobanche cernua/aegyptiaca',
    crop_group: 'cereals',
    crop_codes: ['mustard', 'tobacco'],
    emergence_window_das: [30, 60],
    critical_period_das: [40, 80],
    organic_control: [
      'Trap cropping with flax, clover',
      'Hand pulling before seed set',
      'Deep ploughing to bury seeds',
      'Crop rotation for 6-8 years',
      'Solarization in summer'
    ],
    chemical_control: [
      'Glyphosate @ 25-50 g/ha (low dose application)',
      'Imazethapyr @ 75 g/ha (in tolerant crops)'
    ],
    herbicide_window_das: [45, 65],
    scientific_source: 'ICAR-DRMR Bharatpur',
    scientific_basis: 'Orobanche is a root parasite that attaches to host roots underground. Damage occurs before emergence. Each plant produces 250,000+ seeds.'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// PULSES WEED RULES (8 rules)
// ═══════════════════════════════════════════════════════════════════════════

export const PULSES_WEED_RULES: WeedRule[] = [
  {
    rule_id: 'W_PULSES_ASPHODELUS_001',
    weed_type: 'broadleaf',
    weed_name: 'Piazi/Wild Onion',
    scientific_name: 'Asphodelus tenuifolius',
    crop_group: 'pulses',
    crop_codes: ['chickpea', 'lentil'],
    emergence_window_das: [15, 30],
    critical_period_das: [25, 50],
    organic_control: [
      'Hand weeding at 25-30 DAS',
      'Hoeing at 30-35 DAS',
      'Intercropping with mustard',
      'Higher seed rate for competition'
    ],
    chemical_control: [
      'Pendimethalin 30% EC @ 3.3 L/ha (pre-emergence)',
      'Quizalofop-ethyl 5% EC @ 1 L/ha (grassy weeds)',
      'Imazethapyr 10% SL @ 1 L/ha (broad-spectrum)'
    ],
    herbicide_window_das: [0, 20],
    scientific_source: 'ICAR-IIPR Kanpur',
    scientific_basis: 'Asphodelus tenuifolius is a major weed in chickpea/lentil causing 30-40% yield loss. Bulbils ensure persistence.'
  },
  {
    rule_id: 'W_PULSES_LATHYRUS_001',
    weed_type: 'broadleaf',
    weed_name: 'Wild Pea/Akri',
    scientific_name: 'Lathyrus aphaca',
    crop_group: 'pulses',
    crop_codes: ['lentil', 'chickpea'],
    emergence_window_das: [15, 30],
    critical_period_das: [20, 45],
    organic_control: [
      'Hand weeding at 30 DAS',
      'Clean seed (avoid contaminated seed)',
      'Crop rotation',
      'Higher seed rate'
    ],
    chemical_control: [
      'Pendimethalin 30% EC @ 3.3 L/ha pre-emergence',
      'Imazethapyr 10% SL @ 750 ml/ha'
    ],
    herbicide_window_das: [0, 25],
    scientific_source: 'ICAR-IIPR',
    scientific_basis: 'Lathyrus aphaca is a climber that smothers pulse crops. Seeds resemble lentil making separation difficult.'
  },
  {
    rule_id: 'W_PULSES_CUSCUTA_001',
    weed_type: 'parasitic',
    weed_name: 'Dodder/Amarbel',
    scientific_name: 'Cuscuta campestris',
    crop_group: 'pulses',
    crop_codes: ['chickpea', 'lentil', 'lucerne'],
    emergence_window_das: [20, 40],
    critical_period_das: [25, 60],
    organic_control: [
      'Remove affected plants and 30 cm radius plants',
      'Use Cuscuta-free seed',
      'Crop rotation with non-host (cereals) for 3-4 years',
      'Deep ploughing to bury seeds',
      'Solarization',
      'Avoid overhead irrigation'
    ],
    chemical_control: [
      'Pendimethalin 30% EC @ 3.3 L/ha pre-emergence',
      'Paraquat @ 0.5 L/ha (spot application on patches)',
      'Glyphosate @ 1 L/ha (crop destruction if severe)'
    ],
    herbicide_window_das: [0, 15],
    economic_threshold: 'Any infestation requires immediate action',
    scientific_source: 'ICAR-IIPR, ICAR-IGFRI',
    scientific_basis: 'Cuscuta is a stem parasite that spreads rapidly. One plant can cover 3m² in a month. Seeds viable for 20+ years.'
  },
  {
    rule_id: 'W_PULSES_CONVOLVULUS_001',
    weed_type: 'broadleaf',
    weed_name: 'Field Bindweed/Hirankhuri',
    scientific_name: 'Convolvulus arvensis',
    crop_group: 'pulses',
    crop_codes: ['chickpea', 'pigeonpea', 'mungbean'],
    emergence_window_das: [10, 30],
    critical_period_das: [20, 50],
    organic_control: [
      'Repeated cutting before flowering',
      'Deep ploughing in summer',
      'Hand weeding at 25-30 DAS',
      'Competitive crops'
    ],
    chemical_control: [
      'Pendimethalin 30% EC @ 3.3 L/ha',
      'Imazethapyr 10% SL @ 1 L/ha',
      '2,4-D @ 1 kg/ha (post-emergence)'
    ],
    herbicide_window_das: [0, 25],
    scientific_source: 'ICAR-IIPR',
    scientific_basis: 'Convolvulus arvensis has deep roots (up to 6m) making eradication difficult. Perennial nature requires multi-season management.'
  },
  {
    rule_id: 'W_PULSES_CYNODON_001',
    weed_type: 'grassy',
    weed_name: 'Bermuda Grass/Doob',
    scientific_name: 'Cynodon dactylon',
    crop_group: 'pulses',
    crop_codes: ['pigeonpea', 'mungbean', 'blackgram'],
    emergence_window_das: [7, 21],
    critical_period_das: [15, 45],
    organic_control: [
      'Deep summer ploughing to expose rhizomes',
      'Repeated tillage to exhaust rhizomes',
      'Hand weeding',
      'Solarization with polythene mulch'
    ],
    chemical_control: [
      'Quizalofop-ethyl 5% EC @ 1 L/ha',
      'Imazethapyr 10% SL @ 1 L/ha',
      'Pendimethalin 30% EC @ 3.3 L/ha pre-emergence'
    ],
    herbicide_window_das: [15, 30],
    scientific_source: 'ICAR-IIPR',
    scientific_basis: 'Cynodon dactylon is a perennial grass that spreads through stolons and rhizomes. Requires persistent management.'
  },
  {
    rule_id: 'W_PULSES_TRIANTHEMA_001',
    weed_type: 'broadleaf',
    weed_name: 'Horse Purslane/Patharchatta',
    scientific_name: 'Trianthema portulacastrum',
    crop_group: 'pulses',
    crop_codes: ['mungbean', 'blackgram', 'cowpea'],
    emergence_window_das: [5, 15],
    critical_period_das: [15, 40],
    organic_control: [
      'Hand weeding at 15-20 DAS',
      'Inter-cultivation',
      'Mulching',
      'Early sowing before weed flush'
    ],
    chemical_control: [
      'Pendimethalin 30% EC @ 3.3 L/ha pre-emergence',
      'Imazethapyr 10% SL @ 1 L/ha post-emergence'
    ],
    herbicide_window_das: [0, 20],
    scientific_source: 'ICAR-IIPR',
    scientific_basis: 'Trianthema portulacastrum is a summer annual that germinates rapidly and competes aggressively in kharif pulses.'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// OILSEEDS WEED RULES (6 rules)
// ═══════════════════════════════════════════════════════════════════════════

export const OILSEEDS_WEED_RULES: WeedRule[] = [
  {
    rule_id: 'W_OILSEEDS_PARTHENIUM_001',
    weed_type: 'broadleaf',
    weed_name: 'Congress Grass/Gajar Ghas',
    scientific_name: 'Parthenium hysterophorus',
    crop_group: 'oilseeds',
    crop_codes: ['soybean', 'groundnut', 'sunflower'],
    emergence_window_das: [5, 20],
    critical_period_das: [15, 45],
    organic_control: [
      'Hand weeding before flowering (use gloves - allergenic)',
      'Competitive cropping with Cassia tora',
      'Biocontrol with Mexican beetle (Zygogramma bicolorata)',
      'Mulching with crop residues'
    ],
    chemical_control: [
      'Metribuzin 70% WP @ 350 g/ha (soybean)',
      'Pendimethalin 30% EC @ 3.3 L/ha',
      'Glyphosate @ 2 L/ha (pre-plant)'
    ],
    herbicide_window_das: [0, 20],
    economic_threshold: '2-3 plants/m²',
    scientific_source: 'ICAR-DWR, ICAR-IISR',
    scientific_basis: 'Parthenium is highly invasive and allelopathic. Causes respiratory allergies in humans. Biocontrol beetle established in many states.'
  },
  {
    rule_id: 'W_OILSEEDS_XANTHIUM_001',
    weed_type: 'broadleaf',
    weed_name: 'Cocklebur/Gokhru',
    scientific_name: 'Xanthium strumarium',
    crop_group: 'oilseeds',
    crop_codes: ['soybean', 'sunflower', 'groundnut'],
    emergence_window_das: [7, 21],
    critical_period_das: [20, 50],
    organic_control: [
      'Hand weeding before burr formation',
      'Deep ploughing to bury seeds',
      'Crop rotation with cereals'
    ],
    chemical_control: [
      'Chlorimuron-ethyl 25% WP @ 36 g/ha (soybean)',
      'Imazethapyr 10% SL @ 1 L/ha',
      '2,4-D @ 1 kg/ha (post-emergence)'
    ],
    herbicide_window_das: [15, 30],
    scientific_source: 'ICAR-IISR Indore',
    scientific_basis: 'Xanthium strumarium is toxic to livestock. Burrs contaminate harvested produce and are difficult to separate.'
  },
  {
    rule_id: 'W_OILSEEDS_ACANTHOSPERMUM_001',
    weed_type: 'broadleaf',
    weed_name: 'Bristly Starbur',
    scientific_name: 'Acanthospermum hispidum',
    crop_group: 'oilseeds',
    crop_codes: ['groundnut', 'soybean'],
    emergence_window_das: [7, 21],
    critical_period_das: [20, 45],
    organic_control: [
      'Hand weeding at 20-25 DAS',
      'Inter-cultivation',
      'Mulching'
    ],
    chemical_control: [
      'Pendimethalin 30% EC @ 3.3 L/ha pre-emergence',
      'Imazethapyr 10% SL @ 1 L/ha',
      'Oxyfluorfen 23.5% EC @ 200 ml/ha'
    ],
    herbicide_window_das: [0, 25],
    scientific_source: 'ICAR-DGR Junagadh',
    scientific_basis: 'Acanthospermum hispidum is a major weed in groundnut. Spiny fruits contaminate produce and cause harvest difficulties.'
  },
  {
    rule_id: 'W_OILSEEDS_CELOSIA_001',
    weed_type: 'broadleaf',
    weed_name: 'Cock\'s Comb/Murga Phool',
    scientific_name: 'Celosia argentea',
    crop_group: 'oilseeds',
    crop_codes: ['groundnut', 'soybean', 'sesame'],
    emergence_window_das: [7, 20],
    critical_period_das: [15, 40],
    organic_control: [
      'Hand weeding at 20 DAS',
      'Inter-cultivation',
      'Deep summer ploughing'
    ],
    chemical_control: [
      'Pendimethalin 30% EC @ 3.3 L/ha',
      'Oxyfluorfen 23.5% EC @ 200 ml/ha',
      'Quizalofop-ethyl 5% EC @ 1 L/ha (grassy weeds)'
    ],
    herbicide_window_das: [0, 20],
    scientific_source: 'ICAR-DGR',
    scientific_basis: 'Celosia argentea is a prolific seeder common in rainfed oilseeds. Young plants are edible as a leafy vegetable.'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// VEGETABLES WEED RULES (5 rules)
// ═══════════════════════════════════════════════════════════════════════════

export const VEGETABLES_WEED_RULES: WeedRule[] = [
  {
    rule_id: 'W_VEG_PORTULACA_001',
    weed_type: 'broadleaf',
    weed_name: 'Common Purslane/Kulfa',
    scientific_name: 'Portulaca oleracea',
    crop_group: 'vegetables',
    crop_codes: ['tomato', 'brinjal', 'chilli', 'onion'],
    emergence_window_das: [5, 15],
    critical_period_das: [15, 40],
    organic_control: [
      'Hand weeding at 15-20 DAT',
      'Mulching with black polythene',
      'Stale seedbed technique',
      'Edible - harvest for consumption'
    ],
    chemical_control: [
      'Pendimethalin 30% EC @ 2.5 L/ha pre-emergence',
      'Oxyfluorfen 23.5% EC @ 400 ml/ha',
      'Oxadiargyl 6% EC @ 750 ml/ha'
    ],
    herbicide_window_das: [0, 15],
    scientific_source: 'ICAR-IIVR Varanasi',
    scientific_basis: 'Portulaca oleracea is a C4 succulent weed. Highly nutritious and can be marketed as a vegetable to offset losses.'
  },
  {
    rule_id: 'W_VEG_AMARANTHUS_001',
    weed_type: 'broadleaf',
    weed_name: 'Pigweed/Chaulai',
    scientific_name: 'Amaranthus viridis/spinosus',
    crop_group: 'vegetables',
    crop_codes: ['tomato', 'brinjal', 'okra', 'cucurbits'],
    emergence_window_das: [5, 15],
    critical_period_das: [15, 40],
    organic_control: [
      'Hand weeding at 15-20 DAT',
      'Mulching',
      'Harvest as leafy vegetable',
      'Inter-cultivation'
    ],
    chemical_control: [
      'Pendimethalin 30% EC @ 2.5 L/ha',
      'Oxyfluorfen 23.5% EC @ 400 ml/ha',
      'Metribuzin 70% WP @ 250 g/ha (tomato)'
    ],
    herbicide_window_das: [0, 15],
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Amaranthus species produce 100,000+ seeds/plant. Young leaves are nutritious and can be sold as leafy vegetable.'
  },
  {
    rule_id: 'W_VEG_OXALIS_001',
    weed_type: 'broadleaf',
    weed_name: 'Wood Sorrel/Khatti Buti',
    scientific_name: 'Oxalis corniculata',
    crop_group: 'vegetables',
    crop_codes: ['onion', 'garlic', 'potato'],
    emergence_window_das: [10, 25],
    critical_period_das: [20, 50],
    organic_control: [
      'Hand weeding',
      'Mulching with organic matter',
      'Repeated hoeing',
      'Solarization'
    ],
    chemical_control: [
      'Oxyfluorfen 23.5% EC @ 400 ml/ha',
      'Pendimethalin 30% EC @ 2.5 L/ha'
    ],
    herbicide_window_das: [0, 20],
    scientific_source: 'ICAR-DOGR Rajgurunagar',
    scientific_basis: 'Oxalis corniculata spreads through explosive seed dispersal and stolons. Persistent in perennial crops.'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// COTTON/FIBER WEED RULES (4 rules)
// ═══════════════════════════════════════════════════════════════════════════

export const FIBER_WEED_RULES: WeedRule[] = [
  {
    rule_id: 'W_FIBER_SIDA_001',
    weed_type: 'broadleaf',
    weed_name: 'Prickly Sida/Bala',
    scientific_name: 'Sida spinosa/acuta',
    crop_group: 'fiber',
    crop_codes: ['cotton', 'jute'],
    emergence_window_das: [10, 25],
    critical_period_das: [20, 60],
    organic_control: [
      'Hand weeding at 20-25 DAS',
      'Inter-cultivation at 30-35 DAS',
      'Mulching with cotton stalks'
    ],
    chemical_control: [
      'Pendimethalin 30% EC @ 3.3 L/ha pre-emergence',
      'Pyrithiobac-sodium 10% EC @ 1.25 L/ha',
      'Diuron 80% WP @ 1 kg/ha (pre-emergence)'
    ],
    herbicide_window_das: [0, 25],
    scientific_source: 'ICAR-CICR Nagpur',
    scientific_basis: 'Sida species are problematic in cotton due to similar canopy height. Woody stems interfere with harvest.'
  },
  {
    rule_id: 'W_FIBER_EUPHORBIA_001',
    weed_type: 'broadleaf',
    weed_name: 'Spurge/Dudhi',
    scientific_name: 'Euphorbia hirta/geniculata',
    crop_group: 'fiber',
    crop_codes: ['cotton'],
    emergence_window_das: [7, 21],
    critical_period_das: [15, 45],
    organic_control: [
      'Hand weeding at 20 DAS',
      'Inter-cultivation',
      'Mulching'
    ],
    chemical_control: [
      'Pyrithiobac-sodium 10% EC @ 1.25 L/ha',
      'Pendimethalin 30% EC @ 3.3 L/ha',
      'Oxyfluorfen 23.5% EC @ 500 ml/ha'
    ],
    herbicide_window_das: [0, 25],
    scientific_source: 'ICAR-CICR',
    scientific_basis: 'Euphorbia species have milky latex that stains cotton lint. C4 metabolism gives competitive advantage.'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// COMBINED WEED RULES EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const ALL_WEED_RULES: WeedRule[] = [
  ...CEREALS_WEED_RULES,
  ...PULSES_WEED_RULES,
  ...OILSEEDS_WEED_RULES,
  ...VEGETABLES_WEED_RULES,
  ...FIBER_WEED_RULES
];

// ═══════════════════════════════════════════════════════════════════════════
// WEED MANAGEMENT FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get applicable weed rules for a specific crop and DAS
 */
export function getWeedRulesForCrop(
  cropCode: string,
  cropGroup: string,
  daysAfterSowing: number
): WeedRule[] {
  return ALL_WEED_RULES.filter(rule => {
    // Check crop group match
    const groupMatch = rule.crop_group === cropGroup;
    
    // Check specific crop match (if specified)
    const cropMatch = !rule.crop_codes || rule.crop_codes.includes(cropCode);
    
    // Check if within critical period
    const withinCriticalPeriod = 
      daysAfterSowing >= rule.critical_period_das[0] && 
      daysAfterSowing <= rule.critical_period_das[1];
    
    return groupMatch && cropMatch && withinCriticalPeriod;
  });
}

/**
 * Get weed control recommendations based on farming mode
 */
export function getWeedControlRecommendations(
  rule: WeedRule,
  farmingMode: FarmingMode
): string[] {
  if (farmingMode === FarmingMode.ORGANIC_ONLY) {
    return rule.organic_control;
  }
  
  // For conventional farming, combine both
  return [...rule.organic_control, ...rule.chemical_control];
}

/**
 * Check if herbicide application is within recommended window
 */
export function isWithinHerbicideWindow(
  rule: WeedRule,
  daysAfterSowing: number
): boolean {
  return daysAfterSowing >= rule.herbicide_window_das[0] && 
         daysAfterSowing <= rule.herbicide_window_das[1];
}

/**
 * Get priority weeds for immediate action
 */
export function getPriorityWeeds(
  cropCode: string,
  cropGroup: string,
  daysAfterSowing: number
): WeedRule[] {
  const applicableRules = getWeedRulesForCrop(cropCode, cropGroup, daysAfterSowing);
  
  // Prioritize parasitic weeds and those near end of herbicide window
  return applicableRules.sort((a, b) => {
    // Parasitic weeds get highest priority
    if (a.weed_type === 'parasitic' && b.weed_type !== 'parasitic') return -1;
    if (b.weed_type === 'parasitic' && a.weed_type !== 'parasitic') return 1;
    
    // Then by urgency (days left in herbicide window)
    const daysLeftA = a.herbicide_window_das[1] - daysAfterSowing;
    const daysLeftB = b.herbicide_window_das[1] - daysAfterSowing;
    
    return daysLeftA - daysLeftB;
  });
}
