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
  Search, X, Clock, MessageCircle
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useTenant } from '@/contexts/TenantContext';
import { landsApi } from '@/services/landsApi';
import { localDB } from '@/services/localDB';
import { LandContextCard } from './LandContextCard';
import { GeneralChatWelcomeCard } from './GeneralChatWelcomeCard';
import { ResponseSectionCard } from './ResponseSectionCard';
import { ModernChatUI } from './ModernChatUI';
import { WorldClassCamera } from './WorldClassCamera';
import { VisionAnalysisCard, type VisionAnalysisResult } from './VisionAnalysisCard';
import { DecisionBrainCards, type DecisionBrainResponse } from './DecisionBrainCards';
import { DiagnosticResponseCard } from './DiagnosticResponseCard';
import { CropRecommendationCard } from './CropRecommendationCard';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { useLanguageStore } from '@/stores/languageStore';
import { useVoiceInitialization } from '@/hooks/useVoiceInitialization';
import { VoiceDownloadCard } from '@/components/onboarding/VoiceDownloadCard';
import { uploadChatImage, uploadCompressedVideo } from '@/utils/chatImageStorage';

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
  isCopied?: boolean;
  // Orchestrator response metadata
  orchestratorType?: 'DECISION_PROVIDED' | 'CLARIFICATION_QUESTION' | 'PHOTO_REQUEST' | 'SAFETY_BLOCKED' | 'ESCALATION_REQUIRED';
  analytics?: {
    responseTime?: number;
    tokensUsed?: {
      prompt: number;
      completion: number;
      total: number;
    };
    queryComplexity?: string;
  };
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
  
  const [messages, setMessages] = useState<Record<string, Message[]>>({
    general: []
  });
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [sessionIds, setSessionIds] = useState<Record<string, string>>({});
  const [loadedSessionIds, setLoadedSessionIds] = useState<Set<string>>(new Set());
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [dynamicQuickReplies, setDynamicQuickReplies] = useState<Record<string, string[]>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
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
  
  const scrollToBottom = useCallback((force = false) => {
    if (!force && isUserScrollingRef.current) return;
    
    const container = scrollAreaRef.current;
    if (!container) return;
    
    // Use requestAnimationFrame for smoother scrolling
    requestAnimationFrame(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: force ? 'auto' : 'smooth'
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
    // Force scroll to bottom when messages are added
    const timer = setTimeout(() => scrollToBottom(true), 100);
    return () => clearTimeout(timer);
  }, [messages, activeTab, scrollToBottom]);

  useEffect(() => {
    if (!sessionStartTime[activeTab] && messages[activeTab]?.length > 0) {
      setSessionStartTime(prev => ({ ...prev, [activeTab]: new Date() }));
    }
  }, [activeTab, messages, sessionStartTime]);

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

  // Load session with LocalDB caching for offline-first experience
  const loadLandSession = useCallback(async (landId: string | null) => {
    const sessionKey = landId || 'general';
    
    if (!user?.id || !tenant?.id) {
      console.warn(`[Session] Skipping load - user or tenant not ready`);
      return { sessionId: null, messages: [] };
    }
    
    try {
      // 1. Try to load from LocalDB (instant, offline-first)
      let cachedMessages: Message[] = [];
      try {
        const localMessages = await localDB.getChatMessages(landId);
        if (localMessages && localMessages.length > 0) {
          cachedMessages = localMessages
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
            .map(msg => {
              const metadata = msg.metadata as Record<string, any> | null;
              const imageUrl = msg.image_urls?.[0] || metadata?.image_analyzed || undefined;
              const analysisResult = metadata?.analysis_result || undefined;
              
              return {
                id: msg.id,
                role: msg.role as 'user' | 'assistant',
                content: msg.content,
                timestamp: new Date(msg.created_at),
                imageUrl,
                imageUrls: msg.image_urls || undefined,
                videoUrl: metadata?.video_url || undefined,
                messageType: msg.message_type as Message['messageType'] || 'text',
                analysisResult,
                // ✅ FIX: Extract orchestrator metadata for proper rendering
                orchestratorType: metadata?.orchestrator_type as Message['orchestratorType'],
                dataAudit: metadata?.data_audit,
                analytics: metadata?.response_time_ms ? {
                  responseTime: metadata.response_time_ms,
                  queryComplexity: metadata?.source
                } : undefined,
                feedback: msg.feedback_rating 
                  ? (msg.feedback_rating >= 4 ? 'like' as const : 'dislike' as const) 
                  : null
              };
            });
          console.log(`⚡ [LocalDB] Loaded ${cachedMessages.length} cached messages for ${sessionKey}`);
        }
      } catch (localErr) {
        console.warn('LocalDB read failed, continuing with Supabase:', localErr);
      }
      
      // 2. Sync from Supabase in background (if online)
      let sessionQuery = supabase
        .from('ai_chat_sessions')
        .select('id')
        .eq('farmer_id', user.id)
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1);
      
      if (landId === null) {
        sessionQuery = sessionQuery.is('land_id', null);
      } else {
        sessionQuery = sessionQuery.eq('land_id', landId);
      }
      
      const { data: existingSession, error: sessionError } = await sessionQuery.maybeSingle();

      if (sessionError) {
        console.warn(`Session query error for ${sessionKey}:`, sessionError);
        if (cachedMessages.length > 0) {
          return { sessionId: null, messages: cachedMessages };
        }
        return { sessionId: null, messages: [] };
      }

      if (existingSession) {
        console.log(`✅ Loaded session from Supabase for ${sessionKey}:`, existingSession.id);
        
        // Cache session to LocalDB
        try {
          await localDB.saveChatSession({
            id: existingSession.id,
            tenant_id: tenant?.id || '',
            farmer_id: user?.id || '',
            land_id: landId || null,
            session_type: landId ? 'land_specific' : 'general',
            session_title: landId ? `Land Chat ${landId}` : 'General Agriculture Chat',
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            metadata: {}
          });
        } catch (cacheSessionErr) {
          console.warn('Failed to cache session:', cacheSessionErr);
        }
        
        // Load messages for this session
        const { data: previousMessages, error: messagesError } = await supabase
          .from('ai_chat_messages')
          .select('*')
          .eq('session_id', existingSession.id)
          .eq('farmer_id', user?.id)
          .order('created_at', { ascending: true })
          .limit(100);

        if (messagesError) {
          console.warn(`Messages query error for ${sessionKey}:`, messagesError);
          if (cachedMessages.length > 0) {
            return { sessionId: existingSession.id, messages: cachedMessages };
          }
        }

        if (previousMessages && previousMessages.length > 0) {
          const loadedMessages: Message[] = previousMessages.map(msg => {
            const metadata = msg.metadata as Record<string, any> | null;
            const imageUrl = msg.image_urls?.[0] || metadata?.image_analyzed || undefined;
            const analysisResult = metadata?.analysis_result || undefined;
            
            return {
              id: msg.id,
              role: msg.role as 'user' | 'assistant',
              content: msg.content,
              timestamp: new Date(msg.created_at),
              imageUrl,
              imageUrls: msg.image_urls || undefined,
              videoUrl: metadata?.video_url || undefined,
              messageType: msg.message_type as Message['messageType'] || 'text',
              analysisResult,
              // ✅ FIX: Extract orchestrator metadata for proper rendering after re-login
              orchestratorType: metadata?.orchestrator_type as Message['orchestratorType'],
              dataAudit: metadata?.data_audit,
              analytics: msg.response_time_ms ? {
                responseTime: msg.response_time_ms,
                queryComplexity: metadata?.source
              } : undefined,
              feedback: msg.feedback_rating 
                ? (msg.feedback_rating >= 4 ? 'like' as const : 'dislike' as const) 
                : null
            };
          });
          
          return { sessionId: existingSession.id, messages: loadedMessages };
        }
        
        return { sessionId: existingSession.id, messages: cachedMessages };
      }
      
      return { sessionId: null, messages: cachedMessages };
    } catch (err) {
      console.error(`Error loading session for ${sessionKey}:`, err);
      return { sessionId: null, messages: [] };
    }
  }, [user?.id, tenant?.id]);

  // Fetch lands on mount
  useEffect(() => {
    async function fetchLands() {
      try {
        const fetchedLands = await landsApi.fetchLands();
        setLands(fetchedLands);
        
        // Initialize messages for each land
        const newMessages: Record<string, Message[]> = { general: [] };
        fetchedLands.forEach(land => {
          newMessages[land.id] = [];
        });
        setMessages(newMessages);
      } catch (error) {
        console.error('Error fetching lands:', error);
      }
    }
    
    if (user?.id && tenant?.id) {
      fetchLands();
    }
  }, [user?.id, tenant?.id]);

  // Load session when tab changes
  useEffect(() => {
    async function loadSession() {
      if (!user?.id || !tenant?.id) return;
      
      const landId = activeTab !== 'general' ? activeTab : null;
      const sessionKey = landId || 'general';
      
      // Skip if already loaded
      if (loadedSessionIds.has(sessionKey)) return;
      
      setIsLoadingHistory(true);
      
      try {
        const { sessionId, messages: loadedMsgs } = await loadLandSession(landId);
        
        if (sessionId) {
          setSessionIds(prev => ({ ...prev, [sessionKey]: sessionId }));
        }
        
        if (loadedMsgs.length > 0) {
          setMessages(prev => ({
            ...prev,
            [sessionKey]: loadedMsgs
          }));
        }
        
        setLoadedSessionIds(prev => new Set([...prev, sessionKey]));
      } catch (error) {
        console.error('Error loading session:', error);
      } finally {
        setIsLoadingHistory(false);
      }
    }
    
    loadSession();
  }, [activeTab, user?.id, tenant?.id, loadLandSession]);

  // Get or create session ID
  const getCurrentSessionId = useCallback(async (): Promise<string> => {
    const sessionKey = activeTab !== 'general' ? activeTab : 'general';
    
    if (sessionIds[sessionKey]) {
      return sessionIds[sessionKey];
    }
    
    // Create new session
    const landId = activeTab !== 'general' ? activeTab : null;
    
    const { data: newSession, error } = await supabase
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
      
      // Save user message to database
      await supabase.from('ai_chat_messages').insert({
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
        
        // Save AI response
        await supabase.from('ai_chat_messages').insert({
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
      
      // Save to database
      await supabase.from('ai_chat_messages').insert({
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
      
      // Save AI response
      await supabase.from('ai_chat_messages').insert({
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
  // ═══════════════════════════════════════════════════════════════════════
  const sendMessage = async (text?: string, quickAction?: string) => {
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
    
    const userMessageId = crypto.randomUUID();
    const userMessage: Message = {
      id: userMessageId,
      role: 'user',
      content: finalMessage || (imageFiles.length > 0 ? `[Analyzing ${imageFiles.length} image(s)]` : ''),
      timestamp: new Date()
    };
    
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
      const landId = activeTab !== 'general' ? activeTab : undefined;
      const land = landId ? lands.find(l => l.id === landId) : null;
      
      console.log('🤖 [Orchestrator] Sending message to 9-Agent Pipeline');
      console.log('🌾 Land context:', land?.name || 'General Chat');
      
      // Build land context for orchestrator
      const landContext = land ? {
        land_id: land.id,
        land_name: land.name,
        crop_name: land.current_crop || land.crop_name,
        crop_code: land.crop_code,
        previous_crop: land.previous_crop,
        area_hectares: land.area_hectares,
        farming_mode: land.farming_mode,
        irrigation_type: land.irrigation_type,
        sowing_date: land.sowing_date,
        soil_data: land.soil_data,
        ndvi_data: land.ndvi_data,
        weather_data: land.weather_data,
        location: land.location || { state: land.state, district: land.district }
      } : null;
      
      // Get conversation history for context
      const conversationHistory = (messages[activeTab] || []).slice(-8).map(m => ({ 
        role: m.role, 
        content: m.content 
      }));
      
      const sessionToken = localStorage.getItem('app_session_token') || '';
      
      // ═══════════════════════════════════════════════════════════════════════
      // 🤖 ALL QUERIES → 9-AGENT ORCHESTRATOR
      // NLU → Visual → Context → Diagnostic → Fusion → Rules → Safety → Communication
      // ═══════════════════════════════════════════════════════════════════════
      const { data, error } = await supabase.functions.invoke('ai-agriculture-chat', {
        body: {
          messages: [...conversationHistory, { role: 'user', content: finalMessage }],
          sessionId,
          landId,
          language,
          metadata: {
            tenantId: tenant?.id,
            farmerId: user?.id,
            landContext,
            source: 'orchestrator_v2'
          }
        },
        headers: {
          'x-tenant-id': tenant?.id || '',
          'x-farmer-id': user?.id || '',
          'x-session-token': sessionToken
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
      
      // Save user message to database
      await supabase.from('ai_chat_messages').insert({
        session_id: sessionId,
        tenant_id: tenant?.id,
        farmer_id: user?.id,
        role: 'user',
        content: finalMessage,
        status: 'sent',
        language,
        message_type: 'text',
        word_count: finalMessage.split(/\s+/).length,
        land_context: landContext ? {
          land_id: landContext.land_id,
          crop_name: landContext.crop_name,
          area_hectares: landContext.area_hectares
        } : null,
        is_training_candidate: true,
        metadata: { source: 'orchestrator_v2' }
      });
      
      // Create AI response message - use responseText which has fallback
      const aiMessageId = crypto.randomUUID();
      const aiMessage: Message = {
        id: aiMessageId,
        role: 'assistant',
        content: responseText,
        timestamp: new Date(),
        messageType: 'orchestrator',
        orchestratorType: data.metadata?.type || 'DECISION_PROVIDED',
        // ✅ NEW: Include data audit for debugging cards
        dataAudit: data.dataAudit,
        analytics: {
          responseTime: data.responseTime,
          queryComplexity: 'orchestrator'
        }
      };
      
      setMessages(prev => ({
        ...prev,
        [activeTab]: [...(prev[activeTab] || []), aiMessage]
      }));
      
      // Save AI response to database
      await supabase.from('ai_chat_messages').insert({
        id: aiMessageId,
        session_id: sessionId,
        tenant_id: tenant?.id,
        farmer_id: user?.id,
        role: 'assistant',
        content: responseText,
        status: 'sent',
        language,
        message_type: 'orchestrator',
        ai_model: 'orchestrator_v2',
        response_time_ms: data.responseTime,
        word_count: responseText.split(/\s+/).length,
        land_context: landContext ? {
          land_id: landContext.land_id,
          crop_name: landContext.crop_name
        } : null,
        is_training_candidate: true,
        metadata: {
          source: 'orchestrator_v2',
          orchestrator_type: data.metadata?.type,
          confidence: data.metadata?.confidence,
          safety_status: data.metadata?.safety_status,
          rules_applied: data.metadata?.rules_applied,
          agents_used: data.metadata?.agents_used
        }
      });
      
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
      
      // Remove failed user message
      setMessages(prev => ({
        ...prev,
        [activeTab]: (prev[activeTab] || []).filter(m => m.id !== userMessageId)
      }));
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  };

  // Handle suggestion type selection (for vision analysis flow)
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
      
      // Save to database
      await supabase.from('ai_chat_messages').insert({
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
    
    await supabase
      .from('ai_chat_messages')
      .update({ 
        feedback_rating: isLike ? 5 : 1,
        feedback_timestamp: new Date().toISOString()
      })
      .eq('id', messageId);
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
    <div className="fixed inset-0 flex flex-col bg-gradient-to-br from-background via-background to-muted/30">
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

      {/* ═══════════════════════════════════════════════════════════════════════════
          2030 FUTURISTIC HEADER - Ultra Modern Glassmorphism with Neural Glow
          ═══════════════════════════════════════════════════════════════════════════ */}
      <header className="sticky top-0 z-50 flex-shrink-0">
        {/* Gradient overlay for header depth */}
        <div className="absolute inset-0 bg-gradient-to-b from-card/95 via-card/90 to-card/80 backdrop-blur-2xl" />
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-accent/5" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
        
        {/* Header content */}
        <div className="relative flex items-center justify-between p-3 pt-safe">
          <div className="flex items-center gap-3">
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(-1)}
                className="h-10 w-10 rounded-xl bg-muted/50 hover:bg-muted/80 backdrop-blur-sm border border-border/30"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </motion.div>
            
            <div className="flex items-center gap-3">
              {/* AI Avatar with glow effect */}
              <div className="relative">
                <div className="absolute inset-0 bg-primary/30 rounded-full blur-md animate-pulse" />
                <Avatar className="relative h-10 w-10 border-2 border-primary/40 shadow-lg ring-2 ring-primary/20">
                  <AvatarFallback className="bg-gradient-to-br from-primary via-primary/90 to-accent text-primary-foreground">
                    <Bot className="h-5 w-5" />
                  </AvatarFallback>
                </Avatar>
                {/* Online indicator */}
                <span className={cn(
                  "absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card",
                  isOnline ? "bg-success animate-pulse" : "bg-warning"
                )} />
              </div>
              
              <div>
                <h1 className="text-base font-bold bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text">
                  {t('chat.title', 'Farm AI Assistant')}
                </h1>
                <div className="flex items-center gap-1.5">
                  {isOnline ? (
                    <>
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
                      </span>
                      <span className="text-xs font-medium text-success">
                        {t('common.online', 'Online')}
                      </span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="h-3 w-3 text-warning" />
                      <span className="text-xs font-medium text-warning">
                        {t('common.offline', 'Offline')}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsSearchOpen(!isSearchOpen)}
                className={cn(
                  "h-10 w-10 rounded-xl backdrop-blur-sm border border-border/30 transition-all",
                  isSearchOpen 
                    ? "bg-primary/20 text-primary border-primary/30" 
                    : "bg-muted/50 hover:bg-muted/80"
                )}
              >
                <Search className="h-5 w-5" />
              </Button>
            </motion.div>
            
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="h-10 w-10 rounded-xl bg-muted/50 hover:bg-muted/80 backdrop-blur-sm border border-border/30"
              >
                <RefreshCw className={cn("h-5 w-5", isRefreshing && "animate-spin text-primary")} />
              </Button>
            </motion.div>
          </div>
        </div>

        {/* Animated Search Bar */}
        <AnimatePresence>
          {isSearchOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="relative px-4 pb-3 overflow-hidden"
            >
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 rounded-xl opacity-0 group-focus-within:opacity-100 blur-md transition-opacity" />
                <div className="relative flex items-center">
                  <Search className="absolute left-4 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t('chat.searchMessages', 'Search messages...')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-11 pr-11 h-11 rounded-xl bg-muted/50 border-border/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                  />
                  {searchQuery && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 h-7 w-7 rounded-lg hover:bg-destructive/10 hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Modern Land Tabs with Glass Effect */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="relative w-full">
          <div className="px-4 pb-3 overflow-x-auto scrollbar-hide">
            <TabsList className="h-11 w-auto inline-flex gap-2 bg-transparent p-0">
              <TabsTrigger 
                value="general" 
                className={cn(
                  "text-sm px-4 h-10 rounded-xl font-medium transition-all border",
                  "data-[state=inactive]:bg-muted/40 data-[state=inactive]:border-border/30 data-[state=inactive]:text-muted-foreground",
                  "data-[state=active]:bg-gradient-to-br data-[state=active]:from-primary data-[state=active]:to-primary/80",
                  "data-[state=active]:text-primary-foreground data-[state=active]:border-primary/50",
                  "data-[state=active]:shadow-lg data-[state=active]:shadow-primary/20"
                )}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                {t('chat.generalChat', 'General')}
              </TabsTrigger>
              {lands.slice(0, 5).map(land => (
                <TabsTrigger 
                  key={land.id} 
                  value={land.id}
                  className={cn(
                    "text-sm px-4 h-10 rounded-xl font-medium transition-all border whitespace-nowrap",
                    "data-[state=inactive]:bg-muted/40 data-[state=inactive]:border-border/30 data-[state=inactive]:text-muted-foreground",
                    "data-[state=active]:bg-gradient-to-br data-[state=active]:from-success data-[state=active]:to-success/80",
                    "data-[state=active]:text-success-foreground data-[state=active]:border-success/50",
                    "data-[state=active]:shadow-lg data-[state=active]:shadow-success/20"
                  )}
                >
                  <Mountain className="h-4 w-4 mr-2" />
                  {land.name?.substring(0, 10) || 'Land'}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>
      </header>

      {/* ═══════════════════════════════════════════════════════════════════════════
          2030 FUTURISTIC MESSAGES AREA - Neural Chat Experience
          ═══════════════════════════════════════════════════════════════════════════ */}
      <main 
        ref={scrollAreaRef}
        className="flex-1 overflow-y-auto overscroll-contain scroll-smooth"
      >
        {/* Subtle gradient background pattern */}
        <div className="relative min-h-full">
          <div className="absolute inset-0 opacity-[0.02] pointer-events-none">
            <div className="absolute inset-0" style={{
              backgroundImage: `radial-gradient(circle at 25% 25%, hsl(var(--primary)) 1px, transparent 1px),
                               radial-gradient(circle at 75% 75%, hsl(var(--accent)) 1px, transparent 1px)`,
              backgroundSize: '48px 48px'
            }} />
          </div>
          
          <div className="relative px-4 py-6 space-y-4">
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

            {/* Welcome Card - Enhanced */}
            {!isLoadingHistory && currentMessages.length === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.5, type: "spring", bounce: 0.3 }}
              >
                {activeTab === 'general' ? (
                  <GeneralChatWelcomeCard />
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
            
            {/* Bottom spacing for input area */}
            <div className="h-4" />
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
          2030 FUTURISTIC INPUT AREA - Neural Glassmorphism Design
          ═══════════════════════════════════════════════════════════════════════════ */}
      <footer className="sticky bottom-0 z-50 flex-shrink-0">
        {/* Gradient glow effect */}
        <div className="absolute -top-8 left-0 right-0 h-8 bg-gradient-to-t from-background/80 to-transparent pointer-events-none" />
        
        {/* Main footer with glassmorphism */}
        <div className="relative bg-card/80 backdrop-blur-2xl border-t border-border/30">
          {/* Top glow line */}
          <div className="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
          
          <div className="px-4 py-3 pb-safe space-y-3">
            {/* Attached Files Preview - Enhanced */}
            <AnimatePresence>
              {attachedFiles.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex gap-3 overflow-x-auto scrollbar-hide"
                >
                  {attachedFiles.map((file, index) => (
                    <motion.div 
                      key={index} 
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="relative flex-shrink-0 group"
                    >
                      <div className="h-20 w-20 rounded-xl overflow-hidden border-2 border-primary/30 shadow-lg ring-2 ring-primary/10">
                        {file.type.startsWith('image/') ? (
                          <img
                            src={URL.createObjectURL(file)}
                            alt={file.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center bg-muted">
                            <Paperclip className="h-6 w-6 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute -top-2 -right-2 h-6 w-6 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => setAttachedFiles(prev => prev.filter((_, i) => i !== index))}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input Row */}
            <div className="flex items-center gap-2">
              {/* Action Buttons Group */}
              <div className="flex items-center gap-1">
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowCamera(true)}
                    className="h-11 w-11 rounded-xl bg-gradient-to-br from-accent/20 to-info/20 hover:from-accent/30 hover:to-info/30 border border-accent/30 text-accent-foreground transition-all"
                  >
                    <Camera className="h-5 w-5 text-accent" />
                  </Button>
                </motion.div>

                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-11 w-11 rounded-xl bg-muted/50 hover:bg-muted/80 border border-border/30 transition-all"
                  >
                    <Paperclip className="h-5 w-5" />
                  </Button>
                </motion.div>
              </div>

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

              {/* Main Input Field - Enhanced */}
              <div className="flex-1 relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 rounded-xl opacity-0 group-focus-within:opacity-100 blur-sm transition-opacity" />
                <Input
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t('chat.placeholder', 'Ask about your farm...')}
                  className="relative h-11 rounded-xl bg-muted/50 border-border/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 pr-4 transition-all"
                  disabled={isLoading}
                />
              </div>

              {/* Voice Button - Enhanced */}
              <motion.div 
                whileHover={{ scale: 1.05 }} 
                whileTap={{ scale: 0.95 }}
                animate={isListening ? { scale: [1, 1.1, 1] } : {}}
                transition={isListening ? { repeat: Infinity, duration: 1 } : {}}
              >
                <Button
                  variant={isListening ? "destructive" : "ghost"}
                  size="icon"
                  onClick={isListening ? stopListening : startListening}
                  className={cn(
                    "h-11 w-11 rounded-xl transition-all",
                    isListening 
                      ? "bg-destructive text-destructive-foreground shadow-lg shadow-destructive/30" 
                      : "bg-muted/50 hover:bg-muted/80 border border-border/30"
                  )}
                >
                  {isListening ? (
                    <MicOff className="h-5 w-5" />
                  ) : (
                    <Mic className="h-5 w-5" />
                  )}
                </Button>
              </motion.div>

              {/* Send Button - Futuristic Design */}
              <motion.div 
                whileHover={{ scale: 1.05 }} 
                whileTap={{ scale: 0.95 }}
              >
                <Button
                  onClick={() => sendMessage()}
                  disabled={isLoading || (!inputValue.trim() && attachedFiles.length === 0)}
                  size="icon"
                  className={cn(
                    "h-11 w-11 rounded-xl transition-all shadow-lg",
                    inputValue.trim() || attachedFiles.length > 0
                      ? "bg-gradient-to-br from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-primary/30"
                      : "bg-muted/50 border border-border/30"
                  )}
                >
                  {isLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Send className="h-5 w-5" />
                  )}
                </Button>
              </motion.div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
