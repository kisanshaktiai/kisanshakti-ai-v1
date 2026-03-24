/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PHOTO DISAMBIGUATION SERVICE - Visual Confirmation Integration
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Handles photo requests and integrates visual analysis results back into
 * the Decision Brain for more accurate diagnosis.
 * 
 * FLOW:
 * 1. Diagnostic Mode determines photo is needed
 * 2. This service generates farmer-friendly photo request message
 * 3. Farmer takes photo via InstaScan
 * 4. InstaScan results are fed back here
 * 5. Results are used to confirm/eliminate causes
 * 
 * INTEGRATION POINTS:
 * - InstaScanFlow.tsx for camera capture
 * - ai-crop-scan edge function for analysis
 * - decisionBrainChatService for final decision
 */

import { PhotoRequest, DiagnosticDecision } from './diagnosticModeController';
import { PossibleCause } from './symptomPatternRecognizer';
import { Cause } from '@/decision-graph/types-only';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface PhotoAnalysisResult {
  success: boolean;
  identifiedIssue?: string;
  diseaseType?: string;
  pestType?: string;
  confidence: number;
  healthScore?: number;
  recommendations?: string[];
  rawResult?: any;
}

export interface PhotoConfirmationResult {
  confirmedCause: PossibleCause | null;
  eliminatedCauses: Cause[];
  newConfidence: number;
  analysisNotes: string[];
}

