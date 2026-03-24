/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONFLICT RESOLVER - Production-Grade Action Conflict Resolution
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Resolves conflicts between multiple recommended actions using deterministic
 * rules. This is critical for farmer safety and trust.
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
 * CRITICAL: Every conflict resolution MUST be explainable to the farmer
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
  ActionUrgency,
  CropStage,
  SoilMoistureState
} from './types';
import { isOrganicCompatible } from './decision-mapper';

// ═══════════════════════════════════════════════════════════════════════════
// ENHANCED CONFLICT RULE INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

export interface EnhancedConflictRule extends ConflictRule {
  category: ConflictCategory;
  priority_order: number;  // Lower = applied first
  explanation: string;     // Farmer-facing explanation
  safety_critical: boolean; // If true, cannot be overridden
}

export type ConflictCategory = 
  | 'weather'
  | 'priority'
  | 'farming_mode'
  | 'confidence'
  | 'mutual_exclusion'
  | 'safety'
  | 'labor_cost'
  | 'stage';

// ═══════════════════════════════════════════════════════════════════════════
// CONFLICT RULES - Comprehensive Production-Grade Set
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Conflict resolution rules - ordered by priority
 * Lower priority_order = applied first
 */
export const CONFLICT_RULES: EnhancedConflictRule[] = [
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 1: SAFETY CRITICAL (Cannot be overridden)
  // ═══════════════════════════════════════════════════════════════════════════

  // SAFETY_001: Organic mode absolute filter
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
      
      // If all actions were chemical, add organic monitoring
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

  // SAFETY_002: Heat stress - no field work above 42°C
  {
    rule_id: 'CONF_EXTREME_HEAT_SAFETY',
    category: 'safety',
    priority_order: 2,
    description: 'Farmer safety: Postpone field work in extreme heat',
    explanation: 'Field work postponed for your safety - temperature too high',
    safety_critical: true,
    condition: (_, input) => input.weather_state === WeatherState.HEAT_STRESS,
    resolution: (actions, _) => {
      // Remove field work requiring physical labor in heat
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

  // SAFETY_003: Frost risk - protect crop first
  {
    rule_id: 'CONF_FROST_PRIORITY',
    category: 'safety',
    priority_order: 3,
    description: 'Frost risk takes absolute priority',
    explanation: 'Frost protection is urgent - other activities can wait',
    safety_critical: true,
    condition: (_, input) => input.weather_state === WeatherState.FROST_RISK,
    resolution: (actions, _) => {
      // Boost frost protection, delay everything else
      return actions.map(a => {
        if (a.action === Action.FROST_PROTECTION || a.action === Action.LIGHT_IRRIGATION_COOLING) {
          return { ...a, priority: 10, urgency: ActionUrgency.IMMEDIATE };
        }
        // Delay non-emergency actions
        if (a.priority < 9) {
          return { ...a, priority: Math.max(1, a.priority - 3), urgency: ActionUrgency.WITHIN_3DAYS };
        }
        return a;
      });
    }
  },

  // SAFETY_004: Hailstorm risk - emergency harvest if mature
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

  // WEATHER_001: Rain expected → Remove irrigation
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
        // Keep only emergency irrigation
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

  // WEATHER_002: Rain active → Delay all spray actions
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

  // WEATHER_003: Strong wind → Delay spray (drift risk)
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

  // WEATHER_004: High humidity → Boost fungicide priority
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

  // PRIORITY_001: Water stress + Nutrient deficiency → Irrigate first
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

  // PRIORITY_002: Critical pest/disease → Address before nutrient
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

  // PRIORITY_003: Weed competition → Address before fertilizer (feeds weeds)
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
      // Boost weed control, delay nitrogen
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

  // CONFIDENCE_001: Low overall confidence → Add monitoring
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

      // Add scouting action if not present
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

  // CONFIDENCE_002: Very low NDVI confidence → Don't trust NDVI-based causes
  {
    rule_id: 'CONF_LOW_NDVI_CONFIDENCE',
    category: 'confidence',
    priority_order: 31,
    description: 'Low NDVI confidence - reduce NDVI-based action priority',
    explanation: 'NDVI data may be unreliable - verify in field',
    safety_critical: false,
    condition: (_, input) => input.data_confidence.ndvi < 0.3,
    resolution: (actions, _) => {
      // NDVI-based stress causes that should be treated with caution
      const ndviBasedCauses: Cause[] = [
        Cause.CROP_FAILURE_IMMINENT, Cause.WATER_STRESS_CRITICAL, Cause.COMPOUND_STRESS
      ];
      
      return actions.map(a => {
        // This is a rough heuristic - in production, track which causes came from NDVI
        if (a.priority >= 9 && a.reason.toString().includes('STRESS')) {
          return {
            ...a,
            priority: Math.max(5, a.priority - 3),
            justification_key: `${a.justification_key}.verify_ndvi`
          };
        }
        return a;
      });
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 5: MUTUAL EXCLUSION CONFLICTS
  // ═══════════════════════════════════════════════════════════════════════════

  // MUTUAL_001: Duplicate actions → Keep highest priority
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

  // MUTUAL_002: Skip vs Apply nitrogen
  {
    rule_id: 'CONF_NITROGEN_SKIP_APPLY',
    category: 'mutual_exclusion',
    priority_order: 41,
    description: 'Cannot both skip and apply nitrogen',
    explanation: 'Conflicting nitrogen recommendations resolved by priority',
    safety_critical: false,
    condition: (actions, _) => {
      return actions.some(a => a.action === Action.APPLY_NITROGEN) &&
             actions.some(a => a.action === Action.SKIP_NITROGEN);
    },
    resolution: (actions, _) => {
      const applyAction = actions.find(a => a.action === Action.APPLY_NITROGEN);
      const skipAction = actions.find(a => a.action === Action.SKIP_NITROGEN);
      
      if (applyAction && skipAction) {
        if (skipAction.priority >= applyAction.priority) {
          return actions.filter(a => a.action !== Action.APPLY_NITROGEN);
        } else {
          return actions.filter(a => a.action !== Action.SKIP_NITROGEN);
        }
      }
      return actions;
    }
  },

  // MUTUAL_003: Drain vs Irrigate
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

  // MUTUAL_004: Hand weeding vs Herbicide
  {
    rule_id: 'CONF_WEED_METHOD',
    category: 'mutual_exclusion',
    priority_order: 43,
    description: 'Choose one weed control method',
    explanation: 'Single weed control method recommended based on situation',
    safety_critical: false,
    condition: (actions, _) => {
      const hasManual = actions.some(a => 
        [Action.HAND_WEEDING, Action.MECHANICAL_WEEDING].includes(a.action)
      );
      const hasChemical = actions.some(a => 
        [Action.HERBICIDE_POST_EMERGENCE, Action.HERBICIDE_PRE_EMERGENCE].includes(a.action)
      );
      return hasManual && hasChemical;
    },
    resolution: (actions, input) => {
      // For organic, always prefer manual
      if (input.farming_mode === FarmingMode.ORGANIC_ONLY) {
        return actions.filter(a => 
          ![Action.HERBICIDE_POST_EMERGENCE, Action.HERBICIDE_PRE_EMERGENCE].includes(a.action)
        );
      }
      
      // Otherwise, keep highest priority weed action
      const weedActions = actions.filter(a => 
        [Action.HAND_WEEDING, Action.MECHANICAL_WEEDING,
         Action.HERBICIDE_POST_EMERGENCE, Action.HERBICIDE_PRE_EMERGENCE].includes(a.action)
      );
      
      if (weedActions.length === 0) return actions;
      
      const bestWeed = weedActions.reduce((best, curr) => 
        curr.priority > best.priority ? curr : best
      );
      
      return actions.filter(a => 
        ![Action.HAND_WEEDING, Action.MECHANICAL_WEEDING,
          Action.HERBICIDE_POST_EMERGENCE, Action.HERBICIDE_PRE_EMERGENCE].includes(a.action) ||
        a.action === bestWeed.action
      );
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 6: WATERLOGGING CONFLICTS
  // ═══════════════════════════════════════════════════════════════════════════

  // WATERLOG_001: Waterlogged → No irrigation
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
      
      // Add drainage if not present
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

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 7: LABOR/COST OPTIMIZATION
  // ═══════════════════════════════════════════════════════════════════════════

  // LABOR_001: Too many actions → Prioritize and batch
  {
    rule_id: 'CONF_ACTION_OVERLOAD',
    category: 'labor_cost',
    priority_order: 50,
    description: 'Limit actions to prevent farmer overwhelm',
    explanation: 'Prioritized top 5 most urgent actions to focus your efforts',
    safety_critical: false,
    condition: (actions, _) => actions.length > 7,
    resolution: (actions, _) => {
      // Group similar actions that can be done together
      const batchedActions = batchSimilarActions(actions);
      return batchedActions.slice(0, 7);
    }
  },

  // LABOR_002: Cost-sensitive farmer → Prefer lower cost alternatives
  {
    rule_id: 'CONF_COST_SENSITIVE',
    category: 'labor_cost',
    priority_order: 51,
    description: 'Prefer lower cost alternatives for cost-sensitive farmers',
    explanation: 'Lower cost option recommended based on your preferences',
    safety_critical: false,
    condition: (_, input) => 
      input.farmer_profile?.cost_sensitivity === 'high',
    resolution: (actions, _) => {
      return actions.map(a => {
        if (a.lower_cost_alternative && a.priority < 9) {
          return {
            ...a,
            action: a.lower_cost_alternative,
            justification_key: `${a.justification_key}.cost_optimized`
          };
        }
        return a;
      });
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 8: STAGE-BASED CONFLICTS
  // ═══════════════════════════════════════════════════════════════════════════

  // STAGE_001: Planning stage → Only planning actions
  {
    rule_id: 'CONF_PLANNING_STAGE',
    category: 'stage',
    priority_order: 60,
    description: 'Planning stage - only pre-sowing activities',
    explanation: 'Pre-sowing stage - field preparation and planning recommended',
    safety_critical: false,
    condition: (_, input) => input.crop_stage === CropStage.PLANNING,
    resolution: (actions, _) => {
      const planningActions = [
        Action.SOIL_TEST, Action.CONSULT_EXPERT, Action.CONTINUE_CURRENT,
        Action.STALE_SEEDBED
      ];
      
      const filtered = actions.filter(a => planningActions.includes(a.action));
      
      if (filtered.length === 0) {
        return [{
          action: Action.SOIL_TEST,
          priority: 7,
          reason: Cause.OPTIMAL_GROWTH,
          rule_id: 'CONF_PLANNING_STAGE',
          justification_key: 'action.soil_test.planning',
          scientific_source: 'ICAR Soil Testing',
          urgency: ActionUrgency.WITHIN_WEEK
        }];
      }
      
      return filtered;
    }
  },

  // STAGE_002: Post-harvest stage → Only storage/residue actions
  {
    rule_id: 'CONF_POST_HARVEST',
    category: 'stage',
    priority_order: 61,
    description: 'Post-harvest stage - only post-harvest activities',
    explanation: 'Crop harvested - focus on storage and next season preparation',
    safety_critical: false,
    condition: (_, input) => input.crop_stage === CropStage.POST_HARVEST,
    resolution: (actions, _) => {
      const postHarvestActions = [
        Action.CONTINUE_CURRENT, Action.CONSULT_EXPERT, Action.INSURANCE_CLAIM,
        Action.APPLY_ORGANIC_MANURE, Action.SOIL_TEST
      ];
      
      const filtered = actions.filter(a => postHarvestActions.includes(a.action));
      
      if (filtered.length === 0) {
        return [{
          action: Action.CONTINUE_CURRENT,
          priority: 5,
          reason: Cause.HARVEST_READY,
          rule_id: 'CONF_POST_HARVEST',
          justification_key: 'action.continue.post_harvest',
          scientific_source: 'System',
          urgency: ActionUrgency.FLEXIBLE
        }];
      }
      
      return filtered;
    }
  },

  // STAGE_003: Germination stage → Gentle actions only
  {
    rule_id: 'CONF_GERMINATION_GENTLE',
    category: 'stage',
    priority_order: 62,
    description: 'Germination stage - avoid harsh treatments',
    explanation: 'Seedlings are delicate - avoiding harsh treatments',
    safety_critical: false,
    condition: (_, input) => input.crop_stage === CropStage.GERMINATION,
    resolution: (actions, _) => {
      const harshActions: Action[] = [
        Action.HERBICIDE_POST_EMERGENCE,
        Action.MECHANICAL_WEEDING,
        Action.IRRIGATE_HEAVY
      ];
      
      return actions.map(a => {
        if (harshActions.includes(a.action)) {
          return {
            ...a,
            priority: Math.max(1, a.priority - 3),
            urgency: ActionUrgency.WITHIN_WEEK,
            justification_key: `${a.justification_key}.delayed_germination`
          };
        }
        return a;
      });
    }
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Batch similar actions that can be done together
 */
function batchSimilarActions(actions: PrioritizedAction[]): PrioritizedAction[] {
  // Group actions by category
  const irrigationActions = actions.filter(a => 
    [Action.IRRIGATE_IMMEDIATELY, Action.IRRIGATE_LIGHT, Action.IRRIGATE_HEAVY].includes(a.action)
  );
  const sprayActions = actions.filter(a =>
    [Action.APPLY_FUNGICIDE, Action.APPLY_INSECTICIDE, Action.APPLY_NEEM_OIL,
     Action.FOLIAR_SPRAY, Action.APPLY_BT_SPRAY].includes(a.action)
  );
  const fertilizerActions = actions.filter(a =>
    [Action.APPLY_NITROGEN, Action.APPLY_PHOSPHORUS, Action.APPLY_POTASSIUM,
     Action.APPLY_ZINC, Action.APPLY_MICRONUTRIENTS].includes(a.action)
  );
  const otherActions = actions.filter(a =>
    !irrigationActions.includes(a) && 
    !sprayActions.includes(a) && 
    !fertilizerActions.includes(a)
  );

  // Keep best of each group
  const result: PrioritizedAction[] = [];
  
  if (irrigationActions.length > 0) {
    result.push(irrigationActions.reduce((best, curr) => 
      curr.priority > best.priority ? curr : best
    ));
  }
  
  // For sprays, can potentially combine
  if (sprayActions.length > 0) {
    const bestSpray = sprayActions.reduce((best, curr) => 
      curr.priority > best.priority ? curr : best
    );
    result.push(bestSpray);
  }
  
  // Fertilizers can sometimes be combined
  if (fertilizerActions.length > 0) {
    result.push(...fertilizerActions.slice(0, 2));
  }
  
  // Add remaining actions
  result.push(...otherActions);
  
  // Sort by priority
  return result.sort((a, b) => b.priority - a.priority);
}

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
  explanations: string[];
}

/**
 * Resolve conflicts between actions
 * Applies conflict rules in priority order
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
  const explanations: string[] = [];

  // Sort rules by priority order
  const sortedRules = [...CONFLICT_RULES].sort((a, b) => a.priority_order - b.priority_order);

  // Apply each conflict rule
  for (const rule of sortedRules) {
    try {
      if (rule.condition(currentActions, input)) {
        const beforeCount = currentActions.length;
        const beforeJson = JSON.stringify(currentActions);
        
        currentActions = rule.resolution(currentActions, input);
        
        rulesApplied.push(rule.rule_id);
        
        // Track if resolution made changes
        if (currentActions.length !== beforeCount || 
            JSON.stringify(currentActions) !== beforeJson) {
          conflictsResolved.push(rule.description);
          explanations.push(rule.explanation);
        }
      }
    } catch (error) {
      console.error(`[ConflictResolver] Rule ${rule.rule_id} failed:`, error);
    }
  }

  // Final sort by priority
  currentActions.sort((a, b) => b.priority - a.priority);

  // Limit to top 5 actions to avoid overwhelming farmer
  const topActions = currentActions.slice(0, 5);

  return {
    actions: topActions,
    conflictsResolved,
    rulesApplied,
    explanations
  };
}

/**
 * Get explanation for why an action was not recommended
 */
export function getFilteredActionExplanation(
  action: Action,
  input: DecisionInput
): string | null {
  // Weather-based filters
  if (input.weather_state === WeatherState.RAIN_EXPECTED) {
    if ([Action.IRRIGATE_LIGHT, Action.IRRIGATE_IMMEDIATELY].includes(action)) {
      return 'filter.irrigation.rain_expected';
    }
    if ([Action.APPLY_FUNGICIDE, Action.APPLY_INSECTICIDE].includes(action)) {
      return 'filter.spray.rain_expected';
    }
  }

  if (input.weather_state === WeatherState.RAIN_ACTIVE) {
    if ([Action.APPLY_FUNGICIDE, Action.APPLY_INSECTICIDE, Action.FOLIAR_SPRAY].includes(action)) {
      return 'filter.spray.rain_active';
    }
  }

  if (input.weather_state === WeatherState.STRONG_WIND) {
    if ([Action.APPLY_FUNGICIDE, Action.APPLY_INSECTICIDE].includes(action)) {
      return 'filter.spray.strong_wind';
    }
  }

  // Farming mode filters
  if (input.farming_mode === FarmingMode.ORGANIC_ONLY) {
    if (!isOrganicCompatible(action)) {
      return 'filter.action.not_organic';
    }
  }

  // Soil state filters
  if (input.soil_states.moisture === SoilMoistureState.WATERLOGGED) {
    if ([Action.IRRIGATE_LIGHT, Action.IRRIGATE_IMMEDIATELY, Action.IRRIGATE_HEAVY].includes(action)) {
      return 'filter.irrigation.waterlogged';
    }
  }

  // Stage filters
  if (input.crop_stage === CropStage.POST_HARVEST) {
    if ([Action.APPLY_NITROGEN, Action.IRRIGATE_IMMEDIATELY].includes(action)) {
      return 'filter.action.post_harvest';
    }
  }

  return null;
}

/**
 * Get all safety-critical rules that applied
 */
export function getSafetyCriticalConflicts(
  actions: PrioritizedAction[],
  input: DecisionInput
): EnhancedConflictRule[] {
  return CONFLICT_RULES.filter(rule => 
    rule.safety_critical && rule.condition(actions, input)
  );
}

/**
 * Check if actions are safe to execute
 */
export function validateActionSafety(
  actions: PrioritizedAction[],
  input: DecisionInput
): { safe: boolean; warnings: string[] } {
  const warnings: string[] = [];
  
  // Check for organic violations
  if (input.farming_mode === FarmingMode.ORGANIC_ONLY) {
    const chemicalActions = actions.filter(a => !isOrganicCompatible(a.action));
    if (chemicalActions.length > 0) {
      warnings.push('WARNING: Chemical actions present for organic farmer');
    }
  }
  
  // Check for weather conflicts
  if (input.weather_state === WeatherState.RAIN_ACTIVE) {
    const sprayActions = actions.filter(a => 
      [Action.APPLY_FUNGICIDE, Action.APPLY_INSECTICIDE].includes(a.action)
    );
    if (sprayActions.length > 0) {
      warnings.push('WARNING: Spray actions during rain');
    }
  }
  
  return {
    safe: warnings.length === 0,
    warnings
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export {
  CONFLICT_RULES as default
};
