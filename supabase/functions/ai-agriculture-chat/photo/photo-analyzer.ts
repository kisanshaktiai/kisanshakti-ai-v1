// PHOTO ANALYZER - Vision API Integration for Crop Disease/Pest Analysis

import { AI_MODELS, getAPIKey, hasGeminiKey, getBestAvailableProvider } from '../../_shared/aiConfig.ts';

export const PHOTO_ANALYZER_VERSION = '1.0.0';

// TYPES

export interface PhotoAnalysisInput {
  image_url: string;
  farmer_message?: string;
  crop_context?: {
    crop_code?: string;
    growth_stage?: string;
    days_since_sowing?: number;
  };
  language?: string;
}

export interface PhotoAnalysisOutput {
  success: boolean;
  observations: PhotoObservation[];
  detected_issues: DetectedIssue[];
  severity_assessment: SeverityAssessment;
  image_quality: ImageQuality;
  confidence: number;
  raw_analysis?: string;
  error?: string;
}

export interface PhotoObservation {
  key: string;              // English observation key (e.g., 'LEAF_YELLOWING')
  description: string;      // Human-readable description
  category: 'SYMPTOM' | 'PEST' | 'DISEASE' | 'NUTRIENT' | 'DAMAGE' | 'BENEFICIAL';
  confidence: number;
  affected_area_percent?: number;
}

export interface DetectedIssue {
  type: 'PEST' | 'DISEASE' | 'NUTRIENT_DEFICIENCY' | 'WATER_STRESS' | 'UNKNOWN';
  name: string;
  confidence: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  visual_indicators: string[];
}

export interface SeverityAssessment {
  overall_severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  /**
   * 2026-08-30: `null` means the model reported no figure. Previously an absent
   * value was coerced to 0, which is a positive claim ("no area affected")
   * rather than an absence, and 0 is not nullish so it defeated `??` guards
   * downstream. Verified: no consumer in this function reads this field, so
   * widening the type has no ripple.
   */
  affected_area_percent: number | null;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY';
  recommended_action: string;
}

export interface ImageQuality {
  is_usable: boolean;
  quality_score: number;  // 0-1
  issues: string[];       // e.g., 'blurry', 'too_dark', 'wrong_subject'
}

// ANALYSIS PROMPT

function buildAnalysisPrompt(input: PhotoAnalysisInput): string {
  const cropContext = input.crop_context 
    ? `The farmer is growing ${input.crop_context.crop_code || 'unknown crop'} at ${input.crop_context.growth_stage || 'unknown'} stage (${input.crop_context.days_since_sowing || 0} days after sowing).`
    : 'Crop context is not available.';
  
  const farmerContext = input.farmer_message 
    ? `The farmer described: "${input.farmer_message}"`
    : '';

  return `You are an expert agricultural advisor analyzing a crop photo for pest, disease, or nutrient issues.

${cropContext}
${farmerContext}

Analyze this crop photo and return a JSON object with the following structure:
{
  "image_quality": {
    "is_usable": true/false,
    "quality_score": 0.0-1.0,
    "issues": ["list of quality issues if any"]
  },
  "observations": [
    {
      "key": "ENGLISH_OBSERVATION_KEY",
      "description": "Human readable description",
      "category": "SYMPTOM|PEST|DISEASE|NUTRIENT|DAMAGE|BENEFICIAL",
      "confidence": 0.0-1.0,
      "affected_area_percent": 0-100
    }
  ],
  "detected_issues": [
    {
      "type": "PEST|DISEASE|NUTRIENT_DEFICIENCY|WATER_STRESS|UNKNOWN",
      "name": "Issue name in English",
      "confidence": 0.0-1.0,
      "severity": "LOW|MEDIUM|HIGH|CRITICAL",
      "visual_indicators": ["list of visual signs supporting this diagnosis"]
    }
  ],
  "severity_assessment": {
    "overall_severity": "LOW|MEDIUM|HIGH|CRITICAL",
    "affected_area_percent": 0-100,
    "urgency": "LOW|MEDIUM|HIGH|EMERGENCY",
    "recommended_action": "Brief action recommendation"
  }
}

IMPORTANT RULES:
1. Use standardized observation keys like: LEAF_YELLOWING, LEAF_SPOTS, WILTING, PEST_VISIBLE, HOLES_IN_LEAVES, CURLING, STUNTED_GROWTH, etc.
2. Be conservative with confidence scores - only use >0.8 for clear, definitive observations
3. If image quality is poor (blurry, too dark, wrong subject), set is_usable to false
4. Do NOT diagnose specific pest/disease names unless clearly visible - instead describe what you SEE
5. Focus on OBSERVATIONS first (what's visible), then possible causes

Return ONLY the JSON object, no other text.`;
}

// MAIN ANALYSIS FUNCTION

