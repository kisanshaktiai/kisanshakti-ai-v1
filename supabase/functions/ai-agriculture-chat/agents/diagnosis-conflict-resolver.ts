// ============= DIAGNOSIS CONFLICT RESOLVER =============
// Resolves conflicts between multiple diagnoses from the canonical state
// Uses explicit priority hierarchy and contextual resolution
// Integrates with the existing conflict-resolver.ts for action-level conflicts

import { 
  CanonicalState, 
  DataConfidence, 
  SeverityLevel,
  NDVITrend,
  WaterStress,
  RainfallRecent,
  SoilNitrogen
} from './canonical-state-builder.ts';

// ==================== DIAGNOSIS CATEGORIES ====================

export enum DiagnosisCategory {
  SAFETY = 'SAFETY',           // Always highest priority
  WEATHER_STRESS = 'WEATHER_STRESS',
  WATER_STRESS = 'WATER_STRESS',
  DISEASE = 'DISEASE',
  PEST = 'PEST',
  NUTRIENT_DEFICIENCY = 'NUTRIENT_DEFICIENCY',
  PHYSIOLOGICAL = 'PHYSIOLOGICAL',
  UNKNOWN = 'UNKNOWN'
}

// Priority order (higher number = higher priority)
export const CATEGORY_PRIORITY: Record<DiagnosisCategory, number> = {
  [DiagnosisCategory.SAFETY]: 100,
  [DiagnosisCategory.WEATHER_STRESS]: 90,
  [DiagnosisCategory.WATER_STRESS]: 80,
  [DiagnosisCategory.DISEASE]: 70,
  [DiagnosisCategory.PEST]: 65,
  [DiagnosisCategory.NUTRIENT_DEFICIENCY]: 50,
  [DiagnosisCategory.PHYSIOLOGICAL]: 40,
  [DiagnosisCategory.UNKNOWN]: 0
};

// ==================== DIAGNOSIS INTERFACE ====================

export interface Diagnosis {
  id: string;
  category: DiagnosisCategory;
  cause: string;
  confidence: number;  // 0-1
  evidence: string[];
  rule_ids: string[];
  severity: SeverityLevel;
  requires_immediate_action: boolean;
}

export interface DiagnosisConflictResult {
  primary_diagnosis: Diagnosis | null;
  secondary_diagnoses: Diagnosis[];
  resolution_reason: string;
  confidence_in_resolution: number;
  requires_clarification: boolean;
  clarification_question?: string;
  clarification_options?: string[];
  all_considered: Diagnosis[];
}

// ==================== CONFLICT PATTERNS ====================

interface ConflictPattern {
  categories: DiagnosisCategory[];
  resolution: 'PRIORITY' | 'COMBINE' | 'CLARIFY' | 'BOTH';
  reason: string;
}

const KNOWN_CONFLICTS: ConflictPattern[] = [
  {
    categories: [DiagnosisCategory.WATER_STRESS, DiagnosisCategory.NUTRIENT_DEFICIENCY],
    resolution: 'PRIORITY',
    reason: 'Water stress can mask or mimic nutrient deficiency symptoms. Address water first.'
  },
  {
    categories: [DiagnosisCategory.DISEASE, DiagnosisCategory.NUTRIENT_DEFICIENCY],
    resolution: 'BOTH',
    reason: 'Nutrient deficiency weakens plants, making them susceptible to disease. Address both.'
  },
  {
    categories: [DiagnosisCategory.WEATHER_STRESS, DiagnosisCategory.PEST],
    resolution: 'COMBINE',
    reason: 'Weather stress and pest pressure often occur together. Combined approach needed.'
  },
  {
    categories: [DiagnosisCategory.PEST, DiagnosisCategory.DISEASE],
    resolution: 'CLARIFY',
    reason: 'Pest and disease symptoms can look similar. Photo confirmation recommended.'
  }
];

// ==================== SEVERITY ORDER ====================

const SEVERITY_ORDER = [
  SeverityLevel.NONE,
  SeverityLevel.UNKNOWN,
  SeverityLevel.LOW,
  SeverityLevel.MODERATE,
  SeverityLevel.HIGH,
  SeverityLevel.CRITICAL
];

function compareSeverity(a: SeverityLevel, b: SeverityLevel): number {
  return SEVERITY_ORDER.indexOf(a) - SEVERITY_ORDER.indexOf(b);
}

