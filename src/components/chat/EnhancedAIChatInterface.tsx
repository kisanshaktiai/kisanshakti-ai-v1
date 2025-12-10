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
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { useLanguageStore } from '@/stores/languageStore';
import { useVoiceInitialization } from '@/hooks/useVoiceInitialization';
import { VoiceDownloadCard } from '@/components/onboarding/VoiceDownloadCard';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isPlaying?: boolean;
  landContext?: any;
  structured?: {
    greeting?: string;
    landContext?: string;
    sections?: Array<{type: string, title: string, content: string, color: string}>;
    closingMessage?: string;
    // Legacy format support
    irrigation?: string;
    fertilizer?: string;
    pest?: string;
    weather?: string;
  };
  // ✅ NEW: Color-coded cards
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
  feedback?: 'like' | 'dislike' | null;
  isCopied?: boolean;
  // ✅ NEW: Analytics including token usage
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
  const language = langStore.currentLanguage || 'en'; // Use currentLanguage from store
  const isOnline = useOfflineStatus();
  const { needsDownload, isInitialized, currentLanguage } = useVoiceInitialization();
  const [showVoiceDownload, setShowVoiceDownload] = useState(false);
  
  // ✅ ALL HOOKS MUST BE DECLARED BEFORE ANY CONDITIONAL RETURNS
  const [activeTab, setActiveTab] = useState('general');
  const [lands, setLands] = useState<any[]>([]);
  
  // 🤖 MULTI-AGENT ARCHITECTURE:
  // Each land (tab) has its own independent AI agent with:
  // - Separate conversation history (messages)
  // - Unique session ID for tracking
  // - Land-specific context and training data
  // - Isolated chat memory per land
  const [messages, setMessages] = useState<Record<string, Message[]>>({
    general: []
  });
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState(''); // ✅ NEW: Loading message state
  const [sessionIds, setSessionIds] = useState<Record<string, string>>({});
  const [loadedSessionIds, setLoadedSessionIds] = useState<Set<string>>(new Set()); // Track sessions loaded from DB
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [dynamicQuickReplies, setDynamicQuickReplies] = useState<Record<string, string[]>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true); // NEW: Loading state for chat history
  // Camera and Vision Analysis states
  const [showCamera, setShowCamera] = useState(false);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [pendingVisionAnalysis, setPendingVisionAnalysis] = useState<{
    imageUrl?: string;
    videoUrl?: string;
    result?: VisionAnalysisResult;
    error?: string;
  } | null>(null);
  const [sessionStartTime, setSessionStartTime] = useState<Record<string, Date>>({});
  
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const lastScrollTop = useRef(0);
  const isUserScrollingRef = useRef(false);
  const isAutoScrollingRef = useRef(false);
  const [transcript, setTranscript] = useState('');
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);
  
  // Map language code to BCP-47 format for speech recognition
  const speechLang = language === 'hi' ? 'hi-IN' : language === 'mr' ? 'mr-IN' : language === 'en' ? 'en-IN' : 'hi-IN';
  
  const { isListening, startListening: originalStartListening, stopListening } = useSpeechRecognition({
    onTranscript: (text) => setTranscript(text),
    language: speechLang
  });
  
  // Pass language code directly - nativeTTSService handles all conversions and fallbacks
  const { speak, stop: stopSpeaking, isSpeaking } = useTextToSpeech({
    language: language // Service will convert 'mr' → 'mr-IN', handle fallbacks etc.
  });
  
  // ✅ CRITICAL FIX: ALL HOOKS MUST BE BEFORE CONDITIONAL RETURNS
  // Move useCallback and useEffect hooks here
  const scrollToBottom = useCallback(() => {
    // Don't auto-scroll if user is manually scrolling or already auto-scrolling
    if (isUserScrollingRef.current || isAutoScrollingRef.current) return;
    
    isAutoScrollingRef.current = true;
    
    // Wait for next tick to ensure DOM is updated
    setTimeout(() => {
      if (scrollAreaRef.current) {
        scrollAreaRef.current.scrollTo({
          top: scrollAreaRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }
      // Reset flag after scroll completes
      setTimeout(() => {
        isAutoScrollingRef.current = false;
      }, 300);
    }, 100);
  }, []);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    
    setIsRefreshing(true);
    try {
      // fetchLands will be called after the component is mounted
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

  // All useEffect hooks MUST be before conditional return
  useEffect(() => {
    if (transcript) {
      setInputValue(transcript);
    }
  }, [transcript]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, activeTab]);

  // Track session start time when switching tabs or sending first message
  useEffect(() => {
    if (!sessionStartTime[activeTab] && messages[activeTab]?.length > 0) {
      setSessionStartTime(prev => ({ ...prev, [activeTab]: new Date() }));
    }
  }, [activeTab, messages, sessionStartTime]);

  // Detect user scroll vs auto-scroll
  useEffect(() => {
    const scrollContainer = scrollAreaRef.current;
    if (!scrollContainer) return;

    const handleScroll = () => {
      const currentScrollTop = scrollContainer.scrollTop;
      const scrollHeight = scrollContainer.scrollHeight;
      const clientHeight = scrollContainer.clientHeight;
      
      // Check if user scrolled up (not at bottom)
      const isAtBottom = scrollHeight - currentScrollTop - clientHeight < 50;
      
      // If user manually scrolled up, set flag
      if (currentScrollTop < lastScrollTop.current && !isAtBottom) {
        isUserScrollingRef.current = true;
      }
      // If user scrolled to bottom, clear flag
      else if (isAtBottom) {
        isUserScrollingRef.current = false;
      }
      
      lastScrollTop.current = currentScrollTop;
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, []);

  // MutationObserver to watch for new messages
  useEffect(() => {
    const scrollContainer = scrollAreaRef.current;
    if (!scrollContainer) return;

    const observer = new MutationObserver((mutations) => {
      // Ignore mutations during auto-scroll to prevent infinite loops
      if (isAutoScrollingRef.current) return;
      
      // Check if new content was added (ignore attribute/style changes)
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

  // ✅ CRITICAL FIX: Define loadLandSession FIRST (before fetchLands that depends on it)
  // Now with LocalDB caching for offline-first experience
  const loadLandSession = useCallback(async (landId: string | null) => {
    const sessionKey = landId || 'general';
    
    try {
      // 1. FIRST: Try to load from LocalDB (instant, offline-first)
      let cachedMessages: Message[] = [];
      try {
        const localMessages = await localDB.getChatMessages(landId);
        if (localMessages && localMessages.length > 0) {
          cachedMessages = localMessages
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
            .map(msg => ({
              id: msg.id,
              role: msg.role as 'user' | 'assistant',
              content: msg.content,
              timestamp: new Date(msg.created_at),
              feedback: msg.feedback_rating 
                ? (msg.feedback_rating >= 4 ? 'like' as const : 'dislike' as const) 
                : null
            }));
          console.log(`⚡ [LocalDB] Loaded ${cachedMessages.length} cached messages instantly for ${sessionKey}`);
        }
      } catch (localErr) {
        console.warn('LocalDB read failed, continuing with Supabase:', localErr);
      }
      
      // 2. THEN: Sync from Supabase in background (if online)
      let sessionQuery = supabase
        .from('ai_chat_sessions')
        .select('id')
        .eq('farmer_id', user?.id)
        .eq('tenant_id', tenant?.id)
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1);
      
      // Handle null landId properly - use is null filter instead of eq
      if (landId === null) {
        sessionQuery = sessionQuery.is('land_id', null);
      } else {
        sessionQuery = sessionQuery.eq('land_id', landId);
      }
      
      const { data: existingSession } = await sessionQuery.single();

      if (existingSession) {
        console.log(`✅ Loaded session from Supabase for ${sessionKey}:`, existingSession.id);
        
        // Load messages for this session
        const { data: previousMessages } = await supabase
          .from('ai_chat_messages')
          .select('*')
          .eq('session_id', existingSession.id)
          .eq('farmer_id', user?.id)
          .order('created_at', { ascending: true });

        console.log(`📜 Loaded ${previousMessages?.length || 0} messages from Supabase for ${sessionKey}`);

        // 3. Save to LocalDB for offline access
        if (previousMessages && previousMessages.length > 0) {
          try {
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
                metadata: msg.metadata,
                created_at: msg.created_at,
                updated_at: msg.updated_at
              });
            }
            console.log(`💾 [LocalDB] Cached ${previousMessages.length} messages for offline access`);
          } catch (cacheErr) {
            console.warn('Failed to cache messages to LocalDB:', cacheErr);
          }
        }

        return {
          sessionId: existingSession.id,
          messages: (previousMessages || []).map(msg => ({
            id: msg.id,
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
            timestamp: new Date(msg.created_at),
            feedback: msg.feedback_rating 
              ? (msg.feedback_rating >= 4 ? 'like' as const : 'dislike' as const) 
              : null
          }))
        };
      }

      // If no Supabase session but we have cached messages, return them
      if (cachedMessages.length > 0) {
        console.log(`📦 Using ${cachedMessages.length} cached messages (no Supabase session)`);
        return { sessionId: null, messages: cachedMessages };
      }

      console.log(`ℹ️ No existing session for ${sessionKey}`);
      return { sessionId: null, messages: [] };
    } catch (error) {
      console.error(`Error loading session for ${sessionKey}:`, error);
      // Return cached messages if Supabase fails
      return { sessionId: null, messages: [] };
    }
  }, [user?.id, tenant?.id]);

  // ✅ CRITICAL FIX: fetchLands wrapped in useCallback with proper dependencies
  const fetchLands = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const fetchedLands = await landsApi.fetchLands();
      setLands(fetchedLands);
      
      console.log('🔄 Loading chat history for all lands...');
      
      // Load general chat history
      const generalSession = await loadLandSession(null);
      
      // Load land-specific histories
      const landMessages: Record<string, Message[]> = { 
        general: generalSession.messages 
      };
      const landSessionIds: Record<string, string> = {};
      
      if (generalSession.sessionId) {
        landSessionIds.general = generalSession.sessionId;
      }
      
      // Load history for each land
      for (const land of fetchedLands) {
        const session = await loadLandSession(land.id);
        landMessages[land.id] = session.messages;
        if (session.sessionId) {
          landSessionIds[land.id] = session.sessionId;
        }
      }
      
      setMessages(landMessages);
      setSessionIds(prev => ({ ...prev, ...landSessionIds }));
      
      // Mark all loaded sessions so we don't recreate them in the database
      const loadedIds = new Set(Object.values(landSessionIds));
      setLoadedSessionIds(loadedIds);
      
      console.log('✅ Chat history loaded:', {
        generalMessages: generalSession.messages.length,
        landsCount: fetchedLands.length,
        totalSessions: Object.keys(landSessionIds).length,
        loadedSessionIds: Array.from(loadedIds)
      });
    } catch (error) {
      console.error('Error fetching lands:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [loadLandSession]); // fetchLands depends on loadLandSession

  // ✅ Initialize lands on mount - MUST be before conditional return
  useEffect(() => {
    fetchLands();
  }, [fetchLands]);

  // ✅ All hooks are now declared BEFORE conditional returns
  // Guard: Don't render until tenant is loaded
  if (isTenantLoading || !tenant || !user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Request microphone permission
  const startListening = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      originalStartListening();
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('chat.microphonePermissionRequired'),
        variant: 'destructive'
      });
    }
  };

  // Request camera permission
  const requestCameraPermission = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ video: true });
      return true;
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('chat.cameraPermissionRequired'),
        variant: 'destructive'
      });
      return false;
    }
  };

  // Touch event handlers for pull-to-refresh
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientY);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchEnd - touchStart;
    const isDownSwipe = distance > 50;
    const isAtTop = scrollAreaRef.current?.scrollTop === 0;
    
    if (isDownSwipe && isAtTop) {
      handleRefresh();
    }
  };

  // ✅ MOVED: fetchLands and loadLandSession are now defined BEFORE conditional return as useCallback hooks

  const getCurrentSessionId = () => {
    // Check if we already have a session ID loaded from database or created in this session
    if (sessionIds[activeTab]) {
      console.log(`♻️ Reusing existing session for ${activeTab}:`, sessionIds[activeTab]);
      return sessionIds[activeTab];
    }
    
    // Create new session ID only if none exists
    const newSessionId = crypto.randomUUID();
    console.log(`🆕 Creating new session for ${activeTab}:`, newSessionId);
    setSessionIds(prev => ({ ...prev, [activeTab]: newSessionId }));
    return newSessionId;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setAttachedFiles(prev => [...prev, ...files]);
      toast({
        title: t('common.success'),
        description: `${files.length} ${t('chat.filesAttached')}`
      });
    }
  };

  // ✅ Process attached images through AI Crop Scan
  // ✅ FIXED: Now properly saves user + AI messages to database with correct session/land context
  const processAttachedImages = async (files: File[]) => {
    if (!user?.id || !tenant?.id) return;
    
    setIsAnalyzingImage(true);
    
    try {
      // Convert files to base64
      const base64Images = await Promise.all(
        files.map(file => new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        }))
      );
      
      setPendingVisionAnalysis({ imageUrl: base64Images[0] });
      
      const landId = activeTab !== 'general' ? activeTab : undefined;
      const land = landId ? lands.find(l => l.id === landId) : null;
      const sessionId = getCurrentSessionId();
      
      // ✅ CRITICAL FIX: Create user message for image upload first
      const userMessageId = crypto.randomUUID();
      const userMessage: Message = {
        id: userMessageId,
        role: 'user',
        content: `[📷 Image uploaded for analysis]`,
        timestamp: new Date()
      };
      
      setMessages(prev => ({
        ...prev,
        [activeTab]: [...(prev[activeTab] || []), userMessage]
      }));
      
      // ✅ CRITICAL FIX: Ensure session exists in database
      if (!loadedSessionIds.has(sessionId)) {
        await supabase.from('ai_chat_sessions').insert({
          id: sessionId,
          tenant_id: tenant.id,
          farmer_id: user.id,
          session_type: activeTab === 'general' ? 'general' : 'land_specific',
          session_title: activeTab === 'general' ? 'General Agriculture Chat' : land?.name,
          land_id: land?.id || null,
          metadata: { language, platform: 'mobile', app_version: '1.0.0' }
        });
        setLoadedSessionIds(prev => new Set([...prev, sessionId]));
      }
      
      // ✅ CRITICAL FIX: Save user message with image to database
      const landContext = land ? {
        land_id: land.id,
        land_name: land.name,
        soil_type: land.soil_type,
        current_crop: land.current_crop
      } : null;
      
      await supabase.from('ai_chat_messages').insert({
        id: userMessageId,
        tenant_id: tenant.id,
        farmer_id: user.id,
        session_id: sessionId,
        role: 'user',
        content: `[📷 Image uploaded for analysis]`,
        message_type: 'image_analysis',
        land_context: landContext,
        language,
        status: 'sent'
      });
      
      // Call AI crop scan
      const { data: scanResult, error } = await supabase.functions.invoke('ai-crop-scan', {
        body: {
          images: base64Images,
          language,
          farmerId: user?.id,
          tenantId: tenant?.id,
          landId,
          landCrop: land?.current_crop,
          mode: 'full'
        }
      });
      
      if (error) throw error;
      
      if (scanResult?.success && scanResult?.result) {
        setPendingVisionAnalysis({
          imageUrl: base64Images[0],
          result: scanResult.result
        });
        
        // Show crop mismatch warning
        if (land?.current_crop && scanResult.result.cropDetected?.matchesLandCrop === false) {
          toast({
            title: '⚠️ Crop Mismatch Detected',
            description: `Detected: ${scanResult.result.cropDetected.name}. Expected: ${land.current_crop}. Using General AI for analysis.`,
            variant: 'default'
          });
        }
        
        // ✅ CRITICAL FIX: Create AI response message with proper ID
        const aiMessageId = crypto.randomUUID();
        const aiMessage: Message = {
          id: aiMessageId,
          role: 'assistant',
          content: scanResult.result.diagnosis?.summary || 'Analysis complete',
          timestamp: new Date(),
          structuredResponse: {
            cards: [],
            language
          }
        };
        
        setMessages(prev => ({
          ...prev,
          [activeTab]: [...(prev[activeTab] || []), aiMessage]
        }));
        
        // ✅ CRITICAL FIX: Save AI response to database for training
        await supabase.from('ai_chat_messages').insert({
          id: aiMessageId,
          tenant_id: tenant.id,
          farmer_id: user.id,
          session_id: sessionId,
          role: 'assistant',
          content: scanResult.result.diagnosis?.summary || 'Analysis complete',
          message_type: 'image_analysis_response',
          ai_model: 'gemini-2.5-flash',
          land_context: landContext,
          metadata: {
            analysis_result: scanResult.result,
            crop_detected: scanResult.result.cropDetected,
            diagnosis: scanResult.result.diagnosis
          },
          language,
          status: 'delivered'
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

  // World-class camera capture handler
  // ✅ FIXED: Now properly saves user + AI messages to database with correct session/land context
  const handleWorldClassCapture = async (data: { type: 'photo' | 'video'; data: string; duration?: number }) => {
    if (!user?.id || !tenant?.id) return;
    
    setShowCamera(false);
    setIsAnalyzingImage(true);
    setPendingVisionAnalysis({ imageUrl: data.type === 'photo' ? data.data : undefined, videoUrl: data.type === 'video' ? data.data : undefined });
    
    try {
      const landId = activeTab !== 'general' ? activeTab : undefined;
      const land = landId ? lands.find(l => l.id === landId) : null;
      const sessionId = getCurrentSessionId();
      const mediaType = data.type === 'photo' ? '📷' : '🎥';
      
      // ✅ CRITICAL FIX: Create user message for camera capture first
      const userMessageId = crypto.randomUUID();
      const userMessage: Message = {
        id: userMessageId,
        role: 'user',
        content: `[${mediaType} ${data.type === 'photo' ? 'Photo' : 'Video'} captured for analysis]`,
        timestamp: new Date()
      };
      
      setMessages(prev => ({
        ...prev,
        [activeTab]: [...(prev[activeTab] || []), userMessage]
      }));
      
      // ✅ CRITICAL FIX: Ensure session exists in database
      if (!loadedSessionIds.has(sessionId)) {
        await supabase.from('ai_chat_sessions').insert({
          id: sessionId,
          tenant_id: tenant.id,
          farmer_id: user.id,
          session_type: activeTab === 'general' ? 'general' : 'land_specific',
          session_title: activeTab === 'general' ? 'General Agriculture Chat' : land?.name,
          land_id: land?.id || null,
          metadata: { language, platform: 'mobile', app_version: '1.0.0' }
        });
        setLoadedSessionIds(prev => new Set([...prev, sessionId]));
      }
      
      // ✅ CRITICAL FIX: Save user message with media to database
      await supabase.from('ai_chat_messages').insert({
        id: userMessageId,
        tenant_id: tenant.id,
        farmer_id: user.id,
        session_id: sessionId,
        role: 'user',
        content: `[${mediaType} ${data.type === 'photo' ? 'Photo' : 'Video'} captured for analysis]`,
        message_type: data.type === 'photo' ? 'image_analysis' : 'video_analysis',
        land_context: land ? {
          land_id: land.id,
          land_name: land.name,
          soil_type: land.soil_type,
          current_crop: land.current_crop
        } : null,
        language,
        status: 'sent'
      });
      
      // Call AI crop scan
      const { data: scanResult, error } = await supabase.functions.invoke('ai-crop-scan', {
        body: {
          images: data.type === 'photo' ? [data.data] : [],
          videoFrames: data.type === 'video' ? [data.data] : [],
          language,
          farmerId: user?.id,
          tenantId: tenant?.id,
          landId,
          landCrop: land?.current_crop,
          mode: 'full'
        }
      });
      
      if (error) throw error;
      
      if (scanResult?.success && scanResult?.result) {
        setPendingVisionAnalysis({
          imageUrl: data.type === 'photo' ? data.data : undefined,
          videoUrl: data.type === 'video' ? data.data : undefined,
          result: scanResult.result
        });
        
        // ✅ CRITICAL FIX: Create AI response message with proper ID
        const aiMessageId = crypto.randomUUID();
        const aiMessage: Message = {
          id: aiMessageId,
          role: 'assistant',
          content: scanResult.result.diagnosis?.summary || 'Analysis complete',
          timestamp: new Date(),
          structuredResponse: {
            cards: [],
            language
          }
        };
        
        setMessages(prev => ({
          ...prev,
          [activeTab]: [...(prev[activeTab] || []), aiMessage]
        }));
        
        // ✅ CRITICAL FIX: Save AI response to database for training
        await supabase.from('ai_chat_messages').insert({
          id: aiMessageId,
          tenant_id: tenant.id,
          farmer_id: user.id,
          session_id: sessionId,
          role: 'assistant',
          content: scanResult.result.diagnosis?.summary || 'Analysis complete',
          message_type: data.type === 'photo' ? 'image_analysis_response' : 'video_analysis_response',
          ai_model: 'gemini-2.5-flash',
          land_context: land ? {
            land_id: land.id,
            land_name: land.name,
            soil_type: land.soil_type,
            current_crop: land.current_crop
          } : null,
          metadata: {
            analysis_result: scanResult.result,
            crop_detected: scanResult.result.cropDetected,
            diagnosis: scanResult.result.diagnosis,
            media_type: data.type,
            duration: data.duration
          },
          language,
          status: 'delivered'
        });
        
        // Note: LocalDB sync happens via existing loadLandSession mechanism
        
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

  const sendMessage = async (text?: string, quickAction?: string) => {
    const messageText = text || inputValue.trim();
    const finalMessage = quickAction ? `${quickAction}: ${messageText}` : messageText;
    
    // Check for image attachments - process them through vision analysis
    const imageFiles = attachedFiles.filter(f => f.type.startsWith('image/'));
    if (imageFiles.length > 0 && !finalMessage) {
      // Process attached images through AI crop scan
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
    
    // ✅ NEW: Show random loading messages
    const loadingMessages = language === 'hi' 
      ? ['जवाब तैयार कर रहा हूं...', 'सोच रहा हूं...', 'विश्लेषण कर रहा हूं...', 'समझ रहा हूं...']
      : language === 'mr'
      ? ['उत्तर तयार करत आहे...', 'विचार करत आहे...', 'विश्लेषण करत आहे...', 'समजत आहे...']
      : ['Preparing answer...', 'Thinking...', 'Analyzing...', 'Understanding...'];
    
    const randomMessage = loadingMessages[Math.floor(Math.random() * loadingMessages.length)];
    setLoadingMessage(randomMessage);
    
    try {
      const sessionId = getCurrentSessionId();
      const landId = activeTab !== 'general' ? activeTab : undefined;
      const land = landId ? lands.find(l => l.id === landId) : null;
      
      const tenantId = tenant.id;
      const farmerId = user.id;
      
      // Create session in database only if it's a new session (not loaded from DB)
      if (!loadedSessionIds.has(sessionId)) {
        console.log('💾 Creating new session in database:', sessionId);
        const { error: sessionError } = await supabase.from('ai_chat_sessions').insert({
          id: sessionId,
          tenant_id: tenantId,
          farmer_id: farmerId,
          session_type: activeTab === 'general' ? 'general' : 'land_specific',
          session_title: activeTab === 'general' ? 'General Agriculture Chat' : land?.name,
          land_id: land?.id || null,
          metadata: {
            language,
            platform: 'mobile',
            app_version: '1.0.0'
          }
        });
        
        if (sessionError) {
          console.error('Session creation error:', sessionError);
        } else {
          // Mark this session as loaded (exists in DB now)
          setLoadedSessionIds(prev => new Set([...prev, sessionId]));
        }
      } else {
        console.log('♻️ Reusing existing database session:', sessionId);
      }
      
      // ✅ Let edge function handle ALL message saves (prevents duplicates)
      
      // 🤖 Call Land-Specific AI Agent
      // Each land has its own AI agent that:
      // 1. Uses land-specific context (crop, soil, area, NDVI)
      // 2. Generates quick replies based on land data
      // 3. Stores conversation data for training the land's model
      console.log(`🌾 Invoking AI Agent for Land: ${land?.name || 'General Chat'}`);
      console.log(`📊 Session ID: ${sessionId}`);
      console.log(`🗂️ Training data collected per land in: ai_chat_messages table`);
      
      console.log('🤖 Sending AI request with language:', language);
      
      // Get session token from localStorage
      const sessionToken = localStorage.getItem('app_session_token') || '';
      
      // CRITICAL: Pass tenant and farmer IDs as headers (required by edge function)
      // ✅ Send conversation history (last 8 messages) for context
      const conversationHistory = (messages[activeTab] || []).slice(-8).map(m => ({ 
        role: m.role, 
        content: m.content 
      }));
      
      const { data, error } = await supabase.functions.invoke('ai-agriculture-chat', {
        body: {
          messages: [...conversationHistory, { role: 'user', content: finalMessage }],
          sessionId,
          landId,
          language: language, // Pass user's selected language
          metadata: {
            tenantId,
            farmerId,
            language: language,
            landContext: land
          }
        },
        headers: {
          'x-tenant-id': tenantId,
          'x-farmer-id': farmerId,
          'x-session-token': sessionToken
        }
      });
      
      if (error) {
        console.error('❌ AI Chat Error:', error);
        throw new Error(error.message || 'AI request failed');
      }
      
      if (!data || !data.response) {
        console.error('❌ Invalid AI response:', data);
        throw new Error('Invalid response from AI');
      }
      
      // Update user message status to 'sent'
      await supabase.from('ai_chat_messages')
        .update({ status: 'sent' })
        .eq('id', userMessageId);
      
      const aiMessageId = crypto.randomUUID();
      const aiMessage: Message = {
        id: aiMessageId,
        role: 'assistant',
        content: data.response || t('chat.errorOccurred'),
        timestamp: new Date(),
        structured: parseStructuredResponse(data.response),
        structuredResponse: data.structuredResponse, // ✅ NEW: Color-coded cards from backend
        // ✅ NEW: Include analytics for token display
        analytics: {
          responseTime: data.responseTime,
          tokensUsed: data.analytics?.tokensUsed,
          queryComplexity: data.analytics?.queryComplexity
        }
      };
      
      setMessages(prev => ({
        ...prev,
        [activeTab]: [...(prev[activeTab] || []), aiMessage]
      }));
      
      // 🎯 Save Dynamic Follow-Up Questions (AI-generated)
      if (data.followUpQuestions && data.followUpQuestions.length > 0) {
        console.log(`💡 Dynamic follow-ups for ${land?.name || 'General'}:`, data.followUpQuestions);
        setDynamicQuickReplies(prev => ({
          ...prev,
          [activeTab]: data.followUpQuestions.map((q: any) => q.text)
        }));
      } else if (data.quickReplies && data.quickReplies.length > 0) {
        // Fallback to quick replies
        setDynamicQuickReplies(prev => ({
          ...prev,
          [activeTab]: data.quickReplies
        }));
      }
      
      // Save AI response - No need to save separately as edge function already does this
      
    } catch (error) {
      console.error('❌ Error sending message:', {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
        activeTab,
        landId: activeTab !== 'general' ? activeTab : null,
        language
      });
      
      // Update message status to 'error' if failed
      await supabase.from('ai_chat_messages')
        .update({ 
          status: 'error',
          error_details: { 
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
          }
        })
        .eq('id', userMessageId);
      
      // Show detailed error message for debugging
      const errorMessage = error instanceof Error ? error.message : t('error.unknown');
      toast({
        title: t('error.title'),
        description: isOnline 
          ? `${t('chat.messages.error')}: ${errorMessage}`
          : t('chat.voice.error'),
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
      setLoadingMessage(''); // ✅ Clear loading message
    }
  };

  const parseStructuredResponse = (response: string) => {
    // Parse color-coded sections from AI response with enhanced detection
    const structured: any = {
      greeting: '',
      landContext: '',
      sections: [] as Array<{type: string, title: string, content: string, color: string}>,
      closingMessage: ''
    };
    
    // Extract greeting (first paragraph or line with greeting patterns)
    const greetingMatch = response.match(/^[^।\n]*(नमस्ते|नमस्कार|Hello|Namaste)[^।\n]*/im);
    if (greetingMatch) {
      structured.greeting = greetingMatch[0].trim();
    }
    
    // Intelligent section detection based on keywords (multi-language support)
    const detectSectionType = (text: string): string => {
      const lowerText = text.toLowerCase();
      
      // Organic/Natural fertilizer keywords
      if (lowerText.match(/(organic|जैविक|natural|नैसर्गिक|compost|कंपोस्ट|vermi|वर्मी|fym|गोबर|cow dung)/i)) {
        return 'organic';
      }
      
      // Chemical fertilizer keywords
      if (lowerText.match(/(fertilizer|खत|उर्वरक|npk|urea|युरिया|dap|डीएपी|chemical|रासायनिक|potash|पोटॅश)/i)) {
        return 'fertilizer';
      }
      
      // Pesticide keywords
      if (lowerText.match(/(pesticide|कीटनाशक|किटकनाशक|pest control|insect|किड|spray|फवारणी|fungicide)/i)) {
        return 'pest';
      }
      
      // Water/Irrigation keywords
      if (lowerText.match(/(water|पाणी|irrigation|सिंचाई|पाणीपुरवठा|drip)/i)) {
        return 'water';
      }
      
      return 'other';
    };
    
    // Split response into paragraphs and sections
    const paragraphs = response.split(/\n\n+/);
    let currentSection: any = null;
    
    paragraphs.forEach(para => {
      const trimmed = para.trim();
      if (!trimmed) return;
      
      // Detect section headers (lines with special characters or all caps)
      const isHeader = trimmed.match(/^[🟢🟡🔴🔵🟣🟤⚫⚪]/) || 
                      trimmed.match(/^[A-Z\u0900-\u097F\s]{10,}:/) ||
                      trimmed.match(/^\d+\.\s*[A-Z\u0900-\u097F]/);
      
      if (isHeader) {
        // Save previous section if exists
        if (currentSection && currentSection.content.trim()) {
          const sectionType = detectSectionType(currentSection.title + ' ' + currentSection.content);
          structured.sections.push({
            ...currentSection,
            type: sectionType
          });
        }
        
        // Start new section
        currentSection = {
          title: trimmed.replace(/^[🟢🟡🔴🔵🟣🟤⚫⚪]\s*/, '').replace(/\*\*/g, ''),
          content: '',
          type: 'other'
        };
      } else if (currentSection) {
        // Add content to current section
        currentSection.content += (currentSection.content ? '\n\n' : '') + trimmed;
      } else if (!structured.greeting) {
        // First paragraph becomes greeting if no greeting found
        structured.greeting = trimmed;
      }
    });
    
    // Save last section
    if (currentSection && currentSection.content.trim()) {
      const sectionType = detectSectionType(currentSection.title + ' ' + currentSection.content);
      structured.sections.push({
        ...currentSection,
        type: sectionType
      });
    }
    
    // If no sections found, treat entire response as a single section
    if (structured.sections.length === 0 && response.trim()) {
      const sectionType = detectSectionType(response);
      structured.sections.push({
        title: structured.greeting || 'Response',
        content: response.replace(structured.greeting, '').trim(),
        type: sectionType
      });
    }
    
    // Return structured data
    return structured.sections.length > 0 ? structured : undefined;
  };

  const storeMessageForTraining = async (userMessage: Message, aiMessage: Message, land?: any) => {
    try {
      // Get or create session
      const sessionId = sessionIds[activeTab] || crypto.randomUUID();
      
      // Create session if doesn't exist
      if (!sessionIds[activeTab]) {
        await supabase.from('ai_chat_sessions').insert({
          id: sessionId,
          tenant_id: tenant.id,
          farmer_id: user.id,
          session_type: activeTab === 'general' ? 'general' : 'land_specific',
          session_title: activeTab === 'general' ? 'General Agriculture Chat' : land?.name,
          land_id: land?.id || null,
          metadata: {
            language,
            platform: 'mobile',
            app_version: '1.0.0'
          }
        });
        
        setSessionIds(prev => ({ ...prev, [activeTab]: sessionId }));
      }
      
      // Store user message
      await supabase.from('ai_chat_messages').insert({
        tenant_id: tenant.id,
        farmer_id: user.id,
        session_id: sessionId,
        role: 'user',
        content: userMessage.content,
        land_context: land ? {
          land_id: land.id,
          land_name: land.name,
          soil_type: land.soil_type,
          area_acres: land.area_acres,
          current_crop: land.current_crop,
          cultivation_date: land.cultivation_date
        } : null,
        weather_context: {
          temperature: 28,
          humidity: 65,
          rainfall_prediction: 'moderate'
        },
        crop_context: land?.current_crop ? {
          crop_name: land.current_crop,
          crop_stage: land.cultivation_date ? calculateCropStage(land.cultivation_date) : null,
          days_since_sowing: land.cultivation_date ? 
            Math.floor((Date.now() - new Date(land.cultivation_date).getTime()) / (1000 * 60 * 60 * 24)) : 0
        } : null,
        location_context: {
          state: land?.state || 'Unknown',
          district: land?.district || 'Unknown',
          village: land?.village || 'Unknown'
        },
        agro_climatic_zone: land?.agro_climatic_zone || 'Default',
        soil_zone: land?.soil_zone || 'Default',
        rainfall_zone: land?.rainfall_zone || 'Default',
        crop_season: getCurrentSeason()
      });
      
      // Store AI response
      await supabase.from('ai_chat_messages').insert({
        tenant_id: tenant.id,
        farmer_id: user.id,
        session_id: sessionId,
        role: 'assistant',
        content: aiMessage.content,
        land_context: land ? {
          land_id: land.id,
          land_name: land.name,
          soil_type: land.soil_type,
          area_acres: land.area_acres,
          current_crop: land.current_crop,
          cultivation_date: land.cultivation_date
        } : null,
        ai_model: 'gpt-4',
        response_time_ms: 1500,
        tokens_used: Math.floor(aiMessage.content.length / 4)
      });
      
      // Update analytics
      await supabase.from('ai_chat_analytics').upsert({
        tenant_id: tenant.id,
        farmer_id: user.id,
        date: new Date().toISOString().split('T')[0],
        total_messages: 2,
        total_sessions: 1,
        avg_response_time_ms: 1500,
        topics: [activeTab === 'general' ? 'general' : 'land_specific']
      }, {
        onConflict: 'tenant_id,farmer_id,date',
        count: 'exact'
      });
      
    } catch (error) {
      console.error('Error storing chat data:', error);
    }
  };
  
  const getCurrentSeason = () => {
    const month = new Date().getMonth();
    if (month >= 6 && month <= 9) return 'kharif';
    if (month >= 10 || month <= 1) return 'rabi';
    return 'summer';
  };

  const calculateCropStage = (cultivationDate: string) => {
    const daysElapsed = Math.floor((Date.now() - new Date(cultivationDate).getTime()) / (1000 * 60 * 60 * 24));
    if (daysElapsed < 30) return 'seedling';
    if (daysElapsed < 60) return 'vegetative';
    if (daysElapsed < 90) return 'flowering';
    return 'harvest';
  };

  const handlePlayMessage = (messageId: string, content: string) => {
    if (playingMessageId === messageId) {
      stopSpeaking();
      setPlayingMessageId(null);
    } else {
      stopSpeaking();
      speak(content);
      setPlayingMessageId(messageId);
    }
  };
  
  const handleLike = async (messageId: string, isLike: boolean) => {
    const feedback = isLike ? 'like' : 'dislike';
    
    // Update local state
    setMessages(prev => ({
      ...prev,
      [activeTab]: prev[activeTab].map(msg => 
        msg.id === messageId 
          ? { ...msg, feedback: msg.feedback === feedback ? null : feedback }
          : msg
      )
    }));
    
    // Update in database
    try {
      const message = messages[activeTab].find(m => m.id === messageId);
      if (message) {
        await supabase.from('ai_chat_messages')
          .update({ 
            feedback_rating: message.feedback === feedback ? null : (isLike ? 5 : 1),
            feedback_text: message.feedback === feedback ? null : feedback
          })
          .eq('id', messageId);
      }
    } catch (error) {
      console.error('Error updating feedback:', error);
    }
  };
  
  const handleCopy = async (messageId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(messageId);
      toast({
        title: t('common.copied'),
        description: t('chat.messageCopied'),
      });
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('chat.copyFailed'),
        variant: 'destructive'
      });
    }
  };
  
  const handleShare = async (content: string) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: t('chat.shareTitle'),
          text: content,
        });
      } catch (error) {
        if ((error as any).name !== 'AbortError') {
          console.error('Error sharing:', error);
        }
      }
    } else {
      // Fallback to copy
      await navigator.clipboard.writeText(content);
      toast({
        title: t('common.copied'),
        description: t('chat.shareViaCopy'),
      });
    }
  };

  const handleQuickAction = (action: string) => {
    const prompts: Record<string, string> = {
      irrigation: t('chat.irrigationPrompt'),
      fertilizer: t('chat.fertilizerPrompt'),
      pest: t('chat.pestPrompt'),
      weather: t('chat.weatherPrompt')
    };
    sendMessage(prompts[action] || action, action);
  };

  const getSuggestionChips = () => {
    // Use AI-generated quick replies if available
    if (dynamicQuickReplies[activeTab] && dynamicQuickReplies[activeTab].length > 0) {
      console.log('📝 Using dynamic quick replies for', activeTab);
      return dynamicQuickReplies[activeTab];
    }
    
    // Fallback to static suggestions
    const suggestions = activeTab === 'general' 
      ? [t('chat.weatherToday'), t('chat.cropSuggestion'), t('chat.marketPrices')]
      : [t('chat.whenToIrrigate'), t('chat.bestFertilizerNow'), t('chat.pestAlert'), t('chat.yieldEstimate')];
    return suggestions;
  };

  // Helper: Group messages by date
  const groupMessagesByDate = (messages: Message[]) => {
    const groups: { date: string; messages: Message[] }[] = [];
    const dateMap = new Map<string, Message[]>();

    messages.forEach(msg => {
      const dateKey = new Date(msg.timestamp).toLocaleDateString();
      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, []);
      }
      dateMap.get(dateKey)!.push(msg);
    });

    dateMap.forEach((msgs, date) => {
      groups.push({ date, messages: msgs });
    });

    return groups;
  };

  // Helper: Filter messages by search query
  const filterMessages = (messages: Message[]) => {
    if (!searchQuery.trim()) return messages;
    
    const query = searchQuery.toLowerCase();
    return messages.filter(msg => 
      msg.content.toLowerCase().includes(query)
    );
  };

  // Helper: Get session statistics
  const getSessionStats = () => {
    const currentMessages = messages[activeTab] || [];
    const sessionId = sessionIds[activeTab];
    const isExistingSession = sessionId && loadedSessionIds.has(sessionId);
    const startTime = sessionStartTime[activeTab];
    
    return {
      messageCount: currentMessages.length,
      userMessages: currentMessages.filter(m => m.role === 'user').length,
      aiMessages: currentMessages.filter(m => m.role === 'assistant').length,
      isExisting: isExistingSession,
      sessionId: sessionId,
      duration: startTime ? Date.now() - startTime.getTime() : 0
    };
  };

  // Helper: Format duration
  const formatDuration = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    if (minutes < 1) return 'Just started';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };

  // Get filtered and grouped messages
  const currentMessages = filterMessages(messages[activeTab] || []);
  const groupedMessages = groupMessagesByDate(currentMessages);
  const sessionStats = getSessionStats();

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-lg border-b">
        <div className="flex items-center gap-3 p-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/app')}
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          
          <Avatar className="h-10 w-10 border-2 border-border">
            <AvatarImage src="/ai-avatar.png" />
            <AvatarFallback className="bg-primary text-primary-foreground">
              <Bot className="h-5 w-5" />
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1">
            <h1 className="text-base font-semibold">{t('chat.aiAssistant')}</h1>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-xs text-muted-foreground">{t('common.online')}</span>
              </div>
              {!isOnline && (
                <Badge variant="outline" className="text-xs">
                  <WifiOff className="w-3 h-3 mr-1" />
                  {t('common.offline')}
                </Badge>
              )}
              {/* Session Status Badge */}
              {sessionStats.sessionId && (
                <Badge 
                  variant={sessionStats.isExisting ? "secondary" : "default"} 
                  className="text-xs"
                >
                  {sessionStats.isExisting ? '♻️ Continuing' : '🆕 New'}
                </Badge>
              )}
            </div>
          </div>

          {/* Search Toggle and Stats */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsSearchOpen(!isSearchOpen)}
              className="h-9 w-9"
            >
              <Search className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Session Statistics Bar */}
        {sessionStats.messageCount > 0 && (
          <div className="px-3 pb-2 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <MessageCircle className="w-3 h-3" />
              <span>{sessionStats.messageCount} messages</span>
            </div>
            {sessionStats.duration > 0 && (
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>{formatDuration(sessionStats.duration)}</span>
              </div>
            )}
          </div>
        )}

        {/* Search Bar */}
        {isSearchOpen && (
          <div className="px-3 pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search messages..."
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
        
      {/* Tabs - Mobile optimized horizontal scroll */}
      <div className="w-full overflow-x-auto scrollbar-hide">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="inline-flex w-auto min-w-full justify-start px-3 h-auto bg-transparent gap-2">
            <TabsTrigger 
              value="general"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:bg-muted/50 data-[state=inactive]:text-muted-foreground rounded-full px-4 py-1.5 text-sm transition-all"
            >
              <MessageSquare className="w-4 h-4 mr-1.5" />
              {t('chat.generalChat')}
            </TabsTrigger>
            {lands.map(land => (
              <TabsTrigger 
                key={land.id}
                value={land.id}
                className="data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground data-[state=inactive]:bg-muted/50 data-[state=inactive]:text-muted-foreground rounded-full px-4 py-1.5 text-sm whitespace-nowrap transition-all"
              >
                <Mountain className="w-4 h-4 mr-1.5" />
                {land.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
    </div>

    {/* Messages Area with integrated land context and pull-to-refresh */}
    <div 
      className="flex-1 relative overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull to refresh indicator */}
      {isRefreshing && (
        <div className="absolute top-0 left-0 right-0 flex justify-center p-3 z-20">
          <div className="flex items-center gap-2 bg-primary/10 px-3 py-1.5 rounded-full">
            <RefreshCw className="w-4 h-4 animate-spin text-primary" />
            <span className="text-xs text-primary">{t('common.refreshing')}</span>
          </div>
        </div>
      )}
      
      <div 
        ref={scrollAreaRef}
        className="h-full px-3 py-4 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent"
      >
        <AnimatePresence mode="popLayout">
          {/* Loading State for Chat History */}
          {isLoadingHistory && messages[activeTab]?.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-12 gap-3"
            >
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">
                {language === 'hi' ? 'चैट इतिहास लोड हो रहा है...' : 
                 language === 'mr' ? 'चॅट इतिहास लोड होत आहे...' : 
                 'Loading chat history...'}
              </span>
            </motion.div>
          )}
          
          {/* Show Welcome Card for general chat when no messages */}
          {activeTab === 'general' && messages[activeTab]?.length === 0 && !isLoadingHistory && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4"
            >
              <GeneralChatWelcomeCard 
                onQuickAction={handleQuickAction}
              />
            </motion.div>
          )}
          
          {/* Show Land Context as first message for land-specific chats */}
          {activeTab !== 'general' && messages[activeTab]?.length === 0 && !isLoadingHistory && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4"
            >
              <LandContextCard 
                land={lands.find(l => l.id === activeTab)}
                onQuickAction={handleQuickAction}
              />
            </motion.div>
          )}
          
          {/* Messages grouped by date */}
          {groupedMessages.map((group, groupIndex) => (
            <div key={group.date}>
              {/* Date Separator */}
              <div className="flex items-center justify-center my-4">
                <div className="bg-muted/50 backdrop-blur px-3 py-1 rounded-full">
                  <span className="text-xs font-medium text-muted-foreground">
                    {new Date(group.messages[0].timestamp).toLocaleDateString() === new Date().toLocaleDateString()
                      ? 'Today'
                      : new Date(group.messages[0].timestamp).toLocaleDateString() === new Date(Date.now() - 86400000).toLocaleDateString()
                      ? 'Yesterday'
                      : group.date}
                  </span>
                </div>
              </div>

              {/* Messages for this date */}
              {group.messages.map((message) => (
                <ModernChatUI
                  key={message.id}
                  message={message}
                  onCopy={handleCopy}
                  onLike={handleLike}
                  onShare={handleShare}
                  onPlay={handlePlayMessage}
                />
              ))}
            </div>
          ))}
        </AnimatePresence>
        
        {/* Vision Analysis Card - Shows when analyzing image/video */}
        {(isAnalyzingImage || pendingVisionAnalysis) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4"
          >
            <VisionAnalysisCard
              imageUrl={pendingVisionAnalysis?.imageUrl}
              videoUrl={pendingVisionAnalysis?.videoUrl}
              isAnalyzing={isAnalyzingImage}
              analysisResult={pendingVisionAnalysis?.result}
              error={pendingVisionAnalysis?.error}
              language={language}
              onRetry={() => {
                setPendingVisionAnalysis(null);
                setShowCamera(true);
              }}
            />
          </motion.div>
        )}
        
        {isLoading && !isAnalyzingImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-2 items-center justify-start mb-4"
          >
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-white">
                <Bot className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
            <div className="bg-card border rounded-2xl p-3 shadow-sm">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                {loadingMessage && (
                  <span className="text-xs text-muted-foreground ml-2">{loadingMessage}</span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>

      {/* Suggestion Chips - Show when no messages OR when AI has provided quick replies */}
      {(messages[activeTab]?.length === 0 || (messages[activeTab]?.length > 0 && dynamicQuickReplies[activeTab]?.length > 0)) && (
        <div className="px-3 pb-2">
          <div className="flex gap-2 overflow-x-auto overflow-y-hidden scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent pb-1">
            {getSuggestionChips().map((chip, index) => (
              <button
                key={index}
                onClick={() => sendMessage(chip.replace('💬 ', ''))}
                disabled={isLoading}
                className="px-4 py-2 text-xs font-medium rounded-full bg-primary/10 hover:bg-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
              >
                {chip}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Bar */}
      <div className="sticky bottom-0 p-3 bg-background/80 backdrop-blur-lg border-t">
        {!isOnline && (
          <div className="flex items-center justify-center gap-2 mb-2 text-xs text-muted-foreground">
            <WifiOff className="w-3 h-3" />
            {t('chat.offlineMessage')}
          </div>
        )}
        
        {/* Attached files preview with image thumbnails */}
        {attachedFiles.length > 0 && (
          <div className="flex gap-2 mb-2 overflow-x-auto pb-1">
            {attachedFiles.map((file, index) => (
              <div key={index} className="relative group shrink-0">
                {file.type.startsWith('image/') ? (
                  <div className="relative w-16 h-16 rounded-lg overflow-hidden border-2 border-primary/20">
                    <img 
                      src={URL.createObjectURL(file)} 
                      alt={file.name}
                      className="w-full h-full object-cover"
                    />
                    <button 
                      onClick={() => {
                        URL.revokeObjectURL(URL.createObjectURL(file));
                        setAttachedFiles(prev => prev.filter((_, i) => i !== index));
                      }}
                      className="absolute top-0 right-0 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs shadow-md hover:bg-destructive/90 transition-colors"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 px-3 py-2 bg-secondary/20 rounded-lg text-xs border">
                    <Paperclip className="w-3 h-3" />
                    <span className="max-w-20 truncate">{file.name}</span>
                    <button 
                      onClick={() => setAttachedFiles(prev => prev.filter((_, i) => i !== index))}
                      className="ml-1 hover:text-destructive"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,.doc,.docx"
                className="hidden"
                onChange={handleFileSelect}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="h-4 w-4 text-muted-foreground" />
              </Button>
              
              {/* Camera Button - Opens WorldClassCamera */}
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setShowCamera(true)}
              >
                <Camera className="h-4 w-4 text-muted-foreground" />
              </Button>
              
            </div>
            
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder={t('chat.typeMessage')}
              className="pl-20 pr-12 py-6 rounded-full bg-secondary/10 border-0 focus-visible:ring-2 focus-visible:ring-primary"
              disabled={isLoading || !isOnline}
            />
            
            <div className="absolute right-1 top-1/2 -translate-y-1/2">
              {inputValue.trim() || attachedFiles.length > 0 ? (
                <Button
                  onClick={() => sendMessage()}
                  disabled={isLoading || !isOnline}
                  size="icon"
                  className="rounded-full h-10 w-10 bg-gradient-to-r from-primary to-secondary hover:opacity-90"
                >
                  {isLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Send className="h-5 w-5" />
                  )}
                </Button>
              ) : (
                <Button
                  onClick={isListening ? stopListening : startListening}
                  size="icon"
                  variant={isListening ? 'destructive' : 'secondary'}
                  className="rounded-full h-10 w-10"
                  disabled={!isOnline}
                >
                  {isListening ? (
                    <MicOff className="h-5 w-5" />
                  ) : (
                    <Mic className="h-5 w-5" />
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* WorldClassCamera Modal */}
      {showCamera && (
        <WorldClassCamera
          onCapture={handleWorldClassCapture}
          onClose={() => setShowCamera(false)}
          maxVideoDuration={10}
          language={language}
        />
      )}
    </div>
  );
}