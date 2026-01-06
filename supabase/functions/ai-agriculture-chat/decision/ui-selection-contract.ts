/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UI SELECTION CONTRACT - Decision Brain Controlled UI Logic
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Defines the strict contract between the Decision Brain and the UI layer.
 * The Decision Brain ALONE decides what the UI renders.
 * 
 * CORE PRINCIPLE:
 * The Decision Brain controls:
 * - Whether clarification is needed
 * - What the clarification question should be
 * - Whether the clarification allows single choice or multiple choice
 * - What alternative actions are available (image upload, field observation guide)
 * 
 * The UI and LLM must NEVER infer or override this logic.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const UI_SELECTION_CONTRACT_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// SELECTION TYPE ENUM
// ═══════════════════════════════════════════════════════════════════════════

export enum SelectionType {
  SINGLE_CHOICE = 'single_choice',   // Radio buttons - only ONE observation can be true
  MULTIPLE_CHOICE = 'multiple_choice' // Checkboxes - multiple conditions can co-exist
}

// ═══════════════════════════════════════════════════════════════════════════
// CLARIFICATION OPTION INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

export interface ClarificationOption {
  id: string;                    // Unique identifier
  text: string;                  // Display text (in farmer's language)
  translation?: string;          // English translation for audit
  icon?: string;                 // Optional emoji/icon
  observationKey: string;        // Maps to ObservationKey enum
  mutuallyExclusiveWith?: string[]; // Option IDs that cannot be selected together
}

export interface AlternativeAction {
  id: string;
  text: string;
  translation?: string;
  icon?: string;
  action: 'trigger_image_upload' | 'trigger_voice_input' | 'trigger_expert_call' | 'show_observation_guide';
}

// ═══════════════════════════════════════════════════════════════════════════
// DECISION BRAIN OUTPUT CONTRACT (Sent to UI)
// ═══════════════════════════════════════════════════════════════════════════

export interface DecisionBrainClarificationOutput {
  responseType: 'clarification_required' | 'decision_provided' | 'information_only';
  
  // Question text in farmer's language
  question: string;
  questionTranslation?: string;
  
  // Selection type - UI MUST respect this
  selectionType: SelectionType;
  maxSelections: number;        // For multi-select, how many allowed
  
  // Options - UI renders exactly these
  options: ClarificationOption[];
  
  // Alternative actions (image upload, etc.)
  alternativeActions?: AlternativeAction[];
  
  // Context for display (helps farmer understand)
  context?: string;
  
  // Metadata for audit
  scope: string;
  turn_count: number;
  gate_status: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// UI RESPONSE CONTRACT (Sent back to Decision Brain)
// ═══════════════════════════════════════════════════════════════════════════

export interface UIClarificationResponse {
  session_id: string;
  question_id: string;
  
  // Selected options (IDs)
  selected_option_ids: string[];
  
  // Mapped observation keys (from selected options)
  observation_keys: string[];
  
  // Was "Not Sure" selected?
  not_sure_selected: boolean;
  
  // Alternative action taken (if any)
  alternative_action_taken?: string;
  