function maxSeverity(severities: SeverityLevel[]): SeverityLevel {
  return severities.reduce((max, s) => 
    compareSeverity(s, max) > 0 ? s : max,
    SeverityLevel.NONE
  );
}

// ==================== MAIN CONFLICT RESOLVER ====================

export function resolveDiagnosisConflicts(
  diagnoses: Diagnosis[],
  state: CanonicalState
): DiagnosisConflictResult {
  // No diagnoses - return empty result
  if (diagnoses.length === 0) {
    return {
      primary_diagnosis: null,
      secondary_diagnoses: [],
      resolution_reason: 'No diagnoses to resolve',
      confidence_in_resolution: 0,
      requires_clarification: true,
      clarification_question: 'Could not identify any issues. Please describe the problem in more detail.',
      clarification_options: [
        'पान पिवळे पडत आहेत',
        'पान गळून पडत आहेत',
        'कीड दिसत आहे',
        'फोटो पाठवतो'
      ],
      all_considered: []
    };
  }
  
  // Single diagnosis - no conflict
  if (diagnoses.length === 1) {
    return {
      primary_diagnosis: diagnoses[0],
      secondary_diagnoses: [],
      resolution_reason: 'Single diagnosis, no conflict',
      confidence_in_resolution: diagnoses[0].confidence,
      requires_clarification: diagnoses[0].confidence < 0.6,
      all_considered: diagnoses
    };
  }
  
  // Check for SAFETY category - always takes priority
  const safetyDiagnoses = diagnoses.filter(d => d.category === DiagnosisCategory.SAFETY);
  if (safetyDiagnoses.length > 0) {
    return {
      primary_diagnosis: safetyDiagnoses[0],
      secondary_diagnoses: diagnoses.filter(d => d.category !== DiagnosisCategory.SAFETY),
      resolution_reason: 'Safety issue detected - takes priority over all other diagnoses',
      confidence_in_resolution: 1.0,
      requires_clarification: false,
      all_considered: diagnoses
    };
  }
  
  // Sort by priority and confidence
  const sorted = [...diagnoses].sort((a, b) => {
    const priorityDiff = CATEGORY_PRIORITY[b.category] - CATEGORY_PRIORITY[a.category];
    if (priorityDiff !== 0) return priorityDiff;
    return b.confidence - a.confidence;
  });
  
  // Check for known conflict patterns
  const categories = new Set(diagnoses.map(d => d.category));
  const conflictPattern = findMatchingConflictPattern(Array.from(categories));
  
  if (conflictPattern) {
    return handleKnownConflict(conflictPattern, sorted, state);
  }
  
  // Apply contextual resolution based on state
  return applyContextualResolution(sorted, state);
}

// ==================== HELPER FUNCTIONS ====================

function findMatchingConflictPattern(categories: DiagnosisCategory[]): ConflictPattern | null {
  for (const pattern of KNOWN_CONFLICTS) {
    const patternSet = new Set(pattern.categories);
    if (categories.every(c => patternSet.has(c)) || 
        pattern.categories.every(c => categories.includes(c))) {
      return pattern;
    }
  }
  return null;
}

