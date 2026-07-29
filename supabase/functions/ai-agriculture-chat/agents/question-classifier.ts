// Question Classification System

export enum ResponseTemplateType {
  TREATMENT_FULL = 'treatment_full',           // Pest/disease with chemical products
  TREATMENT_ORGANIC = 'treatment_organic',     // Organic pest/disease solutions
  FERTILIZER_SCHEDULE = 'fertilizer_schedule', // NPK fertilizer plan
  IRRIGATION_PLAN = 'irrigation_plan',         // Water management schedule
  HEALTH_ASSESSMENT = 'health_assessment',     // Crop status check
  GENERAL_ADVICE = 'general_advice',           // Simple Q&A
  WEATHER_ADVISORY = 'weather_advisory',       // Weather-based recommendations
  MARKET_INFO = 'market_info',                 // Price/market information
  MONITORING_UPDATE = 'monitoring_update'      // Follow-up progress check
}

export interface SectionRequirements {
  materials: boolean;           // Show materials list?
  mixing: boolean;              // Show mixing instructions?
  application: boolean;         // Show application method?
  timing: boolean;              // Show timing/schedule?
  economics: boolean;           // Show cost/benefit analysis?
  follow_up: boolean;           // Show follow-up schedule?
  warnings: boolean;            // Show safety warnings?
  rationale: boolean;           // Show explanation/reasoning?
}

export interface QuestionClassification {
  template_type: ResponseTemplateType;
  requires_sections: SectionRequirements;
  response_style: 'detailed' | 'concise' | 'structured';
  max_sections: number;         // Maximum sections to show
  priority_order: string[];     // Order of section importance
}

