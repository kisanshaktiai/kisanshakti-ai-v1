/**
 * Safety Guardian & Escalation Manager Types
 * Final safety checkpoint before agricultural advice reaches farmers
 */

// Safety Check Result
export interface SafetyCheck {
  check_id: string;
  decision_id: string;
  timestamp: string;
  
  safety_gates: {
    banned_substance_check: BannedSubstanceCheck;
    human_safety_check: HumanSafetyCheck;
    food_safety_check: FoodSafetyCheck;
    environmental_check: EnvironmentalCheck;
    regulatory_check: RegulatoryCheck;
  };
  
  overall_safety_status: SafetyStatus;
  blocking_reasons: string[];
  safer_alternatives: SaferAlternative[];
}

export type SafetyStatus = 'SAFE' | 'SAFE_WITH_CONDITIONS' | 'UNSAFE' | 'REQUIRES_EXPERT';

export interface SaferAlternative {
  alternative: string;
  product_name: string;
  why_safer: string;
  efficacy_tradeoff: string;
  cost_difference_inr?: number;
}

// Gate 1: Banned Substances
export interface BannedSubstanceCheck {
  passed: boolean;
  violations: BannedSubstanceViolation[];
  action: 'ALLOW' | 'BLOCK' | 'REQUIRE_SUBSTITUTION';
}

export interface BannedSubstanceViolation {
  substance: string;
  ban_reason: string;
  banned_since: string;
  legal_consequence?: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
}

// Gate 2: Human Safety
export interface HumanSafetyCheck {
  passed: boolean;
  risks: HumanSafetyRisk[];
  action: 'ALLOW' | 'ALLOW_WITH_WARNING' | 'REQUIRE_EXPERT_SUPERVISION' | 'BLOCK';
}

export interface HumanSafetyRisk {
  risk_type: 'ACUTE_TOXICITY' | 'POISONING_RISK' | 'SKIN_CONTACT' | 'INHALATION' | 'EYE_DAMAGE';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  who_toxicity_class: string;
  ppe_mandatory: string[];
  first_aid_measures: string[];
}

// Gate 3: Food Safety (PHI/MRL)
export interface FoodSafetyCheck {
  passed: boolean;
  violations: FoodSafetyViolation[];
  action: 'ALLOW' | 'DELAY_UNTIL_SAFE' | 'USE_SHORTER_PHI_ALTERNATIVE' | 'BLOCK';
}

export interface FoodSafetyViolation {
  issue: 'PHI_NOT_MET' | 'MRL_EXCEEDED' | 'EXPORT_RESTRICTION';
  chemical: string;
  days_to_harvest: number;
  withdrawal_period_required: number;
  gap_days: number;
  risk: string;
}

// Gate 4: Environmental Safety
export interface EnvironmentalCheck {
  passed: boolean;
  concerns: EnvironmentalConcern[];
  action: 'ALLOW' | 'ALLOW_WITH_PRECAUTIONS' | 'RECOMMEND_ALTERNATIVE' | 'BLOCK';
}

export interface EnvironmentalConcern {
  concern: 'POLLINATOR_RISK' | 'WATER_CONTAMINATION' | 'BENEFICIAL_INSECT_HARM' | 'SOIL_PERSISTENCE' | 'AQUATIC_TOXICITY';
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  mitigation_required: string[];
  buffer_zone_meters?: number;
}

// Gate 5: Regulatory Compliance
export interface RegulatoryCheck {
  passed: boolean;
  compliance_issues: RegulatoryIssue[];
  action: 'ALLOW' | 'REQUIRE_DOCUMENTATION' | 'REQUIRE_LICENSE' | 'BLOCK';
}

export interface RegulatoryIssue {
  regulation: string;
  requirement: string;
  current_status: 'COMPLIANT' | 'NON_COMPLIANT' | 'REQUIRES_VERIFICATION';
  reference?: string;
}

// Escalation Decision
export interface EscalationDecision {
  should_escalate: boolean;
  escalation_level: EscalationLevel;
  escalation_reasons: string[];
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  
  expert_needed: {
    type: ExpertType;
    reason: string;
    sla_response_hours: number;
  };
}

