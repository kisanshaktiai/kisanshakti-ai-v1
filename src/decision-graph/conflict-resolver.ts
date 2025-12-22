/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONFLICT RESOLVER - Action Conflict Resolution
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Resolves conflicts between multiple recommended actions.
 * Uses priority-based and rule-based conflict resolution.
 * 
 * Examples:
 * - Rain expected → Remove irrigation actions
 * - Water stress + N deficiency → Irrigate first, fertilize later
 * - Organic mode → Replace chemical actions with organic
 * 
 * Version: 1.0.0
 */

import {
  DecisionInput,
  PrioritizedAction,
  Action,
  Cause,
  ConflictRule,
  FarmingMode,
  WeatherState,
  ActionUrgency
} from './types';
import { isOrganicCompatible } from './decision-mapper';

// ═══════════════════════════════════════════════════════════════════════════
// CONFLICT RULES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Conflict resolution rules
 * Applied in order - first matching rule wins
 */
const CONFLICT_RULES: ConflictRule[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // WEATHER-BASED CONFLICTS
  // ─────────────────────────────────────────────────────────────────────────
  
  // CONF_001: Rain expected → Remove irrigation actions
  {
    rule_id: 'CONF_RAIN_IRRIGATION',
    description: 'Skip irrigation when rain is expected within 24-48 hours',
    condition: (_, input) => 
      input.weather_state === WeatherState.RAIN_EXPECTED ||
      input.weather_forecast_3day.some(w => w === WeatherState.RAIN_EXPECTED || w === WeatherState.RAIN_ACTIVE),
    resolution: (actions, _) => {
      // Filter out non-critical irrigation actions
      return actions.filter(a => {
        if (a.action === Action.IRRIGATE_LIGHT || a.action === Action.IRRIGATE_IMMEDIATELY) {
          // Keep only if it's an emergency
          return a.priority >= 10;
        }
        return true;
      }).map(a => {
        // Add note to remaining irrigation actions
        if (a.action === Action.EMERGENCY_IRRIGATION) {
          return {
            ...a,
            justification_key: `${a.justification_key}.despite_rain`
          };
        }
        return a;
      });
    }
  },

  // CONF_002: Rain active → Delay all spray actions
  {
    rule_id: 'CONF_RAIN_SPRAY',
    description: 'Delay spray applications during active rain',
    condition: (_, input) => input.weather_state === WeatherState.RAIN_ACTIVE,
    resolution: (actions, _) => {
      return actions.map(a => {
        if ([Action.APPLY_FUNGICIDE, Action.APPLY_INSECTICIDE, Action.APPLY_NEEM_OIL, 
             Action.HERBICIDE_POST_EMERGENCE, Action.HERBICIDE_PRE_EMERGENCE,
             Action.FOLIAR_SPRAY].includes(a.action)) {
          return {
            ...a,
            action: Action.DELAY_SPRAY,
            priority: Math.max(1, a.priority - 2),
            justification_key: 'action.delay_spray.rain_active'
          };
        }
        return a;
      });
    }
  },

  // CONF_003: Strong wind → Delay spray actions
  {
    rule_id: 'CONF_WIND_SPRAY',
    description: 'Delay spray applications during strong wind',
    condition: (_, input) => input.weather_state === WeatherState.STRONG_WIND,
    resolution: (actions, _) => {
      return actions.map(a => {
        if ([Action.APPLY_FUNGICIDE, Action.APPLY_INSECTICIDE, Action.APPLY_NEEM_OIL,
             Action.HERBICIDE_POST_EMERGENCE].includes(a.action)) {
          return {
            ...a,
            action: Action.DELAY_SPRAY,
            priority: Math.max(1, a.priority - 1),
            justification_key: 'action.delay_spray.strong_wind'
          };
        }
        return a;
      });
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PRIORITY-BASED CONFLICTS
  // ─────────────────────────────────────────────────────────────────────────

  // CONF_004: Water stress + Nutrient deficiency → Irrigate first
  {
    rule_id: 'CONF_WATER_BEFORE_FERTILIZER',
    description: 'Address water stress before fertilizer application',
    condition: (actions, _) => {
      const hasWaterAction = actions.some(a => 
        a.reason === Cause.WATER_STRESS_CRITICAL ||
        a.reason === Cause.WATER_STRESS_MODERATE ||
        a.reason === Cause.DROUGHT_STRESS
      );
      const hasNutrientAction = actions.some(a =>
        a.reason === Cause.NITROGEN_DEFICIENCY ||
        a.reason === Cause.NITROGEN_DEFICIENCY_CRITICAL ||
        a.reason === Cause.PHOSPHORUS_DEFICIENCY ||
        a.reason === Cause.POTASSIUM_DEFICIENCY
      );
      return hasWaterAction && hasNutrientAction;
    },
    resolution: (actions, _) => {
      return actions.map(a => {
        // Reduce priority of fertilizer actions
        if ([Action.APPLY_NITROGEN, Action.APPLY_PHOSPHORUS, Action.APPLY_POTASSIUM].includes(a.action)) {
          return {
            ...a,
            priority: Math.max(1, a.priority - 3),
            urgency: ActionUrgency.WITHIN_3DAYS,
            justification_key: `${a.justification_key}.after_irrigation`
          };
        }
        return a;
      });
    }
  },

  // CONF_005: Waterlogging + Irrigation recommended → Remove irrigation
  {
    rule_id: 'CONF_WATERLOG_IRRIGATION',
    description: 'Do not irrigate waterlogged fields',
    condition: (actions, input) => {
      const hasIrrigation = actions.some(a => 
        [Action.IRRIGATE_IMMEDIATELY, Action.IRRIGATE_LIGHT, Action.IRRIGATE_HEAVY].includes(a.action)
      );
      const isWaterlogged = input.soil_states.moisture === 'WATERLOGGED';
      return hasIrrigation && isWaterlogged;
    },
    resolution: (actions, _) => {
      return actions.filter(a => 
        ![Action.IRRIGATE_IMMEDIATELY, Action.IRRIGATE_LIGHT, Action.IRRIGATE_HEAVY].includes(a.action)
      );
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // FARMING MODE CONFLICTS
  // ─────────────────────────────────────────────────────────────────────────

  // CONF_006: Organic mode → Filter out chemical actions
  {
    rule_id: 'CONF_ORGANIC_MODE',
    description: 'Remove chemical inputs for organic farming mode',
    condition: (_, input) => input.farming_mode === FarmingMode.ORGANIC_ONLY,
    resolution: (actions, _) => {
      return actions.filter(a => isOrganicCompatible(a.action));
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CONFIDENCE-BASED CONFLICTS
  // ─────────────────────────────────────────────────────────────────────────

  // CONF_007: Low confidence → Add monitoring, reduce non-critical actions
  {
    rule_id: 'CONF_LOW_CONFIDENCE',
    description: 'Add monitoring for low confidence situations',
    condition: (_, input) => 
      input.data_confidence.ndvi < 0.5 && 
      input.data_confidence.soil < 0.5,
    resolution: (actions, _) => {
      // Downgrade non-critical actions
      let modifiedActions = actions.map(a => {
        if (a.priority < 8) {
          return {
            ...a,
            priority: Math.max(1, a.priority - 2),
            urgency: ActionUrgency.WITHIN_WEEK
          };
        }
        return a;
      });

      // Add monitoring action if not present
      const hasMonitoring = modifiedActions.some(a => 
        a.action === Action.MONITOR_CLOSELY || 
        a.action === Action.WAIT_AND_WATCH ||
        a.action === Action.SCOUT_FIELD
      );

      if (!hasMonitoring) {
        modifiedActions.push({
          action: Action.SCOUT_FIELD,
          priority: 6,
          reason: Cause.UNCERTAIN_CRITICAL,
          rule_id: 'CONF_LOW_CONFIDENCE',
          justification_key: 'action.scout.low_confidence',
          scientific_source: 'System',
          urgency: ActionUrgency.WITHIN_24H
        });
      }

      return modifiedActions;
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // DUPLICATE ACTION CONFLICTS
  // ─────────────────────────────────────────────────────────────────────────

  // CONF_008: Duplicate actions → Keep highest priority
  {
    rule_id: 'CONF_DUPLICATE_ACTIONS',
    description: 'Remove duplicate actions, keep highest priority',
    condition: (actions, _) => {
      const actionCounts = new Map<Action, number>();
      for (const a of actions) {
        actionCounts.set(a.action, (actionCounts.get(a.action) || 0) + 1);
      }
      return Array.from(actionCounts.values()).some(count => count > 1);
    },
    resolution: (actions, _) => {
      const seenActions = new Map<Action, PrioritizedAction>();
      
      // Keep highest priority for each action
      for (const action of actions) {
        const existing = seenActions.get(action.action);
        if (!existing || action.priority > existing.priority) {
          seenActions.set(action.action, action);
        }
      }

      return Array.from(seenActions.values());
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // MUTUALLY EXCLUSIVE ACTIONS
  // ─────────────────────────────────────────────────────────────────────────

  // CONF_009: Skip vs Apply nitrogen → Can't do both
  {
    rule_id: 'CONF_NITROGEN_SKIP_APPLY',
    description: 'Cannot both skip and apply nitrogen',
    condition: (actions, _) => {
      const hasApply = actions.some(a => a.action === Action.APPLY_NITROGEN);
      const hasSkip = actions.some(a => a.action === Action.SKIP_NITROGEN);
      return hasApply && hasSkip;
    },
    resolution: (actions, _) => {
      // Find which has higher priority
      const applyAction = actions.find(a => a.action === Action.APPLY_NITROGEN);
      const skipAction = actions.find(a => a.action === Action.SKIP_NITROGEN);
      
      if (applyAction && skipAction) {
        // Keep the one with higher priority
        if (skipAction.priority >= applyAction.priority) {
          return actions.filter(a => a.action !== Action.APPLY_NITROGEN);
        } else {
          return actions.filter(a => a.action !== Action.SKIP_NITROGEN);
        }
      }
      return actions;
    }
  },

  // CONF_010: Drain vs Irrigate → Can't do both
  {
    rule_id: 'CONF_DRAIN_IRRIGATE',
    description: 'Cannot both drain and irrigate',
    condition: (actions, _) => {
      const hasDrain = actions.some(a => 
        a.action === Action.DRAIN_FIELD || a.action === Action.DRAIN_EXCESS_WATER
      );
      const hasIrrigate = actions.some(a => 
        [Action.IRRIGATE_IMMEDIATELY, Action.IRRIGATE_LIGHT, Action.IRRIGATE_HEAVY, 
         Action.EMERGENCY_IRRIGATION].includes(a.action)
      );
      return hasDrain && hasIrrigate;
    },
    resolution: (actions, _) => {
      // Find highest priority action
      const drainActions = actions.filter(a => 
        a.action === Action.DRAIN_FIELD || a.action === Action.DRAIN_EXCESS_WATER
      );
      const irrigateActions = actions.filter(a => 
        [Action.IRRIGATE_IMMEDIATELY, Action.IRRIGATE_LIGHT, Action.IRRIGATE_HEAVY,
         Action.EMERGENCY_IRRIGATION].includes(a.action)
      );

      const maxDrainPriority = Math.max(...drainActions.map(a => a.priority));
      const maxIrrigatePriority = Math.max(...irrigateActions.map(a => a.priority));

      if (maxDrainPriority >= maxIrrigatePriority) {
        // Keep drain, remove irrigate
        return actions.filter(a => 
          ![Action.IRRIGATE_IMMEDIATELY, Action.IRRIGATE_LIGHT, Action.IRRIGATE_HEAVY,
            Action.EMERGENCY_IRRIGATION].includes(a.action)
        );
      } else {
        // Keep irrigate, remove drain
        return actions.filter(a => 
          a.action !== Action.DRAIN_FIELD && a.action !== Action.DRAIN_EXCESS_WATER
        );
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // STAGE-BASED CONFLICTS
  // ─────────────────────────────────────────────────────────────────────────

  // CONF_011: Post-harvest stage → Only storage/marketing actions
  {
    rule_id: 'CONF_POST_HARVEST',
    description: 'Limit actions for post-harvest stage',
    condition: (_, input) => input.crop_stage === 'POST_HARVEST',
    resolution: (actions, _) => {
      // Remove field actions, keep only relevant ones
      const allowedPostHarvest = [
        Action.CONTINUE_CURRENT,
        Action.CONSULT_EXPERT,
        Action.INSURANCE_CLAIM
      ];
      return actions.filter(a => allowedPostHarvest.includes(a.action));
    }
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// CONFLICT RESOLUTION ENGINE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Result of conflict resolution
 */
export interface ConflictResolutionResult {
  actions: PrioritizedAction[];
  conflictsResolved: string[];
  rulesApplied: string[];
}

/**
 * Resolve conflicts between actions
 * Applies conflict rules in order until no more matches
 * 
 * @param actions - Array of prioritized actions
 * @param input - Decision input
 * @returns Resolved actions and conflict info
 */
export function resolveConflicts(
  actions: PrioritizedAction[],
  input: DecisionInput
): ConflictResolutionResult {
  let currentActions = [...actions];
  const conflictsResolved: string[] = [];
  const rulesApplied: string[] = [];

  // Apply each conflict rule
  for (const rule of CONFLICT_RULES) {
    try {
      if (rule.condition(currentActions, input)) {
        const beforeCount = currentActions.length;
        currentActions = rule.resolution(currentActions, input);
        
        rulesApplied.push(rule.rule_id);
        
        // Track if resolution made changes
        if (currentActions.length !== beforeCount || 
            JSON.stringify(currentActions) !== JSON.stringify(actions)) {
          conflictsResolved.push(rule.description);
        }
      }
    } catch (error) {
      console.error(`Conflict rule ${rule.rule_id} failed:`, error);
    }
  }

  // Final sort by priority
  currentActions.sort((a, b) => b.priority - a.priority);

  // Limit to top 5 actions to avoid overwhelming farmer
  const topActions = currentActions.slice(0, 5);

  return {
    actions: topActions,
    conflictsResolved,
    rulesApplied
  };
}

/**
 * Get explanation for why an action was not recommended
 * Useful for "why NOT" explanations
 * 
 * @param action - Action that was filtered
 * @param input - Decision input
 * @returns Explanation string key
 */
export function getFilteredActionExplanation(
  action: Action,
  input: DecisionInput
): string | null {
  // Check common filter reasons
  if (input.weather_state === WeatherState.RAIN_EXPECTED) {
    if ([Action.IRRIGATE_LIGHT, Action.IRRIGATE_IMMEDIATELY].includes(action)) {
      return 'filter.irrigation.rain_expected';
    }
    if ([Action.APPLY_FUNGICIDE, Action.APPLY_INSECTICIDE].includes(action)) {
      return 'filter.spray.rain_expected';
    }
  }

  if (input.farming_mode === FarmingMode.ORGANIC_ONLY) {
    if (!isOrganicCompatible(action)) {
      return 'filter.action.not_organic';
    }
  }

  if (input.soil_states.moisture === 'WATERLOGGED') {
    if ([Action.IRRIGATE_LIGHT, Action.IRRIGATE_IMMEDIATELY, Action.IRRIGATE_HEAVY].includes(action)) {
      return 'filter.irrigation.waterlogged';
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export {
  CONFLICT_RULES
};
