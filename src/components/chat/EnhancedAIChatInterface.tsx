import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { 
  Send, Mic, MicOff, Volume2, VolumeX, Loader2, Bot, User, 
  RefreshCw, Wifi, WifiOff, MessageSquare, Mountain, 
  Paperclip, Camera, Image, ArrowLeft, ChevronDown,
  ThumbsUp, ThumbsDown, Copy, Share2, Check, Search, X, Clock, MessageCircle
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useTenant } from '@/contexts/TenantContext';
import { landsApi } from '@/services/landsApi';
import { LandContextCard } from './LandContextCard';
import { GeneralChatWelcomeCard } from './GeneralChatWelcomeCard';
import { ResponseSectionCard } from './ResponseSectionCard';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { useLanguageStore } from '@/stores/languageStore';

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
  feedback?: 'like' | 'dislike' | null;
  isCopied?: boolean;
}

export function EnhancedAIChatInterface() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { tenant, isLoading: isTenantLoading } = useTenant();
  const langStore = useLanguageStore();
  const language = (langStore as any).selectedLanguage || 'en';
  const isOnline = useOfflineStatus();
  
  // Guard: Don't render until tenant is loaded
  if (isTenantLoading || !tenant || !user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
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
  const [sessionIds, setSessionIds] = useState<Record<string, string>>({});
  const [loadedSessionIds, setLoadedSessionIds] = useState<Set<string>>(new Set()); // Track sessions loaded from DB
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [dynamicQuickReplies, setDynamicQuickReplies] = useState<Record<string, string[]>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState<Record<string, Date>>({});
  
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const lastScrollTop = useRef(0);
  
  const [transcript, setTranscript] = useState('');
  const { isListening, startListening: originalStartListening, stopListening } = useSpeechRecognition({
    onTranscript: (text) => setTranscript(text)
  });
  
  const { speak, stop: stopSpeaking, isSpeaking } = useTextToSpeech({
    language: language === 'hi' ? 'hi-IN' : language === 'pa' ? 'pa-IN' : language === 'mr' ? 'mr-IN' : language === 'ta' ? 'ta-IN' : 'en-IN'
  });

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

  // Pull to refresh handler
  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    
    setIsRefreshing(true);
    try {
      await fetchLands();
      toast({
        title: t('common.success'),
        description: t('chat.refreshed')
      });
    } catch (error) {
      console.error('Error refreshing:', error);
    } finally {
      setTimeout(() => setIsRefreshing(false), 1000);
    }
  }, [isRefreshing]);

  // Touch event handlers for pull-to-refresh
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);
  
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

  useEffect(() => {
    fetchLands();
  }, []);

  // Track session start time when switching tabs or sending first message
  useEffect(() => {
    if (!sessionStartTime[activeTab] && messages[activeTab]?.length > 0) {
      setSessionStartTime(prev => ({ ...prev, [activeTab]: new Date() }));
    }
  }, [activeTab, messages]);

  useEffect(() => {
    if (transcript) {
      setInputValue(transcript);
    }
  }, [transcript]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, activeTab]);

  // Load session and messages for a specific land (or general chat if landId is null)
  const loadLandSession = async (landId: string | null) => {
    try {
      // Get existing active session for this land
      const { data: existingSession } = await supabase
        .from('ai_chat_sessions')
        .select('id')
        .eq('farmer_id', user?.id)
        .eq('tenant_id', tenant?.id)
        .eq('land_id', landId)
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (existingSession) {
        console.log(`✅ Loaded session for ${landId || 'general'}:`, existingSession.id);
        
        // Load messages for this session
        const { data: previousMessages } = await supabase
          .from('ai_chat_messages')
          .select('*')
          .eq('session_id', existingSession.id)
          .eq('farmer_id', user?.id)
          .order('created_at', { ascending: true });

        console.log(`📜 Loaded ${previousMessages?.length || 0} messages for ${landId || 'general'}`);

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

      console.log(`ℹ️ No existing session for ${landId || 'general'}`);
      return { sessionId: null, messages: [] };
    } catch (error) {
      console.error(`Error loading session for ${landId || 'general'}:`, error);
      return { sessionId: null, messages: [] };
    }
  };

  const fetchLands = async () => {
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
    }
  };

  const scrollToBottom = useCallback(() => {
    // Don't auto-scroll if user is manually scrolling
    if (isUserScrolling) return;
    
    // Wait for next tick to ensure DOM is updated
    setTimeout(() => {
      if (scrollAreaRef.current) {
        // Get the actual viewport element that contains the scroll
        const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
        if (viewport) {
          viewport.scrollTo({
            top: viewport.scrollHeight,
            behavior: 'smooth'
          });
        }
      }
    }, 100);
  }, [isUserScrolling]);

  // Detect user scroll vs auto-scroll
  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (!viewport) return;

    const handleScroll = () => {
      const currentScrollTop = viewport.scrollTop;
      const scrollHeight = viewport.scrollHeight;
      const clientHeight = viewport.clientHeight;
      
      // Check if user scrolled up (not at bottom)
      const isAtBottom = scrollHeight - currentScrollTop - clientHeight < 50;
      
      // If user manually scrolled up, set flag
      if (currentScrollTop < lastScrollTop.current && !isAtBottom) {
        setIsUserScrolling(true);
      }
      // If user scrolled to bottom, clear flag
      else if (isAtBottom) {
        setIsUserScrolling(false);
      }
      
      lastScrollTop.current = currentScrollTop;
    };

    viewport.addEventListener('scroll', handleScroll, { passive: true });
    return () => viewport.removeEventListener('scroll', handleScroll);
  }, []);

  // MutationObserver to watch for new messages
  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (!viewport) return;

    const observer = new MutationObserver((mutations) => {
      // Check if new content was added
      const hasNewContent = mutations.some(mutation => 
        mutation.type === 'childList' && mutation.addedNodes.length > 0
      );
      
      if (hasNewContent && !isUserScrolling) {
        scrollToBottom();
      }
    });

    observer.observe(viewport, {
      childList: true,
      subtree: true
    });

    return () => observer.disconnect();
  }, [scrollToBottom, isUserScrolling]);

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

  const handleCameraCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const hasPermission = await requestCameraPermission();
    if (hasPermission) {
      handleFileSelect(e);
    }
  };

  const sendMessage = async (text?: string, quickAction?: string) => {
    const messageText = text || inputValue.trim();
    const finalMessage = quickAction ? `${quickAction}: ${messageText}` : messageText;
    
    if (!finalMessage && !quickAction && attachedFiles.length === 0) return;
    
    const userMessageId = crypto.randomUUID();
    const userMessage: Message = {
      id: userMessageId,
      role: 'user',
      content: finalMessage,
      timestamp: new Date()
    };
    
    setMessages(prev => ({
      ...prev,
      [activeTab]: [...(prev[activeTab] || []), userMessage]
    }));
    
    setInputValue('');
    setAttachedFiles([]);
    setIsLoading(true);
    
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
      
      // Save user message immediately with status 'sending'
      const { error: msgError } = await supabase.from('ai_chat_messages').insert({
        id: userMessageId,
        session_id: sessionId,
        tenant_id: tenantId,
        farmer_id: farmerId,
        role: 'user',
        content: finalMessage,
        status: 'sending',
        language: language,
        message_type: attachedFiles.length > 0 ? 'multimedia' : 'text',
        word_count: finalMessage.split(/\s+/).length,
        metadata: {
          tab: activeTab,
          landId: land?.id,
          quickAction: quickAction,
          attachments: attachedFiles.length
        },
        land_context: land ? {
          land_id: land.id,
          land_name: land.name,
          soil_type: land.soil_type,
          area_acres: land.area_acres,
          current_crop: land.current_crop
        } : null,
        crop_season: getCurrentSeason()
      });
      
      if (msgError) console.error('Error saving user message:', msgError);
      
      // 🤖 Call Land-Specific AI Agent
      // Each land has its own AI agent that:
      // 1. Uses land-specific context (crop, soil, area, NDVI)
      // 2. Generates quick replies based on land data
      // 3. Stores conversation data for training the land's model
      console.log(`🌾 Invoking AI Agent for Land: ${land?.name || 'General Chat'}`);
      console.log(`📊 Session ID: ${sessionId}`);
      console.log(`🗂️ Training data collected per land in: ai_chat_messages table`);
      
      const { data, error } = await supabase.functions.invoke('ai-agriculture-chat', {
        body: {
          messages: [{ role: 'user', content: finalMessage }],
          sessionId,
          landId,
          language,
          metadata: {
            tenantId,
            farmerId,
            language,
            landContext: land
          }
        }
      });
      
      if (error) throw error;
      
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
        structured: parseStructuredResponse(data.response)
      };
      
      setMessages(prev => ({
        ...prev,
        [activeTab]: [...(prev[activeTab] || []), aiMessage]
      }));
      
      // 🎯 Save Land-Specific Quick Replies
      // Quick replies are generated based on:
      // 1. Land context (crop type, soil type, growth stage)
      // 2. AI response content (what was just discussed)
      // 3. User's last message (conversation context)
      if (data.quickReplies && data.quickReplies.length > 0) {
        console.log(`💬 Land-specific quick replies for ${land?.name || 'General'}:`, data.quickReplies);
        setDynamicQuickReplies(prev => ({
          ...prev,
          [activeTab]: data.quickReplies
        }));
      }
      
      // Save AI response - No need to save separately as edge function already does this
      
    } catch (error) {
      console.error('Error sending message:', error);
      
      // Update message status to 'error' if failed
      await supabase.from('ai_chat_messages')
        .update({ 
          status: 'error',
          error_details: { error: error instanceof Error ? error.message : 'Unknown error' }
        })
        .eq('id', userMessageId);
      
      toast({
        title: t('common.error'),
        description: isOnline ? t('chat.errorOccurred') : t('chat.offlineMessage'),
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const parseStructuredResponse = (response: string) => {
    // Parse color-coded sections from AI response
    const structured: any = {
      greeting: '',
      landContext: '',
      sections: [] as Array<{type: string, title: string, content: string, color: string}>,
      closingMessage: ''
    };
    
    // Extract greeting (first line with emoji)
    const greetingMatch = response.match(/^👨‍🌾.*?🙏/m);
    if (greetingMatch) {
      structured.greeting = greetingMatch[0];
    }
    
    // Extract land context line
    const landContextMatch = response.match(/🌾.*?\|.*?\|.*$/m);
    if (landContextMatch) {
      structured.landContext = landContextMatch[0];
    }
    
    // Extract color-coded sections
    const sectionPatterns = [
      { emoji: '🟢', keyword: 'Organic Practices', type: 'organic', color: 'green' },
      { emoji: '🟡', keyword: 'Fertilizer Schedule', type: 'fertilizer', color: 'yellow' },
      { emoji: '🔴', keyword: 'Pesticide', type: 'pesticide', color: 'red' },
      { emoji: '🟣', keyword: 'Hormone', type: 'hormone', color: 'purple' },
      { emoji: '🟢', keyword: 'Advisory Note', type: 'advisory', color: 'blue' }
    ];
    
    sectionPatterns.forEach(pattern => {
      // More flexible regex to capture section content
      const regex = new RegExp(`${pattern.emoji}\\s*\\*\\*([^*]+)\\*\\*([^🟢🟡🔴🟣🌾]+)`, 'g');
      let match;
      while ((match = regex.exec(response)) !== null) {
        const title = match[1].trim();
        const content = match[2].trim();
        if (title.includes(pattern.keyword) && content) {
          structured.sections.push({
            type: pattern.type,
            title: title,
            content: content,
            color: pattern.color
          });
        }
      }
    });
    
    // Extract closing message
    const closingMatch = response.match(/🌾.*best friend!.*$/m);
    if (closingMatch) {
      structured.closingMessage = closingMatch[0];
    }
    
    // Return structured data if we found sections, otherwise return simple structure
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
      
      <ScrollArea className="h-full px-3 py-4" ref={scrollAreaRef}>
        <AnimatePresence mode="popLayout">
          {/* Show Welcome Card for general chat when no messages */}
          {activeTab === 'general' && messages[activeTab]?.length === 0 && (
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
          {activeTab !== 'general' && messages[activeTab]?.length === 0 && (
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
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -20, scale: 0.95 }}
                  transition={{ 
                    duration: 0.5, 
                    type: "spring", 
                    stiffness: 300, 
                    damping: 25 
                  }}
                  className={cn(
                    "flex gap-2 mb-4",
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  )}
                >
                  {message.role === 'assistant' && (
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        <Bot className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                  )}
                  
                  <div className={cn(
                    "relative max-w-[85%]",
                    message.role === 'user' && 'order-1'
                  )}>
                    {/* Message content - 2030 Modern UI with glassmorphism */}
                    <div className={cn(
                      "relative overflow-hidden group",
                      message.role === 'user' 
                        ? cn(
                            // Base glassmorphism
                            "backdrop-blur-2xl bg-gradient-to-br from-primary/90 via-primary to-primary-hover",
                            // Asymmetric rounded corners
                            "rounded-[2rem_2rem_0.5rem_2rem]",
                            // Text color
                            "text-primary-foreground",
                            // Smooth animations
                            "transition-all duration-500 ease-out",
                            // Interactive hover
                            "hover:scale-[1.02]",
                            // Advanced shadows for depth
                            "shadow-[0_8px_32px_rgba(33,150,243,0.25),0_16px_64px_rgba(33,150,243,0.15),0_0_0_1px_rgba(255,255,255,0.1)_inset]",
                            "hover:shadow-[0_12px_48px_rgba(33,150,243,0.35)]",
                            // Glow effect
                            "after:absolute after:inset-0 after:rounded-[2rem_2rem_0.5rem_2rem]",
                            "after:bg-gradient-to-t after:from-white/10 after:to-transparent after:pointer-events-none"
                          )
                        : cn(
                            // Glassmorphism base
                            "bg-card/60 backdrop-blur-2xl",
                            // Multi-layer border
                            "border-2 border-border/40",
                            // Organic shape
                            "rounded-[0.5rem_2rem_2rem_2rem]",
                            // Smooth entrance animation
                            "animate-in slide-in-from-left-4 fade-in duration-500",
                            // Interactive
                            "hover:border-border/60 transition-all duration-300",
                            // Advanced shadows
                            "shadow-[0_8px_32px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.04),0_0_0_1px_rgba(255,255,255,0.05)_inset]",
                            "hover:shadow-[0_12px_48px_rgba(0,0,0,0.12)]",
                            // Inner glow
                            "before:absolute before:inset-0 before:rounded-[0.5rem_2rem_2rem_2rem]",
                            "before:bg-gradient-to-br before:from-primary/5 before:to-transparent before:pointer-events-none"
                          )
                    )}>
                      <div className="p-5">
                        {message.role === 'assistant' && message.structured?.sections ? (
                          <div className="space-y-4">
                            {message.structured.greeting && message.structured.greeting.trim() !== '' && (
                              <div className="text-base font-medium text-foreground mb-3 pb-3 border-b border-border/20">
                                {message.structured.greeting.replace(/\*\*/g, '').replace(/\n\n\n+/g, '\n\n')}
                              </div>
                            )}
                            {message.structured.sections.map((section: any, idx: number) => (
                              <ResponseSectionCard 
                                key={idx} 
                                emoji={section.emoji || '📋'}
                                title={section.title.replace(/\*\*/g, '')}
                                content={section.content.replace(/\*\*/g, '').replace(/\n\n\n+/g, '\n\n')}
                                sectionType={section.type || 'other'}
                              />
                            ))}
                            {message.structured.closingMessage && message.structured.closingMessage.trim() !== '' && (
                              <div className="text-sm text-muted-foreground mt-3 pt-3 border-t border-border/20">
                                {message.structured.closingMessage.replace(/\*\*/g, '').replace(/\n\n\n+/g, '\n\n')}
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-[15px] leading-[1.6] whitespace-pre-wrap break-words">
                            {message.content.replace(/\*\*/g, '').replace(/\n\n\n+/g, '\n\n')}
                          </p>
                        )}
                        
                        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/10">
                          <span className="text-xs opacity-60">
                            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action buttons below message - Modern subtle design */}
                    <div className={cn(
                      "flex items-center gap-1 mt-2",
                      message.role === 'user' ? 'justify-end' : 'justify-start'
                    )}>
                      {/* Read aloud button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          // Glassmorphism
                          "backdrop-blur-xl bg-background/40",
                          // Floating effect
                          "border border-border/40 shadow-[0_4px_16px_rgba(0,0,0,0.1)]",
                          // Size and shape
                          "h-7 px-2.5 rounded-full text-xs",
                          // Smooth transitions
                          "transition-all duration-300",
                          // Interactive states
                          "hover:bg-background/60 hover:scale-110 hover:shadow-[0_6px_24px_rgba(0,0,0,0.15)]",
                          "active:scale-95"
                        )}
                        onClick={() => handlePlayMessage(message.id, message.content)}
                      >
                        {playingMessageId === message.id && isSpeaking ? (
                          <VolumeX className="h-3 w-3" />
                        ) : (
                          <Volume2 className="h-3 w-3" />
                        )}
                      </Button>
                      
                      {/* Like/Dislike buttons */}
                      {message.role === 'assistant' && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                              // Glassmorphism
                              "backdrop-blur-xl bg-background/40",
                              // Floating effect
                              "border border-border/40 shadow-[0_4px_16px_rgba(0,0,0,0.1)]",
                              // Size and shape
                              "h-7 px-2.5 rounded-full text-xs",
                              // Smooth transitions
                              "transition-all duration-300",
                              // Interactive states
                              "hover:bg-background/60 hover:scale-110 hover:shadow-[0_6px_24px_rgba(0,0,0,0.15)]",
                              "active:scale-95",
                              // Active state
                              message.feedback === 'like' && "bg-primary/20 text-primary hover:bg-primary/30 border-primary/40"
                            )}
                            onClick={() => handleLike(message.id, true)}
                          >
                            <ThumbsUp className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                              // Glassmorphism
                              "backdrop-blur-xl bg-background/40",
                              // Floating effect
                              "border border-border/40 shadow-[0_4px_16px_rgba(0,0,0,0.1)]",
                              // Size and shape
                              "h-7 px-2.5 rounded-full text-xs",
                              // Smooth transitions
                              "transition-all duration-300",
                              // Interactive states
                              "hover:bg-background/60 hover:scale-110 hover:shadow-[0_6px_24px_rgba(0,0,0,0.15)]",
                              "active:scale-95",
                              // Active state
                              message.feedback === 'dislike' && "bg-destructive/20 text-destructive hover:bg-destructive/30 border-destructive/40"
                            )}
                            onClick={() => handleLike(message.id, false)}
                          >
                            <ThumbsDown className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                      
                      {/* Copy button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          // Glassmorphism
                          "backdrop-blur-xl bg-background/40",
                          // Floating effect
                          "border border-border/40 shadow-[0_4px_16px_rgba(0,0,0,0.1)]",
                          // Size and shape
                          "h-7 px-2.5 rounded-full text-xs",
                          // Smooth transitions
                          "transition-all duration-300",
                          // Interactive states
                          "hover:bg-background/60 hover:scale-110 hover:shadow-[0_6px_24px_rgba(0,0,0,0.15)]",
                          "active:scale-95",
                          // Active state
                          copiedMessageId === message.id && "bg-success/20 text-success border-success/40"
                        )}
                        onClick={() => handleCopy(message.id, message.content)}
                      >
                        {copiedMessageId === message.id ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                      
                      {/* Share button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          // Glassmorphism
                          "backdrop-blur-xl bg-background/40",
                          // Floating effect
                          "border border-border/40 shadow-[0_4px_16px_rgba(0,0,0,0.1)]",
                          // Size and shape
                          "h-7 px-2.5 rounded-full text-xs",
                          // Smooth transitions
                          "transition-all duration-300",
                          // Interactive states
                          "hover:bg-background/60 hover:scale-110 hover:shadow-[0_6px_24px_rgba(0,0,0,0.15)]",
                          "active:scale-95"
                        )}
                        onClick={() => handleShare(message.content)}
                      >
                        <Share2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  
                  {message.role === 'user' && (
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="bg-secondary">
                        <User className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                  )}
                </motion.div>
              ))}
            </div>
          ))}
        </AnimatePresence>
        
        {isLoading && (
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
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </motion.div>
        )}
      </ScrollArea>
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
        
        {/* Attached files preview */}
        {attachedFiles.length > 0 && (
          <div className="flex gap-2 mb-2 overflow-x-auto">
            {attachedFiles.map((file, index) => (
              <div key={index} className="flex items-center gap-1 px-2 py-1 bg-secondary/20 rounded-full text-xs">
                <Image className="w-3 h-3" />
                {file.name}
                <button 
                  onClick={() => setAttachedFiles(prev => prev.filter((_, i) => i !== index))}
                  className="ml-1"
                >
                  ×
                </button>
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
              
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleCameraCapture}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => cameraInputRef.current?.click()}
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
    </div>
  );
}