import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { 
  Send, Mic, MicOff, Loader2, Bot, 
  RefreshCw, Wifi, WifiOff, MessageSquare, Mountain, 
  Paperclip, Camera, Image, ArrowLeft,
  Search, X, Clock, MessageCircle, Check, AlertCircle
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { supabase, supabaseWithAuth } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useTenant } from '@/contexts/TenantContext';
import { landsApi } from '@/services/landsApi';
import { localDB } from '@/services/localDB';
import { chatSyncService } from '@/services/chatSyncService';
import { LandContextCard } from './LandContextCard';
import { GeneralChatWelcomeCard } from './GeneralChatWelcomeCard';
import { ResponseSectionCard } from './ResponseSectionCard';
import { ModernChatUI } from './ModernChatUI';
import { WorldClassCamera } from './WorldClassCamera';
import { VisionAnalysisCard, type VisionAnalysisResult } from './VisionAnalysisCard';
import { DecisionBrainCards, type DecisionBrainResponse } from './DecisionBrainCards';
import { DiagnosticResponseCard } from './DiagnosticResponseCard';
import FarmingModeBadge, { type FarmingMode } from './FarmingModeBadge';
import { useFarmingModeHydration } from '@/hooks/useFarmingModeHydration';

import { CropRecommendationCard } from './CropRecommendationCard';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { useLanguageStore } from '@/stores/languageStore';
import { useVoiceInitialization } from '@/hooks/useVoiceInitialization';
import { VoiceDownloadCard } from '@/components/onboarding/VoiceDownloadCard';
import { uploadChatImage, uploadCompressedVideo } from '@/utils/chatImageStorage';
import { useEntitlements } from '@/hooks/useEntitlements';
import { ChatQuotaHeader } from '@/components/subscription/ChatQuotaHeader';
import { ChatQuotaBanner } from '@/components/subscription/ChatQuotaBanner';
import GeneralChatLandPicker from './GeneralChatLandPicker';
import { useQueryClient } from '@tanstack/react-query';
import { prefetchLandChatContext } from '@/hooks/useLandChatContext';

// Message status type for optimistic updates
export type MessageStatus = 'sending' | 'sent' | 'failed' | 'synced';

interface Message {
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
  analysisResult?: VisionAnalysisResult;
  awaitingSuggestionSelection?: boolean;
  suggestionType?: 'organic' | 'fertilizer' | 'pesticide' | 'hybrid';
  structured?: {
    greeting?: string;
    landContext?: string;
    sections?: Array<{type: string, title: string, content: string, color: string}>;
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
  // ✅ NEW: Data Audit for debugging - shows what data was found/missing
  dataAudit?: any;
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
  // ✅ Canonical Farmer Advisory structured JSON from backend
  structuredAdvisory?: any;
  isCopied?: boolean;
  // Orchestrator response metadata
  orchestratorType?: 'DECISION_PROVIDED' | 'CLARIFICATION_QUESTION' | 'PHOTO_REQUEST' | 'SAFETY_BLOCKED' | 'ESCALATION_REQUIRED' | 'DIAGNOSTIC_ESCALATION';
  // ✅ NEW: Diagnostic Escalation data for expert-quality intermediate responses
  diagnosticEscalationData?: {
    hypotheses: Array<{
      cause_code: string;
      cause_name: string;
      category: 'PEST' | 'DISEASE' | 'NUTRIENT' | 'WATER' | 'WEATHER' | 'OTHER';
      confidence: number;
      supporting_evidence: string[];
      confirming_evidence: string[];
      ruling_out_evidence: string[];
      explanation?: string;
    }>;
    required_inputs: Array<{
      type: 'PHOTO' | 'SEVERITY' | 'DISTRIBUTION' | 'SYMPTOM_DETAIL';
      target: string;
      rationale: string;
      priority: 'HIGH' | 'MEDIUM' | 'LOW';
      photo_guidance?: {
        what_to_capture: string;
        angle: string;
        lighting: string;
      };
    }>;
    current_confidence: number;
    threshold_for_treatment: number;
    diagnostic_summary?: string;
    interim_monitoring?: string[];
    photo_recommended?: boolean;
  };
  // PHASE 5: Add trace_id for debugging
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
  // Clarification options for Decision Brain interactive UI
  clarificationOptions?: {
    question?: string;
    options?: Array<{ label: string; value?: string; description?: string; observation_key?: string }>;
    selectionType?: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE';
  };
  // ⚡ OPTIMISTIC UPDATE: Message status for WhatsApp-like UX
  status?: MessageStatus;
  // For retry logic
  tempId?: string;
}

export function EnhancedAIChatInterface() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { tenant, isLoading: isTenantLoading } = useTenant();
  const langStore = useLanguageStore();
  const language = langStore.currentLanguage || 'en';
  const isOnline = useOfflineStatus();
  const { needsDownload, isInitialized, currentLanguage } = useVoiceInitialization();
  const [showVoiceDownload, setShowVoiceDownload] = useState(false);
  
  const [activeTab, setActiveTab] = useState('general');
  const [lands, setLands] = useState<any[]>([]);
  const queryClient = useQueryClient();

  /**
   * Prefetch the full land-scoped chat context (land row, active crop +
   * variety + sowing date, latest soil, latest NDVI, live weather + daily
   * metrics) the moment the farmer taps a land tab, so the welcome card
   * and downstream orchestrator request paint with real data on first
   * frame. See `useLandChatContext` for the exact columns and tables.
   */
  const selectLandTab = React.useCallback(
    (landId: string) => {
      setActiveTab(landId);
      if (tenant?.id && user?.id) {
        prefetchLandChatContext(queryClient, landId, tenant.id, user.id);
      }
    },
    [queryClient, tenant?.id, user?.id],
  );

  // GENERAL-CHAT land context picker:
  //   undefined => not yet chosen for this session (open picker before sending)
  //   null      => farmer explicitly chose "no specific land"
  //   string    => land.id of the chosen land
  const [generalLandId, setGeneralLandId] = useState<string | null | undefined>(undefined);
  const [showGeneralLandPicker, setShowGeneralLandPicker] = useState(false);
  const pendingGeneralSendRef = useRef<string | null>(null);
  
  const [messages, setMessages] = useState<Record<string, Message[]>>({
    general: []
  });
  const [inputValue, setInputValue] = useState('');
  const { aiChat: aiChatEntitlement, bumpUsage, refresh: refreshEntitlements } = useEntitlements();
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [sessionIds, setSessionIds] = useState<Record<string, string>>({});
  // CRITICAL FIX: loadedSessionIds should reset when user changes
  const [loadedSessionIds, setLoadedSessionIds] = useState<Set<string>>(new Set());
  const [hasEverHadMessages, setHasEverHadMessages] = useState<Record<string, boolean>>({});
  