export type EscalationLevel = 'NONE' | 'ADVISORY' | 'REQUIRED' | 'EMERGENCY';
export type ExpertType = 'AGRONOMIST' | 'PATHOLOGIST' | 'ENTOMOLOGIST' | 'SAFETY_OFFICER' | 'VETERINARIAN' | 'TOXICOLOGIST';

// Emergency Protocol
export interface EmergencyProtocol {
  emergency_detected: boolean;
  emergency_type: EmergencyType | null;
  immediate_actions: string[];
  expert_escalation: {
    required: boolean;
    expert_type?: string;
    sla_minutes?: number;
  };
  farmer_safety_instructions: {
    mr: string;
    hi: string;
    en: string;
  };
}

export type EmergencyType = 'POISONING' | 'MASS_MORTALITY' | 'OUTBREAK' | 'WEATHER_DISASTER' | 'BANNED_SUBSTANCE_USED';

// PHI Enforcement
export interface PHIEnforcement {
  check_passed: boolean;
  days_to_harvest: number;
  withdrawal_period_required: number;
  safe_to_apply: boolean;
  violations: FoodSafetyViolation[];
  recommendation: 'ALLOW' | 'DELAY_APPLICATION' | 'USE_SHORTER_PHI_ALTERNATIVE' | 'BLOCK';
}

// Safety Verification Result (final output)
export interface SafetyVerificationResult {
  approved: boolean;
  safety_check: SafetyCheck;
  escalation_decision: EscalationDecision;
  modified_decision: any; // DecisionOutput with safety warnings added
  blocked_decision: BlockedDecisionMessage | null;
  emergency_protocol?: EmergencyProtocol;
}

export interface BlockedDecisionMessage {
  reason_mr: string;
  reason_hi: string;
  reason_en: string;
  blocking_rules: string[];
  alternatives: SaferAlternative[];
  expert_consultation_recommended: boolean;
}

// Banned Substances Database
export interface BannedSubstanceEntry {
  status: 'BANNED' | 'RESTRICTED' | 'HIGHLY_RESTRICTED';
  banned_since?: string;
  reason: string;
  use_cases_banned?: string;
  allowed_uses?: string[];
  restrictions?: string[];
  penalty?: string;
  global_status?: string;
}

// PHI Database Entry
export interface PHIDatabaseEntry {
  phi_days: number;
  mrl_safe: boolean;
  mrl_value_mg_kg?: number;
  export_restrictions?: string[];
}

// Constants
export const BANNED_SUBSTANCES_INDIA: Record<string, BannedSubstanceEntry> = {
  'MONOCROTOPHOS': {
    status: 'BANNED',
    banned_since: '2020-04-01',
    reason: 'High human toxicity, bird mortality',
    use_cases_banned: 'ALL',
    penalty: 'Criminal prosecution under Insecticides Act'
  },
  'ENDOSULFAN': {
    status: 'BANNED',
    banned_since: '2011-05-13',
    reason: 'Environmental persistence, neurological damage',
    use_cases_banned: 'ALL',
    global_status: 'Stockholm Convention banned'
  },
  'CARBOFURAN': {
    status: 'BANNED',
    banned_since: '2020-01-01',
    reason: 'Extreme toxicity, WHO Class Ib',
    use_cases_banned: 'ALL'
  },
  'PHORATE': {
    status: 'BANNED',
    banned_since: '2020-01-01',
    reason: 'Organophosphate, high acute toxicity',
    use_cases_banned: 'ALL'
  },
  'METHYL_PARATHION': {
    status: 'BANNED',
    banned_since: '2018-12-31',
    reason: 'WHO Class Ia - extremely hazardous',
    use_cases_banned: 'ALL'
  },
  'TRIAZOPHOS': {
    status: 'BANNED',
    banned_since: '2020-12-31',
    reason: 'High acute toxicity',
    use_cases_banned: 'ALL'
  },
  'CHLORPYRIFOS': {
    status: 'RESTRICTED',
    reason: 'Neurotoxicity concerns',
    allowed_uses: ['AGRICULTURE_WITH_LICENSE'],
    restrictions: [
      'Licensed applicator only',
      'Not during flowering',
      'PHI minimum 15 days',
      'Buffer zone 50m from water'
    ]
  },
  'ALUMINUM_PHOSPHIDE': {
    status: 'HIGHLY_RESTRICTED',
    reason: 'Generates phosphine gas - lethal if misused',
    allowed_uses: ['Fumigation only'],
    restrictions: [
      'Certified pest control operator only',
      'Sealed storage application',
      'Mandatory safety training',
      'Medical facility within 30 minutes'
    ]
  },
  'DICOFOL': {
    status: 'BANNED',
    banned_since: '2020-01-01',
    reason: 'Organochlorine, environmental persistence',
    use_cases_banned: 'ALL'
  }
};