export async function analyzePhoto(input: PhotoAnalysisInput): Promise<PhotoAnalysisOutput> {
  const startTime = Date.now();
  console.log(`📸 [PhotoAnalyzer] Starting analysis...`);
  console.log(`   Image URL: ${input.image_url.substring(0, 50)}...`);
  console.log(`   Crop context: ${input.crop_context?.crop_code || 'none'}`);
  
  try {
    // CRITICAL FIX: Use getBestAvailableProvider() to get matching provider+key
    // This ensures we never send Gemini key to OpenAI endpoint or vice versa
    const { provider, apiKey } = getBestAvailableProvider();
    
    if (!apiKey) {
      throw new Error('No API key available for vision analysis');
    }
    
    const useGemini = provider === 'gemini' || provider === 'google';
    console.log(`   Using provider: ${provider}`);
    
    const analysisPrompt = buildAnalysisPrompt(input);
    
    let response: Response;
    let analysisResult: any;
    
    if (useGemini) {
      // Use Gemini Vision
      response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: analysisPrompt },
              { inline_data: { mime_type: 'image/jpeg', data: await fetchImageAsBase64(input.image_url) } }
            ]
          }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 2048
          }
        })
      });
      
      const geminiResult = await response.json();
      const textContent = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text || '';
      analysisResult = parseJsonFromText(textContent);
      
    } else {
      // Use OpenAI GPT-4o Vision
      const openaiKey = Deno.env.get('OPENAI_API_KEY');
      if (!openaiKey) {
        throw new Error('OpenAI API key not configured');
      }
      
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: analysisPrompt },
              { type: 'image_url', image_url: { url: input.image_url, detail: 'high' } }
            ]
          }],
          max_tokens: 2048,
          temperature: 0.2,
          response_format: { type: 'json_object' }
        })
      });
      
      const openaiResult = await response.json();
      const textContent = openaiResult.choices?.[0]?.message?.content || '';
      analysisResult = parseJsonFromText(textContent);
    }
    
    // Validate and normalize the result
    const output = normalizeAnalysisResult(analysisResult);
    
    const processingTime = Date.now() - startTime;
    console.log(`   ✅ Analysis complete (${processingTime}ms)`);
    console.log(`   Observations: ${output.observations.length}, Issues: ${output.detected_issues.length}`);
    console.log(`   Confidence: ${(output.confidence * 100).toFixed(0)}%`);
    
    return output;
    
  } catch (error) {
    console.error(`   ❌ Photo analysis failed:`, error);
    return {
      success: false,
      observations: [],
      detected_issues: [],
      severity_assessment: {
        overall_severity: 'LOW',
        affected_area_percent: null,
        urgency: 'LOW',
        recommended_action: 'Unable to analyze photo. Please try again with a clearer image.'
      },
      image_quality: {
        is_usable: false,
        quality_score: 0,
        issues: ['analysis_failed']
      },
      confidence: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// HELPER FUNCTIONS

async function fetchImageAsBase64(imageUrl: string): Promise<string> {
  // If already base64, extract the data part
  if (imageUrl.startsWith('data:image')) {
    const base64Data = imageUrl.split(',')[1];
    return base64Data;
  }
  
  // Fetch and convert to base64
  const response = await fetch(imageUrl);
  const arrayBuffer = await response.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < uint8Array.length; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binary);
}

function parseJsonFromText(text: string): any {
  // Try to extract JSON from the text (handle markdown code blocks)
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || 
                    text.match(/```\s*([\s\S]*?)\s*```/) ||
                    text.match(/\{[\s\S]*\}/);
  
  const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text;
  
  try {
    return JSON.parse(jsonStr.trim());
  } catch (e) {
    console.error('Failed to parse JSON from vision response:', jsonStr.substring(0, 200));
    return null;
  }
}

function normalizeAnalysisResult(result: any): PhotoAnalysisOutput {
  if (!result) {
    return {
      success: false,
      observations: [],
      detected_issues: [],
      severity_assessment: {
        overall_severity: 'LOW',
        affected_area_percent: null,
        urgency: 'LOW',
        recommended_action: 'Could not parse analysis result'
      },
      image_quality: {
        is_usable: false,
        quality_score: 0,
        issues: ['parse_error']
      },
      confidence: 0,
      error: 'Failed to parse analysis result'
    };
  }
  
  // Normalize observations
  const observations: PhotoObservation[] = (result.observations || []).map((obs: any) => ({
    key: String(obs.key || 'UNKNOWN').toUpperCase().replace(/\s+/g, '_'),
    description: String(obs.description || ''),
    category: validateCategory(obs.category),
    confidence: Math.min(1, Math.max(0, Number(obs.confidence) || 0.5)),
    affected_area_percent: obs.affected_area_percent
  }));
  
  // Normalize detected issues
  const detected_issues: DetectedIssue[] = (result.detected_issues || []).map((issue: any) => ({
    type: validateIssueType(issue.type),
    name: String(issue.name || 'Unknown Issue'),
    confidence: Math.min(1, Math.max(0, Number(issue.confidence) || 0.5)),
    severity: validateSeverity(issue.severity),
    visual_indicators: Array.isArray(issue.visual_indicators) ? issue.visual_indicators : []
  }));
  
  // Normalize severity assessment
  // 2026-08-30: absent stays absent — see the SeverityAssessment doc comment.
  const rawAffectedArea = Number(result.severity_assessment?.affected_area_percent);
  const severity_assessment: SeverityAssessment = {
    overall_severity: validateSeverity(result.severity_assessment?.overall_severity),
    affected_area_percent: Number.isFinite(rawAffectedArea)
      ? Math.min(100, Math.max(0, rawAffectedArea))
      : null,
    urgency: validateUrgency(result.severity_assessment?.urgency),
    recommended_action: String(result.severity_assessment?.recommended_action || 'Monitor and take photo again if symptoms persist')
  };
  
  // Normalize image quality
  const image_quality: ImageQuality = {
    is_usable: result.image_quality?.is_usable !== false,
    quality_score: Math.min(1, Math.max(0, Number(result.image_quality?.quality_score) || 0.7)),
    issues: Array.isArray(result.image_quality?.issues) ? result.image_quality.issues : []
  };
  
  // Calculate overall confidence
  const avgConfidence = observations.length > 0 
    ? observations.reduce((sum, obs) => sum + obs.confidence, 0) / observations.length
    : 0.5;
  
  return {
    success: image_quality.is_usable,
    observations,
    detected_issues,
    severity_assessment,
    image_quality,
    confidence: avgConfidence,
    raw_analysis: JSON.stringify(result)
  };
}

function validateCategory(category: any): PhotoObservation['category'] {
  const valid = ['SYMPTOM', 'PEST', 'DISEASE', 'NUTRIENT', 'DAMAGE', 'BENEFICIAL'];
  return valid.includes(String(category).toUpperCase()) 
    ? String(category).toUpperCase() as PhotoObservation['category']
    : 'SYMPTOM';
}

function validateIssueType(type: any): DetectedIssue['type'] {
  const valid = ['PEST', 'DISEASE', 'NUTRIENT_DEFICIENCY', 'WATER_STRESS', 'UNKNOWN'];
  return valid.includes(String(type).toUpperCase()) 
    ? String(type).toUpperCase() as DetectedIssue['type']
    : 'UNKNOWN';
}

function validateSeverity(severity: any): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  const valid = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  return valid.includes(String(severity).toUpperCase()) 
    ? String(severity).toUpperCase() as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
    : 'LOW';
}