  // Free text (if allowed)
  free_text?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SCOPE TO SELECTION TYPE MAPPING (Deterministic)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * SINGLE-CHOICE SCOPES
 * Use when: Only ONE observation can be true at a time
 * UI: Radio buttons or single-select cards
 */
export const SINGLE_CHOICE_SCOPES = new Set([
  'IDENTIFY_INSECT_BEHAVIOR',   // Flying OR Crawling (never both simultaneously)
  'IDENTIFY_DISTRIBUTION',      // Clustered OR Scattered (primary pattern)
  'IDENTIFY_SEVERITY',          // Low OR Medium OR High
  'IDENTIFY_TIMING',            // Recent OR Week OR Long
  'IDENTIFY_LOCATION',          // Leaves OR Stem OR Roots (primary location)
  'IDENTIFY_CROP'               // Only one crop at a time
]);

/**
 * MULTIPLE-CHOICE SCOPES
 * Use when: Multiple conditions can genuinely co-exist
 * UI: Checkboxes or multi-select cards
 */
export const MULTIPLE_CHOICE_SCOPES = new Set([
  'IDENTIFY_PLANT_RESPONSE',    // Yellowing + Wilting + Spots (all can occur together)
  'IDENTIFY_SYMPTOMS',          // Multiple symptoms can co-exist
  'IDENTIFY_ACTIONS_TAKEN'      // Farmer may have done multiple things
]);

// ═══════════════════════════════════════════════════════════════════════════
// MUTUALLY EXCLUSIVE OPTION RULES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Options that CANNOT be selected together.
 * If user selects both → trigger conflict resolution.
 */
export const MUTUAL_EXCLUSION_RULES: Record<string, string[]> = {
  'INSECT_BEHAVIOR_FLYING': ['INSECT_BEHAVIOR_CRAWLING', 'INSECT_BEHAVIOR_JUMPING'],
  'INSECT_BEHAVIOR_CRAWLING': ['INSECT_BEHAVIOR_FLYING', 'INSECT_BEHAVIOR_JUMPING'],
  'DISTRIBUTION_UNIFORM': ['DISTRIBUTION_PATCHY', 'DISTRIBUTION_EDGE', 'DISTRIBUTION_CENTER'],
  'DISTRIBUTION_PATCHY': ['DISTRIBUTION_UNIFORM'],
  'DROUGHT_STRESS': ['WATERLOGGING'],
  'WATERLOGGING': ['DROUGHT_STRESS'],
  'SEVERITY_LOW': ['SEVERITY_HIGH'],
  'SEVERITY_HIGH': ['SEVERITY_LOW']
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the selection type for a clarification scope.
 * Decision Brain determines this, not the UI.
 */
export function getSelectionTypeForScope(scope: string): SelectionType {
  if (SINGLE_CHOICE_SCOPES.has(scope)) {
    return SelectionType.SINGLE_CHOICE;
  }
  if (MULTIPLE_CHOICE_SCOPES.has(scope)) {
    return SelectionType.MULTIPLE_CHOICE;
  }
  // Default to single choice (safer)
  return SelectionType.SINGLE_CHOICE;
}

/**
 * Validate multi-select response for conflicts.
 * Returns conflicting pairs if any found.
 */
export function validateMultiSelectResponse(
  selectedKeys: string[]
): {
  valid: boolean;
  conflicts: Array<{ key1: string; key2: string; reason: string }>;
  needsResolution: boolean;
} {
  const conflicts: Array<{ key1: string; key2: string; reason: string }> = [];
  
  for (const key of selectedKeys) {
    const exclusions = MUTUAL_EXCLUSION_RULES[key];
    if (exclusions) {
      for (const otherKey of selectedKeys) {
        if (exclusions.includes(otherKey)) {
          conflicts.push({
            key1: key,
            key2: otherKey,
            reason: `${key} and ${otherKey} are mutually exclusive`
          });
        }
      }
    }
  }
  
  // Remove duplicates (A-B and B-A are same conflict)
  const uniqueConflicts = conflicts.filter((c, i) => {
    return !conflicts.slice(0, i).some(
      prev => (prev.key1 === c.key2 && prev.key2 === c.key1)
    );
  });
  
  return {
    valid: uniqueConflicts.length === 0,
    conflicts: uniqueConflicts,
    needsResolution: uniqueConflicts.length > 0
  };
}

/**
 * Handle "Select All" behavior.
 * If farmer selects all options → treat as non-specific.
 */
export function handleSelectAllBehavior(
  selectedCount: number,
  totalOptions: number
): {
  isSelectAll: boolean;
  treatAs: 'NON_SPECIFIC' | 'NORMAL';
  message?: string;
} {
  if (selectedCount >= totalOptions - 1) { // All or all-but-one
    return {
      isSelectAll: true,
      treatAs: 'NON_SPECIFIC',
      message: 'You selected most/all options. This means the issue is widespread or mixed. Would you like to send a photo for more accurate diagnosis?'
    };
  }
  
  return {
    isSelectAll: false,
    treatAs: 'NORMAL'
  };
}

/**
 * Build conflict resolution question for mutually exclusive selections.
 */
export function buildConflictResolutionQuestion(
  conflicts: Array<{ key1: string; key2: string }>,
  language: 'mr' | 'hi' | 'en'
): {
  question: string;
  options: ClarificationOption[];
} {
  const conflict = conflicts[0]; // Handle first conflict
  
  const templates: Record<string, { question: string; options: string[] }> = {
    mr: {
      question: `तुम्ही दोन विरोधी पर्याय निवडले. कृपया स्पष्ट करा:`,
      options: ['दोन वेगवेगळे किडे आहेत', 'मी चुकीचा पर्याय निवडला', 'खात्री नाही']
    },
    hi: {
      question: `आपने दो विरोधी विकल्प चुने। कृपया स्पष्ट करें:`,
      options: ['दो अलग-अलग कीट हैं', 'मैंने गलत विकल्प चुना', 'निश्चित नहीं']
    },
    en: {
      question: `You selected two conflicting options. Please clarify:`,
      options: ['There are two different pests', 'I selected wrong option', 'Not sure']
    }
  };
  
  const t = templates[language] || templates.en;
  
  return {
    question: t.question,
    options: t.options.map((text, i) => ({
      id: `conflict_option_${i}`,
      text,
      observationKey: i === 0 ? 'MULTIPLE_PESTS' : i === 1 ? 'CORRECTION_NEEDED' : 'UNSURE'
    }))
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// UI RENDERING RULES (What UI MUST and MUST NOT do)
// ═══════════════════════════════════════════════════════════════════════════

export const UI_RENDERING_RULES = {
  MUST_DO: [
    'Render exactly the selection type specified (single vs multiple)',
    'Display all options with icons and text',
    'Show alternative actions if provided',
    'Return selected option_id to backend (not just text)',
    'Handle multi-select validation on submit',
    'Respect maxSelections limit',
    'Include observationKey in response'
  ],
  
  MUST_NOT_DO: [
    'Change selection type (single → multiple or vice versa)',
    'Add or remove options',
    'Infer agronomic meaning from selections',
    'Allow more selections than maxSelections specifies',
    'Skip sending observationKey metadata',
    'Make treatment recommendations',
    'Display pest/disease names not in options'
  ]
};

/**
 * Validate that UI response follows the contract.
 */
export function validateUIResponse(
  originalOutput: DecisionBrainClarificationOutput,
  uiResponse: UIClarificationResponse
): {
  valid: boolean;
  violations: string[];
} {
  const violations: string[] = [];
  
  // Check selection count
  if (originalOutput.selectionType === SelectionType.SINGLE_CHOICE) {
    if (uiResponse.selected_option_ids.length > 1) {
      violations.push('SINGLE_CHOICE_VIOLATION: Multiple options selected for single-choice question');
    }
  }
  
  // Check max selections
  if (uiResponse.selected_option_ids.length > originalOutput.maxSelections) {
    violations.push(`MAX_SELECTIONS_VIOLATION: Selected ${uiResponse.selected_option_ids.length} options, max allowed is ${originalOutput.maxSelections}`);
  }
  
  // Check all selected IDs are valid
  const validIds = new Set(originalOutput.options.map(o => o.id));
  for (const id of uiResponse.selected_option_ids) {
    if (!validIds.has(id)) {
      violations.push(`INVALID_OPTION_ID: ${id} is not a valid option`);
    }
  }
  
  return {
    valid: violations.length === 0,
    violations
  };
}