// Classify the farmer's question and determine appropriate response template
export function classifyQuestion(
  primaryIntent: string,
  nluOutput: any,
  contextState: any,
  decisionOutput?: any  // NEW: Accept decision output for robust classification
): QuestionClassification {
  
  console.log('📋 [QuestionClassifier] Classifying question...');
  console.log(`   Primary intent: ${primaryIntent}`);
  
  // CRITICAL FIX: Force TREATMENT_FULL if DecisionOutput has pest/disease target
  if (decisionOutput) {
    // Note: target is an object with pest_code, disease_code, nutrient_deficiency properties, not a string
    const hasPestTarget = !!(decisionOutput.primary_decision?.target?.pest_code || 
                             decisionOutput.primary_decision?.pest_code ||
                             decisionOutput.audit_trail?.pest_disease_detected);
    const hasDiseaseTarget = !!(decisionOutput.primary_decision?.target?.disease_code ||
                                decisionOutput.primary_decision?.disease_code ||
                                decisionOutput.audit_trail?.disease_detected);
    const hasChemicalAction = decisionOutput.primary_decision?.action_type === 'CHEMICAL_SPRAY' ||
                              decisionOutput.primary_decision?.action_type === 'BIOPESTICIDE' ||
                              decisionOutput.primary_decision?.action_type === 'BOTANICAL';
    
    if (hasPestTarget || hasDiseaseTarget || hasChemicalAction) {
      console.log('   ✅ [OVERRIDE] Classified as TREATMENT_FULL from DecisionOutput');
      return {
        template_type: ResponseTemplateType.TREATMENT_FULL,
        requires_sections: {
          materials: true,
          mixing: true,
          application: true,
          timing: true,
          economics: true,
          follow_up: true,
          warnings: true,
          rationale: true
        },
        response_style: 'detailed',
        max_sections: 8,
        priority_order: ['immediate_action', 'how_to', 'warnings', 'economics', 'follow_up', 'rationale']
      };
    }
  }
  
  // PATTERN 1: Pest/Disease Treatment with Products
  if (primaryIntent === 'PEST_PROBLEM' || 
      primaryIntent === 'DISEASE_PROBLEM' ||
      primaryIntent === 'PEST_MANAGEMENT' ||
      primaryIntent === 'DISEASE_MANAGEMENT') {
    const hasPest = nluOutput.entities_extracted?.pest_mentioned || 
                    nluOutput.symptom_extraction?.inferred_pest_codes?.length > 0 ||
                    nluOutput.entities?.pest_code;  // Support mapped NLU format
    const hasDisease = nluOutput.entities_extracted?.disease_mentioned ||
                       nluOutput.symptom_extraction?.inferred_disease_codes?.length > 0 ||
                       nluOutput.entities?.disease_code;  // Support mapped NLU format
    
    if (hasPest || hasDisease) {
      console.log('   ✅ Classified as TREATMENT_FULL');
      return {
        template_type: ResponseTemplateType.TREATMENT_FULL,
        requires_sections: {
          materials: true,
          mixing: true,
          application: true,
          timing: true,
          economics: true,
          follow_up: true,
          warnings: true,
          rationale: true
        },
        response_style: 'detailed',
        max_sections: 8,
        priority_order: ['immediate_action', 'how_to', 'warnings', 'economics', 'follow_up', 'rationale']
      };
    }
  }
  
  // PATTERN 2: Irrigation/Water Management Query
  if (primaryIntent === 'IRRIGATION_QUERY' || 
      primaryIntent === 'WATER_MANAGEMENT' ||
      primaryIntent === 'WATER_SCHEDULE' ||
      primaryIntent === 'WATER_ISSUE' ||              // NLU agent's actual intent
      primaryIntent === 'IRRIGATION_PLANNING' ||
      nluOutput.symptom_extraction?.symptom_category === 'WATER_RELATED') {
    
    console.log('   ✅ Classified as IRRIGATION_PLAN');
    return {
      template_type: ResponseTemplateType.IRRIGATION_PLAN,
      requires_sections: {
        materials: false,       // NO products needed for watering
        mixing: false,          // NO mixing needed
        application: false,     // NO spray application
        timing: true,           // WHEN to water (critical)
        economics: false,       // NO cost for water
        follow_up: true,        // Monitor soil moisture
        warnings: true,         // Waterlogging caution
        rationale: true         // Why this schedule
      },
      response_style: 'structured',
      max_sections: 4,
      priority_order: ['immediate_action', 'timing', 'warnings', 'rationale']
    };
  }
  
  // PATTERN 3: Fertilizer Schedule Query
  if (primaryIntent === 'FERTILIZER_QUERY' || 
      primaryIntent === 'NUTRIENT_MANAGEMENT' ||
      primaryIntent === 'FERTILIZER_SCHEDULE' ||
      primaryIntent === 'NUTRIENT_DEFICIENCY' ||
      primaryIntent === 'NUTRIENT_ISSUE' ||           // NLU agent's actual intent
      primaryIntent === 'FERTILIZER_RECOMMENDATION') {
    
    console.log('   ✅ Classified as FERTILIZER_SCHEDULE');
    return {
      template_type: ResponseTemplateType.FERTILIZER_SCHEDULE,
      requires_sections: {
        materials: true,        // Fertilizer list with quantities
        mixing: false,          // NO mixing for granular fertilizers
        application: true,      // HOW to apply (broadcast/drill)
        timing: true,           // WHEN at each crop stage
        economics: true,        // Cost breakdown by stage
        follow_up: false,       // NO follow-up needed
        warnings: true,         // Application precautions
        rationale: true         // Why this NPK ratio
      },
      response_style: 'structured',
      max_sections: 6,
      priority_order: ['immediate_action', 'materials', 'timing', 'economics', 'application', 'rationale']
    };
  }
  
  // PATTERN 4: Crop Health Check / Status Query
  if (primaryIntent === 'CROP_STATUS_CHECK' || 
      primaryIntent === 'HEALTH_ASSESSMENT' ||
      primaryIntent === 'CROP_HEALTH' ||
      primaryIntent === 'STATUS_CHECK' ||
      contextState?.current_state === 'MONITORING') {
    
    console.log('   ✅ Classified as HEALTH_ASSESSMENT');
    return {
      template_type: ResponseTemplateType.HEALTH_ASSESSMENT,
      requires_sections: {
        materials: false,
        mixing: false,
        application: false,
        timing: false,
        economics: false,
        follow_up: false,
        warnings: false,
        rationale: false
      },
      response_style: 'concise',
      max_sections: 2,
      priority_order: ['immediate_action']
    };
  }
  
  // PATTERN 5: General Information / Variety Selection
  if (primaryIntent === 'GENERAL_QUERY' || 
      primaryIntent === 'VARIETY_SELECTION' ||
      primaryIntent === 'BEST_PRACTICES' ||
      primaryIntent === 'INFORMATION_REQUEST' ||
      primaryIntent === 'GREETING') {
    
    console.log('   ✅ Classified as GENERAL_ADVICE');
    return {
      template_type: ResponseTemplateType.GENERAL_ADVICE,
      requires_sections: {
        materials: false,
        mixing: false,
        application: false,
        timing: false,
        economics: false,
        follow_up: false,
        warnings: false,
        rationale: true
      },
      response_style: 'concise',
      max_sections: 2,
      priority_order: ['immediate_action', 'rationale']
    };
  }
  
  // PATTERN 6: Weather-Based Advisory
  if (primaryIntent === 'WEATHER_QUERY' || 
      primaryIntent === 'WEATHER_ADVISORY' ||
      nluOutput.entities_extracted?.weather_mentioned) {
    
    console.log('   ✅ Classified as WEATHER_ADVISORY');
    return {
      template_type: ResponseTemplateType.WEATHER_ADVISORY,
      requires_sections: {
        materials: false,
        mixing: false,
        application: false,
        timing: true,
        economics: false,
        follow_up: false,
        warnings: true,
        rationale: true
      },
      response_style: 'concise',
      max_sections: 3,
      priority_order: ['immediate_action', 'timing', 'warnings']
    };
  }
  
  // PATTERN 7: Follow-up / Monitoring Update
  if ((contextState?.questions_asked || 0) > 0 && 
      (primaryIntent === 'PROBLEM_UPDATE' || 
       primaryIntent === 'PROGRESS_REPORT' ||
       primaryIntent === 'FOLLOW_UP')) {
    
    console.log('   ✅ Classified as MONITORING_UPDATE');
    return {
      template_type: ResponseTemplateType.MONITORING_UPDATE,
      requires_sections: {
        materials: false,
        mixing: false,
        application: false,
        timing: true,
        economics: false,
        follow_up: true,
        warnings: true,
        rationale: false
      },
      response_style: 'concise',
      max_sections: 3,
      priority_order: ['immediate_action', 'timing', 'follow_up']
    };
  }
  
  // PATTERN 8: Market Information
  if (primaryIntent === 'MARKET_QUERY' || 
      primaryIntent === 'PRICE_INFO' ||
      primaryIntent === 'MARKET_INFO') {
    
    console.log('   ✅ Classified as MARKET_INFO');
    return {
      template_type: ResponseTemplateType.MARKET_INFO,
      requires_sections: {
        materials: false,
        mixing: false,
        application: false,
        timing: true,
        economics: true,
        follow_up: false,
        warnings: false,
        rationale: true
      },
      response_style: 'structured',
      max_sections: 3,
      priority_order: ['immediate_action', 'economics', 'rationale']
    };
  }
  
  // DEFAULT: General Advice (Fallback)
  console.log('   ⚠️ Fallback to GENERAL_ADVICE');
  return {
    template_type: ResponseTemplateType.GENERAL_ADVICE,
    requires_sections: {
      materials: false,
      mixing: false,
      application: false,
      timing: false,
      economics: false,
      follow_up: false,
      warnings: false,
      rationale: true
    },
    response_style: 'concise',
    max_sections: 2,
    priority_order: ['immediate_action', 'rationale']
  };
}