function handleKnownConflict(
  pattern: ConflictPattern,
  sorted: Diagnosis[],
  state: CanonicalState
): DiagnosisConflictResult {
  switch (pattern.resolution) {
    case 'PRIORITY':
      return {
        primary_diagnosis: sorted[0],
        secondary_diagnoses: sorted.slice(1),
        resolution_reason: pattern.reason,
        confidence_in_resolution: sorted[0].confidence * 0.8,
        requires_clarification: false,
        all_considered: sorted
      };
    
    case 'COMBINE':
      return {
        primary_diagnosis: sorted[0],
        secondary_diagnoses: sorted.slice(1),
        resolution_reason: `${pattern.reason} Both issues should be addressed.`,
        confidence_in_resolution: Math.min(...sorted.map(d => d.confidence)),
        requires_clarification: false,
        all_considered: sorted
      };
    
    case 'BOTH':
      // Merge diagnoses for combined treatment
      const merged: Diagnosis = {
        id: `combined_${sorted[0].id}_${sorted[1]?.id || ''}`,
        category: sorted[0].category,
        cause: `Multiple: ${sorted.map(d => d.cause).join(' + ')}`,
        confidence: Math.min(...sorted.map(d => d.confidence)),
        evidence: sorted.flatMap(d => d.evidence),
        rule_ids: sorted.flatMap(d => d.rule_ids),
        severity: maxSeverity(sorted.map(d => d.severity)),
        requires_immediate_action: sorted.some(d => d.requires_immediate_action)
      };
      return {
        primary_diagnosis: merged,
        secondary_diagnoses: [],
        resolution_reason: pattern.reason,
        confidence_in_resolution: merged.confidence,
        requires_clarification: false,
        all_considered: sorted
      };
    
    case 'CLARIFY':
      return {
        primary_diagnosis: sorted[0], // Tentative
        secondary_diagnoses: sorted.slice(1),
        resolution_reason: pattern.reason,
        confidence_in_resolution: sorted[0].confidence * 0.5,
        requires_clarification: true,
        clarification_question: generateClarificationQuestion(sorted, state),
        clarification_options: generateClarificationOptions(sorted, state),
        all_considered: sorted
      };
    
    default:
      return {
        primary_diagnosis: sorted[0],
        secondary_diagnoses: sorted.slice(1),
        resolution_reason: 'Default priority resolution',
        confidence_in_resolution: sorted[0].confidence,
        requires_clarification: false,
        all_considered: sorted
      };
  }
}

function applyContextualResolution(
  sorted: Diagnosis[],
  state: CanonicalState
): DiagnosisConflictResult {
  // Context-aware adjustments
  
  // 1. If recent heavy rainfall + yellowing → likely water stress, not nutrient
  if (state.rainfall_recent === RainfallRecent.EXCESSIVE || state.rainfall_recent === RainfallRecent.HEAVY) {
    const waterStress = sorted.find(d => d.category === DiagnosisCategory.WATER_STRESS);
    if (waterStress) {
      return {
        primary_diagnosis: waterStress,
        secondary_diagnoses: sorted.filter(d => d.id !== waterStress.id),
        resolution_reason: 'Recent heavy rainfall indicates water stress as primary cause',
        confidence_in_resolution: Math.min(waterStress.confidence * 1.2, 1.0),
        requires_clarification: false,
        all_considered: sorted
      };
    }
  }
  
  // 2. If NDVI sharply declining + visual symptoms → disease/pest more likely than nutrient
  if (state.ndvi_trend === NDVITrend.SHARP_DECLINE) {
    const diseasePest = sorted.find(d => 
      d.category === DiagnosisCategory.DISEASE || d.category === DiagnosisCategory.PEST
    );
    if (diseasePest) {
      return {
        primary_diagnosis: diseasePest,
        secondary_diagnoses: sorted.filter(d => d.id !== diseasePest.id),
        resolution_reason: 'Sharp NDVI decline suggests active disease or pest attack',
        confidence_in_resolution: Math.min(diseasePest.confidence * 1.1, 1.0),
        requires_clarification: false,
        all_considered: sorted
      };
    }
  }
  
  // 3. If soil test shows deficiency + yellowing → nutrient deficiency confirmed
  if (state.soil_nitrogen === SoilNitrogen.VERY_LOW || state.soil_nitrogen === SoilNitrogen.LOW) {
    const nutrient = sorted.find(d => d.category === DiagnosisCategory.NUTRIENT_DEFICIENCY);
    if (nutrient) {
      return {
        primary_diagnosis: nutrient,
        secondary_diagnoses: sorted.filter(d => d.id !== nutrient.id),
        resolution_reason: 'Soil test confirms nutrient deficiency',
        confidence_in_resolution: Math.min(nutrient.confidence * 1.3, 1.0),
        requires_clarification: false,
        all_considered: sorted
      };
    }
  }
  
  // 4. Low confidence on all diagnoses → ask for clarification
  if (sorted.every(d => d.confidence < 0.5)) {
    return {
      primary_diagnosis: sorted[0],
      secondary_diagnoses: sorted.slice(1),
      resolution_reason: 'Low confidence on all diagnoses',
      confidence_in_resolution: sorted[0].confidence,
      requires_clarification: true,
      clarification_question: generateClarificationQuestion(sorted, state),
      clarification_options: generateClarificationOptions(sorted, state),
      all_considered: sorted
    };
  }
  
  // 5. Default: return highest priority/confidence
  return {
    primary_diagnosis: sorted[0],
    secondary_diagnoses: sorted.slice(1),
    resolution_reason: `Selected based on priority (${sorted[0].category}) and confidence (${(sorted[0].confidence * 100).toFixed(0)}%)`,
    confidence_in_resolution: sorted[0].confidence,
    requires_clarification: sorted[0].confidence < 0.6,
    all_considered: sorted
  };
}