  // CRITICAL FIX (2026-01-14): Reset loaded state when user OR tenant changes (re-login scenario)
  const prevUserIdRef = useRef<string | null>(null);
  const prevTenantIdRef = useRef<string | null>(null);
  useEffect(() => {
    const userChanged = user?.id && user.id !== prevUserIdRef.current;
    const tenantChanged = tenant?.id && tenant.id !== prevTenantIdRef.current;
    
    if (userChanged || tenantChanged) {
      // Reset all loaded states when user/tenant changes to force reload
      setLoadedSessionIds(new Set());
      setSessionIds({});
      setMessages({ general: [] });
      setHasEverHadMessages({});
      setLands([]);
      
      // CRITICAL: Re-initialize localDB for new tenant
      if (tenant?.id) {
        localDB.initializeWithTenant(tenant.id).catch(console.error);
      }
      
      if (import.meta.env.DEV) {
        console.log('🔄 [Chat] Reset state for user/tenant change:', { 
          userId: user?.id, 
          tenantId: tenant?.id,
          userChanged,
          tenantChanged
        });
      }
      
      prevUserIdRef.current = user?.id || null;
      prevTenantIdRef.current = tenant?.id || null;
    }
  }, [user?.id, tenant?.id]);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [dynamicQuickReplies, setDynamicQuickReplies] = useState<Record<string, string[]>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  // Land-scoped farming mode (SSOT: crop_schedules.farming_type → land_crops → farmers).
  // Hydrated on chat open (cached mirror for instant paint), refreshed from response metadata.
  // FIX 5 (2026-08-19): on the "general" tab there is no land in the tab id, which
  // used to skip the land-scoped SSOT entirely. Resolve the farmer's most recently
  // updated land and use it for HYDRATION ONLY (active tab is unchanged).
  const [hydrationFallbackLandId, setHydrationFallbackLandId] = useState<string | null>(null);
  useEffect(() => {
    if (activeTab !== 'general' || !user?.id || !tenant?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('lands')
          .select('id')
          .eq('farmer_id', user.id)
          .eq('tenant_id', tenant.id)
          .order('updated_at', { ascending: false })
          .limit(1);
        if (!cancelled) setHydrationFallbackLandId(data?.[0]?.id ?? null);
      } catch {
        /* hydration fallback is best-effort */
      }
    })();
    return () => { cancelled = true; };
  }, [activeTab, user?.id, tenant?.id]);

  const { farmingMode, setFarmingMode } = useFarmingModeHydration({
    landId: activeTab !== 'general' ? activeTab : hydrationFallbackLandId,
    farmerId: user?.id,
    tenantId: tenant?.id,
  });


  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [showCamera, setShowCamera] = useState(false);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [pendingVisionAnalysis, setPendingVisionAnalysis] = useState<{
    imageUrl?: string;
    videoUrl?: string;
    result?: VisionAnalysisResult;
    error?: string;
  } | null>(null);
  const [sessionStartTime, setSessionStartTime] = useState<Record<string, Date>>({});
  const [isLoadingSuggestion, setIsLoadingSuggestion] = useState(false);

  // ═══════════════════════════════════════════════════════════════════════════
  // 🔔 PROACTIVE-ALERT → CHAT ENTRY (land-scoped, fresh session, AI question)
  // URL: /app/chat?landId=<uuid>&fromAlert=<uuid>&seedSession=new
  // 1) Switch to the correct land tab.
  // 2) Force a brand-new session for that land.
  // 3) Ask the `proactive-question-seed` edge fn to generate the question
  //    in the farmer's language and prefill the composer.
  // ═══════════════════════════════════════════════════════════════════════════
  const [searchParams, setSearchParams] = useSearchParams();
  const seededAlertRef = useRef<string | null>(null);
  // Holds the proactive-alert payload to attach to the NEXT outgoing user message,
  // keyed by tab. Cleared after one use so it never bleeds into subsequent turns.
  const proactiveAlertRef = useRef<Record<string, any>>({});

  useEffect(() => {
    const fromAlert = searchParams.get('fromAlert');
    const landIdParam = searchParams.get('landId');
    const seedSession = searchParams.get('seedSession');

    if (!fromAlert && !landIdParam) return;
    if (seededAlertRef.current === (fromAlert || `land:${landIdParam}`)) return;
    if (lands.length === 0 && landIdParam) return; // wait for lands to load
    if (!user?.id || !tenant?.id) return;

    seededAlertRef.current = fromAlert || `land:${landIdParam}`;

    // 1) Switch to the right land tab (fall back to general if invalid)
    if (landIdParam) {
      const landExists = lands.some(l => l.id === landIdParam);
      if (landExists) {
        selectLandTab(landIdParam);
      } else {
        toast({
          title: t('chat.landNotFound', 'Land not found'),
          description: t('chat.openingGeneralChat', 'Opening general chat instead.'),
        });
      }
    }

    const targetTab = (landIdParam && lands.some(l => l.id === landIdParam)) ? landIdParam : 'general';

    // 2) Force a fresh session for this land (clean conversation from the alert)
    if (seedSession === 'new') {
      setMessages(prev => ({ ...prev, [targetTab]: [] }));
      setSessionIds(prev => {
        const next = { ...prev };
        delete next[targetTab];
        return next;
      });
      setLoadedSessionIds(prev => {
        const next = new Set(prev);
        next.delete(targetTab);
        return next;
      });
      setHasEverHadMessages(prev => ({ ...prev, [targetTab]: false }));
    }

    // 3) Ask the AI to generate the farmer-friendly question in their language
    if (fromAlert) {
      (async () => {
        try {
          // Fetch full alert row in parallel so the next outgoing message can carry
          // its Decision-Brain context (NDVI, condition_code, action_text, etc.)
          // straight to the orchestrator. Without this the orchestrator sees a
          // generic free-text question and falls back to monitoring advice.
          const authClient = supabaseWithAuth(user.id, tenant.id);
          const alertPromise = authClient
            .from('proactive_alerts')
            .select('id, alert_category, priority, title_en, title_hi, title_mr, message_en, message_hi, message_mr, action_text_en, action_text_hi, action_text_mr, decision_reasoning, trigger_data, land_id')
            .eq('id', fromAlert)
            .maybeSingle();

          const [seedResult, alertResult] = await Promise.all([
            supabase.functions.invoke('proactive-question-seed', {
              body: { alertId: fromAlert, landId: landIdParam || null, language },
              headers: {
                'x-farmer-id': user?.id || '',
                'x-tenant-id': tenant?.id || '',
              },
            }),
            alertPromise,
          ]);

          const { data, error } = seedResult;
          if (error) throw error;

          // Stash the alert payload for the next user-send to attach to metadata.
          if (alertResult?.data) {
            proactiveAlertRef.current[targetTab] = alertResult.data;
            console.log('[chat] Cached proactive alert for next send:', {
              alert_id: alertResult.data.id,
              category: alertResult.data.alert_category,
              condition_code: (alertResult.data.trigger_data as any)?.condition_code,
            });
          }

          const q = (data as any)?.question?.toString().trim();
          if (q) {
            setInputValue(q);
            // Focus composer so farmer can review and tap Send
            setTimeout(() => inputRef.current?.focus(), 250);
          }
        } catch (err) {
          console.error('[chat] proactive-question-seed failed', err);
          // Soft-fail: leave composer empty, farmer can type their own question
        }
      })();
    }

    // Clear params so refresh doesn't replay the seed
    setSearchParams({}, { replace: true });
  }, [searchParams, lands, user?.id, tenant?.id, language, t, setSearchParams]);

  
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const lastScrollTop = useRef(0);
  const isUserScrollingRef = useRef(false);
  const isAutoScrollingRef = useRef(false);
  const [transcript, setTranscript] = useState('');
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);
  
  const speechLang = language === 'hi' ? 'hi-IN' : language === 'mr' ? 'mr-IN' : language === 'en' ? 'en-IN' : 'hi-IN';
  
  const { isListening, startListening: originalStartListening, stopListening } = useSpeechRecognition({
    onTranscript: (text) => setTranscript(text),
    language: speechLang
  });
  
  const { speak, stop: stopSpeaking, isSpeaking } = useTextToSpeech({
    language: language
  });
  
  // CRITICAL FIX: Improved scroll to bottom with proper timing
  const scrollToBottom = useCallback((force = false) => {
    if (!force && isUserScrollingRef.current) return;
    
    const container = scrollAreaRef.current;
    if (!container) return;
    
    // CRITICAL: Use multiple RAF to ensure DOM is fully rendered
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const scrollHeight = container.scrollHeight;
        const clientHeight = container.clientHeight;
        
        // Only scroll if there's content to scroll to
        if (scrollHeight > clientHeight) {
          container.scrollTo({
            top: scrollHeight,
            behavior: force ? 'auto' : 'smooth'
          });
        }
      });
    });
  }, []);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    
    setIsRefreshing(true);
    try {
      const fetchedLands = await landsApi.fetchLands();
      setLands(fetchedLands);
      toast({
        title: t('common.success'),
        description: t('chat.refreshed')
      });
    } catch (error) {
      console.error('Error refreshing:', error);
    } finally {
      setTimeout(() => setIsRefreshing(false), 1000);
    }
  }, [isRefreshing, t]);

  useEffect(() => {
    if (transcript) {
      setInputValue(transcript);
    }
  }, [transcript]);

  // Auto-scroll to bottom when messages change or tab changes
  useEffect(() => {
    const currentMsgs = messages[activeTab] || [];
    if (currentMsgs.length === 0) return;
    
    // CRITICAL FIX: Wait for DOM to fully render before scrolling
    // Use longer timeout and multiple attempts to ensure messages are visible
    const timer1 = setTimeout(() => scrollToBottom(true), 50);
    const timer2 = setTimeout(() => scrollToBottom(true), 150);
    const timer3 = setTimeout(() => scrollToBottom(true), 300);
    
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [messages, activeTab, scrollToBottom]);

  useEffect(() => {
    if (!sessionStartTime[activeTab] && messages[activeTab]?.length > 0) {
      setSessionStartTime(prev => ({ ...prev, [activeTab]: new Date() }));
    }
  }, [activeTab, messages, sessionStartTime]);

  // Reset the General-tab land context whenever the general session is empty
  // so the picker re-appears for each fresh conversation.
  useEffect(() => {
    if (activeTab === 'general' && (messages.general?.length || 0) === 0) {
      setGeneralLandId(undefined);
    }
  }, [activeTab, messages.general]);

  useEffect(() => {
    const scrollContainer = scrollAreaRef.current;
    if (!scrollContainer) return;

    const handleScroll = () => {
      const currentScrollTop = scrollContainer.scrollTop;
      const scrollHeight = scrollContainer.scrollHeight;
      const clientHeight = scrollContainer.clientHeight;
      
      const isAtBottom = scrollHeight - currentScrollTop - clientHeight < 50;
      
      if (currentScrollTop < lastScrollTop.current && !isAtBottom) {
        isUserScrollingRef.current = true;
      } else if (isAtBottom) {
        isUserScrollingRef.current = false;
      }
      
      lastScrollTop.current = currentScrollTop;
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const scrollContainer = scrollAreaRef.current;
    if (!scrollContainer) return;

    const observer = new MutationObserver((mutations) => {
      if (isAutoScrollingRef.current) return;
      
      const hasNewContent = mutations.some(mutation => 
        mutation.type === 'childList' && 
        mutation.addedNodes.length > 0 &&
        Array.from(mutation.addedNodes).some(node => node.nodeType === Node.ELEMENT_NODE)
      );
      
      if (hasNewContent && !isUserScrollingRef.current) {
        scrollToBottom();
      }
    });

    observer.observe(scrollContainer, {
      childList: true,
      subtree: true
    });

    return () => observer.disconnect();
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // ⚡ CACHE-FIRST LOADING - WhatsApp-like Instant Load
  // Load from LocalDB INSTANTLY, then background sync from Supabase
  // ═══════════════════════════════════════════════════════════════════════════
  const loadLandSession = useCallback(async (landId: string | null): Promise<{ sessionId: string | null; messages: Message[]; fromCache: boolean }> => {
    const sessionKey = landId || 'general';
    
    if (!user?.id || !tenant?.id) {
      console.warn(`[Session] Skipping load - user or tenant not ready`);
      return { sessionId: null, messages: [], fromCache: false };
    }
    
    // Helper function to map message from DB to Message type
    const mapMessageFromDB = (msg: any): Message => {
      const metadata = msg.metadata as Record<string, any> | null;
      const imageUrl = msg.image_urls?.[0] || metadata?.image_analyzed || undefined;
      const analysisResult = metadata?.analysis_result || undefined;
      
      return {
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        content: msg.content || '',
        timestamp: new Date(msg.created_at),
        imageUrl,
        imageUrls: msg.image_urls || undefined,
        videoUrl: metadata?.video_url || undefined,
        messageType: msg.message_type as Message['messageType'] || 'text',
        analysisResult,
        orchestratorType: metadata?.orchestrator_type as Message['orchestratorType'],
        dataAudit: metadata?.data_audit,
        traceId: metadata?.trace_id,
        status: 'synced' as MessageStatus,
        analytics: msg.response_time_ms ? {
          responseTime: msg.response_time_ms,
          queryComplexity: metadata?.source
        } : undefined,
        feedback: msg.feedback_rating 
          ? (msg.feedback_rating >= 4 ? 'like' as const : 'dislike' as const) 
          : null,
        // P0 FIX: Reconstruct clarification options from persisted metadata
        clarificationOptions: metadata?.clarification_options ? {
          question: metadata.clarification_options.question,
          options: metadata.clarification_options.options?.map((o: any) => ({
            label: typeof o === 'string' ? o : o.label,
            value: typeof o === 'string' ? o : (o.value || o.label),
            description: typeof o === 'object' ? o.description : undefined,
            observation_key: typeof o === 'object' ? o.observation_key : undefined
          })),
          selectionType: metadata.clarification_options.selectionType || 'SINGLE_CHOICE'
        } : undefined,
        // P0 FIX: Reconstruct decision brain data for rich card rendering
        decisionBrainResponse: metadata?.decision_brain_data ? {
          primaryActions: (metadata.decision_brain_data.primary_decision ? [metadata.decision_brain_data.primary_decision] : []).map((d: any) => ({
            action: d.action_text || d.action || '',
            reason: d.reason_text || d.reason || '',
            timing: typeof d.timing === 'object' ? (d.timing?.reason || d.timing?.recommended_start || '') : (d.timing || ''),
            ruleSources: d.rules_applied || d.rule_sources || [],
            priority: d.priority || 1
          })),
          secondaryActions: (metadata.decision_brain_data.secondary_decisions || []).map((d: any) => ({
            action: d.action_text || d.action || '',
            reason: d.reason_text || d.reason || '',
            timing: typeof d.timing === 'object' ? (d.timing?.reason || d.timing?.recommended_start || '') : (d.timing || ''),
            ruleSources: d.rules_applied || d.rule_sources || [],
            priority: d.priority || 2
          })),
          blockedActions: (metadata.decision_brain_data.blocked_actions || []).map((b: any) => ({
            action: b.action || '',
            whyNot: b.reason || b.why_not || '',
            blockedByRules: b.blocked_by_rules || []
          })),
          confidence: {
            riskLevel: metadata.decision_brain_data.risk_level || 'LOW',
            confidence: metadata.decision_brain_data.confidence || 0,
            explanations: [],
            rulesApplied: metadata?.rules_applied?.length || 0
          },
          farmerMessage: msg.content || '',
          language: msg.language || 'en'
        } : undefined,
        // P0 FIX: Reconstruct diagnostic escalation data
        diagnosticEscalationData: metadata?.diagnostic_escalation_data || undefined
      };
    };
    
    try {
      // ═══════════════════════════════════════════════════════════════════════
      // PHASE 1: Load from LocalDB INSTANTLY (0ms perceived latency)
      // ═══════════════════════════════════════════════════════════════════════
      
      // CRITICAL FIX (2026-01-14): Ensure tenantIsolationService has userId before querying
      // This prevents stale user context in LocalDB queries after re-login
      const { tenantIsolationService } = await import('@/services/tenantIsolationService');
      tenantIsolationService.setUserId(user.id);
      
      // Ensure localDB is initialized for current tenant
      await localDB.initialize();
      
      // CRITICAL FIX: Pass tenantId for multi-tenant isolation
      const cachedMessages = await localDB.getChatMessages(landId, user.id, tenant.id);
      
      console.log(`📱 [Cache-First] Checking LocalDB for tenant ${tenant.id}, ${sessionKey}:`, {
        cachedCount: cachedMessages?.length || 0,
        tenantId: tenant.id,
        userId: user.id,
        landId
      });
      
      if (cachedMessages && cachedMessages.length > 0) {
        console.log(`⚡ [Cache-First] INSTANT load: ${cachedMessages.length} messages for ${sessionKey}`);
        
        const sortedMessages = cachedMessages
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
          .map(mapMessageFromDB);
        
        // Get session ID from cache if available - CRITICAL: Pass farmer ID for isolation
        const sessions = await localDB.getChatSessionsByLand(landId, user.id);
        const cachedSessionId = sessions?.[0]?.id || null;
        
        // PHASE 2: Trigger background sync (non-blocking)
        // This will fetch only NEW messages and merge them
        chatSyncService.debouncedSync(
          landId,
          user.id,
          tenant.id,
          (newMessages) => {
            if (newMessages.length > 0) {
              console.log(`🔄 [Background Sync] Found ${newMessages.length} new messages for ${sessionKey}`);
              
              // Merge new messages into state
              const mappedNew = newMessages.map(mapMessageFromDB);
              setMessages(prev => {
                const existing = prev[sessionKey] || [];
                const existingIds = new Set(existing.map(m => m.id));
                const uniqueNew = mappedNew.filter(m => !existingIds.has(m.id));
                
                if (uniqueNew.length === 0) return prev;
                
                return {
                  ...prev,
                  [sessionKey]: [...existing, ...uniqueNew].sort(
                    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
                  )
                };
              });
            }
          }
        );
        
        return { sessionId: cachedSessionId, messages: sortedMessages, fromCache: true };
      }
      
      // ═══════════════════════════════════════════════════════════════════════
      // PHASE 2: No cache - Fetch from Supabase (only on first load)
      // ═══════════════════════════════════════════════════════════════════════
      console.log(`📡 [Network] No cache, fetching from Supabase for ${sessionKey}`);
      
      const authClient = supabaseWithAuth(user.id, tenant.id);
      
      // CRITICAL FIX (Phase 2): For General chat, load ALL sessions and their messages
      if (landId === null) {
        // Query ALL general chat sessions (not just the latest)
        const { data: allGeneralSessions, error: sessionsError } = await authClient
          .from('ai_chat_sessions')
          .select('id, updated_at')
          .eq('farmer_id', user.id)
          .eq('tenant_id', tenant.id)
          .is('land_id', null)
          .order('updated_at', { ascending: false });
        
        if (!sessionsError && allGeneralSessions && allGeneralSessions.length > 0) {
          const allSessionIds = allGeneralSessions.map(s => s.id);
          if (import.meta.env.DEV) console.log(`✅ [Supabase] Found ${allSessionIds.length} general sessions`);
          
          // Load messages from ALL general sessions
          // CRITICAL: Filter by tenant_id AND farmer_id for multi-tenant isolation
          const { data: allMessages, error: messagesError } = await authClient
            .from('ai_chat_messages')
            .select('*')
            .in('session_id', allSessionIds)
            .eq('tenant_id', tenant.id)  // CRITICAL: Tenant isolation
            .eq('farmer_id', user.id)
            .order('created_at', { ascending: false })
            .limit(200);
          
          if (!messagesError && allMessages && allMessages.length > 0) {
            if (import.meta.env.DEV) console.log(`✅ [Supabase] Loaded ${allMessages.length} total general messages`);
            
            // Apply filter and dedupe - SMART CONTENT-BASED FILTERING
            const filterDisplayableMessages = (msgs: any[]): any[] => {
              return msgs.filter(msg => {
                // Filter 1: Skip empty content messages
                if (!msg.content || msg.content.trim().length === 0) return false;
                
                const content = msg.content.trim();
                
                // Filter 2: Skip ACTUAL system prompts (NOT farmer messages)
                // These are internal prompts sent TO the LLM, not real farmer questions
                const isSystemPrompt = 
                  content.startsWith('Based on the ') ||
                  content.startsWith('Based on ') && content.includes('provide') ||
                  content.startsWith('🧠 DECISION BRAIN OUTPUT') ||
                  content.startsWith('🧠') ||
                  content.startsWith('[PREVIOUS_RECOMMENDATIONS') ||
                  content.startsWith('Analyze this') ||
                  content.startsWith('Provide ') ||
                  content.includes('DO NOT CHANGE THE FORMAT') ||
                  content.includes('DECISION BRAIN OUTPUT');
                
                if (msg.role === 'user' && isSystemPrompt) {
                  return false;
                }
                
                // Filter 3: Skip system acknowledgment messages
                if (content === 'Response generated' || content === 'Processing...') {
                  return false;
                }
                
                // Filter 4: Skip minimal decision brain responses (< 20 chars)
                if (msg.role === 'assistant' && msg.decision_brain_source === true && content.length < 20) {
                  return false;
                }
                
                // KEEP: All other messages including real farmer questions
                return true;
              });
            };
            
            const filteredMessages = filterDisplayableMessages(allMessages);
            
            // Dedupe by id (in case of duplicates across sessions)
            const seenIds = new Set<string>();
            const uniqueMessages = filteredMessages.filter(msg => {
              if (seenIds.has(msg.id)) return false;
              seenIds.add(msg.id);
              return true;
            });
            
            // Sort by created_at ascending
            uniqueMessages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
            
            if (import.meta.env.DEV) console.log(`✅ [Filter] Showing ${uniqueMessages.length} displayable messages`);
            
            const loadedMessages: Message[] = uniqueMessages.map(mapMessageFromDB);
            
            // Use the most recent active session as the canonical session for new messages
            const { data: canonicalSession } = await authClient
              .from('ai_chat_sessions')
              .select('id')
              .eq('farmer_id', user.id)
              .eq('tenant_id', tenant.id)
              .is('land_id', null)
              .eq('is_active', true)
              .order('updated_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            
            // Cache to LocalDB for offline
            try {
              if (canonicalSession) {
                await localDB.saveChatSession({
                  id: canonicalSession.id,
                  tenant_id: tenant.id,
                  farmer_id: user.id,
                  land_id: null,
                  session_type: 'general',
                  session_title: 'General Agriculture Chat',
                  is_active: true,
                  metadata: {},
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                });
              }
              for (const msg of allMessages) {
                await localDB.saveChatMessage({
                  id: msg.id,
                  tenant_id: msg.tenant_id,
                  farmer_id: msg.farmer_id,
                  session_id: msg.session_id,
                  role: msg.role,
                  content: msg.content || '',
                  // Context fields
                  land_context: msg.land_context || null,
                  crop_context: msg.crop_context || null,
                  weather_context: msg.weather_context || null,
                  location_context: msg.location_context || null,
                  // Zone information
                  agro_climatic_zone: msg.agro_climatic_zone || null,
                  soil_zone: msg.soil_zone || null,
                  rainfall_zone: msg.rainfall_zone || null,
                  crop_season: msg.crop_season || null,
                  // AI model info
                  ai_model: msg.ai_model,
                  response_time_ms: msg.response_time_ms,
                  tokens_used: msg.tokens_used,
                  // Feedback
                  feedback_rating: msg.feedback_rating,
                  feedback_text: msg.feedback_text,
                  feedback_timestamp: msg.feedback_timestamp,
                  // Attachments
                  attachments: msg.attachments || null,
                  image_urls: msg.image_urls,
                  // Message tracking
                  status: msg.status || 'sent',
                  language: msg.language,
                  message_type: msg.message_type,
                  error_details: msg.error_details || null,
                  // Editing
                  is_edited: msg.is_edited || null,
                  edited_at: msg.edited_at || null,
                  parent_message_id: msg.parent_message_id || null,
                  // Audit fields
                  user_agent: msg.user_agent || null,
                  ip_address: msg.ip_address || null,
                  partition_key: msg.partition_key || null,
                  // Analysis
                  word_count: msg.word_count || null,
                  inferred_intent: msg.inferred_intent,
                  intent_confidence: msg.intent_confidence,
                  // Training fields
                  is_training_candidate: msg.is_training_candidate,
                  human_verified: msg.human_verified,
                  correction_notes: msg.correction_notes,
                  conversation_quality_score: msg.conversation_quality_score,
                  domain_tags: msg.domain_tags,
                  complexity_level: msg.complexity_level,
                  conversation_turn_number: msg.conversation_turn_number,
                  off_topic: msg.off_topic,
                  training_processed: msg.training_processed,
                  preprocessed_content: msg.preprocessed_content,
                  excluded_reason: msg.excluded_reason,
                  agricultural_accuracy: msg.agricultural_accuracy,
                  // Decision brain fields
                  decision_brain_source: msg.decision_brain_source,
                  actions_returned: msg.actions_returned,
                  actions_filtered_out: msg.actions_filtered_out,
                  // Metadata
                  metadata: msg.metadata,
                  // Timestamps
                  created_at: msg.created_at,
                  updated_at: msg.updated_at
                });
              }
              if (import.meta.env.DEV) console.log(`💾 [LocalDB] Cached ${allMessages.length} general messages`);
            } catch (cacheErr) {
              console.warn('Failed to cache messages to LocalDB:', cacheErr);
            }
            
            return { sessionId: canonicalSession?.id || allGeneralSessions[0].id, messages: loadedMessages, fromCache: false };
          }
          
          // Sessions exist but no messages
          return { sessionId: allGeneralSessions[0].id, messages: [], fromCache: false };
        }
      }
      
      // For land-specific chats, use original single-session logic
      let sessionQuery = authClient
        .from('ai_chat_sessions')
        .select('id')
        .eq('farmer_id', user.id)
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1);
      
      sessionQuery = sessionQuery.eq('land_id', landId);
      
      const { data: existingSession, error: sessionError } = await sessionQuery.maybeSingle();

      if (!sessionError && existingSession) {
        if (import.meta.env.DEV) console.log(`✅ [Supabase] Loaded session for ${sessionKey}:`, existingSession.id);
        
        // Load messages for this session from Supabase
        // CRITICAL FIX: Use authClient with proper headers
        // CRITICAL FIX (2026-01): Fetch MOST RECENT messages first so refresh shows latest conversation
        // CRITICAL: Filter by tenant_id AND farmer_id for multi-tenant isolation
        const { data: previousMessages, error: messagesError } = await authClient
          .from('ai_chat_messages')
          .select('*')
          .eq('session_id', existingSession.id)
          .eq('tenant_id', tenant.id)  // CRITICAL: Tenant isolation
          .eq('farmer_id', user?.id)
          .order('created_at', { ascending: false })
          .limit(200);

        if (!messagesError && previousMessages && previousMessages.length > 0) {
          if (import.meta.env.DEV) console.log(`✅ [Supabase] Loaded ${previousMessages.length} recent messages for ${sessionKey}`);

          // Convert newest-first -> chronological for UI rendering
          const chronologicalMessages = [...previousMessages].reverse();
          
          // CRITICAL FIX: SMART CONTENT-BASED FILTERING
          const filterDisplayableMessages = (msgs: any[]): any[] => {
            return msgs.filter(msg => {
              // Filter 1: Skip empty content messages
              if (!msg.content || msg.content.trim().length === 0) return false;
              
              const content = msg.content.trim();
              
              // Filter 2: Skip ACTUAL system prompts (NOT farmer messages)
              // These are internal prompts sent TO the LLM, not real farmer questions
              const isSystemPrompt = 
                content.startsWith('Based on the ') ||
                content.startsWith('Based on ') && content.includes('provide') ||
                content.startsWith('🧠 DECISION BRAIN OUTPUT') ||
                content.startsWith('🧠') ||
                content.startsWith('[PREVIOUS_RECOMMENDATIONS') ||
                content.startsWith('Analyze this') ||
                content.startsWith('Provide ') ||
                content.includes('DO NOT CHANGE THE FORMAT') ||
                content.includes('DECISION BRAIN OUTPUT');
              
              if (msg.role === 'user' && isSystemPrompt) {
                return false;
              }
              
              // Filter 3: Skip system acknowledgment messages
              if (content === 'Response generated' || content === 'Processing...') {
                return false;
              }
              
              // Filter 4: Skip minimal decision brain responses (< 20 chars)
              if (msg.role === 'assistant' && msg.decision_brain_source === true && content.length < 20) {
                return false;
              }
              
              // KEEP: All other messages including real farmer questions
              return true;
            });
          };
          
          const filteredMessages = filterDisplayableMessages(chronologicalMessages);
          if (import.meta.env.DEV) console.log(`✅ [Filter] Showing ${filteredMessages.length}/${chronologicalMessages.length} displayable messages`);
          
          const loadedMessages: Message[] = filteredMessages.map(mapMessageFromDB);

          // CRITICAL FIX: Sync Supabase messages TO LocalDB for offline access
          try {
            // Cache session first
            await localDB.saveChatSession({
              id: existingSession.id,
              tenant_id: tenant.id,
              farmer_id: user.id,
              land_id: landId || null,
              session_type: landId ? 'land_specific' : 'general',
              session_title: landId ? `Land Chat ${landId}` : 'General Agriculture Chat',
              is_active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              metadata: {}
            });
            
            // Cache all messages for offline
            for (const msg of previousMessages) {
              await localDB.saveChatMessage({
                id: msg.id,
                session_id: msg.session_id,
                tenant_id: msg.tenant_id,
                farmer_id: msg.farmer_id,
                role: msg.role,
                content: msg.content,
                land_context: msg.land_context,
                crop_context: msg.crop_context,
                weather_context: msg.weather_context,
                location_context: msg.location_context,
                agro_climatic_zone: msg.agro_climatic_zone,
                soil_zone: msg.soil_zone,
                rainfall_zone: msg.rainfall_zone,
                crop_season: msg.crop_season,
                ai_model: msg.ai_model,
                response_time_ms: msg.response_time_ms,
                tokens_used: msg.tokens_used,
                feedback_rating: msg.feedback_rating,
                feedback_text: msg.feedback_text,
                feedback_timestamp: msg.feedback_timestamp,
                attachments: msg.attachments,
                image_urls: msg.image_urls,
                status: msg.status,
                language: msg.language,
                message_type: msg.message_type,
                error_details: msg.error_details,
                is_edited: msg.is_edited,
                edited_at: msg.edited_at,
                parent_message_id: msg.parent_message_id,
                user_agent: msg.user_agent,
                ip_address: msg.ip_address,
                partition_key: msg.partition_key,
                word_count: msg.word_count,
                inferred_intent: msg.inferred_intent,
                intent_confidence: msg.intent_confidence,
                is_training_candidate: msg.is_training_candidate,
                human_verified: msg.human_verified,
                correction_notes: msg.correction_notes,
                conversation_quality_score: msg.conversation_quality_score,
                domain_tags: msg.domain_tags,
                complexity_level: msg.complexity_level,
                conversation_turn_number: msg.conversation_turn_number,
                off_topic: msg.off_topic,
                training_processed: msg.training_processed,
                preprocessed_content: msg.preprocessed_content,
                excluded_reason: msg.excluded_reason,
                agricultural_accuracy: msg.agricultural_accuracy,
                decision_brain_source: msg.decision_brain_source,
                actions_returned: msg.actions_returned,
                actions_filtered_out: msg.actions_filtered_out,
                metadata: msg.metadata,
                created_at: msg.created_at,
                updated_at: msg.updated_at
              });
            }
            if (import.meta.env.DEV) console.log(`💾 [LocalDB] Cached ${previousMessages.length} messages`);
          } catch (cacheErr) {
            console.warn('Failed to cache messages to LocalDB:', cacheErr);
          }
          
          return { sessionId: existingSession.id, messages: loadedMessages, fromCache: false };
        }
        
        // Session exists but no messages
        return { sessionId: existingSession.id, messages: [], fromCache: false };
      }

      // 2. FALLBACK: Load from LocalDB if Supabase failed (offline mode)
      if (sessionError) {
        console.warn(`[Supabase] Session query error for ${sessionKey}:`, sessionError);
      }
      
      if (import.meta.env.DEV) console.log(`📴 [LocalDB] Trying offline cache for ${sessionKey}`);
      try {
        const localMessages = await localDB.getChatMessages(landId);
        if (localMessages && localMessages.length > 0) {
          const cachedMessages = localMessages
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
            .map(mapMessageFromDB);
          if (import.meta.env.DEV) console.log(`⚡ [LocalDB] Loaded ${cachedMessages.length} cached messages for ${sessionKey}`);
          return { sessionId: null, messages: cachedMessages, fromCache: true };
        }
      } catch (localErr) {
        console.warn('LocalDB read failed:', localErr);
      }
      
      return { sessionId: null, messages: [], fromCache: false };
    } catch (err) {
      console.error(`Error loading session for ${sessionKey}:`, err);
      return { sessionId: null, messages: [], fromCache: false };
    }
  }, [user?.id, tenant?.id]);

  // CRITICAL FIX (Phase 1): Fetch lands on mount - MERGE instead of overwrite
  useEffect(() => {
    async function fetchLands() {
      try {
        const fetchedLands = await landsApi.fetchLands();
        setLands(fetchedLands);
        
        // CRITICAL: MERGE new land keys into existing messages, don't overwrite
        setMessages(prev => {
          const merged = { ...prev };
          // Ensure general exists
          if (!merged.general) merged.general = [];
          // Add empty arrays only for NEW lands (don't overwrite existing)
          fetchedLands.forEach(land => {
            if (!merged[land.id]) {
              merged[land.id] = [];
            }
          });
          return merged;
        });
      } catch (error) {
        console.error('Error fetching lands:', error);
      }
    }
    
    if (user?.id && tenant?.id) {
      fetchLands();
    }
  }, [user?.id, tenant?.id]);

  // ═══════════════════════════════════════════════════════════════════════════
  // ⚡ CACHE-FIRST SESSION LOADING - WhatsApp-like Instant Experience
  // Shows cached messages INSTANTLY, then syncs in background
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    async function loadSession() {
      if (!user?.id || !tenant?.id) return;
      
      const landId = activeTab !== 'general' ? activeTab : null;
      const sessionKey = landId || 'general';
      
      // Skip if already loaded
      if (loadedSessionIds.has(sessionKey)) return;
      
      // ⚡ PHASE 1: DON'T show loading for cache-first loads
      // Only show loading if we have no cached data
      
      // CRITICAL FIX (2026-01-14): Ensure tenantIsolationService has userId before querying
      const { tenantIsolationService } = await import('@/services/tenantIsolationService');
      tenantIsolationService.setUserId(user.id);
      
      // Ensure localDB is initialized for current tenant
      await localDB.initialize();
      
      const cachedMessages = await localDB.getChatMessages(landId, user.id);
      const hasCache = cachedMessages && cachedMessages.length > 0;
      
      console.log(`🔍 [Session Load] Checking cache for ${sessionKey}:`, {
        hasCache,
        messageCount: cachedMessages?.length || 0,
        userId: user.id
      });
      
      if (!hasCache) {
        // No cache - need to show loading
        setIsLoadingHistory(true);
      }
      
      try {
        const { sessionId, messages: loadedMsgs, fromCache } = await loadLandSession(landId);
        
        if (sessionId) {
          setSessionIds(prev => ({ ...prev, [sessionKey]: sessionId }));
        }
        
        if (loadedMsgs.length > 0) {
          setMessages(prev => ({
            ...prev,
            [sessionKey]: loadedMsgs
          }));
          // Track that this tab has had messages (prevents welcome card flash)
          setHasEverHadMessages(prev => ({ ...prev, [sessionKey]: true }));
        }
        
        setLoadedSessionIds(prev => new Set([...prev, sessionKey]));
        
        // Log cache performance
        if (fromCache) {
          console.log(`⚡ [Performance] Instant load from cache for ${sessionKey}`);
        }
      } catch (error) {
        console.error('Error loading session:', error);
      } finally {
        setIsLoadingHistory(false);
      }
    }
    
    loadSession();
  }, [activeTab, user?.id, tenant?.id, loadLandSession]);

  // CRITICAL FIX (Phase 3): Get or create session ID - REUSE existing before creating
  const getCurrentSessionId = useCallback(async (): Promise<string> => {
    const sessionKey = activeTab !== 'general' ? activeTab : 'general';
    
    if (sessionIds[sessionKey]) {
      return sessionIds[sessionKey];
    }
    
    const landId = activeTab !== 'general' ? activeTab : null;
    const authClient = supabaseWithAuth(user?.id || '', tenant?.id || '');
    
    // PHASE 3: First, try to find an existing active session (prevents duplicates)
    let existingQuery = authClient
      .from('ai_chat_sessions')
      .select('id')
      .eq('farmer_id', user?.id)
      .eq('tenant_id', tenant?.id)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1);
    
    if (landId === null) {
      existingQuery = existingQuery.is('land_id', null);
    } else {
      existingQuery = existingQuery.eq('land_id', landId);
    }
    
    const { data: existingSession, error: findError } = await existingQuery.maybeSingle();
    
    if (!findError && existingSession) {
      if (import.meta.env.DEV) console.log(`♻️ [Session] Reusing existing session for ${sessionKey}:`, existingSession.id);
      setSessionIds(prev => ({ ...prev, [sessionKey]: existingSession.id }));
      return existingSession.id;
    }
    
    // No existing session found, create new one
    if (import.meta.env.DEV) console.log(`🆕 [Session] Creating new session for ${sessionKey}`);
    const { data: newSession, error } = await authClient
      .from('ai_chat_sessions')
      .insert({
        tenant_id: tenant?.id,
        farmer_id: user?.id,
        land_id: landId,
        session_type: landId ? 'land_specific' : 'general',
        session_title: landId ? `Land Chat` : 'General Agriculture Chat',
        is_active: true,
        metadata: { language, source: 'orchestrator_v2' }
      })
      .select('id')
      .single();
    
    if (error || !newSession) {
      console.error('Failed to create session:', error);
      return crypto.randomUUID();
    }
    
    setSessionIds(prev => ({ ...prev, [sessionKey]: newSession.id }));
    return newSession.id;
  }, [activeTab, sessionIds, tenant?.id, user?.id, language]);

  // Process attached images through vision analysis
  const processAttachedImages = async (imageFiles: File[]) => {
    if (!user?.id || !tenant?.id) return;
    
    setIsAnalyzingImage(true);
    
    try {
      const landId = activeTab !== 'general' ? activeTab : undefined;
      const land = landId ? lands.find(l => l.id === landId) : null;
      const sessionId = await getCurrentSessionId();
      const userMessageId = crypto.randomUUID();
      
      // Read file as base64
      const file = imageFiles[0];
      const reader = new FileReader();
      const imageData = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      
      // Upload to storage
      const result = await uploadChatImage(imageData, sessionId, userMessageId, user.id);
      const imageStorageUrl = result.url;
      
      setPendingVisionAnalysis({ imageUrl: imageStorageUrl });
      
      // Create user message
      const userMessage: Message = {
        id: userMessageId,
        role: 'user',
        content: language === 'hi' ? 'फोटो विश्लेषण के लिए' : language === 'mr' ? 'फोटो विश्लेषणासाठी' : 'Photo for analysis',
        timestamp: new Date(),
        messageType: 'image_analysis'
      };
      
      setMessages(prev => ({
        ...prev,
        [activeTab]: [...(prev[activeTab] || []), userMessage]
      }));
      
      // Save user message to database - use authClient
      const authClient = supabaseWithAuth(user.id, tenant.id);
      await authClient.from('ai_chat_messages').insert({
        id: userMessageId,
        tenant_id: tenant.id,
        farmer_id: user.id,
        session_id: sessionId,
        role: 'user',
        content: '[📷 Photo uploaded for analysis]',
        message_type: 'image_analysis',
        image_urls: [imageStorageUrl],
        language,
        status: 'sent'
      });
      
      // Call AI crop scan
      const { data: scanResult, error } = await supabase.functions.invoke('ai-crop-scan', {
        body: {
          images: [imageData],
          language,
          farmerId: user.id,
          tenantId: tenant.id,
          landId,
          landCrop: land?.current_crop,
          mode: 'full'
        }
      });
      
      if (error) throw error;
      
      if (scanResult?.success && scanResult?.result) {
        const aiMessageId = crypto.randomUUID();
        const aiContent = scanResult.result.diagnosis?.summary || 'Analysis complete';
        
        const aiMessage: Message = {
          id: aiMessageId,
          role: 'assistant',
          content: aiContent,
          timestamp: new Date(),
          messageType: 'image_analysis_response',
          imageUrl: imageStorageUrl,
          analysisResult: scanResult.result,
          awaitingSuggestionSelection: true
        };
        
        setMessages(prev => ({
          ...prev,
          [activeTab]: [...(prev[activeTab] || []), aiMessage]
        }));
        
        setPendingVisionAnalysis(null);
        
        // Save AI response - use authClient
        await authClient.from('ai_chat_messages').insert({
          id: aiMessageId,
          tenant_id: tenant.id,
          farmer_id: user.id,
          session_id: sessionId,
          role: 'assistant',
          content: aiContent,
          message_type: 'image_analysis_response',
          ai_model: 'gemini-2.5-flash',
          image_urls: [imageStorageUrl],
          metadata: {
            analysis_result: scanResult.result,
            crop_detected: scanResult.result.cropDetected,
            diagnosis: scanResult.result.diagnosis
          },
          language,
          status: 'sent'
        });
      } else {
        throw new Error(scanResult?.error || 'Analysis failed');
      }
    } catch (err) {
      console.error('Vision analysis error:', err);
      setPendingVisionAnalysis(prev => prev ? { ...prev, error: err instanceof Error ? err.message : 'Analysis failed' } : null);
      toast({
        title: t('error.title'),
        description: err instanceof Error ? err.message : 'Failed to analyze image',
        variant: 'destructive'
      });
    } finally {
      setIsAnalyzingImage(false);
    }
  };

  // Camera capture handler - sends to orchestrator with image
  const handleWorldClassCapture = async (data: { type: 'photo' | 'video'; data: string; duration?: number }) => {
    if (!user?.id || !tenant?.id) return;
    
    setShowCamera(false);
    setIsAnalyzingImage(true);
    
    try {
      const landId = activeTab !== 'general' ? activeTab : undefined;
      const land = landId ? lands.find(l => l.id === landId) : null;
      const sessionId = await getCurrentSessionId();
      const userMessageId = crypto.randomUUID();
      const isPhoto = data.type === 'photo';
      
      // Upload to storage
      let imageStorageUrl: string;
      let videoStorageUrl: string | undefined;
      
      if (isPhoto) {
        const result = await uploadChatImage(data.data, sessionId, userMessageId, user.id);
        imageStorageUrl = result.url;
      } else {
        const result = await uploadCompressedVideo(data.data, sessionId, userMessageId, user.id);
        videoStorageUrl = result.videoUrl;
        imageStorageUrl = result.thumbnailUrl;
      }
      
      setPendingVisionAnalysis({ imageUrl: imageStorageUrl, videoUrl: videoStorageUrl });
      
      // Create user message
      const userMessage: Message = {
        id: userMessageId,
        role: 'user',
        content: `${isPhoto ? '📷' : '🎥'} ${language === 'hi' ? (isPhoto ? 'फोटो' : 'वीडियो') + ' विश्लेषण के लिए' : language === 'mr' ? (isPhoto ? 'फोटो' : 'व्हिडिओ') + ' विश्लेषणासाठी' : (isPhoto ? 'Photo' : 'Video') + ' for analysis'}`,
        timestamp: new Date(),
        messageType: isPhoto ? 'image_analysis' : 'video_analysis'
      };
      
      setMessages(prev => ({
        ...prev,
        [activeTab]: [...(prev[activeTab] || []), userMessage]
      }));
      
      // Save to database - use authClient
      const authClient = supabaseWithAuth(user.id, tenant.id);
      await authClient.from('ai_chat_messages').insert({
        id: userMessageId,
        tenant_id: tenant.id,
        farmer_id: user.id,
        session_id: sessionId,
        role: 'user',
        content: `[${isPhoto ? '📷 Photo' : '🎥 Video'} captured for analysis]`,
        message_type: isPhoto ? 'image_analysis' : 'video_analysis',
        image_urls: [imageStorageUrl],
        language,
        status: 'sent'
      });
      
      // ═══════════════════════════════════════════════════════════════════════
      // 🤖 ORCHESTRATOR - Send image to 9-agent orchestrator for analysis
      // ═══════════════════════════════════════════════════════════════════════
      console.log('🤖 [Orchestrator] Sending image for analysis via 9-agent pipeline');
      
      const sessionToken = localStorage.getItem('app_session_token') || '';
      
      const { data: orchestratorResponse, error } = await supabase.functions.invoke('ai-agriculture-chat', {
        body: {
          messages: [{ role: 'user', content: 'Analyze this crop image and provide diagnosis' }],
          sessionId,
          landId,
          imageUrl: imageStorageUrl,
          language,
          metadata: {
            tenantId: tenant.id,
            farmerId: user.id,
            mediaType: data.type,
            landContext: land ? {
              land_id: land.id,
              land_name: land.name,
              current_crop: land.current_crop,
              farming_mode: land.farming_mode
            } : null
          }
        },
        headers: {
          'x-tenant-id': tenant.id,
          'x-farmer-id': user.id,
          'x-session-token': sessionToken
        }
      });
      
      if (error) throw error;
      
      // Create AI response from orchestrator
      const aiMessageId = crypto.randomUUID();
      const aiContent = orchestratorResponse?.response || 'Analysis complete';
      
      const aiMessage: Message = {
        id: aiMessageId,
        role: 'assistant',
        content: aiContent,
        timestamp: new Date(),
        messageType: 'orchestrator',
        orchestratorType: orchestratorResponse?.metadata?.type || 'DECISION_PROVIDED',
        analytics: {
          responseTime: orchestratorResponse?.responseTime,
          queryComplexity: 'orchestrator_vision'
        }
      };
      
      setMessages(prev => ({
        ...prev,
        [activeTab]: [...(prev[activeTab] || []), aiMessage]
      }));
      
      setPendingVisionAnalysis(null);
      
      // Save AI response - use authClient
      await authClient.from('ai_chat_messages').insert({
        id: aiMessageId,
        tenant_id: tenant.id,
        farmer_id: user.id,
        session_id: sessionId,
        role: 'assistant',
        content: aiContent,
        message_type: 'orchestrator',
        ai_model: 'orchestrator_v2',
        response_time_ms: orchestratorResponse?.responseTime,
        image_urls: [imageStorageUrl],
        metadata: {
          orchestrator_type: orchestratorResponse?.metadata?.type,
          image_analyzed: imageStorageUrl,
          video_url: videoStorageUrl
        },
        language,
        status: 'sent'
      });
      
      // Set quick replies from orchestrator
      if (orchestratorResponse?.quickReplies?.length > 0) {
        setDynamicQuickReplies(prev => ({
          ...prev,
          [activeTab]: orchestratorResponse.quickReplies
        }));
      }
      
      console.log('✅ Orchestrator vision analysis complete');
      
    } catch (err) {
      console.error('Vision analysis error:', err);
      setPendingVisionAnalysis(prev => prev ? { ...prev, error: err instanceof Error ? err.message : 'Analysis failed' } : null);
      toast({
        title: t('error.title'),
        description: err instanceof Error ? err.message : 'Failed to analyze image',
        variant: 'destructive'
      });
    } finally {
      setIsAnalyzingImage(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════
  // 🤖 UNIFIED SEND MESSAGE - ALL queries go to 9-Agent Orchestrator
  // ⚡ OPTIMISTIC UPDATES - Show message instantly before server confirms
  // ═══════════════════════════════════════════════════════════════════════
  const sendMessage = async (text?: string, quickAction?: string, overrideGeneralLandId?: string | null) => {
    const messageText = text || inputValue.trim();
    const finalMessage = quickAction ? `${quickAction}: ${messageText}` : messageText;
    
    // Check for image attachments
    const imageFiles = attachedFiles.filter(f => f.type.startsWith('image/'));
    if (imageFiles.length > 0 && !finalMessage) {
      await processAttachedImages(imageFiles);
      setAttachedFiles([]);
      return;
    }
    
    if (!finalMessage && !quickAction && attachedFiles.length === 0) return;

    // ─── GENERAL-CHAT land context gate ───────────────────────────────────
    // Only open the picker on the FIRST send of a fresh General session.
    // When the picker resolves, it re-invokes sendMessage with an explicit
    // `overrideGeneralLandId` so we never depend on not-yet-committed React state.
    if (
      activeTab === 'general' &&
      overrideGeneralLandId === undefined &&
      generalLandId === undefined &&
      finalMessage &&
      (lands?.length || 0) > 0
    ) {
      pendingGeneralSendRef.current = finalMessage;
      setShowGeneralLandPicker(true);
      return;
    }

    // ─── Subscription quota gate ──────────────────────────────────────────
    // Block sends when farmer is over their daily AI-chat quota or when the
    // tenant has disabled the AI Chat feature. Server-side enforcement in
    // `ai-agriculture-chat` is the authoritative check; this is a fast UX guard.
    if (!aiChatEntitlement.allowed) {
      const reason = aiChatEntitlement.reason;
      toast({
        title: reason === 'feature_disabled'
          ? t('chat.quota.tenant_disabled_title', 'AI Chat unavailable')
          : t('chat.quota.exceeded_title', "Today's chats are over"),
        description: reason === 'feature_disabled'
          ? t('chat.quota.tenant_disabled_body', 'AI Chat is not enabled for your organisation.')
          : t('chat.quota.exceeded_body_short', 'New chats unlock automatically at midnight.'),
        variant: 'destructive',
      });
      return;
    }
    
    // ⚡ OPTIMISTIC UPDATE: Generate temp ID and show message INSTANTLY
    const tempId = `temp_${Date.now()}`;
    const userMessageId = crypto.randomUUID();
    const userMessage: Message = {
      id: userMessageId,
      tempId, // Track for replacement after server confirms
      role: 'user',
      content: finalMessage || (imageFiles.length > 0 ? `[Analyzing ${imageFiles.length} image(s)]` : ''),
      timestamp: new Date(),
      status: 'sending' // ⚡ Show as "sending" initially
    };
    
    // ⚡ INSTANT: Add message to UI immediately
    setMessages(prev => ({
      ...prev,
      [activeTab]: [...(prev[activeTab] || []), userMessage]
    }));
    
    setInputValue('');
    setAttachedFiles([]);
    setIsLoading(true);
    
    // Random loading messages
    const loadingMessages = language === 'hi' 
      ? ['जवाब तैयार कर रहा हूं...', 'सोच रहा हूं...', 'विश्लेषण कर रहा हूं...']
      : language === 'mr'
      ? ['उत्तर तयार करत आहे...', 'विचार करत आहे...', 'विश्लेषण करत आहे...']
      : ['Preparing answer...', 'Thinking...', 'Analyzing...'];
    
    setLoadingMessage(loadingMessages[Math.floor(Math.random() * loadingMessages.length)]);
    
    try {
      const sessionId = await getCurrentSessionId();

      // On the General tab the farmer may have attached a land via the picker.
      // Resolve the effective land for context (but NOT for orchestrator routing —
      // general-mode goes through the direct-LLM short-circuit on the server).
      const isGeneralTab = activeTab === 'general';
      const resolvedGeneralLandId = overrideGeneralLandId !== undefined
        ? overrideGeneralLandId
        : (typeof generalLandId === 'string' ? generalLandId : null);
      const effectiveLandId = isGeneralTab ? resolvedGeneralLandId : activeTab;
      const landId = isGeneralTab ? undefined : effectiveLandId;
      const land = effectiveLandId ? lands.find(l => l.id === effectiveLandId) : null;

      console.log('🤖 [Chat] Sending message', { mode: isGeneralTab ? 'general' : 'land_specific', land: land?.name || 'none' });

      // Build land context for orchestrator - CRITICAL: Include crop_schedule data for accurate stage calculation
      // Find active crop schedule for this land
      const activeSchedule = land?.crop_schedules?.find((s: any) => s.status === 'active') || 
                             land?.active_schedule || 
                             null;
      
      const landContext = land ? {
        land_id: land.id,
        land_name: land.name,
        crop_name: land.current_crop || land.crop_name || activeSchedule?.crop_name,
        crop_code: land.crop_code || activeSchedule?.crop_code,
        previous_crop: land.previous_crop,
        area_hectares: land.area_hectares,
        farming_mode: land.farming_mode,
        irrigation_type: land.irrigation_type,
        // CRITICAL: sowing_date for accurate growth stage calculation
        sowing_date: land.sowing_date || activeSchedule?.sowing_date || activeSchedule?.started_at,
        growth_stage: land.growth_stage || activeSchedule?.current_stage,
        days_since_sowing: land.days_since_sowing || activeSchedule?.days_since_sowing,
        expected_harvest_date: land.expected_harvest_date || activeSchedule?.expected_harvest_date,
        crop_variety: land.crop_variety || activeSchedule?.variety,
        // Include soil, NDVI, weather data
        soil_data: land.soil_data || land.soil_health,
        ndvi_data: land.ndvi_data || land.ndvi,
        weather_data: land.weather_data,
        location: land.location || { state: land.state, district: land.district },
        // Include center coordinates for weather fetching
        center_lat: land.center_lat,
        center_lon: land.center_lon
      } : null;

      
      // ═══════════════════════════════════════════════════════════════════════
      // CRITICAL FIX: Deduplicate conversation history to prevent repeated messages
      // The logs showed 9 identical user messages being sent to backend
      // ═══════════════════════════════════════════════════════════════════════
      const rawHistory = (messages[activeTab] || []).slice(-10);
      
      // Deduplicate: Remove consecutive identical messages
      const deduplicatedHistory: typeof rawHistory = [];
      for (const msg of rawHistory) {
        const lastMsg = deduplicatedHistory[deduplicatedHistory.length - 1];
        // Skip if same role and same content as previous message
        if (lastMsg && lastMsg.role === msg.role && lastMsg.content === msg.content) {
          console.log('[Chat] Skipping duplicate message:', msg.content.substring(0, 50));
          continue;
        }
        deduplicatedHistory.push(msg);
      }
      
      // Take last 6 unique messages for context.
      // For General tab, strip any prior symbolic-clarification/orchestrator turns
      // so the direct-LLM senior-agronomist is not biased by past decision-brain output.
      let conversationHistory = deduplicatedHistory.slice(-6).map(m => ({
        role: m.role,
        content: m.content,
        _orch: (m as any).orchestratorType,
        _clar: !!(m as any).clarificationOptions,
      }));

      if (isGeneralTab) {
        conversationHistory = conversationHistory.filter(m => {
          if (m.role !== 'assistant') return true;
          if (m._clar) return false;
          if (m._orch && m._orch !== 'DECISION_PROVIDED') return false;
          return true;
        });
      }

      const cleanHistory = conversationHistory.map(m => ({ role: m.role, content: m.content }));
      
      const sessionToken = localStorage.getItem('app_session_token') || '';
      
      // CRITICAL: If this send originated from a proactive alert, attach the
      // alert's Decision-Brain payload so the orchestrator narrates from
      // authoritative facts instead of re-diagnosing from the seeded question.
      // Consume-once: clear after attaching so subsequent turns are not biased.
      // Skip entirely on the General tab — proactive alerts belong to land-specific chat.
      const proactiveAlertPayload = isGeneralTab ? null : proactiveAlertRef.current[activeTab];
      if (proactiveAlertPayload) {
        delete proactiveAlertRef.current[activeTab];
        console.log('[chat] Attaching proactive alert to outgoing message:', proactiveAlertPayload.id);
      }
      
      // ═══════════════════════════════════════════════════════════════════════
      // 🤖 ROUTING (by edge-function name — single source of truth):
      //   - General tab → `ai-general-chat`     (direct LLM, senior agronomist)
      //   - Land tab    → `ai-agriculture-chat` (9-agent symbolic brain)
      // ═══════════════════════════════════════════════════════════════════════
      const fnName = isGeneralTab ? 'ai-general-chat' : 'ai-agriculture-chat';
      const invokeBody: Record<string, any> = {
        messages: [...cleanHistory, { role: 'user', content: finalMessage }],
        sessionId,
        landId,
        language,
      };
      if (isGeneralTab) {
        invokeBody.landContext = landContext ?? null;
      } else {
        invokeBody.metadata = {
          tenantId: tenant?.id,
          farmerId: user?.id,
          landContext,
          source: 'orchestrator_v2',
          proactiveAlert: proactiveAlertPayload || undefined,
        };
      }
      const { data, error } = await supabase.functions.invoke(fnName, {
        body: invokeBody,
        headers: {
          'x-tenant-id': tenant?.id || '',
          'x-farmer-id': user?.id || '',
          'x-session-token': sessionToken,
        }
      });
      
      if (error) {
        console.error('❌ Orchestrator Error:', error);
        throw new Error(error.message || 'AI request failed');
      }
      
      // CRITICAL FIX: Handle both response and empty response cases gracefully
      if (!data) {
        console.error('❌ No data from orchestrator');
        throw new Error('Invalid response from AI');
      }
      
      // Allow responses even if response field is empty - use fallback
      const responseText = data.response || 
        (language === 'mr' ? 'माझ्याकडे या क्षणी पूर्ण माहिती नाही. कृपया अधिक तपशील द्या.' :
         language === 'hi' ? 'मेरे पास इस समय पूरी जानकारी नहीं है। कृपया अधिक विवरण दें।' :
         'I need more information to help you. Please provide more details.');
      
      console.log('✅ [Orchestrator] Response received:', data.metadata?.type || 'DECISION_PROVIDED');
      console.log('🔍 [Trace ID]:', data.metadata?.trace_id || 'none');

      // Farming-mode badge state comes from the backend metadata only.
      if (data.metadata?.farming_mode) {
        setFarmingMode(data.metadata.farming_mode as FarmingMode);
      }
      
      // PHASE 5: Server already persists messages, so we DON'T save user message here
      // This eliminates duplicate message persistence and makes server the single writer
      
      // Create AI response message - use responseText which has fallback
      const aiMessageId = crypto.randomUUID();
      
      // ═══════════════════════════════════════════════════════════════════════════
      // GENERAL-TAB direct-LLM responses must render as plain text — never as
      // symbolic clarification cards or Decision-Brain UI. This is the visual
      // guarantee that General chat is treated differently from land-specific.
      // ═══════════════════════════════════════════════════════════════════════════
      const isGeneralResponse =
        isGeneralTab ||
        data.metadata?.orchestrator_type === 'GENERAL_LLM_DIRECT' ||
        data.metadata?.chat_mode === 'general_llm_v1' ||
        data.metadata?.type === 'general_chat';

      const isClarification = !isGeneralResponse && (
        data.metadata?.type === 'clarification' ||
        data.metadata?.orchestrator_type === 'CLARIFICATION_QUESTION'
      );

      // One-time organic-preference chip (backend sends it only when the farmer
      // has no saved farming_preference and a real advisory was produced).
      const preferencePrompt = data.metadata?.preference_prompt;

      const clarificationOptions = isClarification && data.metadata?.options?.length ? {
        question: responseText,
        options: data.metadata.options.map((o: any) => ({
          label: typeof o === 'string' ? o : o.label,
          value: typeof o === 'string' ? o : (o.value || o.label),
          description: typeof o === 'object' ? o.description : undefined,
          observation_key: typeof o === 'object' ? (o.observation_key || o.value) : undefined
        })),
        selectionType: (data.metadata?.selectionType || 'SINGLE_CHOICE') as 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE'
      } : (preferencePrompt?.options?.length ? {
        question: preferencePrompt.question,
        options: preferencePrompt.options.map((o: any) => ({ label: o.label, value: o.value })),
        selectionType: 'SINGLE_CHOICE' as const
      } : undefined);

      const aiMessage: Message = {
        id: aiMessageId,
        role: 'assistant',
        content: responseText,
        timestamp: new Date(),
        messageType: isGeneralResponse ? 'text' : 'orchestrator',
        orchestratorType: isGeneralResponse
          ? 'DECISION_PROVIDED'
          : (isClarification ? 'CLARIFICATION_QUESTION'
            : (data.metadata?.orchestrator_type || 'DECISION_PROVIDED')),
        traceId: data.metadata?.trace_id,
        dataAudit: isGeneralResponse ? undefined : data.dataAudit,
        clarificationOptions: isGeneralResponse ? undefined : clarificationOptions,
        structuredAdvisory: isGeneralResponse ? undefined : (data.structured_advisory || undefined),
        analytics: {
          responseTime: data.responseTime,
          queryComplexity: isGeneralResponse ? 'general_llm' : 'orchestrator'
        }
      };
      
      // ⚡ OPTIMISTIC UPDATE: Mark user message as 'sent' on success
      setMessages(prev => ({
        ...prev,
        [activeTab]: prev[activeTab]?.map(m => 
          m.id === userMessageId ? { ...m, status: 'sent' as MessageStatus } : m
        ) || []
      }));
      
      // Add AI response
      setMessages(prev => ({
        ...prev,
        [activeTab]: [...(prev[activeTab] || []), aiMessage]
      }));
      
      // ═══════════════════════════════════════════════════════════════════════
      // CRITICAL FIX: Save BOTH user message AND AI response to LocalDB
      // Previously: Only user message was saved, AI response was lost on refresh
      // ═══════════════════════════════════════════════════════════════════════
      chatSyncService.batchSaveMessages([
        // User message
        {
          id: userMessageId,
          session_id: sessionId,
          tenant_id: tenant?.id,
          farmer_id: user?.id,
          role: 'user',
          content: finalMessage,
          created_at: new Date().toISOString(),
          status: 'sent'
        },
        // AI response - CRITICAL: This was missing before!
        {
          id: aiMessageId,
          session_id: sessionId,
          tenant_id: tenant?.id,
          farmer_id: user?.id,
          role: 'assistant',
          content: responseText,
          created_at: new Date().toISOString(),
          status: 'sent',
          metadata: {
            orchestrator_type: isClarification ? 'CLARIFICATION_QUESTION' : 
                              (data.metadata?.orchestrator_type || 'DECISION_PROVIDED'),
            trace_id: data.metadata?.trace_id,
            clarification_options: clarificationOptions
          }
        }
      ]);
      
      // Set quick replies from orchestrator
      if (data.quickReplies && data.quickReplies.length > 0) {
        setDynamicQuickReplies(prev => ({
          ...prev,
          [activeTab]: data.quickReplies
        }));
      }
      
    } catch (err) {
      console.error('Send message error:', err);
      toast({
        title: t('error.title'),
        description: err instanceof Error ? err.message : 'Failed to send message',
        variant: 'destructive'
      });
      
      // ⚡ OPTIMISTIC UPDATE: Mark message as 'failed' instead of removing
      setMessages(prev => ({
        ...prev,
        [activeTab]: prev[activeTab]?.map(m => 
          m.id === userMessageId ? { ...m, status: 'failed' as MessageStatus } : m
        ) || []
      }));
      
      // Queue for retry
      chatSyncService.queueForRetry({
        id: userMessageId,
        role: 'user',
        content: finalMessage || '',
        status: 'failed',
        timestamp: new Date(),
        landId: activeTab !== 'general' ? activeTab : null,
        sessionId: sessionIds[activeTab] || ''
      });
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
      // Optimistically bump local quota counter; server-side commit is authoritative.
      bumpUsage('ai_chat', 1);
      // Soft-refresh entitlements after a short delay so reset times stay accurate.
      setTimeout(() => refreshEntitlements(), 1500);
    }
  };

  // Handle clarification option selection (Decision Brain UI)
  // ═══════════════════════════════════════════════════════════════════════════
  // CRITICAL FIX: Send structured selection with observation_key for rule engine
  // Previously: Sent plain text labels (e.g., "मातीचे बोगद") 
  // Now: Sends observation keys (e.g., "MUD_TUBES_PRESENT") for proper re-evaluation
  // ═══════════════════════════════════════════════════════════════════════════
  const handleClarificationSelect = useCallback((selectedOptions: string[]) => {
    if (selectedOptions.length === 0) return;

    // Build the message (some UIs already embed [obs_keys:...])
    const message = selectedOptions.length === 1 
      ? selectedOptions[0]
      : selectedOptions.join(', ');

    const hasEmbeddedObsKeys = /\[obs_keys:[^\]]+\]/.test(message);

    // If already embedded, send as-is to avoid double nesting like:
    // "... [obs_keys:X] [obs_keys:... [obs_keys:X]]"
    if (hasEmbeddedObsKeys) {
      console.log('🔘 [ClarificationSelect] Sending embedded selection as-is');
      sendMessage(message);
      return;
    }

    // Otherwise, map labels back to observation_keys from the last AI clarification message
    const currentMessages = messages[activeTab] || [];
    const lastAIMessage = [...currentMessages].reverse().find(m => m.role === 'assistant' && m.clarificationOptions);

    const selectedObservationKeys: string[] = [];
    if (lastAIMessage?.clarificationOptions?.options) {
      for (const selected of selectedOptions) {
        const matchingOption = lastAIMessage.clarificationOptions.options.find(
          (opt: any) => opt.label === selected || opt.value === selected
        );
        // Farming-preference chip: send the raw preference key, no obs_keys wrapper.
        if (typeof matchingOption?.value === 'string' && matchingOption.value.startsWith('preference.')) {
          sendMessage(matchingOption.value);
          return;
        }
        if (matchingOption?.observation_key) {
          selectedObservationKeys.push(matchingOption.observation_key);
        } else if (matchingOption?.value) {
          selectedObservationKeys.push(matchingOption.value);
        }
      }
    }

    console.log('🔘 [ClarificationSelect] Selected:', {
      labels: selectedOptions,
      observationKeys: selectedObservationKeys,
      hasStructuredOptions: !!lastAIMessage?.clarificationOptions?.options,
      embeddedInLabel: false
    });

    sendMessage(`${message} [obs_keys:${selectedObservationKeys.join(',')}]`);
  }, [sendMessage, messages, activeTab]);

  const handleSuggestionSelect = async (messageId: string, type: 'organic' | 'fertilizer' | 'pesticide' | 'hybrid') => {
    if (!user?.id || !tenant?.id) return;
    
    setIsLoadingSuggestion(true);
    
    try {
      const sessionId = await getCurrentSessionId();
      const landId = activeTab !== 'general' ? activeTab : undefined;
      const land = landId ? lands.find(l => l.id === landId) : null;
      
      // Find the message with analysis result
      const originalMessage = messages[activeTab]?.find(m => m.id === messageId);
      if (!originalMessage?.analysisResult) {
        throw new Error('Analysis result not found');
      }
      
      console.log('🤖 [Orchestrator] Generating targeted solution:', type);
      
      // Send to orchestrator with suggestion type context
      const sessionToken = localStorage.getItem('app_session_token') || '';
      
      const { data, error } = await supabase.functions.invoke('ai-agriculture-chat', {
        body: {
          messages: [{ 
            role: 'user', 
            content: `Based on the crop analysis, provide ${type} recommendations for: ${originalMessage.analysisResult.diagnosis?.summary || 'crop health improvement'}` 
          }],
          sessionId,
          landId,
          language,
          metadata: {
            tenantId: tenant.id,
            farmerId: user.id,
            suggestionType: type,
            analysisResult: originalMessage.analysisResult,
            landContext: land ? { land_id: land.id, crop_name: land.current_crop } : null
          }
        },
        headers: {
          'x-tenant-id': tenant.id,
          'x-farmer-id': user.id,
          'x-session-token': sessionToken
        }
      });
      
      if (error) throw error;
      
      // Update original message to remove selector
      setMessages(prev => ({
        ...prev,
        [activeTab]: prev[activeTab]?.map(m => 
          m.id === messageId 
            ? { ...m, awaitingSuggestionSelection: false, suggestionType: type }
            : m
        ) || []
      }));
      
      // Create new targeted solution message
      const aiMessageId = crypto.randomUUID();
      const aiMessage: Message = {
        id: aiMessageId,
        role: 'assistant',
        content: data?.response || 'Recommendations generated',
        timestamp: new Date(),
        messageType: 'targeted_solution',
        suggestionType: type,
        orchestratorType: 'DECISION_PROVIDED',
        analytics: {
          responseTime: data?.responseTime,
          queryComplexity: 'orchestrator_targeted'
        }
      };
      
      setMessages(prev => ({
        ...prev,
        [activeTab]: [...(prev[activeTab] || []), aiMessage]
      }));
      
      // Save to database - use authClient
      const insertClient = supabaseWithAuth(user.id, tenant.id);
      await insertClient.from('ai_chat_messages').insert({
        id: aiMessageId,
        session_id: sessionId,
        tenant_id: tenant.id,
        farmer_id: user.id,
        role: 'assistant',
        content: data?.response || '',
        message_type: 'targeted_solution',
        ai_model: 'orchestrator_v2',
        response_time_ms: data?.responseTime,
        metadata: {
          suggestion_type: type,
          source: 'orchestrator_v2'
        },
        language,
        status: 'sent'
      });
      
      // Set quick replies
      if (data?.quickReplies?.length > 0) {
        setDynamicQuickReplies(prev => ({
          ...prev,
          [activeTab]: data.quickReplies
        }));
      }
      
    } catch (err) {
      console.error('Suggestion selection error:', err);
      toast({
        title: t('error.title'),
        description: err instanceof Error ? err.message : 'Failed to generate recommendations',
        variant: 'destructive'
      });
    } finally {
      setIsLoadingSuggestion(false);
    }
  };

  // Utility functions
  const handleCopyMessage = async (messageId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
      toast({ title: t('common.copied') });
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  const handleFeedback = async (messageId: string, isLike: boolean) => {
    setMessages(prev => ({
      ...prev,
      [activeTab]: prev[activeTab]?.map(msg => 
        msg.id === messageId 
          ? { ...msg, feedback: isLike ? 'like' : 'dislike' }
          : msg
      ) || []
    }));
    
    // CRITICAL FIX: Use authClient with tenant/farmer isolation for feedback updates
    const authClient = supabaseWithAuth(user?.id || '', tenant?.id || '');
    await authClient
      .from('ai_chat_messages')
      .update({ 
        feedback_rating: isLike ? 5 : 1,
        feedback_timestamp: new Date().toISOString()
      })
      .eq('id', messageId)
      .eq('tenant_id', tenant?.id)  // CRITICAL: Tenant isolation
      .eq('farmer_id', user?.id);   // CRITICAL: Farmer isolation
  };

  const handleShare = async (content: string) => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Farm AI Advice',
          text: content
        });
      } else {
        await navigator.clipboard.writeText(content);
        toast({ title: t('common.copied') });
      }
    } catch (err) {
      console.error('Share failed:', err);
    }
  };

  const handlePlayMessage = async (messageId: string, content: string) => {
    if (playingMessageId === messageId) {
      stopSpeaking();
      setPlayingMessageId(null);
      return;
    }
    
    setPlayingMessageId(messageId);
    await speak(content);
    setPlayingMessageId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const startListening = () => {
    if (needsDownload && !isInitialized) {
      setShowVoiceDownload(true);
      return;
    }
    originalStartListening();
  };

  // Early return if tenant/user not ready
  if (isTenantLoading || !tenant || !user) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const currentMessages = messages[activeTab] || [];
  const currentLand = activeTab !== 'general' ? lands.find(l => l.id === activeTab) : null;
  const quickReplies = dynamicQuickReplies[activeTab] || [];

  return (
    <div className="fixed inset-0 flex flex-col min-h-0 bg-gradient-to-br from-background via-background to-muted/30">
      {/* Camera Modal */}
      {showCamera && (
        <WorldClassCamera
          onCapture={handleWorldClassCapture}
          onClose={() => setShowCamera(false)}
          language={language}
        />
      )}

      {/* Voice Download Modal */}
      {showVoiceDownload && (
        <VoiceDownloadCard
          language={language}
          languageName={language === 'hi' ? 'Hindi' : language === 'mr' ? 'Marathi' : 'English'}
          onComplete={() => setShowVoiceDownload(false)}
          onSkip={() => setShowVoiceDownload(false)}
        />
      )}

      {/* General-tab Land Context Picker */}
      <GeneralChatLandPicker
        open={showGeneralLandPicker}
        lands={lands as any}
        onClose={() => {
          setShowGeneralLandPicker(false);
          pendingGeneralSendRef.current = null;
        }}
        onPick={(picked) => {
          setGeneralLandId(picked);
          setShowGeneralLandPicker(false);
          const queued = pendingGeneralSendRef.current;
          pendingGeneralSendRef.current = null;
          if (queued) {
            // Pass the picked id explicitly — do NOT rely on React state having
            // committed yet, which previously caused the picker to re-open.
            setTimeout(() => { void sendMessage(queued, undefined, picked); }, 0);
          }
        }}
      />


      {/* ═══════════════════════════════════════════════════════════════════════════
          COMPACT HEADER - Mobile-First with Integrated Land Selector
          ═══════════════════════════════════════════════════════════════════════════ */}
      <header className="sticky top-0 z-50 flex-shrink-0 bg-background/95 backdrop-blur-xl border-b border-border/30">
        {/* Header Row - Compact */}
        <div className="flex items-center justify-between px-3 py-2 pt-safe">
          <div className="flex items-center gap-3">
            {/* Back Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/app/home')}
              className="h-9 w-9 rounded-full"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            
            {/* AI Avatar + Title */}
            <div className="relative">
              <Avatar className="h-9 w-9 border-2 border-primary/30">
                <AvatarFallback className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground text-sm">
                  <Bot className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <span className={cn(
                "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background",
                isOnline ? "bg-success" : "bg-warning"
              )} />
            </div>
            
            <div className="flex-1 min-w-0">
              <h1 className="text-sm font-semibold truncate">{t('chat.title', 'Farm AI')}</h1>
              <p className="text-[10px] text-muted-foreground">
                {isOnline ? t('common.online', 'Online') : t('common.offline', 'Offline')}
              </p>
            </div>
          </div>
          
          {/* Action Buttons */}
          <div className="flex items-center gap-1">
            <FarmingModeBadge
              mode={farmingMode}
              onSelectModeKey={(modeKey) => sendMessage(modeKey)}
              className="mr-1"
            />

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsSearchOpen(!isSearchOpen)}
              className={cn("h-8 w-8 rounded-full", isSearchOpen && "bg-primary/10 text-primary")}
            >
              <Search className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="h-8 w-8 rounded-full"
            >
              <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin text-primary")} />
            </Button>
          </div>
        </div>

        {/* Search Bar - Compact */}
        <AnimatePresence>
          {isSearchOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="px-3 pb-2 overflow-hidden"
            >
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('chat.searchMessages', 'Search...')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 rounded-full text-sm"
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Land Selector - Horizontal Swipe Cards */}
        <div className="px-3 pb-2">
          <div 
            className="flex gap-2 overflow-x-auto scrollbar-hide snap-x snap-mandatory"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {/* General Chat Card */}
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setActiveTab('general')}
              className={cn(
                "flex-shrink-0 snap-start flex flex-col items-center justify-center",
                "min-w-[64px] h-[48px] rounded-xl border transition-all",
                activeTab === 'general'
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-muted/50 border-border/40 hover:bg-muted"
              )}
            >
              <MessageSquare className="h-4 w-4 mb-0.5" />
              <span className="text-[9px] font-medium">{t('chat.tabs.general', 'General')}</span>
            </motion.button>

            {/* Land Cards - Show loading state or actual cards */}
            {lands.length === 0 && !isLoadingHistory ? (
              <div className="flex items-center gap-2 px-3 text-xs text-muted-foreground">
                <Mountain className="h-4 w-4" />
                <span>{t('chat.noLands', 'No lands added yet')}</span>
              </div>
            ) : (
              lands.map(land => {
                const cropEmoji = land.current_crop?.icon || land.current_crop?.name?.charAt(0) || '🌾';
                const isActive = activeTab === land.id;
                return (
                  <motion.button
                    key={land.id}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => selectLandTab(land.id)}
                    className={cn(
                      "flex-shrink-0 snap-start flex flex-col items-center justify-center",
                      "min-w-[64px] h-[48px] rounded-xl border transition-all px-2",
                      isActive
                        ? "bg-success text-success-foreground border-success shadow-sm"
                        : "bg-muted/50 border-border/40 hover:bg-muted"
                    )}
                  >
                    <span className="text-base leading-none">{cropEmoji}</span>
                    <span className="text-[9px] font-medium truncate max-w-[56px] mt-0.5">
                      {land.name?.substring(0, 7) || 'Land'}
                    </span>
                  </motion.button>
                );
              })
            )}
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════════════════════
          2030 FUTURISTIC MESSAGES AREA - Neural Chat Experience
          ═══════════════════════════════════════════════════════════════════════════ */}
      {/* CRITICAL FIX: Use pb-36 to ensure content isn't hidden behind fixed footer + safe area */}
      <main 
        ref={scrollAreaRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain scroll-smooth pb-36"
      >
        {/* Subtle gradient background pattern */}
        <div className="relative">
          <div className="absolute inset-0 opacity-[0.015] pointer-events-none">
            <div className="absolute inset-0" style={{
              backgroundImage: `radial-gradient(circle at 20% 30%, hsl(var(--primary)) 1px, transparent 1px),
                               radial-gradient(circle at 80% 70%, hsl(var(--accent)) 1px, transparent 1px)`,
              backgroundSize: '60px 60px'
            }} />
          </div>
          
          <div className="relative px-4 py-4 space-y-4">
            {/* Loading History - Modern Skeleton */}
            {isLoadingHistory && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-12 space-y-4"
              >
                <div className="relative">
                  <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
                  <div className="relative p-4 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 backdrop-blur-sm border border-primary/20">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground animate-pulse">
                  {t('chat.loadingHistory', 'Loading your conversations...')}
                </p>
              </motion.div>
            )}

            {/* Welcome Card - Only show if never had messages (prevents flash) */}
            {!isLoadingHistory && currentMessages.length === 0 && !hasEverHadMessages[activeTab] && (
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.5, type: "spring", bounce: 0.3, delay: 0.1 }}
              >
                {activeTab === 'general' ? (
                  <GeneralChatWelcomeCard onQuickAction={(query) => {
                    setInputValue(query);
                    setTimeout(() => sendMessage(query), 100);
                  }} />
                ) : currentLand ? (
                  <LandContextCard land={currentLand} />
                ) : null}
              </motion.div>
            )}

            {/* Messages with enhanced animations */}
            <AnimatePresence mode="popLayout">
              {currentMessages
                .filter(msg => 
                  !searchQuery || 
                  msg.content.toLowerCase().includes(searchQuery.toLowerCase())
                )
                .map((message, index) => (
                  <ModernChatUI
                    key={message.id}
                    message={{
                      ...message,
                      isCopied: copiedMessageId === message.id,
                      isPlaying: playingMessageId === message.id
                    }}
                    onCopy={handleCopyMessage}
                    onLike={handleFeedback}
                    onShare={handleShare}
                    onPlay={handlePlayMessage}
                    onSuggestionSelect={handleSuggestionSelect}
                    onClarificationSelect={handleClarificationSelect}
                    onTakePhoto={() => setShowCamera(true)}
                    isLoadingSuggestion={isLoadingSuggestion}
                  />
                ))}
            </AnimatePresence>

            {/* Enhanced Loading Indicator - Futuristic Design */}
            {isLoading && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-3"
              >
                <div className="relative">
                  <div className="absolute inset-0 bg-primary/30 rounded-full blur-md animate-pulse" />
                  <Avatar className="relative h-10 w-10 border-2 border-primary/40 shadow-lg">
                    <AvatarFallback className="bg-gradient-to-br from-primary via-primary/90 to-accent text-primary-foreground">
                      <Bot className="h-5 w-5" />
                    </AvatarFallback>
                  </Avatar>
                </div>
                <motion.div 
                  initial={{ scale: 0.9 }}
                  animate={{ scale: 1 }}
                  className="flex-1 max-w-[80%]"
                >
                  <Card className="bg-card/90 backdrop-blur-sm border-border/50 shadow-lg overflow-hidden">
                    {/* Animated gradient bar */}
                    <div className="h-1 bg-gradient-to-r from-primary via-accent to-primary bg-[length:200%_auto] animate-[gradient-x_2s_linear_infinite]" />
                    <div className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex gap-1">
                          {[0, 1, 2].map((i) => (
                            <motion.div
                              key={i}
                              className="w-2 h-2 rounded-full bg-primary"
                              animate={{
                                scale: [1, 1.3, 1],
                                opacity: [0.5, 1, 0.5]
                              }}
                              transition={{
                                duration: 1,
                                repeat: Infinity,
                                delay: i * 0.2
                              }}
                            />
                          ))}
                        </div>
                        <span className="text-sm font-medium text-muted-foreground">
                          {loadingMessage || t('chat.thinking', 'Analyzing your query...')}
                        </span>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              </motion.div>
            )}

            {/* Vision Analysis Pending - Enhanced */}
            {pendingVisionAnalysis && isAnalyzingImage && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
              >
                <VisionAnalysisCard
                  imageUrl={pendingVisionAnalysis.imageUrl}
                  isAnalyzing={true}
                  error={pendingVisionAnalysis.error}
                  language={language}
                />
              </motion.div>
            )}
            
            {/* Bottom spacing for fixed input area */}
            <div className="h-6" />
          </div>
        </div>
      </main>

      {/* ═══════════════════════════════════════════════════════════════════════════
          2030 QUICK REPLIES - Floating Neural Suggestions
          ═══════════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {quickReplies.length > 0 && !isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="flex-shrink-0 px-4 pb-3"
          >
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
              {quickReplies.slice(0, 4).map((reply, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => sendMessage(reply)}
                    className="flex-shrink-0 text-xs h-9 px-4 whitespace-nowrap rounded-xl bg-card/80 backdrop-blur-sm border-border/50 hover:bg-primary/10 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10 transition-all"
                  >
                    {reply}
                  </Button>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════════════════════
          FOOTER INPUT - Exact Match: chat_bottom.png Reference
          ═══════════════════════════════════════════════════════════════════════════ */}
      <footer className="fixed bottom-0 left-0 right-0 z-50">
        {/* Fade gradient for seamless blend */}
        <div className="absolute -top-6 left-0 right-0 h-6 bg-gradient-to-t from-background to-transparent pointer-events-none" />
        
        <div className="relative bg-background px-4 pb-safe pt-2">
          {/* Attached Files Preview */}
          <AnimatePresence>
            {attachedFiles.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex gap-2 overflow-x-auto scrollbar-hide mb-2"
              >
                {attachedFiles.map((file, index) => (
                  <motion.div 
                    key={index} 
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="relative flex-shrink-0"
                  >
                    <div className="h-12 w-12 rounded-lg overflow-hidden border border-border">
                      {file.type.startsWith('image/') ? (
                        <img src={URL.createObjectURL(file)} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center bg-muted">
                          <Paperclip className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setAttachedFiles(prev => prev.filter((_, i) => i !== index))}
                      className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-[10px]"
                    >
                      ×
                    </button>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              setAttachedFiles(prev => [...prev, ...files]);
              e.target.value = '';
            }}
          />

          {/* ═══════════════════════════════════════════════════════════════════════════
              PILL INPUT - EXACT MATCH to reference image
              - Light border pill container
              - Paperclip + Camera on left (inside pill)
              - Input in center
              - Violet mic button on right (inside pill)
              ═══════════════════════════════════════════════════════════════════════════ */}
          {/* Daily quota indicator + over-limit blocker (no-op when unlimited) */}
          <ChatQuotaHeader />
          <ChatQuotaBanner />

          <div className="flex items-center bg-card border border-border/60 rounded-full pl-2 pr-1.5 py-1.5 shadow-sm mb-3">
            {/* Left: Attachment Icon */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <Paperclip className="h-5 w-5" />
            </button>

            {/* Left: Camera Icon */}
            <button
              onClick={() => setShowCamera(true)}
              className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors -ml-1"
            >
              <Camera className="h-5 w-5" />
            </button>

            {/* Center: Input Field */}
            <input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('chat.input.placeholder', 'Type your message...')}
              className="flex-1 bg-transparent border-none outline-none px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
              disabled={isLoading}
            />

            {/* Right: Violet Mic/Send Button - INSIDE the pill */}
            {inputValue.trim() || attachedFiles.length > 0 ? (
              <motion.button
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => sendMessage()}
                disabled={isLoading}
                className="h-9 w-9 rounded-full flex items-center justify-center bg-primary hover:bg-primary text-white transition-colors"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </motion.button>
            ) : (
              <motion.button
                whileTap={{ scale: 0.9 }}
                animate={isListening ? { scale: [1, 1.05, 1] } : {}}
                transition={isListening ? { repeat: Infinity, duration: 1 } : {}}
                onClick={isListening ? stopListening : startListening}
                className={cn(
                  "h-9 w-9 rounded-full flex items-center justify-center transition-colors",
                  isListening 
                    ? "bg-destructive hover:bg-destructive text-white" 
                    : "bg-primary hover:bg-primary text-white"
                )}
              >
                {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </motion.button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