// Helper: Check if question involves product application
export function requiresProductApplication(classification: QuestionClassification): boolean {
  return classification.requires_sections.materials && 
         classification.requires_sections.mixing;
}

// Helper: Check if question is monitoring/status check
export function isStatusCheck(classification: QuestionClassification): boolean {
  return classification.template_type === ResponseTemplateType.HEALTH_ASSESSMENT ||
         classification.template_type === ResponseTemplateType.MONITORING_UPDATE;
}

// Helper: Get human-readable template description
export function getTemplateDescription(type: ResponseTemplateType): string {
  const descriptions: Record<ResponseTemplateType, string> = {
    [ResponseTemplateType.TREATMENT_FULL]: 'Full treatment with products and follow-up',
    [ResponseTemplateType.TREATMENT_ORGANIC]: 'Organic treatment solutions',
    [ResponseTemplateType.FERTILIZER_SCHEDULE]: 'Fertilizer application schedule',
    [ResponseTemplateType.IRRIGATION_PLAN]: 'Water management plan',
    [ResponseTemplateType.HEALTH_ASSESSMENT]: 'Crop health status',
    [ResponseTemplateType.GENERAL_ADVICE]: 'General agricultural advice',
    [ResponseTemplateType.WEATHER_ADVISORY]: 'Weather-based recommendations',
    [ResponseTemplateType.MARKET_INFO]: 'Market information',
    [ResponseTemplateType.MONITORING_UPDATE]: 'Progress monitoring update'
  };
  
  return descriptions[type] || 'Standard response';
}
