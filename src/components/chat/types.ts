// Shared chat message contract.
// EnhancedAIChatInterface = container (state/history/send).
// ModernChatUI = per-message renderer.
// This is the union of the fields previously declared locally in both files.

import type { VisionAnalysisResult } from './VisionAnalysisCard';
import type { DecisionBrainResponse } from './DecisionBrainCards';
import type { DataAudit } from './DataAuditCards';
import type { SuggestionType } from './SuggestionTypeSelector';
import type { DiagnosticEscalationData } from './ModernChatUI';

export type MessageStatus = 'sending' | 'sent' | 'failed' | 'synced';

/**
 * Normalize a confidence value to a 0–100 percentage.
 * Server emits 0–1 (0.9, 0.6); legacy persisted rows may already be 0–100.
 */
export function normalizeConfidencePct(v: unknown): number {
  if (typeof v !== 'number' || isNaN(v)) return 0;
  return v <= 1 ? Math.round(v * 100) : Math.round(v);
}

export interface CitationRefs {
  label: string;      // "Sources" in the farmer's language (from backend)
  pageWord: string;   // "page" in the farmer's language
  pagesWord: string;  // "pages" in the farmer's language
  items: Array<{ documentId: string; title: string; publisher: string; pages: number[] }>;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isPlaying?: boolean;
  landContext?: any;
  imageUrl?: string;
  imageUrls?: string[];
  videoUrl?: string;
  messageType?: 'text' | 'image_analysis' | 'video_analysis' | 'image_analysis_response' | 'video_analysis_response' | 'suggestion_selector' | 'targeted_solution' | 'orchestrator';
  analysisResult?: VisionAnalysisResult | any;
  awaitingSuggestionSelection?: boolean;
  suggestionType?: SuggestionType | 'organic' | 'fertilizer' | 'pesticide' | 'hybrid';
  structured?: {
    greeting?: string;
    landContext?: string;
    sections?: Array<{ type: string; title: string; content: string; color: string }>;
    closingMessage?: string;
    irrigation?: string;
    fertilizer?: string;
    pest?: string;
    weather?: string;
  };
  structuredResponse?: {
    cards: Array<{
      id: string;
      type: 'organic' | 'fertilizer' | 'pesticide' | 'warning' | 'success' | 'info' | 'hormone' | 'irrigation';
      title: string;
      content: string;
      color: string;
      gradient: string[];
      icon: string;
      priority: number;
    }>;
    language: string;
  };
  decisionBrainResponse?: DecisionBrainResponse;
  dataAudit?: DataAudit | any;
  /** Structured references for a RAG-grounded General-chat answer (2026-09-04).
   *  Label/page words are already in the farmer's language (set by the backend). */
  citations?: CitationRefs;
  diagnosticData?: {
    landName?: string;
    cropName?: string;
    daysAfterSowing?: number;
    growthStage?: string;
    areaDisplay?: string;
    soilMoisture?: number;
    ndviValue?: number;
    temperature?: number;
    symptomDetected?: string;
    rankedCauses: Array<{
      cause_name: string;
      probability: number;
      differentiating_factors: string[];
    }>;
    eliminatedCauses?: Array<{ causeName: string; eliminationReason: string }>;
    disambiguationQuestions: Array<{
      question: string;
      yesIndicates: string;
      noIndicates: string;
    }>;
    photoRequired?: boolean;
    photoInstructions?: string[];
    confidence: number;
    mode: 'DIAGNOSTIC' | 'ACTION' | 'PHOTO_REQUIRED';
  };
  feedback?: 'like' | 'dislike' | null;
  structuredAdvisory?: any;
  isCopied?: boolean;
  orchestratorType?: 'DECISION_PROVIDED' | 'CLARIFICATION_QUESTION' | 'PHOTO_REQUEST' | 'SAFETY_BLOCKED' | 'ESCALATION_REQUIRED' | 'DIAGNOSTIC_ESCALATION';
  diagnosticEscalationData?: DiagnosticEscalationData;
  traceId?: string;
  analytics?: {
    responseTime?: number;
    tokensUsed?: {
      prompt: number;
      completion: number;
      total: number;
    };
    queryComplexity?: string;
  };
  clarificationOptions?: {
    question?: string;
    options?: Array<{ label: string; value?: string; description?: string; observation_key?: string }>;
    selectionType?: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE';
  };
  status?: MessageStatus;
  tempId?: string;
}
