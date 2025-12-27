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
  
  const scrollToBottom = useCallback(() => {
    if (isUserScrollingRef.current || isAutoScrollingRef.current) return;
    
    isAutoScrollingRef.current = true;
    
    setTimeout(() => {
      if (scrollAreaRef.current) {
        scrollAreaRef.current.scrollTo({
          top: scrollAreaRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }
      setTimeout(() => {
        isAutoScrollingRef.current = false;
      }, 300);
    }, 100);
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

  useEffect(() => {
    scrollToBottom();
  }, [messages, activeTab]);

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
      
      if (!data || !data.response) {
        console.error('❌ Invalid orchestrator response:', data);
        throw new Error('Invalid response from AI');
      }
      
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
      
      // Create AI response message
      const aiMessageId = crypto.randomUUID();
      const aiMessage: Message = {
        id: aiMessageId,
        role: 'assistant',
        content: data.response || t('chat.errorOccurred'),
        timestamp: new Date(),
        messageType: 'orchestrator',
        orchestratorType: data.metadata?.type || 'DECISION_PROVIDED',
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
        content: data.response,
        status: 'sent',
        language,
        message_type: 'orchestrator',
        ai_model: 'orchestrator_v2',
        response_time_ms: data.responseTime,
        word_count: data.response.split(/\s+/).length,
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
    <div className="h-full flex flex-col bg-background">
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

      {/* Header */}
      <div className="flex-shrink-0 border-b border-border/50 bg-card/50 backdrop-blur-xl">
        <div className="flex items-center justify-between p-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
              className="h-8 w-8"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8 border-2 border-primary/20">
                <AvatarFallback className="bg-gradient-to-br from-primary to-primary-hover text-primary-foreground text-xs">
                  <Bot className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <div>
                <h1 className="text-sm font-semibold">
                  {t('chat.title', 'Farm AI Assistant')}
                </h1>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  {isOnline ? (
                    <>
                      <Wifi className="h-3 w-3 text-success" />
                      <span className="text-success">Online</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="h-3 w-3 text-warning" />
                      <span className="text-warning">Offline</span>
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsSearchOpen(!isSearchOpen)}
              className="h-8 w-8"
            >
              <Search className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="h-8 w-8"
            >
              <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
            </Button>
          </div>
        </div>

        {/* Search Bar */}
        {isSearchOpen && (
          <div className="px-3 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('chat.searchMessages', 'Search messages...')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-9 h-9"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Land Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="px-3 pb-2 overflow-x-auto scrollbar-hide">
            <TabsList className="h-9 w-auto inline-flex bg-muted/50 p-1">
              <TabsTrigger 
                value="general" 
                className="text-xs px-3 h-7 data-[state=active]:bg-background"
              >
                <MessageSquare className="h-3 w-3 mr-1.5" />
                {t('chat.generalChat', 'General')}
              </TabsTrigger>
              {lands.slice(0, 5).map(land => (
                <TabsTrigger 
                  key={land.id} 
                  value={land.id}
                  className="text-xs px-3 h-7 data-[state=active]:bg-background"
                >
                  <Mountain className="h-3 w-3 mr-1.5" />
                  {land.name?.substring(0, 12) || 'Land'}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>
      </div>

      {/* Messages Area */}
      <div 
        ref={scrollAreaRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {/* Loading History */}
        {isLoadingHistory && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {/* Welcome Card */}
        {!isLoadingHistory && currentMessages.length === 0 && (
          activeTab === 'general' ? (
            <GeneralChatWelcomeCard />
          ) : currentLand ? (
            <LandContextCard land={currentLand} />
          ) : null
        )}

        {/* Messages */}
        <AnimatePresence mode="popLayout">
          {currentMessages
            .filter(msg => 
              !searchQuery || 
              msg.content.toLowerCase().includes(searchQuery.toLowerCase())
            )
            .map((message) => (
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

        {/* Loading Indicator */}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-3"
          >
            <Avatar className="h-9 w-9 border-2 border-primary/20">
              <AvatarFallback className="bg-gradient-to-br from-primary to-primary-hover text-primary-foreground">
                <Bot className="h-5 w-5" />
              </AvatarFallback>
            </Avatar>
            <Card className="bg-card/80 border-border/50 p-3">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">
                  {loadingMessage || t('chat.thinking', 'Thinking...')}
                </span>
              </div>
            </Card>
          </motion.div>
        )}

        {/* Vision Analysis Pending */}
        {pendingVisionAnalysis && isAnalyzingImage && (
          <VisionAnalysisCard
            imageUrl={pendingVisionAnalysis.imageUrl}
            isAnalyzing={true}
            error={pendingVisionAnalysis.error}
            language={language}
          />
        )}
      </div>

      {/* Quick Replies */}
      {quickReplies.length > 0 && !isLoading && (
        <div className="flex-shrink-0 px-4 pb-2">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {quickReplies.slice(0, 4).map((reply, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                onClick={() => sendMessage(reply)}
                className="flex-shrink-0 text-xs h-8 whitespace-nowrap"
              >
                {reply}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="flex-shrink-0 border-t border-border/50 bg-card/50 backdrop-blur-xl p-3">
        {/* Attached Files Preview */}
        {attachedFiles.length > 0 && (
          <div className="flex gap-2 mb-2 overflow-x-auto pb-1">
            {attachedFiles.map((file, index) => (
              <div key={index} className="relative flex-shrink-0">
                <div className="h-16 w-16 rounded-lg overflow-hidden border border-border/50">
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
                  className="absolute -top-1 -right-1 h-5 w-5 rounded-full"
                  onClick={() => setAttachedFiles(prev => prev.filter((_, i) => i !== index))}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          {/* Camera Button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowCamera(true)}
            className="h-10 w-10 flex-shrink-0"
          >
            <Camera className="h-5 w-5" />
          </Button>

          {/* File Attach Button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            className="h-10 w-10 flex-shrink-0"
          >
            <Paperclip className="h-5 w-5" />
          </Button>
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

          {/* Input Field */}
          <div className="flex-1 relative">
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('chat.placeholder', 'Ask about your farm...')}
              className="pr-10 h-10"
              disabled={isLoading}
            />
          </div>

          {/* Voice Button */}
          <Button
            variant={isListening ? "destructive" : "ghost"}
            size="icon"
            onClick={isListening ? stopListening : startListening}
            className="h-10 w-10 flex-shrink-0"
          >
            {isListening ? (
              <MicOff className="h-5 w-5" />
            ) : (
              <Mic className="h-5 w-5" />
            )}
          </Button>

          {/* Send Button */}
          <Button
            onClick={() => sendMessage()}
            disabled={isLoading || (!inputValue.trim() && attachedFiles.length === 0)}
            size="icon"
            className="h-10 w-10 flex-shrink-0"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