export interface ChatPhotoRequest {
  messageType: 'PHOTO_REQUEST';
  message: string;
  photoRequest: PhotoRequest;
  showCameraButton: boolean;
  sessionContext: {
    symptomIds: string[];
    suspectedCauses: string[];
    cropCode?: string;
    daysAfterSowing?: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PHOTO REQUEST MESSAGE BUILDER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a farmer-friendly photo request message for the chat
 */
export function buildPhotoRequestMessage(
  photoRequest: PhotoRequest,
  suspectedCauses: PossibleCause[],
  language: string = 'mr'
): ChatPhotoRequest {
  const lang = (language === 'hi' || language === 'mr') ? language : 'en';
  
  // Build the message based on language
  let message = '';
  
  if (lang === 'mr') {
    message = `📷 ${photoRequest.reason}\n\n`;
    message += `✅ खालील फोटो पाठवा:\n`;
    photoRequest.whatToCapture.forEach((item, i) => {
      message += `${i + 1}. ${item}\n`;
    });
    message += `\n🔍 संभाव्य कारणे:\n`;
    suspectedCauses.slice(0, 3).forEach((cause, i) => {
      const icon = i === 0 ? '1️⃣' : i === 1 ? '2️⃣' : '3️⃣';
      message += `${icon} ${cause.cause_name} – ${Math.round(cause.probability * 100)}% शक्यता\n`;
    });
    message += `\n⚠️ फोटोवरून नक्की कारण समजेल आणि योग्य उपाय सांगता येईल.`;
  } else if (lang === 'hi') {
    message = `📷 ${photoRequest.reason}\n\n`;
    message += `✅ ये फोटो भेजें:\n`;
    photoRequest.whatToCapture.forEach((item, i) => {
      message += `${i + 1}. ${item}\n`;
    });
    message += `\n🔍 संभावित कारण:\n`;
    suspectedCauses.slice(0, 3).forEach((cause, i) => {
      const icon = i === 0 ? '1️⃣' : i === 1 ? '2️⃣' : '3️⃣';
      message += `${icon} ${cause.cause_name} – ${Math.round(cause.probability * 100)}% संभावना\n`;
    });
    message += `\n⚠️ फोटो से सही कारण पता चलेगा और सही उपाय बताए जाएंगे।`;
  } else {
    message = `📷 ${photoRequest.reason}\n\n`;
    message += `✅ Please send the following photos:\n`;
    photoRequest.whatToCapture.forEach((item, i) => {
      message += `${i + 1}. ${item}\n`;
    });
    message += `\n🔍 Suspected causes:\n`;
    suspectedCauses.slice(0, 3).forEach((cause, i) => {
      const icon = i === 0 ? '1️⃣' : i === 1 ? '2️⃣' : '3️⃣';
      message += `${icon} ${cause.cause_name} – ${Math.round(cause.probability * 100)}% probability\n`;
    });
    message += `\n⚠️ Photos will help identify the exact cause and provide appropriate treatment.`;
  }
  
  return {
    messageType: 'PHOTO_REQUEST',
    message,
    photoRequest,
    showCameraButton: true,
    sessionContext: {
      symptomIds: [],
      suspectedCauses: suspectedCauses.map(c => c.cause_name),
      cropCode: photoRequest.contextForAnalysis.cropCode,
      daysAfterSowing: photoRequest.contextForAnalysis.daysAfterSowing
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PHOTO ANALYSIS RESULT MAPPER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Map InstaScan/AI analysis results to cause confirmation
 */
export function mapPhotoAnalysisToCause(
  analysisResult: PhotoAnalysisResult,
  suspectedCauses: PossibleCause[]
): PhotoConfirmationResult {
  const analysisNotes: string[] = [];
  const eliminatedCauses: Cause[] = [];
  let confirmedCause: PossibleCause | null = null;
  let newConfidence = analysisResult.confidence;
  
  if (!analysisResult.success || analysisResult.confidence < 0.30) {
    analysisNotes.push('Photo analysis inconclusive - manual inspection recommended');
    return {
      confirmedCause: null,
      eliminatedCauses: [],
      newConfidence: 0.30,
      analysisNotes
    };
  }
  
  const identifiedIssue = (analysisResult.identifiedIssue || '').toLowerCase();
  const diseaseType = (analysisResult.diseaseType || '').toLowerCase();
  const pestType = (analysisResult.pestType || '').toLowerCase();
  
  // Match analysis result to suspected causes
  for (const cause of suspectedCauses) {
    const causeName = cause.cause_name.toLowerCase();
    const causeStr = cause.cause.toString().toLowerCase();
    
    // Check for pest matches
    if (pestType) {
      if (causeName.includes('borer') && (pestType.includes('borer') || pestType.includes('caterpillar'))) {
        confirmedCause = cause;
        newConfidence = Math.max(newConfidence, 0.85);
        analysisNotes.push(`Photo confirms borer attack: ${pestType}`);
        break;
      }
      if (causeName.includes('caterpillar') && pestType.includes('larva')) {
        confirmedCause = cause;
        newConfidence = Math.max(newConfidence, 0.80);
        analysisNotes.push(`Photo confirms larval damage: ${pestType}`);
        break;
      }
    }
    
    // Check for disease matches
    if (diseaseType) {
      if (causeName.includes('fungal') && (diseaseType.includes('fungal') || diseaseType.includes('spot') || diseaseType.includes('blight'))) {
        confirmedCause = cause;
        newConfidence = Math.max(newConfidence, 0.85);
        analysisNotes.push(`Photo confirms fungal disease: ${diseaseType}`);
        break;
      }
      if (causeName.includes('rust') && diseaseType.includes('rust')) {
        confirmedCause = cause;
        newConfidence = Math.max(newConfidence, 0.90);
        analysisNotes.push(`Photo confirms rust disease: ${diseaseType}`);
        break;
      }
      if (causeName.includes('wilt') && (diseaseType.includes('wilt') || diseaseType.includes('fusarium'))) {
        confirmedCause = cause;
        newConfidence = Math.max(newConfidence, 0.85);
        analysisNotes.push(`Photo confirms wilt disease: ${diseaseType}`);
        break;
      }
    }
    
    // Check for nutrient/stress matches
    if (identifiedIssue) {
      if (causeName.includes('nitrogen') && identifiedIssue.includes('nitrogen')) {
        confirmedCause = cause;
        newConfidence = Math.max(newConfidence, 0.80);
        analysisNotes.push(`Photo confirms nitrogen deficiency`);
        break;
      }
      if (causeName.includes('water') && (identifiedIssue.includes('drought') || identifiedIssue.includes('water stress'))) {
        confirmedCause = cause;
        newConfidence = Math.max(newConfidence, 0.85);
        analysisNotes.push(`Photo confirms water stress`);
        break;
      }
    }
  }
  
  // If we found a confirmed cause, eliminate others
  if (confirmedCause) {
    for (const cause of suspectedCauses) {
      if (cause.cause !== confirmedCause.cause) {
        eliminatedCauses.push(cause.cause);
      }
    }
  }
  
  // Health score can help eliminate certain causes
  if (analysisResult.healthScore !== undefined) {
    if (analysisResult.healthScore > 70) {
      // Healthy plant - likely not severe disease
      analysisNotes.push(`Plant appears generally healthy (score: ${analysisResult.healthScore}%)`);
      for (const cause of suspectedCauses) {
        if (cause.cause.toString().includes('CRITICAL') || cause.cause.toString().includes('SEVERE')) {
          if (!eliminatedCauses.includes(cause.cause)) {
            eliminatedCauses.push(cause.cause);
            analysisNotes.push(`Eliminated severe condition: ${cause.cause_name}`);
          }
        }
      }
    }
  }
  
  return {
    confirmedCause,
    eliminatedCauses,
    newConfidence,
    analysisNotes
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSION CONTEXT MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

interface DiagnosticSessionContext {
  sessionId: string;
  symptomIds: string[];
  suspectedCauses: PossibleCause[];
  diagnosticDecision: DiagnosticDecision;
  cropCode?: string;
  daysAfterSowing?: number;
  photoRequested: boolean;
  photoReceived: boolean;
  photoResult?: PhotoConfirmationResult;
}

// In-memory session storage (in production, use proper storage)
const diagnosticSessions = new Map<string, DiagnosticSessionContext>();

/**
 * Store diagnostic context for photo follow-up
 */
export function storeDiagnosticContext(
  sessionId: string,
  symptomIds: string[],
  suspectedCauses: PossibleCause[],
  diagnosticDecision: DiagnosticDecision,
  cropCode?: string,
  daysAfterSowing?: number
): void {
  diagnosticSessions.set(sessionId, {
    sessionId,
    symptomIds,
    suspectedCauses,
    diagnosticDecision,
    cropCode,
    daysAfterSowing,
    photoRequested: diagnosticDecision.mode === 'PHOTO_REQUIRED',
    photoReceived: false
  });
  
  console.log(`📸 [Photo Service] Stored diagnostic context for session: ${sessionId}`);
}

/**
 * Retrieve diagnostic context when photo is received
 */
export function getDiagnosticContext(sessionId: string): DiagnosticSessionContext | null {
  return diagnosticSessions.get(sessionId) || null;
}

/**
 * Update session with photo analysis result
 */
export function updateSessionWithPhotoResult(
  sessionId: string,
  photoResult: PhotoConfirmationResult
): void {
  const session = diagnosticSessions.get(sessionId);
  if (session) {
    session.photoReceived = true;
    session.photoResult = photoResult;
    diagnosticSessions.set(sessionId, session);
    console.log(`📸 [Photo Service] Updated session ${sessionId} with photo result`);
  }
}

/**
 * Clear diagnostic session after resolution
 */
export function clearDiagnosticSession(sessionId: string): void {
  diagnosticSessions.delete(sessionId);
}

// ═══════════════════════════════════════════════════════════════════════════
// INSTASCAN INTEGRATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Prepare context for InstaScan camera flow
 */
export function prepareInstaScanContext(
  diagnosticDecision: DiagnosticDecision,
  sessionId: string
): {
  mode: 'disambiguation';
  sessionId: string;
  suspectedCauses: string[];
  whatToLookFor: string[];
} {
  return {
    mode: 'disambiguation',
    sessionId,
    suspectedCauses: diagnosticDecision.remainingCauses.map(c => c.cause_name),
    whatToLookFor: diagnosticDecision.photoRequest?.whatToCapture || []
  };
}

/**
 * Process InstaScan result for the Decision Brain
 */
export function processInstaScanResult(
  scanResult: {
    identified_as?: string;
    disease_info?: { name?: string; type?: string };
    pest_info?: { name?: string; type?: string };
    confidence?: number;
    health_status?: string;
    recommendations?: string[];
  },
  sessionId: string
): PhotoConfirmationResult | null {
  const session = getDiagnosticContext(sessionId);
  if (!session) {
    console.warn(`📸 [Photo Service] No session found for: ${sessionId}`);
    return null;
  }
  
  const analysisResult: PhotoAnalysisResult = {
    success: true,
    identifiedIssue: scanResult.identified_as,
    diseaseType: scanResult.disease_info?.name || scanResult.disease_info?.type,
    pestType: scanResult.pest_info?.name || scanResult.pest_info?.type,
    confidence: scanResult.confidence || 0.5,
    healthScore: scanResult.health_status === 'Healthy' ? 85 : 
                 scanResult.health_status === 'Moderate Stress' ? 60 : 
                 scanResult.health_status === 'Severe Stress' ? 30 : 50,
    recommendations: scanResult.recommendations,
    rawResult: scanResult
  };
  
  const confirmationResult = mapPhotoAnalysisToCause(analysisResult, session.suspectedCauses);
  updateSessionWithPhotoResult(sessionId, confirmationResult);
  
  return confirmationResult;
}
