/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WORLD-CLASS FOLLOW-UP GENERATOR
 * Day-by-Day Follow-up Plans for Farmer Actions
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Generate specific follow-up timelines so farmers know what to expect when.
 * No more "continue monitoring" without specific dates.
 * 
 * EXAMPLE OUTPUT:
 * 📅 Follow-up Plan:
 * | Day 3:    | Check for new dead hearts |
 * | Day 7:    | 70%+ improvement expected |
 * | Day 14:   | Second Trichogramma release |
 * | Day 21+:  | Weekly Trichogramma continues |
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const FOLLOW_UP_GENERATOR_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface FollowUpAction {
  day: number;
  action: string;
  action_en: string;
  is_critical: boolean;
  expected_outcome?: string;
}

export interface FollowUpPlan {
  pest_or_disease: string;
  treatment_applied: string;
  actions: FollowUpAction[];
  expected_recovery_days: number;
  recovery_indicator: string;
}

export interface RealisticExpectation {
  will_recover: string[];
  will_not_recover: string[];
  expected_yield_impact_percent: number;
  timeline_days: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// FOLLOW-UP TEMPLATES BY PEST/DISEASE
// ═══════════════════════════════════════════════════════════════════════════

const FOLLOW_UP_TEMPLATES: Record<string, FollowUpAction[]> = {
  'SHOOT_BORER': [
    { day: 3, action: 'Check for new dead hearts', action_en: 'Check for new dead hearts', is_critical: true },
    { day: 7, action: 'Expect 70% reduction in new damage', action_en: 'Expect 70% reduction in new damage', is_critical: false, expected_outcome: 'No new dead hearts appearing' },
    { day: 14, action: 'Second Trichogramma release if using biocontrol', action_en: 'Second Trichogramma release', is_critical: true },
    { day: 21, action: 'Weekly biocontrol releases continue until harvest', action_en: 'Weekly Trichogramma releases continue', is_critical: false }
  ],
  'TERMITE': [
    { day: 2, action: 'Check soil moisture around treated area', action_en: 'Check soil moisture around treated area', is_critical: true },
    { day: 5, action: 'Look for reduced termite activity (less white soil)', action_en: 'Less white soil = reduced termite activity', is_critical: true },
    { day: 10, action: 'Check plant recovery - new roots should appear', action_en: 'Check if new roots are developing', is_critical: false },
    { day: 21, action: 'Repeat treatment if termite activity persists', action_en: 'Repeat treatment if termites persist', is_critical: true }
  ],
  'APHID': [
    { day: 2, action: 'Check for reduced aphid population', action_en: 'Check for reduced aphid numbers', is_critical: true },
    { day: 5, action: 'New leaves should be aphid-free', action_en: 'New leaves should be aphid-free', is_critical: false, expected_outcome: 'Clean new growth' },
    { day: 10, action: 'Monitor for re-infestation', action_en: 'Monitor for re-infestation', is_critical: false }
  ],
  'NITROGEN_DEFICIENCY': [
    { day: 7, action: 'Lower leaves should show less yellowing', action_en: 'Lower leaves should be less yellow', is_critical: false },
    { day: 14, action: 'New leaves should be dark green', action_en: 'New leaves should be dark green', is_critical: true, expected_outcome: 'Dark green new growth' },
    { day: 21, action: 'Apply second split dose if needed', action_en: 'Apply second split dose if needed', is_critical: false }
  ],
  'DEFAULT': [
    { day: 3, action: 'Check for initial improvement', action_en: 'Check for initial improvement', is_critical: true },
    { day: 7, action: 'Visible improvement expected', action_en: 'Visible improvement expected', is_critical: false },
    { day: 14, action: 'Reassess if problem persists', action_en: 'Reassess if problem persists', is_critical: true }
  ]
};

// ═══════════════════════════════════════════════════════════════════════════
// REALISTIC EXPECTATIONS BY PROBLEM
// ═══════════════════════════════════════════════════════════════════════════

const REALISTIC_EXPECTATIONS: Record<string, RealisticExpectation> = {
  'SHOOT_BORER': {
    will_recover: [
      'New tillers will form',
      'Undamaged canes will continue growing',
      'New infestation will be prevented'
    ],
    will_not_recover: [
      'Already dead hearts (shoots)',
      'Damaged internodes'
    ],
    expected_yield_impact_percent: 15,
    timeline_days: 21
  },
  'TERMITE': {
    will_recover: [
      'Surviving plants with partial root damage',
      'Plants with new root growth'
    ],
    will_not_recover: [
      'Completely dead plants (100% root damage)',
      'Plants that pull out easily'
    ],
    expected_yield_impact_percent: 10,
    timeline_days: 14
  },
  'NITROGEN_DEFICIENCY': {
    will_recover: [
      'New leaves will be green',
      'Plant vigor will improve'
    ],
    will_not_recover: [
      'Already yellowed old leaves (may fall)'
    ],
    expected_yield_impact_percent: 5,
    timeline_days: 14
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// GENERATE FOLLOW-UP PLAN
// ═══════════════════════════════════════════════════════════════════════════

export function generateFollowUpPlan(
  pestOrDisease: string,
  treatmentApplied: string
): FollowUpPlan {
  const normalizedPest = pestOrDisease.toUpperCase().replace(/[_-]/g, '_');
  
  // Get template or default
  const actions = FOLLOW_UP_TEMPLATES[normalizedPest] || FOLLOW_UP_TEMPLATES['DEFAULT'];
  const expectations = REALISTIC_EXPECTATIONS[normalizedPest];
  
  return {
    pest_or_disease: pestOrDisease,
    treatment_applied: treatmentApplied,
    actions,
    expected_recovery_days: expectations?.timeline_days || 14,
    recovery_indicator: expectations?.will_recover[0] || 'Improvement in plant health'
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// FORMAT FOLLOW-UP PLAN FOR DISPLAY
// ═══════════════════════════════════════════════════════════════════════════

export function formatFollowUpPlan(
  plan: FollowUpPlan,
  _language: string
): string {
  let output = `\n📅 Follow-up Plan:\n`;
  output += '─'.repeat(40) + '\n';
  
  for (const action of plan.actions) {
    const critical = action.is_critical ? ' ⚠️' : '';
    output += `| Day ${action.day}:`.padEnd(12) + `| ${action.action_en}${critical}\n`;
  }
  
  output += '─'.repeat(40);
  
  return output;
}

// ═══════════════════════════════════════════════════════════════════════════
// FORMAT REALISTIC EXPECTATIONS
// ═══════════════════════════════════════════════════════════════════════════

export function formatRealisticExpectations(
  pestOrDisease: string,
  _language: string
): string {
  const normalizedPest = pestOrDisease.toUpperCase().replace(/[_-]/g, '_');
  const expectations = REALISTIC_EXPECTATIONS[normalizedPest];
  
  if (!expectations) {
    return '';
  }
  
  let output = `\n🎯 Expected Outcome:\n`;
  output += `✓ Will happen:\n`;
  for (const item of expectations.will_recover) {
    output += `  - ${item}\n`;
  }
  output += `✗ Won't happen:\n`;
  for (const item of expectations.will_not_recover) {
    output += `  - ${item}\n`;
  }
  output += `⚠️ Expected yield impact: ~${expectations.expected_yield_impact_percent}%\n`;
  
  return output;
}

// ═══════════════════════════════════════════════════════════════════════════
// GENERATE COMPLETE FOLLOW-UP SECTION
// ═══════════════════════════════════════════════════════════════════════════

export function generateCompleteFollowUp(
  pestOrDisease: string,
  treatmentApplied: string,
  language: string
): string {
  const plan = generateFollowUpPlan(pestOrDisease, treatmentApplied);
  
  let output = formatFollowUpPlan(plan, language);
  output += '\n' + formatRealisticExpectations(pestOrDisease, language);
  
  return output;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export default {
  generateFollowUpPlan,
  formatFollowUpPlan,
  formatRealisticExpectations,
  generateCompleteFollowUp,
  FOLLOW_UP_GENERATOR_VERSION
};