function validateUrgency(urgency: any): 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY' {
  const valid = ['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY'];
  return valid.includes(String(urgency).toUpperCase()) 
    ? String(urgency).toUpperCase() as 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY'
    : 'LOW';
}

// UNDERSTANDING ENHANCEMENT

// Enhance understanding output with photo analysis results
export function enhanceUnderstandingWithPhoto(
  understanding: any,
  photoAnalysis: PhotoAnalysisOutput
): any {
  if (!photoAnalysis.success || !understanding) {
    return understanding;
  }
  
  console.log(`📸 [PhotoAnalyzer] Enhancing understanding with photo observations...`);
  
  // Add photo observations to existing observations
  const photoObservations = photoAnalysis.observations.map(obs => ({
    key: obs.key,
    original_text: obs.description,
    category: obs.category,
    confidence: obs.confidence,
    metadata: {
      source: 'PHOTO_ANALYSIS',
      affected_area_percent: obs.affected_area_percent
    }
  }));
  
  const enhancedObservations = [
    ...(understanding.observations || []),
    ...photoObservations
  ];
  
  // Boost confidence if photo confirms text observations
  let confidenceBoost = 0;
  if (photoAnalysis.confidence > 0.7) {
    confidenceBoost = 0.15;  // Photo adds 15% confidence when clear
  }
  
  // Update urgency based on photo analysis
  const photoUrgency = photoAnalysis.severity_assessment.urgency;
  const currentUrgency = understanding.urgency || 'LOW';
  const urgencyOrder = ['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY'];
  const maxUrgency = urgencyOrder.indexOf(photoUrgency) > urgencyOrder.indexOf(currentUrgency)
    ? photoUrgency
    : currentUrgency;
  
  console.log(`   Added ${photoObservations.length} observations from photo`);
  console.log(`   Confidence boost: +${(confidenceBoost * 100).toFixed(0)}%`);
  console.log(`   Urgency: ${currentUrgency} → ${maxUrgency}`);
  
  return {
    ...understanding,
    observations: enhancedObservations,
    confidence: Math.min(1, (understanding.confidence || 0.5) + confidenceBoost),
    urgency: maxUrgency,
    context_needed: understanding.context_needed?.filter((c: string) => c !== 'PHOTO') || [],
    photo_analysis: {
      analyzed: true,
      quality_score: photoAnalysis.image_quality.quality_score,
      observations_added: photoObservations.length,
      severity: photoAnalysis.severity_assessment.overall_severity
    }
  };
}