export const PHI_DATABASE: Record<string, PHIDatabaseEntry> = {
  'NEEM_OIL': { phi_days: 1, mrl_safe: true },
  'BEAUVERIA_BASSIANA': { phi_days: 0, mrl_safe: true },
  'BACILLUS_THURINGIENSIS': { phi_days: 0, mrl_safe: true },
  'TRICHODERMA': { phi_days: 0, mrl_safe: true },
  'IMIDACLOPRID': { phi_days: 21, mrl_safe: true, mrl_value_mg_kg: 0.5 },
  'CHLORPYRIFOS': { phi_days: 15, mrl_safe: true, mrl_value_mg_kg: 0.2 },
  'CYPERMETHRIN': { phi_days: 7, mrl_safe: true, mrl_value_mg_kg: 0.5 },
  'LAMBDA_CYHALOTHRIN': { phi_days: 7, mrl_safe: true, mrl_value_mg_kg: 0.3 },
  'SPINOSAD': { phi_days: 3, mrl_safe: true, mrl_value_mg_kg: 0.3 },
  'THIAMETHOXAM': { phi_days: 14, mrl_safe: true, mrl_value_mg_kg: 0.2 },
  'ACETAMIPRID': { phi_days: 7, mrl_safe: true, mrl_value_mg_kg: 0.3 },
  'MANCOZEB': { phi_days: 21, mrl_safe: true, mrl_value_mg_kg: 3.0 },
  'COPPER_OXYCHLORIDE': { phi_days: 7, mrl_safe: true, mrl_value_mg_kg: 20.0 },
  'CARBENDAZIM': { phi_days: 14, mrl_safe: true, mrl_value_mg_kg: 0.5 },
  'PROPICONAZOLE': { phi_days: 14, mrl_safe: true, mrl_value_mg_kg: 0.5 }
};

export const EMERGENCY_KEYWORDS = {
  poisoning: ['विष', 'poison', 'बेहोश', 'unconscious', 'उलटी', 'vomiting', 'मृत्यू', 'चक्कर', 'dizziness'],
  mass_death: ['मरत', 'मृत्यू', 'death', 'सर्व', 'all dying', 'सगळे', 'पूर्ण नष्ट'],
  banned_used: ['एंडोसल्फान', 'endosulfan', 'मोनोक्रोटोफॉस', 'monocrotophos', 'कार्बोफ्युरान', 'carbofuran']
};

export const WHO_TOXICITY_CLASSES: Record<string, { class: string; description: string; color: string }> = {
  'Ia': { class: 'Ia', description: 'Extremely Hazardous', color: 'red' },
  'Ib': { class: 'Ib', description: 'Highly Hazardous', color: 'red' },
  'II': { class: 'II', description: 'Moderately Hazardous', color: 'orange' },
  'III': { class: 'III', description: 'Slightly Hazardous', color: 'yellow' },
  'U': { class: 'U', description: 'Unlikely to Present Acute Hazard', color: 'green' }
};

export const SAFETY_THRESHOLDS = {
  MIN_CONFIDENCE_FOR_CHEMICAL: 0.75,
  MIN_CONFIDENCE_FOR_BIOLOGICAL: 0.60,
  MAX_FAILED_TREATMENTS_BEFORE_ESCALATION: 2,
  HIGH_VALUE_CROP_THRESHOLD_INR: 200000,
  LARGE_AREA_THRESHOLD_ACRES: 10,
  PHI_BUFFER_DAYS: 2 // Extra buffer for safety
};

export const ESCALATION_SLA_HOURS = {
  EMERGENCY: 2,
  REQUIRED: 24,
  ADVISORY: 72
};