function generateClarificationQuestion(
  diagnoses: Diagnosis[],
  state: CanonicalState
): string {
  const categories = [...new Set(diagnoses.map(d => d.category))];
  
  // Pest vs Disease ambiguity
  if (categories.includes(DiagnosisCategory.PEST) && categories.includes(DiagnosisCategory.DISEASE)) {
    return 'कीड दिसत आहे की फक्त डाग/दाग दिसत आहेत?';
  }
  
  // Water vs Nutrient ambiguity
  if (categories.includes(DiagnosisCategory.WATER_STRESS) && categories.includes(DiagnosisCategory.NUTRIENT_DEFICIENCY)) {
    return 'माती कोरडी आहे की ओली? सर्व झाडे सारखीच प्रभावित आहेत का?';
  }
  
  // Weather stress
  if (categories.includes(DiagnosisCategory.WEATHER_STRESS)) {
    return 'ही समस्या अलीकडील गरमी/थंडी/पाऊस नंतर सुरू झाली का?';
  }
  
  // Default
  return 'कृपया प्रभावित पानाचा/झाडाचा फोटो पाठवा.';
}

function generateClarificationOptions(
  diagnoses: Diagnosis[],
  state: CanonicalState
): string[] {
  const categories = [...new Set(diagnoses.map(d => d.category))];
  
  // Pest vs Disease ambiguity
  if (categories.includes(DiagnosisCategory.PEST) && categories.includes(DiagnosisCategory.DISEASE)) {
    return [
      'किडे/अळी दिसत आहेत',
      'फक्त डाग/बुरशी दिसते',
      'दोन्ही दिसत आहेत',
      'फोटो पाठवतो'
    ];
  }
  
  // Water vs Nutrient ambiguity
  if (categories.includes(DiagnosisCategory.WATER_STRESS) && categories.includes(DiagnosisCategory.NUTRIENT_DEFICIENCY)) {
    return [
      'माती कोरडी आहे',
      'माती ओली/पाणी साचले आहे',
      'काही ठिकाणी पिवळे, काही ठिकाणी हिरवे',
      'सर्व पिवळे पडत आहे'
    ];
  }
  
  // Default options
  return [
    'होय, हे बरोबर आहे',
    'नाही, वेगळे आहे',
    'फोटो पाठवतो'
  ];
}

// ==================== RULE DEDUPLICATION ====================

export interface RuleMatch {
  rule_id: string;
  category: DiagnosisCategory;
  cause: string;
  confidence: number;
  source: string;
}

export function deduplicateRules(matches: RuleMatch[]): RuleMatch[] {
  const seen = new Map<string, RuleMatch>();
  
  for (const match of matches) {
    const key = `${match.cause}_${match.category}`;
    const existing = seen.get(key);
    
    if (!existing || match.confidence > existing.confidence) {
      seen.set(key, match);
    }
  }
  
  return Array.from(seen.values());
}

// ==================== CREATE DIAGNOSES FROM RULES ====================

export function createDiagnosesFromRules(
  matches: RuleMatch[],
  state: CanonicalState
): Diagnosis[] {
  const deduplicated = deduplicateRules(matches);
  
  return deduplicated.map(match => ({
    id: match.rule_id,
    category: match.category,
    cause: match.cause,
    confidence: match.confidence,
    evidence: [`Rule: ${match.rule_id}`, `Source: ${match.source}`],
    rule_ids: [match.rule_id],
    severity: state.severity,
    requires_immediate_action: match.category === DiagnosisCategory.SAFETY || 
                               match.category === DiagnosisCategory.DISEASE
  }));
}

// ==================== EXPORTS ====================

export const DiagnosisConflictResolver = {
  resolve: resolveDiagnosisConflicts,
  deduplicateRules,
  createDiagnoses: createDiagnosesFromRules,
  DiagnosisCategory,
  CATEGORY_PRIORITY
};
