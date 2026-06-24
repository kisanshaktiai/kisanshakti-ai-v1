/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MULTI-MODAL FUSION ENGINE - KisanShakti AI
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Intelligently combines information from text, images, sensor data, 
 * weather APIs, and satellite imagery into unified agricultural intelligence.
 */

import type {
  MultiModalInput,
  FusedIntelligence,
  ConflictDetectionResult,
  DetectedConflict,
  ResolvedConflict,
  CrossValidationResult,
  ValidatedFact,
  GapFillingResult,
  FilledGap,
  UnifiedContext,
  DataQualityAssessment,
  FusionRecommendations,
  AgreementLevel,
  ConflictType,
  InferenceMethod
} from './multimodal-fusion-types.ts';

import {
  TRUST_HIERARCHY,
  MODALITY_NAMES,
  CONFIDENCE_BOOST_RULES,
  CROP_STAGE_RULES
} from './multimodal-fusion-types.ts';

export const MULTIMODAL_FUSION_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// MAIN FUSION ENGINE CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class MultiModalFusionEngine {
  private version = MULTIMODAL_FUSION_VERSION;
  
  /**
   * Main fusion method - combines all input modalities
   */
  async fuse(input: MultiModalInput): Promise<FusedIntelligence> {
    const startTime = Date.now();
    console.log('🔗 Multi-Modal Fusion: Starting...');
    
    // Step 1: Detect conflicts between sources
    const conflictResult = this.detectConflicts(input);
    console.log(`   Found ${conflictResult.conflicts_found.length} conflicts`);
    
    // Step 2: Cross-validate information
    const validationResult = this.crossValidate(input);
    console.log(`   Validated ${validationResult.validated_facts.length} facts`);
    
    // Step 3: Fill information gaps
    const gapResult = this.fillInformationGaps(input);
    console.log(`   Filled ${gapResult.gaps_filled.length} information gaps`);
    
    // Step 4: Resolve conflicts using trust hierarchy
    const resolvedConflicts = conflictResult.conflicts_found.map(c => 
      this.resolveConflict(c, input)
    );
    
    // Step 5: Build unified context
    const unifiedContext = this.buildUnifiedContext(
      input, 
      validationResult, 
      gapResult, 
      resolvedConflicts
    );
    
    // Step 6: Assess data quality
    const dataQuality = this.assessDataQuality(input, validationResult);
    
    // Step 7: Generate recommendations
    const recommendations = this.generateRecommendations(input, dataQuality, gapResult);
    
    const processingTime = Date.now() - startTime;
    console.log('✅ Multi-Modal Fusion: Complete');
    console.log(`   Overall Confidence: ${(dataQuality.overall_quality * 100).toFixed(1)}%`);
    console.log(`   Processing Time: ${processingTime}ms`);
    
    return {
      fusion_id: this.generateId(),
      timestamp: new Date().toISOString(),
      session_id: input.session_id,
      
      fusion_summary: {
        modalities_present: this.getModalitiesPresent(input),
        modalities_used: this.getModalitiesUsed(input, validationResult, gapResult),
        overall_confidence: dataQuality.overall_quality,
        data_quality_score: dataQuality.reliability_score,
        fusion_method: 'HIERARCHICAL_TRUST_FUSION',
        processing_notes: this.generateProcessingNotes(conflictResult, validationResult, gapResult)
      },
      
      validated_facts: validationResult.validated_facts,
      conflicts: resolvedConflicts,
      inferred_information: gapResult.gaps_filled,
      unified_context: unifiedContext,
      data_quality: dataQuality,
      recommendations: recommendations,
      
      processing_metadata: {
        fusion_version: this.version,
        processing_time_ms: processingTime,
        sources_processed: this.getModalitiesPresent(input).length,
        algorithms_applied: ['CONFLICT_DETECTION', 'CROSS_VALIDATION', 'GAP_FILLING', 'TRUST_HIERARCHY']
      }
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: CONFLICT DETECTION
  // ═══════════════════════════════════════════════════════════════════════════
  
  private detectConflicts(input: MultiModalInput): ConflictDetectionResult {
    const conflicts: DetectedConflict[] = [];
    
    // Conflict Type 1: Text says pest X, Image shows pest Y
    if (input.text_understanding.entities.pest_code && 
        input.visual_analysis?.detections.pests?.[0]) {
      
      const textPest = input.text_understanding.entities.pest_code;
      const visualPest = input.visual_analysis.detections.pests[0].code;
      
      if (textPest !== visualPest) {
        conflicts.push({
          conflict_id: 'C_TEXT_VISUAL_PEST',
          type: 'TEXT_VS_VISUAL',
          sources: [MODALITY_NAMES.text, MODALITY_NAMES.visual],
          description: `Farmer said "${textPest}" but image shows "${visualPest}"`,
          severity: 'MODERATE',
          resolution_strategy: 'TRUST_VISUAL_EVIDENCE',
          data_points: {
            source1: { source: MODALITY_NAMES.text, value: textPest },
            source2: { source: MODALITY_NAMES.visual, value: visualPest }
          }
        });
      }
    }
    
    // Conflict Type 2: Text says disease X, Image shows disease Y
    if (input.text_understanding.entities.disease_code && 
        input.visual_analysis?.detections.diseases?.[0]) {
      
      const textDisease = input.text_understanding.entities.disease_code;
      const visualDisease = input.visual_analysis.detections.diseases[0].code;
      
      if (textDisease !== visualDisease) {
        conflicts.push({
          conflict_id: 'C_TEXT_VISUAL_DISEASE',
          type: 'TEXT_VS_VISUAL',
          sources: [MODALITY_NAMES.text, MODALITY_NAMES.visual],
          description: `Farmer said "${textDisease}" but image shows "${visualDisease}"`,
          severity: 'MODERATE',
          resolution_strategy: 'TRUST_VISUAL_EVIDENCE',
          data_points: {
            source1: { source: MODALITY_NAMES.text, value: textDisease },
            source2: { source: MODALITY_NAMES.visual, value: visualDisease }
          }
        });
      }
    }
    
    // Conflict Type 3: Farmer says water shortage, Sensor shows adequate
    if (input.text_understanding.intent.includes('WATER') && 
        input.sensor_data?.readings.soil_moisture_percent !== undefined &&
        input.sensor_data.readings.soil_moisture_percent > 50) {
      
      conflicts.push({
        conflict_id: 'C_FARMER_SENSOR_MOISTURE',
        type: 'VISUAL_VS_SENSOR',
        sources: [MODALITY_NAMES.text, MODALITY_NAMES.sensor],
        description: `Farmer reports water stress but soil moisture ${input.sensor_data.readings.soil_moisture_percent}% (adequate)`,
        severity: 'MODERATE',
        resolution_strategy: 'TRUST_SENSOR_INVESTIGATE_ROOT_DAMAGE',
        data_points: {
          source1: { source: MODALITY_NAMES.text, value: 'WATER_STRESS_REPORTED' },
          source2: { source: MODALITY_NAMES.sensor, value: input.sensor_data.readings.soil_moisture_percent }
        }
      });
    }
    
    // Conflict Type 4: Farmer says crop healthy, NDVI shows stress
    const noIssueReported = !input.text_understanding.entities.pest_code && 
                            !input.text_understanding.entities.disease_code;
    
    if (noIssueReported && 
        input.satellite_data?.ndvi.current !== undefined &&
        input.satellite_data.ndvi.current < 0.4) {
      
      conflicts.push({
        conflict_id: 'C_FARMER_SATELLITE_HEALTH',
        type: 'FARMER_VS_SATELLITE',
        sources: [MODALITY_NAMES.text, MODALITY_NAMES.satellite],
        description: `Farmer unaware of issue but NDVI ${input.satellite_data.ndvi.current.toFixed(2)} shows stress`,
        severity: 'CRITICAL',
        resolution_strategy: 'EARLY_WARNING_ALERT',
        data_points: {
          source1: { source: MODALITY_NAMES.text, value: 'NO_ISSUE_REPORTED' },
          source2: { source: MODALITY_NAMES.satellite, value: input.satellite_data.ndvi.current }
        }
      });
    }
    
    // Conflict Type 5: Image timestamp vs Text timestamp mismatch
    if (input.visual_analysis?.image_timestamp) {
      const timeDiff = Math.abs(
        new Date(input.timestamp).getTime() - 
        new Date(input.visual_analysis.image_timestamp).getTime()
      ) / (1000 * 60 * 60); // Hours
      
      if (timeDiff > 48) {
        conflicts.push({
          conflict_id: 'C_TEMPORAL_MISMATCH',
          type: 'TEMPORAL_MISMATCH',
          sources: [MODALITY_NAMES.text, MODALITY_NAMES.visual],
          description: `Image is ${Math.round(timeDiff)}h old - situation may have changed`,
          severity: 'MINOR',
          resolution_strategy: 'REQUEST_NEW_PHOTO',
          data_points: {
            source1: { source: MODALITY_NAMES.text, value: input.timestamp },
            source2: { source: MODALITY_NAMES.visual, value: input.visual_analysis.image_timestamp }
          }
        });
      }
    }
    
    // Conflict Type 6: Severity mismatch between text and visual
    if (input.visual_analysis?.severity_quantification.affected_area_percent !== undefined) {
      const visualSeverity = input.visual_analysis.severity_quantification.affected_area_percent;
      const textMentionsSevere = input.text_understanding.farmer_message.toLowerCase().includes('खूप') ||
                                  input.text_understanding.farmer_message.toLowerCase().includes('बहुत') ||
                                  input.text_understanding.farmer_message.toLowerCase().includes('severe');
      
      // Farmer says severe but image shows mild
      if (textMentionsSevere && visualSeverity < 20) {
        conflicts.push({
          conflict_id: 'C_SEVERITY_MISMATCH',
          type: 'SEVERITY_MISMATCH',
          sources: [MODALITY_NAMES.text, MODALITY_NAMES.visual],
          description: 'Farmer describes severe issue but image shows mild infestation',
          severity: 'MINOR',
          resolution_strategy: 'TRUST_VISUAL_QUANTIFICATION',
          data_points: {
            source1: { source: MODALITY_NAMES.text, value: 'SEVERE_DESCRIBED' },
            source2: { source: MODALITY_NAMES.visual, value: visualSeverity }
          }
        });
      }
    }
    
    return {
      conflicts_found: conflicts,
      total_conflicts: conflicts.length,
      critical_conflicts: conflicts.filter(c => c.severity === 'CRITICAL').length
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: CROSS-VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════
  
  private crossValidate(input: MultiModalInput): CrossValidationResult {
    const facts: ValidatedFact[] = [];
    
    // Validate Pest Identification
    if (input.text_understanding.entities.pest_code) {
      const pestCode = input.text_understanding.entities.pest_code;
      const supportingSources = [MODALITY_NAMES.text];
      let confidence = input.text_understanding.confidence;
      const originalConfidence = confidence;
      
      // Check visual confirmation
      const visualPest = input.visual_analysis?.detections.pests?.find(p => p.code === pestCode);
      if (visualPest) {
        supportingSources.push(MODALITY_NAMES.visual);
        confidence = Math.min(
          CONFIDENCE_BOOST_RULES.MAX_CONFIDENCE, 
          confidence + CONFIDENCE_BOOST_RULES.VISUAL_CONFIRMS_TEXT
        );
      }
      
      // Check NDVI decline (consistent with pest stress)
      if (input.satellite_data?.ndvi.trend === 'DECLINING') {
        supportingSources.push(MODALITY_NAMES.satellite);
        confidence = Math.min(
          CONFIDENCE_BOOST_RULES.MAX_CONFIDENCE, 
          confidence + 0.05
        );
      }
      
      // Check historical pattern
      const historicalMatch = input.historical_data?.previous_issues.some(
        i => i.issue_code === pestCode
      );
      if (historicalMatch) {
        supportingSources.push(MODALITY_NAMES.historical);
        confidence = Math.min(
          CONFIDENCE_BOOST_RULES.MAX_CONFIDENCE, 
          confidence + CONFIDENCE_BOOST_RULES.HISTORICAL_PATTERN_MATCH
        );
      }
      
      facts.push({
        fact_id: `PEST_${pestCode}`,
        fact: `${pestCode}_INFESTATION_PRESENT`,
        category: 'PEST',
        value: { 
          code: pestCode, 
          count: visualPest?.count,
          density: input.visual_analysis?.severity_quantification.pest_density
        },
        confidence: confidence,
        original_confidence: originalConfidence,
        confidence_boost: confidence - originalConfidence,
        supporting_sources: supportingSources,
        contradicting_sources: [],
        agreement_level: this.determineAgreementLevel(supportingSources.length),
        validation_method: 'MULTI_SOURCE_CONFIRMATION'
      });
    }
    
    // Validate Disease Identification
    if (input.text_understanding.entities.disease_code) {
      const diseaseCode = input.text_understanding.entities.disease_code;
      const supportingSources = [MODALITY_NAMES.text];
      let confidence = input.text_understanding.confidence;
      const originalConfidence = confidence;
      
      const visualDisease = input.visual_analysis?.detections.diseases?.find(d => d.code === diseaseCode);
      if (visualDisease) {
        supportingSources.push(MODALITY_NAMES.visual);
        confidence = Math.min(
          CONFIDENCE_BOOST_RULES.MAX_CONFIDENCE, 
          confidence + CONFIDENCE_BOOST_RULES.VISUAL_CONFIRMS_TEXT
        );
      }
      
      facts.push({
        fact_id: `DISEASE_${diseaseCode}`,
        fact: `${diseaseCode}_INFECTION_PRESENT`,
        category: 'DISEASE',
        value: { 
          code: diseaseCode, 
          severity: visualDisease?.severity,
          severity_index: input.visual_analysis?.severity_quantification.disease_severity_index
        },
        confidence: confidence,
        original_confidence: originalConfidence,
        confidence_boost: confidence - originalConfidence,
        supporting_sources: supportingSources,
        contradicting_sources: [],
        agreement_level: this.determineAgreementLevel(supportingSources.length),
        validation_method: 'MULTI_SOURCE_CONFIRMATION'
      });
    }
    
    // Validate Soil Moisture Status
    if (input.sensor_data?.readings.soil_moisture_percent !== undefined) {
      const moisturePercent = input.sensor_data.readings.soil_moisture_percent;
      const status = moisturePercent < 30 ? 'LOW' :
                     moisturePercent < 50 ? 'MODERATE' :
                     moisturePercent < 70 ? 'ADEQUATE' : 'HIGH';
      
      facts.push({
        fact_id: 'SOIL_MOISTURE',
        fact: `SOIL_MOISTURE_${status}`,
        category: 'WATER',
        value: { percent: moisturePercent, status: status },
        confidence: input.sensor_data.reliability === 'HIGH' ? 0.95 : 
                    input.sensor_data.reliability === 'MEDIUM' ? 0.85 : 0.70,
        original_confidence: 0.90,
        confidence_boost: 0,
        supporting_sources: [MODALITY_NAMES.sensor],
        contradicting_sources: [],
        agreement_level: 'STRONG',
        validation_method: 'SENSOR_READING'
      });
    }
    
    // Validate Crop Stress from NDVI
    if (input.satellite_data?.ndvi) {
      const ndvi = input.satellite_data.ndvi.current;
      const stressLevel = ndvi < 0.3 ? 'SEVERE' :
                          ndvi < 0.5 ? 'MODERATE' :
                          ndvi < 0.7 ? 'MILD' : 'NONE';
      
      // Adjust confidence based on cloud cover
      const cloudPenalty = input.satellite_data.cloud_cover_percent > 20 ? 0.10 : 0;
      
      facts.push({
        fact_id: 'CROP_STRESS_NDVI',
        fact: `CROP_STRESS_${stressLevel}`,
        category: 'CROP_STAGE',
        value: { ndvi: ndvi, trend: input.satellite_data.ndvi.trend, stress_level: stressLevel },
        confidence: 0.85 - cloudPenalty,
        original_confidence: 0.85,
        confidence_boost: 0,
        supporting_sources: [MODALITY_NAMES.satellite],
        contradicting_sources: [],
        agreement_level: 'MODERATE',
        validation_method: 'SATELLITE_ANALYSIS'
      });
    }
    
    // Calculate average confidence
    const avgConfidence = facts.length > 0 
      ? facts.reduce((sum, f) => sum + f.confidence, 0) / facts.length 
      : 0;
    
    return {
      validated_facts: facts,
      total_facts: facts.length,
      strong_agreement_count: facts.filter(f => f.agreement_level === 'STRONG').length,
      average_confidence: avgConfidence
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: GAP FILLING
  // ═══════════════════════════════════════════════════════════════════════════
  
  private fillInformationGaps(input: MultiModalInput): GapFillingResult {
    const filled: FilledGap[] = [];
    const remaining: string[] = [];
    
    // Gap 1: Crop stage not mentioned by farmer
    const cropCode = input.text_understanding.entities.crop_code || 
                     input.historical_data?.crop_code;
    
    if (cropCode && input.historical_data?.sowing_date) {
      const daysAfterSowing = Math.floor(
        (new Date(input.timestamp).getTime() - 
         new Date(input.historical_data.sowing_date).getTime()) 
        / (1000 * 60 * 60 * 24)
      );
      
      const inferredStage = this.inferCropStage(cropCode, daysAfterSowing, input.satellite_data?.ndvi);
      
      if (inferredStage !== 'UNKNOWN') {
        filled.push({
          gap_id: 'GAP_CROP_STAGE',
          gap: 'CROP_STAGE_UNKNOWN',
          gap_type: 'CROP_STAGE',
          filled_by: [MODALITY_NAMES.historical, MODALITY_NAMES.satellite],
          inferred_value: { stage: inferredStage, days_after_sowing: daysAfterSowing },
          confidence: 0.85,
          method: 'DAYS_AFTER_SOWING',
          reasoning: `Sowing date ${input.historical_data.sowing_date} + ${daysAfterSowing} days = ${inferredStage}`,
          requires_confirmation: false
        });
      } else {
        remaining.push('CROP_STAGE');
      }
    } else if (!cropCode) {
      remaining.push('CROP_IDENTIFICATION');
    }
    
    // Gap 2: Soil moisture not available from sensor
    if (!input.sensor_data?.readings.soil_moisture_percent) {
      const recentRainfall = input.weather_data.current.rainfall_last_24h_mm;
      const temperature = input.weather_data.current.temperature_c;
      
      const estimatedMoisture = this.estimateSoilMoisture(recentRainfall, temperature);
      
      if (estimatedMoisture !== null) {
        filled.push({
          gap_id: 'GAP_SOIL_MOISTURE',
          gap: 'SOIL_MOISTURE_NOT_MEASURED',
          gap_type: 'SOIL_MOISTURE',
          filled_by: [MODALITY_NAMES.weather],
          inferred_value: { estimated_percent: estimatedMoisture, status: this.getMoistureStatus(estimatedMoisture) },
          confidence: 0.55, // Lower confidence - estimation only
          method: 'WEATHER_ESTIMATION',
          reasoning: `Based on ${recentRainfall}mm rain in 24h and ${temperature}°C temperature`,
          requires_confirmation: true
        });
      } else {
        remaining.push('SOIL_MOISTURE');
      }
    }
    
    // Gap 3: Pest density not quantified
    if (input.text_understanding.entities.pest_code && 
        !input.visual_analysis?.severity_quantification.pest_density) {
      
      const symptomCount = input.text_understanding.entities.symptom_codes?.length || 0;
      const estimatedDensity = symptomCount > 2 ? 'HIGH' : 
                               symptomCount > 1 ? 'MODERATE' : 'LOW';
      
      filled.push({
        gap_id: 'GAP_PEST_DENSITY',
        gap: 'PEST_DENSITY_UNKNOWN',
        gap_type: 'PEST_DENSITY',
        filled_by: [MODALITY_NAMES.text],
        inferred_value: { density_level: estimatedDensity, symptom_count: symptomCount },
        confidence: 0.50, // Low confidence - needs photo
        method: 'SYMPTOM_CORRELATION',
        reasoning: `${symptomCount} symptoms mentioned correlates with ${estimatedDensity} density`,
        requires_confirmation: true
      });
    }
    
    // Gap 4: Issue onset time estimation
    if (input.text_understanding.entities.pest_code || input.text_understanding.entities.disease_code) {
      const ndviDeclineWeeks = input.satellite_data?.ndvi.trend === 'DECLINING' ? 
        this.estimateDeclineDuration(input.satellite_data.ndvi) : 0;
      
      if (ndviDeclineWeeks > 0) {
        filled.push({
          gap_id: 'GAP_ONSET_TIME',
          gap: 'ISSUE_ONSET_UNKNOWN',
          gap_type: 'ONSET_TIME',
          filled_by: [MODALITY_NAMES.satellite],
          inferred_value: { estimated_weeks_ago: ndviDeclineWeeks, confidence: 0.65 },
          confidence: 0.65,
          method: 'NDVI_PATTERN',
          reasoning: `NDVI decline pattern suggests issue started ~${ndviDeclineWeeks} weeks ago`,
          requires_confirmation: false
        });
      }
    }
    
    return {
      gaps_filled: filled,
      gaps_remaining: remaining,
      total_gaps_detected: filled.length + remaining.length,
      total_gaps_filled: filled.length
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 4: CONFLICT RESOLUTION
  // ═══════════════════════════════════════════════════════════════════════════
  
  private resolveConflict(conflict: DetectedConflict, input: MultiModalInput): ResolvedConflict {
    const sourceRankings = conflict.sources.map(s => ({
      source: s,
      rank: TRUST_HIERARCHY[s] || 99
    }));
    
    // Trust the highest-ranked source
    const mostTrusted = sourceRankings.sort((a, b) => a.rank - b.rank)[0];
    const resolvedValue = this.getValueFromSource(mostTrusted.source, conflict, input);
    
    // Calculate confidence after resolution
    const baseConfidence = 0.70;
    const trustBonus = (10 - mostTrusted.rank) * 0.03; // Higher rank = more bonus
    const confidenceAfter = Math.min(0.95, baseConfidence + trustBonus);
    
    return {
      ...conflict,
      resolved_value: resolvedValue,
      resolution_method: 'TRUST_HIERARCHY',
      resolution_explanation: `Trusting ${mostTrusted.source} (rank ${mostTrusted.rank}) over ${conflict.sources.filter(s => s !== mostTrusted.source).join(', ')}`,
      confidence_after_resolution: confidenceAfter
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 5: BUILD UNIFIED CONTEXT
  // ═══════════════════════════════════════════════════════════════════════════
  
  private buildUnifiedContext(
    input: MultiModalInput,
    validation: CrossValidationResult,
    gaps: GapFillingResult,
    resolvedConflicts: ResolvedConflict[]
  ): UnifiedContext {
    
    // Build crop context
    // CRITICAL FIX: Check multiple sources for crop code with proper fallback chain
    const cropStageGap = gaps.gaps_filled.find(g => g.gap_type === 'CROP_STAGE');
    const cropCode = input.text_understanding.entities.crop_code || 
                     input.historical_data?.crop_code ||
                     input.historical_data?.current_crop ||  // Fallback to current_crop field
                     (input as any).historical_data?.crop_name ||  // Some contexts use crop_name
                     'UNKNOWN';
    
    // Log for debugging
    if (cropCode !== 'UNKNOWN') {
      console.log(`   🌾 [Fusion] Crop identified: ${cropCode}`);
    }
    
    const crop: UnifiedContext['crop'] = {
      code: cropCode,
      name: input.historical_data?.current_crop || cropCode,
      stage: cropStageGap?.inferred_value?.stage || 
             input.historical_data?.growth_stage || 
             'UNKNOWN',
      growth_stage: cropStageGap?.inferred_value?.stage || 
                   input.historical_data?.growth_stage,
      days_after_sowing: cropStageGap?.inferred_value?.days_after_sowing || 
                         input.historical_data?.days_since_sowing ||
                         0,
      confidence: cropCode !== 'UNKNOWN' ? 0.85 : (cropStageGap?.confidence || 0.50),
      source: cropCode !== 'UNKNOWN' ? 'INFERRED_FROM_LAND_CONTEXT' : 
              (cropStageGap ? 'INFERRED' : 'UNKNOWN')
    };
    
    // Build problem context
    const pestFact = validation.validated_facts.find(f => f.category === 'PEST');
    const diseaseFact = validation.validated_facts.find(f => f.category === 'DISEASE');
    
    const problem: UnifiedContext['problem'] = {
      type: pestFact && diseaseFact ? 'MIXED' :
            pestFact ? 'PEST' :
            diseaseFact ? 'DISEASE' :
            input.text_understanding.entities.nutrient_deficiency ? 'NUTRIENT' :
            'UNKNOWN',
      primary_cause: pestFact?.value?.code || 
                     diseaseFact?.value?.code || 
                     input.text_understanding.entities.nutrient_deficiency ||
                     'UNKNOWN',
      severity: this.determineSeverity(validation, input),
      confidence: pestFact?.confidence || diseaseFact?.confidence || 0.50,
      affected_area_percent: input.visual_analysis?.severity_quantification.affected_area_percent || 
                             this.estimateAffectedArea(validation)
    };
    
    // Build field conditions
    const moistureGap = gaps.gaps_filled.find(g => g.gap_type === 'SOIL_MOISTURE');
    const moistureFact = validation.validated_facts.find(f => f.category === 'WATER');
    
    const field_conditions: UnifiedContext['field_conditions'] = {
      soil_moisture: {
        value: moistureFact?.value?.percent || moistureGap?.inferred_value?.estimated_percent || 'UNKNOWN',
        source: moistureFact ? MODALITY_NAMES.sensor : 
                moistureGap ? MODALITY_NAMES.weather : 'UNKNOWN',
        confidence: moistureFact?.confidence || moistureGap?.confidence || 0.30,
        status: moistureFact?.value?.status || moistureGap?.inferred_value?.status || 'UNKNOWN'
      },
      soil_health: {
        status: this.assessSoilHealth(input.historical_data?.soil_test_results),
        ph: input.historical_data?.soil_test_results?.ph,
        source: input.historical_data?.soil_test_results ? MODALITY_NAMES.historical : 'UNKNOWN',
        confidence: input.historical_data?.soil_test_results ? 0.80 : 0.30
      },
      crop_stress_level: {
        level: this.determineStressLevel(input),
        indicators: this.collectStressIndicators(input, validation),
        source: input.satellite_data ? MODALITY_NAMES.satellite : MODALITY_NAMES.visual,
        confidence: input.satellite_data ? 0.85 : 0.70
      }
    };
    
    // Build environmental context
    // CRITICAL FIX: Defensive access - weather_data may have different shapes
    const weatherCurrent = input.weather_data?.current || {};
    const weatherForecast = input.weather_data?.forecast_24h || input.weather_data?.forecast?.[0] || {};
    
    const environmental: UnifiedContext['environmental'] = {
      current_weather: {
        temperature_c: weatherCurrent.temperature_c ?? weatherCurrent.temperature ?? null,
        humidity_percent: weatherCurrent.humidity_percent ?? weatherCurrent.humidity ?? null,
        wind_speed_kmh: weatherCurrent.wind_speed_kmh ?? weatherCurrent.wind_speed ?? null,
        conditions: this.summarizeWeatherConditions(input.weather_data)
      },
      weather_forecast_24h: {
        rain_probability: weatherForecast.rain_probability_percent ?? weatherForecast.precipitation_probability ?? 20,
        suitable_for_spraying: this.isSprayingSuitable(input.weather_data),
        risk_factors: this.identifyWeatherRisks(input.weather_data)
      },
      season: this.determineSeason(input.timestamp)
    };
    
    // Build temporal context
    const onsetGap = gaps.gaps_filled.find(g => g.gap_type === 'ONSET_TIME');
    
    const temporal: UnifiedContext['temporal'] = {
      issue_onset_estimated: onsetGap ? 
        new Date(Date.now() - (onsetGap.inferred_value.estimated_weeks_ago * 7 * 24 * 60 * 60 * 1000)).toISOString() :
        'UNKNOWN',
      issue_duration_days: onsetGap ? onsetGap.inferred_value.estimated_weeks_ago * 7 : 0,
      progression_rate: this.determineProgressionRate(input),
      time_criticality: problem.severity === 'CRITICAL' ? 'URGENT' :
                        problem.severity === 'HIGH' ? 'MODERATE' : 'LOW'
    };
    
    // Check for beneficial insects
    const beneficial_presence = input.visual_analysis?.detections.beneficial_insects?.length ? {
      insects_present: true,
      types: input.visual_analysis.detections.beneficial_insects.map(b => b.code),
      protection_needed: true
    } : undefined;
    
    return {
      crop,
      problem,
      field_conditions,
      environmental,
      temporal,
      beneficial_presence
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 6: DATA QUALITY ASSESSMENT
  // ═══════════════════════════════════════════════════════════════════════════
  
  private assessDataQuality(
    input: MultiModalInput, 
    validation: CrossValidationResult
  ): DataQualityAssessment {
    
    const bySource = {
      text_quality: this.assessTextQuality(input.text_understanding),
      visual_quality: this.assessVisualQuality(input.visual_analysis),
      sensor_reliability: this.assessSensorReliability(input.sensor_data),
      weather_confidence: 0.90, // Weather APIs generally reliable
      satellite_freshness: this.assessSatelliteFreshness(input.satellite_data),
      historical_relevance: this.assessHistoricalRelevance(input.historical_data)
    };
    
    // Calculate overall quality (weighted average)
    const weights = {
      text_quality: 0.20,
      visual_quality: 0.25,
      sensor_reliability: 0.15,
      weather_confidence: 0.15,
      satellite_freshness: 0.15,
      historical_relevance: 0.10
    };
    
    const overall_quality = Object.entries(bySource).reduce((sum, [key, value]) => {
      return sum + (value * weights[key as keyof typeof weights]);
    }, 0);
    
    // Identify critical gaps
    const critical_gaps: string[] = [];
    const quality_issues: string[] = [];
    
    if (!input.visual_analysis) {
      critical_gaps.push('NO_PHOTO_PROVIDED');
    } else if (input.visual_analysis.quality_score < 0.5) {
      quality_issues.push('LOW_IMAGE_QUALITY');
    }
    
    if (!input.sensor_data) {
      quality_issues.push('NO_SENSOR_DATA');
    }
    
    if (validation.average_confidence < 0.60) {
      quality_issues.push('LOW_OVERALL_CONFIDENCE');
    }
    
    // Determine sufficiency
    const sufficiency = overall_quality >= 0.75 ? 'SUFFICIENT' :
                        overall_quality >= 0.50 ? 'MARGINAL' : 'INSUFFICIENT';
    
    return {
      overall_quality,
      by_source: bySource,
      sufficiency,
      critical_gaps,
      quality_issues,
      reliability_score: validation.average_confidence
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 7: RECOMMENDATIONS
  // ═══════════════════════════════════════════════════════════════════════════
  
  private generateRecommendations(
    input: MultiModalInput,
    dataQuality: DataQualityAssessment,
    gaps: GapFillingResult
  ): FusionRecommendations {
    
    const additional_data_needed: string[] = [];
    
    if (gaps.gaps_remaining.includes('CROP_STAGE')) {
      additional_data_needed.push('SOWING_DATE_OR_CROP_STAGE');
    }
    if (gaps.gaps_remaining.includes('SOIL_MOISTURE')) {
      additional_data_needed.push('SOIL_MOISTURE_READING');
    }
    
    const photo_required = !input.visual_analysis && dataQuality.overall_quality < 0.75;
    const sensor_check_needed = !input.sensor_data && 
      input.text_understanding.intent.includes('WATER');
    const urgent_escalation = dataQuality.overall_quality < 0.50;
    
    return {
      additional_data_needed,
      photo_required,
      photo_instructions: photo_required ? 
        'Please take a close-up photo of affected leaves/plants in good lighting' : undefined,
      sensor_check_needed,
      urgent_escalation,
      escalation_reason: urgent_escalation ? 
        'Insufficient data quality for reliable diagnosis' : undefined,
      confidence_improvement_possible: photo_required || sensor_check_needed,
      suggested_questions: this.generateSuggestedQuestions(gaps, dataQuality)
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════════
  
  private generateId(): string {
    return `fusion_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private getModalitiesPresent(input: MultiModalInput): string[] {
    const modalities = [MODALITY_NAMES.text, MODALITY_NAMES.weather];
    if (input.visual_analysis) modalities.push(MODALITY_NAMES.visual);
    if (input.sensor_data) modalities.push(MODALITY_NAMES.sensor);
    if (input.satellite_data) modalities.push(MODALITY_NAMES.satellite);
    if (input.historical_data) modalities.push(MODALITY_NAMES.historical);
    return modalities;
  }
  
  private getModalitiesUsed(
    input: MultiModalInput,
    validation: CrossValidationResult,
    gaps: GapFillingResult
  ): string[] {
    const used = new Set<string>();
    
    validation.validated_facts.forEach(f => {
      f.supporting_sources.forEach(s => used.add(s));
    });
    
    gaps.gaps_filled.forEach(g => {
      g.filled_by.forEach(s => used.add(s));
    });
    
    return Array.from(used);
  }
  
  private generateProcessingNotes(
    conflicts: ConflictDetectionResult,
    validation: CrossValidationResult,
    gaps: GapFillingResult
  ): string[] {
    const notes: string[] = [];
    
    if (conflicts.critical_conflicts > 0) {
      notes.push(`${conflicts.critical_conflicts} critical conflict(s) resolved using trust hierarchy`);
    }
    if (validation.strong_agreement_count > 0) {
      notes.push(`${validation.strong_agreement_count} fact(s) validated with strong multi-source agreement`);
    }
    if (gaps.total_gaps_filled > 0) {
      notes.push(`${gaps.total_gaps_filled} information gap(s) filled through inference`);
    }
    if (gaps.gaps_remaining.length > 0) {
      notes.push(`${gaps.gaps_remaining.length} gap(s) remain unfilled: ${gaps.gaps_remaining.join(', ')}`);
    }
    
    return notes;
  }
  
  private determineAgreementLevel(sourceCount: number): AgreementLevel {
    if (sourceCount >= 3) return 'STRONG';
    if (sourceCount === 2) return 'MODERATE';
    return 'WEAK';
  }
  
  private inferCropStage(
    cropCode: string, 
    daysAfterSowing: number, 
    ndvi?: { current: number; trend: string }
  ): string {
    const rules = CROP_STAGE_RULES[cropCode.toUpperCase()];
    
    if (rules) {
      for (const [stage, { minDays, maxDays }] of Object.entries(rules)) {
        if (daysAfterSowing >= minDays && daysAfterSowing <= maxDays) {
          return stage;
        }
      }
    }
    
    // Fallback using NDVI if available
    if (ndvi && ndvi.trend === 'DECLINING' && ndvi.current < 0.6) {
      return 'POST_FLOWERING';
    }
    
    // Generic stages based on days
    if (daysAfterSowing < 20) return 'GERMINATION';
    if (daysAfterSowing < 45) return 'VEGETATIVE';
    if (daysAfterSowing < 90) return 'FLOWERING';
    if (daysAfterSowing < 130) return 'FRUITING';
    return 'MATURITY';
  }
  
  private estimateSoilMoisture(recentRainfall: number, temperature: number): number | null {
    // Simple estimation based on rainfall and evapotranspiration
    if (recentRainfall > 20) return 70;
    if (recentRainfall > 10) return 55;
    if (recentRainfall > 5) return 45;
    
    // Higher temperature = more evaporation
    if (temperature > 35) return 25;
    if (temperature > 30) return 35;
    return 40;
  }
  
  private getMoistureStatus(percent: number): string {
    if (percent < 30) return 'LOW';
    if (percent < 50) return 'MODERATE';
    if (percent < 70) return 'ADEQUATE';
    return 'HIGH';
  }
  
  private estimateDeclineDuration(ndvi: { current: number; previous_week: number }): number {
    const weeklyDecline = ndvi.previous_week - ndvi.current;
    if (weeklyDecline < 0.05) return 1;
    if (weeklyDecline < 0.10) return 2;
    return 3;
  }
  
  private getValueFromSource(
    source: string, 
    conflict: DetectedConflict, 
    input: MultiModalInput
  ): any {
    if (source === MODALITY_NAMES.visual) {
      if (conflict.type === 'TEXT_VS_VISUAL' && conflict.conflict_id.includes('PEST')) {
        return input.visual_analysis?.detections.pests?.[0]?.code;
      }
      if (conflict.type === 'TEXT_VS_VISUAL' && conflict.conflict_id.includes('DISEASE')) {
        return input.visual_analysis?.detections.diseases?.[0]?.code;
      }
    }
    if (source === MODALITY_NAMES.sensor) {
      return input.sensor_data?.readings.soil_moisture_percent;
    }
    if (source === MODALITY_NAMES.satellite) {
      return input.satellite_data?.ndvi.current;
    }
    return conflict.data_points.source2.value;
  }
  
  private determineSeverity(
    validation: CrossValidationResult, 
    input: MultiModalInput
  ): 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' {
    const affectedArea = input.visual_analysis?.severity_quantification.affected_area_percent || 0;
    const ndvi = input.satellite_data?.ndvi.current;
    
    if (affectedArea > 60 || (ndvi && ndvi < 0.3)) return 'CRITICAL';
    if (affectedArea > 40 || (ndvi && ndvi < 0.4)) return 'HIGH';
    if (affectedArea > 20 || (ndvi && ndvi < 0.5)) return 'MODERATE';
    return 'LOW';
  }
  
  private estimateAffectedArea(validation: CrossValidationResult): number {
    const stressFact = validation.validated_facts.find(f => f.fact.includes('STRESS'));
    if (stressFact?.value?.ndvi) {
      const ndvi = stressFact.value.ndvi;
      if (ndvi < 0.3) return 70;
      if (ndvi < 0.4) return 50;
      if (ndvi < 0.5) return 30;
    }
    return 20; // Default estimate
  }
  
  private assessSoilHealth(soilTest?: { ph: number; organic_carbon_percent: number }): 'POOR' | 'FAIR' | 'GOOD' | 'EXCELLENT' {
    if (!soilTest) return 'FAIR';
    
    const phScore = (soilTest.ph >= 6.0 && soilTest.ph <= 7.5) ? 1 : 0;
    const ocScore = soilTest.organic_carbon_percent >= 0.75 ? 1 : 0;
    
    const total = phScore + ocScore;
    if (total === 2) return 'GOOD';
    if (total === 1) return 'FAIR';
    return 'POOR';
  }
  
  private determineStressLevel(input: MultiModalInput): 'NONE' | 'MILD' | 'MODERATE' | 'SEVERE' {
    if (input.satellite_data?.ndvi) {
      const ndvi = input.satellite_data.ndvi.current;
      if (ndvi < 0.3) return 'SEVERE';
      if (ndvi < 0.5) return 'MODERATE';
      if (ndvi < 0.7) return 'MILD';
      return 'NONE';
    }
    return 'MILD'; // Default if no data
  }
  
  private collectStressIndicators(input: MultiModalInput, validation: CrossValidationResult): string[] {
    const indicators: string[] = [];
    
    if (input.satellite_data?.ndvi.trend === 'DECLINING') {
      indicators.push('NDVI_DECLINING');
    }
    if (input.visual_analysis?.severity_quantification.affected_area_percent && 
        input.visual_analysis.severity_quantification.affected_area_percent > 20) {
      indicators.push('VISUAL_DAMAGE');
    }
    if (input.text_understanding.entities.symptom_codes?.length) {
      indicators.push('SYMPTOMS_REPORTED');
    }
    
    return indicators;
  }
  
  private summarizeWeatherConditions(weather: MultiModalInput['weather_data']): string {
    // CRITICAL FIX: Defensive access for variable weather data shapes
    const current = weather?.current || {};
    const rainfall = current.rainfall_last_24h_mm ?? current.precipitation ?? 0;
    const temp = current.temperature_c ?? current.temperature;
    const humidity = current.humidity_percent ?? current.humidity;
    const wind = current.wind_speed_kmh ?? current.wind_speed;
    
    const conditions: string[] = [];
    
    if (temp == null && humidity == null && wind == null) {
      return 'Weather data unavailable';
    }
    
    if (rainfall > 0) {
      conditions.push(`${rainfall}mm rain`);
    }
    if (temp != null && temp > 35) {
      conditions.push('Hot');
    } else if (temp != null && temp < 15) {
      conditions.push('Cool');
    }
    if (humidity != null && humidity > 80) {
      conditions.push('Humid');
    }
    if (wind != null && wind > 20) {
      conditions.push('Windy');
    }
    
    return conditions.length > 0 ? conditions.join(', ') : 'Normal';
  }
  
  private isSprayingSuitable(weather: MultiModalInput['weather_data']): boolean {
    // CRITICAL FIX: Defensive access for variable weather data shapes
    const forecast = weather?.forecast_24h || weather?.forecast?.[0] || {};
    const current = weather?.current || {};
    
    const rainProb = forecast.rain_probability_percent ?? forecast.precipitation_probability ?? null;
    const wind = current.wind_speed_kmh ?? current.wind_speed ?? null;
    const temp = current.temperature_c ?? current.temperature ?? null;
    
    if (rainProb == null || wind == null || temp == null) return false; // Unknown weather = unsafe to spray
    return rainProb < 40 && wind < 15 && temp < 35;
  }
  
  private identifyWeatherRisks(weather: MultiModalInput['weather_data']): string[] {
    // CRITICAL FIX: Defensive access for variable weather data shapes
    const forecast = weather?.forecast_24h || weather?.forecast?.[0] || {};
    
    const rainProb = forecast.rain_probability_percent ?? forecast.precipitation_probability ?? 20;
    const windMax = forecast.wind_max_kmh ?? forecast.wind_speed_max ?? 18;
    const tempMax = forecast.temperature_max_c ?? forecast.temperature_max ?? 32;
    
    const risks: string[] = [];
    
    if (rainProb > 60) {
      risks.push('RAIN_EXPECTED');
    }
    if (windMax > 20) {
      risks.push('HIGH_WIND');
    }
    if (tempMax > 38) {
      risks.push('EXTREME_HEAT');
    }
    
    return risks;
  }
  
  private determineSeason(timestamp: string): 'KHARIF' | 'RABI' | 'SUMMER' | 'TRANSITION' {
    const month = new Date(timestamp).getMonth() + 1;
    
    if (month >= 6 && month <= 10) return 'KHARIF';
    if (month >= 11 || month <= 2) return 'RABI';
    if (month >= 3 && month <= 5) return 'SUMMER';
    return 'TRANSITION';
  }
  
  private determineProgressionRate(input: MultiModalInput): 'RAPID' | 'MODERATE' | 'SLOW' | 'UNKNOWN' {
    if (input.satellite_data?.ndvi) {
      const weeklyChange = input.satellite_data.ndvi.previous_week - input.satellite_data.ndvi.current;
      if (weeklyChange > 0.15) return 'RAPID';
      if (weeklyChange > 0.08) return 'MODERATE';
      if (weeklyChange > 0) return 'SLOW';
    }
    return 'UNKNOWN';
  }
  
  private assessTextQuality(text: MultiModalInput['text_understanding']): number {
    let quality = 0.50; // Base quality
    
    if (text.confidence > 0.70) quality += 0.20;
    if (text.entities.crop_code) quality += 0.10;
    if (text.entities.pest_code || text.entities.disease_code) quality += 0.10;
    if (text.ambiguities.length === 0) quality += 0.10;
    
    return Math.min(1.0, quality);
  }
  
  private assessVisualQuality(visual?: MultiModalInput['visual_analysis']): number {
    if (!visual) return 0.0;
    return visual.quality_score;
  }
  
  private assessSensorReliability(sensor?: MultiModalInput['sensor_data']): number {
    if (!sensor) return 0.0;
    
    switch (sensor.reliability) {
      case 'HIGH': return 0.95;
      case 'MEDIUM': return 0.75;
      case 'LOW': return 0.50;
      default: return 0.0;
    }
  }
  
  private assessSatelliteFreshness(satellite?: MultiModalInput['satellite_data']): number {
    if (!satellite) return 0.0;
    
    const daysSinceAcquisition = Math.floor(
      (Date.now() - new Date(satellite.acquisition_date).getTime()) / (1000 * 60 * 60 * 24)
    );
    
    // Penalize for old data and cloud cover
    let freshness = Math.max(0, 1 - (daysSinceAcquisition / 14)); // Max 14 days
    freshness *= (1 - satellite.cloud_cover_percent / 100);
    
    return freshness;
  }
  
  private assessHistoricalRelevance(historical?: MultiModalInput['historical_data']): number {
    if (!historical) return 0.0;
    
    let relevance = 0.50;
    
    if (historical.sowing_date) relevance += 0.20;
    if (historical.previous_issues?.length > 0) relevance += 0.15;
    if (historical.soil_test_results) relevance += 0.15;
    
    return Math.min(1.0, relevance);
  }
  
  private generateSuggestedQuestions(gaps: GapFillingResult, quality: DataQualityAssessment): string[] {
    const questions: string[] = [];
    
    if (gaps.gaps_remaining.includes('CROP_STAGE')) {
      questions.push('पेरणी कधी केली? / When did you sow the crop?');
    }
    if (quality.critical_gaps.includes('NO_PHOTO_PROVIDED')) {
      questions.push('किडग्रस्त पानाचा फोटो पाठवता का? / Can you send a photo of affected leaves?');
    }
    
    return questions;
  }
}

// Export singleton instance
export const multiModalFusion = new MultiModalFusionEngine();
