/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONFLICT RESOLVER RULES - Production-Grade Action Conflict Resolution
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * BACKEND-ONLY: This module contains proprietary conflict resolution rules.
 * 
 * CONFLICT CATEGORIES:
 * 1. Weather-based (rain, wind, temperature)
 * 2. Priority-based (water before fertilizer)
 * 3. Farming mode (organic/conventional)
 * 4. Confidence-based (low data quality)
 * 5. Mutual exclusion (can't do both)
 * 6. Safety constraints (PHI, REI, temperature)
 * 7. Labor/cost optimization
 * 8. Stage-based restrictions
 * 
 * Version: 1.0.0
 */

import {
  Action,
  Cause,
  FarmingMode,
  WeatherState,
  ActionUrgency,
  CropStage,
  SoilMoistureState,
  PrioritizedAction
} from '../types.ts';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export type ConflictCategory = 
  | 'weather'
  | 'priority'
  | 'farming_mode'
  | 'confidence'
  | 'mutual_exclusion'
  | 'safety'
  | 'labor_cost'
  | 'stage';

export interface DecisionInput {
  farming_mode: FarmingMode;
  weather_state: WeatherState;
  weather_forecast_3day: WeatherState[];
  data_confidence: {
    ndvi: number;
    soil: number;
  };
  soil_states: {
    moisture?: SoilMoistureState;
  };
  crop_stage?: CropStage;
}

export interface EnhancedConflictRule {
  rule_id: string;
  category: ConflictCategory;
  priority_order: number;
  description: string;
  explanation: string;
  safety_critical: boolean;
  condition: (actions: PrioritizedAction[], input: DecisionInput) => boolean;
  resolution: (actions: PrioritizedAction[], input: DecisionInput) => PrioritizedAction[];
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTION - Check organic compatibility
// ═══════════════════════════════════════════════════════════════════════════

function isOrganicCompatible(action: Action): boolean {
  const ORGANIC_COMPATIBLE: Action[] = [
    Action.MONITOR_CLOSELY,
    Action.WAIT_AND_WATCH,
    Action.SCOUT_FIELD,
    Action.APPLY_NEEM_OIL,
    Action.APPLY_BIO_CONTROL,
    Action.APPLY_BT_SPRAY,
    Action.APPLY_TRICHODERMA,
    Action.APPLY_ORGANIC_MANURE,
    Action.HAND_WEEDING,
    Action.MECHANICAL_WEEDING,
    Action.IRRIGATE_LIGHT,
    Action.IRRIGATE_IMMEDIATELY,
    Action.DRAIN_EXCESS_WATER,
    Action.FROST_PROTECTION,
  ];
  return ORGANIC_COMPATIBLE.includes(action);
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFLICT RULES - Comprehensive Production-Grade Set
// ═══════════════════════════════════════════════════════════════════════════

export const CONFLICT_RULES: EnhancedConflictRule[] = [
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 1: SAFETY CRITICAL (Cannot be overridden)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    rule_id: 'CONF_ORGANIC_ABSOLUTE',
    category: 'safety',
    priority_order: 1,
    description: 'Absolute filter: No chemicals for organic farmers',
    explanation: 'Chemical inputs removed - your farm is certified organic',
    safety_critical: true,
    condition: (_, input) => input.farming_mode === FarmingMode.ORGANIC_ONLY,
    resolution: (actions, _) => {
      const filtered = actions.filter(a => isOrganicCompatible(a.action));
      
      if (filtered.length === 0 && actions.length > 0) {
        return [{
          action: Action.SCOUT_FIELD,
          priority: 7,
          reason: Cause.COMPOUND_STRESS,
          rule_id: 'CONF_ORGANIC_ABSOLUTE',
          justification_key: 'action.scout.organic_alternative_needed',
          scientific_source: 'NPOP Guidelines',
          urgency: ActionUrgency.WITHIN_24H
        }];
      }
      
      return filtered;
    }
  },

  {
    rule_id: 'CONF_EXTREME_HEAT_SAFETY',
    category: 'safety',
    priority_order: 2,
    description: 'Farmer safety: Postpone field work in extreme heat',
    explanation: 'Field work postponed for your safety - temperature too high',
    safety_critical: true,
    condition: (_, input) => input.weather_state === WeatherState.HEAT_STRESS,
    resolution: (actions, _) => {
      const laborIntensive: Action[] = [
        Action.HAND_WEEDING,
        Action.MECHANICAL_WEEDING,
        Action.APPLY_ORGANIC_MANURE,
        Action.APPLY_LIME,
        Action.APPLY_GYPSUM
      ];
      
      return actions.map(a => {
        if (laborIntensive.includes(a.action)) {
          return {
            ...a,
            urgency: ActionUrgency.WITHIN_3DAYS,
            priority: Math.max(1, a.priority - 2),
            justification_key: `${a.justification_key}.delayed_heat_safety`
          };
        }
        return a;
      });
    }
  },

  {
    rule_id: 'CONF_FROST_PRIORITY',
    category: 'safety',
    priority_order: 3,
    description: 'Frost risk takes absolute priority',
    explanation: 'Frost protection is urgent - other activities can wait',
    safety_critical: true,
    condition: (_, input) => input.weather_state === WeatherState.FROST_RISK,
    resolution: (actions, _) => {
      return actions.map(a => {
        if (a.action === Action.FROST_PROTECTION || a.action === Action.LIGHT_IRRIGATION_COOLING) {
          return { ...a, priority: 10, urgency: ActionUrgency.IMMEDIATE };
        }
        if (a.priority < 9) {
          return { ...a, priority: Math.max(1, a.priority - 3), urgency: ActionUrgency.WITHIN_3DAYS };
        }
        return a;
      });
    }
  },

  {
    rule_id: 'CONF_HAILSTORM_EMERGENCY',
    category: 'safety',
    priority_order: 4,
    description: 'Hailstorm risk - consider emergency harvest',
    explanation: 'Hailstorm warning - harvest may be urgent if crop is mature',
    safety_critical: true,
    condition: (_, input) => 
      input.weather_state === WeatherState.HAILSTORM_RISK &&
      (input.crop_stage === CropStage.MATURITY || input.crop_stage === CropStage.HARVEST),
    resolution: (actions, _) => {
      const hasHarvest = actions.some(a => 
        a.action === Action.EARLY_HARVEST || a.action === Action.SALVAGE_HARVEST
      );
      
      if (!hasHarvest) {
        return [
          {
            action: Action.EARLY_HARVEST,
            priority: 10,
            reason: Cause.TOTAL_CROP_LOSS_RISK,
            rule_id: 'CONF_HAILSTORM_EMERGENCY',
            justification_key: 'action.early_harvest.hailstorm_risk',
            scientific_source: 'IMD Weather Advisory',
            urgency: ActionUrgency.IMMEDIATE
          },
          ...actions
        ];
      }
      return actions;
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 2: WEATHER-BASED CONFLICTS
  // ═══════════════════════════════════════════════════════════════════════════

  {
    rule_id: 'CONF_RAIN_IRRIGATION',
    category: 'weather',
    priority_order: 10,
    description: 'Skip irrigation when rain is expected within 24-48 hours',
    explanation: 'Irrigation skipped - rain expected within 24-48 hours',
    safety_critical: false,
    condition: (_, input) => 
      input.weather_state === WeatherState.RAIN_EXPECTED ||
      input.weather_forecast_3day.some(w => 
        w === WeatherState.RAIN_EXPECTED || w === WeatherState.RAIN_ACTIVE
      ),
    resolution: (actions, _) => {
      return actions.filter(a => {
        if (a.action === Action.IRRIGATE_LIGHT || a.action === Action.IRRIGATE_IMMEDIATELY) {
          return a.priority >= 10;
        }
        return true;
      }).map(a => {
        if (a.action === Action.EMERGENCY_IRRIGATION) {
          return { ...a, justification_key: `${a.justification_key}.despite_rain` };
        }
        return a;
      });
    }
  },

  {
    rule_id: 'CONF_RAIN_SPRAY',
    category: 'weather',
    priority_order: 11,
    description: 'Delay spray applications during active rain',
    explanation: 'Spray delayed - rain will wash off chemicals',
    safety_critical: false,
    condition: (_, input) => input.weather_state === WeatherState.RAIN_ACTIVE,
    resolution: (actions, _) => {
      const sprayActions: Action[] = [
        Action.APPLY_FUNGICIDE, Action.APPLY_INSECTICIDE, Action.APPLY_NEEM_OIL,
        Action.HERBICIDE_POST_EMERGENCE, Action.HERBICIDE_PRE_EMERGENCE,
        Action.FOLIAR_SPRAY, Action.APPLY_BT_SPRAY
      ];
      
      return actions.map(a => {
        if (sprayActions.includes(a.action)) {
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

  {
    rule_id: 'CONF_WIND_SPRAY',
    category: 'weather',
    priority_order: 12,
    description: 'Delay spray applications during strong wind (>15 km/h)',
    explanation: 'Spray postponed - wind too strong, risk of drift',
    safety_critical: false,
    condition: (_, input) => input.weather_state === WeatherState.STRONG_WIND,
    resolution: (actions, _) => {
      const sprayActions: Action[] = [
        Action.APPLY_FUNGICIDE, Action.APPLY_INSECTICIDE, Action.APPLY_NEEM_OIL,
        Action.HERBICIDE_POST_EMERGENCE, Action.FOLIAR_SPRAY
      ];
      
      return actions.map(a => {
        if (sprayActions.includes(a.action)) {
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

  {
    rule_id: 'CONF_HUMIDITY_FUNGICIDE',
    category: 'weather',
    priority_order: 13,
    description: 'High humidity increases disease risk - prioritize fungicide',
    explanation: 'High humidity detected - fungicide application more urgent',
    safety_critical: false,
    condition: (actions, input) => 
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      actions.some(a => a.action === Action.APPLY_FUNGICIDE || a.action === Action.APPLY_TRICHODERMA),
    resolution: (actions, _) => {
      return actions.map(a => {
        if (a.action === Action.APPLY_FUNGICIDE || a.action === Action.APPLY_TRICHODERMA) {
          return {
            ...a,
            priority: Math.min(10, a.priority + 2),
            urgency: ActionUrgency.WITHIN_24H,
            justification_key: `${a.justification_key}.high_humidity`
          };
        }
        return a;
      });
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 3: PRIORITY-BASED CONFLICTS (Resource Sequencing)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    rule_id: 'CONF_WATER_BEFORE_FERTILIZER',
    category: 'priority',
    priority_order: 20,
    description: 'Address water stress before fertilizer application',
    explanation: 'Irrigate first - fertilizer works better with adequate moisture',
    safety_critical: false,
    condition: (actions, _) => {
      const hasWaterStress = actions.some(a => 
        [Cause.WATER_STRESS_CRITICAL, Cause.WATER_STRESS_MODERATE, 
         Cause.DROUGHT_STRESS, Cause.WATER_STRESS_MILD].includes(a.reason)
      );
      const hasNutrientAction = actions.some(a =>
        [Action.APPLY_NITROGEN, Action.APPLY_PHOSPHORUS, Action.APPLY_POTASSIUM,
         Action.APPLY_ZINC, Action.APPLY_MICRONUTRIENTS].includes(a.action)
      );
      return hasWaterStress && hasNutrientAction;
    },
    resolution: (actions, _) => {
      const fertilizerActions: Action[] = [
        Action.APPLY_NITROGEN, Action.APPLY_PHOSPHORUS, Action.APPLY_POTASSIUM,
        Action.APPLY_ZINC, Action.APPLY_MICRONUTRIENTS, Action.FOLIAR_SPRAY
      ];
      
      return actions.map(a => {
        if (fertilizerActions.includes(a.action)) {
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

  {
    rule_id: 'CONF_PROTECTION_BEFORE_NUTRITION',
    category: 'priority',
    priority_order: 21,
    description: 'Address pest/disease before nutrition',
    explanation: 'Pest control first - plants cannot absorb nutrients when damaged',
    safety_critical: false,
    condition: (actions, _) => {
      const hasCriticalPest = actions.some(a => 
        a.priority >= 8 && 
        [Action.APPLY_INSECTICIDE, Action.APPLY_FUNGICIDE, Action.EMERGENCY_SPRAY,
         Action.APPLY_BIO_CONTROL, Action.APPLY_BT_SPRAY].includes(a.action)
      );
      const hasNutrientAction = actions.some(a =>
        [Action.APPLY_NITROGEN, Action.APPLY_PHOSPHORUS, Action.APPLY_POTASSIUM].includes(a.action)
      );
      return hasCriticalPest && hasNutrientAction;
    },
    resolution: (actions, _) => {
      return actions.map(a => {
        if ([Action.APPLY_NITROGEN, Action.APPLY_PHOSPHORUS, Action.APPLY_POTASSIUM].includes(a.action)) {
          return {
            ...a,
            priority: Math.max(1, a.priority - 2),
            urgency: ActionUrgency.WITHIN_3DAYS,
            justification_key: `${a.justification_key}.after_pest_control`
          };
        }
        return a;
      });
    }
  },

  {
    rule_id: 'CONF_WEED_BEFORE_FERTILIZER',
    category: 'priority',
    priority_order: 22,
    description: 'Control weeds before fertilizer application',
    explanation: 'Weed control first - fertilizer will also feed weeds',
    safety_critical: false,
    condition: (actions, _) => {
      const hasWeedAction = actions.some(a => 
        [Action.HAND_WEEDING, Action.MECHANICAL_WEEDING, 
         Action.HERBICIDE_POST_EMERGENCE].includes(a.action)
      );
      const hasNutrientAction = actions.some(a =>
        a.action === Action.APPLY_NITROGEN
      );
      return hasWeedAction && hasNutrientAction;
    },
    resolution: (actions, _) => {
      return actions.map(a => {
        if ([Action.HAND_WEEDING, Action.MECHANICAL_WEEDING, 
             Action.HERBICIDE_POST_EMERGENCE].includes(a.action)) {
          return { ...a, priority: Math.min(10, a.priority + 1) };
        }
        if (a.action === Action.APPLY_NITROGEN) {
          return {
            ...a,
            priority: Math.max(1, a.priority - 2),
            justification_key: `${a.justification_key}.after_weeding`
          };
        }
        return a;
      });
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 4: CONFIDENCE-BASED CONFLICTS
  // ═══════════════════════════════════════════════════════════════════════════

  {
    rule_id: 'CONF_LOW_CONFIDENCE',
    category: 'confidence',
    priority_order: 30,
    description: 'Add monitoring for low confidence situations',
    explanation: 'Data quality is low - recommending field inspection before action',
    safety_critical: false,
    condition: (_, input) => 
      input.data_confidence.ndvi < 0.5 && 
      input.data_confidence.soil < 0.5,
    resolution: (actions, _) => {
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

      const hasMonitoring = modifiedActions.some(a => 
        [Action.MONITOR_CLOSELY, Action.WAIT_AND_WATCH, Action.SCOUT_FIELD].includes(a.action)
      );

      if (!hasMonitoring) {
        modifiedActions.push({
          action: Action.SCOUT_FIELD,
          priority: 7,
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

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 5: MUTUAL EXCLUSION CONFLICTS
  // ═══════════════════════════════════════════════════════════════════════════

  {
    rule_id: 'CONF_DUPLICATE_ACTIONS',
    category: 'mutual_exclusion',
    priority_order: 40,
    description: 'Remove duplicate actions, keep highest priority',
    explanation: 'Duplicate recommendation removed',
    safety_critical: false,
    condition: (actions, _) => {
      const actionCounts = new Map<Action, number>();
      for (const a of actions) {
        actionCounts.set(a.action, (actionCounts.get(a.action) || 0) + 1);
      }
      return Array.from(actionCounts.values()).some(count => count > 1);
    },
    resolution: (actions, _) => {
      const seenActions = new Map<Action, PrioritizedAction>();
      
      for (const action of actions) {
        const existing = seenActions.get(action.action);
        if (!existing || action.priority > existing.priority) {
          seenActions.set(action.action, action);
        }
      }

      return Array.from(seenActions.values());
    }
  },

  {
    rule_id: 'CONF_DRAIN_IRRIGATE',
    category: 'mutual_exclusion',
    priority_order: 42,
    description: 'Cannot both drain and irrigate',
    explanation: 'Field cannot be drained and irrigated simultaneously',
    safety_critical: false,
    condition: (actions, _) => {
      const hasDrain = actions.some(a => 
        [Action.DRAIN_FIELD, Action.DRAIN_EXCESS_WATER].includes(a.action)
      );
      const hasIrrigate = actions.some(a => 
        [Action.IRRIGATE_IMMEDIATELY, Action.IRRIGATE_LIGHT, Action.IRRIGATE_HEAVY,
         Action.EMERGENCY_IRRIGATION].includes(a.action)
      );
      return hasDrain && hasIrrigate;
    },
    resolution: (actions, _) => {
      const drainActions = actions.filter(a => 
        [Action.DRAIN_FIELD, Action.DRAIN_EXCESS_WATER].includes(a.action)
      );
      const irrigateActions = actions.filter(a => 
        [Action.IRRIGATE_IMMEDIATELY, Action.IRRIGATE_LIGHT, Action.IRRIGATE_HEAVY,
         Action.EMERGENCY_IRRIGATION].includes(a.action)
      );

      const maxDrainPriority = Math.max(...drainActions.map(a => a.priority));
      const maxIrrigatePriority = Math.max(...irrigateActions.map(a => a.priority));

      if (maxDrainPriority >= maxIrrigatePriority) {
        return actions.filter(a => 
          ![Action.IRRIGATE_IMMEDIATELY, Action.IRRIGATE_LIGHT, Action.IRRIGATE_HEAVY,
            Action.EMERGENCY_IRRIGATION].includes(a.action)
        );
      } else {
        return actions.filter(a => 
          ![Action.DRAIN_FIELD, Action.DRAIN_EXCESS_WATER].includes(a.action)
        );
      }
    }
  },

  {
    rule_id: 'CONF_WATERLOG_IRRIGATION',
    category: 'mutual_exclusion',
    priority_order: 44,
    description: 'Do not irrigate waterlogged fields',
    explanation: 'Field already waterlogged - drainage needed, not irrigation',
    safety_critical: false,
    condition: (actions, input) => {
      const hasIrrigation = actions.some(a => 
        [Action.IRRIGATE_IMMEDIATELY, Action.IRRIGATE_LIGHT, Action.IRRIGATE_HEAVY].includes(a.action)
      );
      return hasIrrigation && input.soil_states.moisture === SoilMoistureState.WATERLOGGED;
    },
    resolution: (actions, _) => {
      let filtered = actions.filter(a => 
        ![Action.IRRIGATE_IMMEDIATELY, Action.IRRIGATE_LIGHT, Action.IRRIGATE_HEAVY].includes(a.action)
      );
      
      const hasDrain = filtered.some(a => 
        [Action.DRAIN_FIELD, Action.DRAIN_EXCESS_WATER].includes(a.action)
      );
      
      if (!hasDrain) {
        filtered.push({
          action: Action.DRAIN_EXCESS_WATER,
          priority: 8,
          reason: Cause.WATERLOGGING,
          rule_id: 'CONF_WATERLOG_IRRIGATION',
          justification_key: 'action.drain.waterlogged',
          scientific_source: 'ICAR Drainage Guidelines',
          urgency: ActionUrgency.IMMEDIATE
        });
      }
      
      return filtered;
    }
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// CONFLICT RESOLVER FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export function resolveConflicts(
  actions: PrioritizedAction[],
  input: DecisionInput
): { resolved: PrioritizedAction[]; appliedRules: string[]; explanations: string[] } {
  const appliedRules: string[] = [];
  const explanations: string[] = [];
  let currentActions = [...actions];

  // Sort rules by priority_order
  const sortedRules = [...CONFLICT_RULES].sort((a, b) => a.priority_order - b.priority_order);

  for (const rule of sortedRules) {
    if (rule.condition(currentActions, input)) {
      currentActions = rule.resolution(currentActions, input);
      appliedRules.push(rule.rule_id);
      explanations.push(rule.explanation);
    }
  }

  return {
    resolved: currentActions,
    appliedRules,
    explanations
  };
}
