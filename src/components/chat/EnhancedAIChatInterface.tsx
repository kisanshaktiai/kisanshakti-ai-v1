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
  Paperclip, Camera, Image, ArrowLeft, ChevronDown
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useTenantStore } from '@/stores/tenantStore';
import { landsApi } from '@/services/landsApi';
import { LandContextCard } from './LandContextCard';
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
    irrigation?: string;
    fertilizer?: string;
    pest?: string;
    weather?: string;
  };
}

export function EnhancedAIChatInterface() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const tenantStore = useTenantStore();
  const currentTenant = (tenantStore as any).tenant;
  const langStore = useLanguageStore();
  const language = (langStore as any).selectedLanguage || 'en';
  const isOnline = useOfflineStatus();
  
  const [activeTab, setActiveTab] = useState('general');
  const [lands, setLands] = useState<any[]>([]);
  const [messages, setMessages] = useState<Record<string, Message[]>>({
    general: []
  });
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionIds, setSessionIds] = useState<Record<string, string>>({});
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  
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

  useEffect(() => {
    if (transcript) {
      setInputValue(transcript);
    }
  }, [transcript]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, activeTab]);

  const fetchLands = async () => {
    try {
      const fetchedLands = await landsApi.fetchLands();
      setLands(fetchedLands);
      
      // Initialize message arrays for each land
      const landMessages: Record<string, Message[]> = { general: [] };
      fetchedLands.forEach(land => {
        landMessages[land.id] = [];
      });
      setMessages(prev => ({ ...prev, ...landMessages }));
    } catch (error) {
      console.error('Error fetching lands:', error);
    }
  };

  const scrollToBottom = () => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  };

  const getCurrentSessionId = () => {
    if (!sessionIds[activeTab]) {
      const newSessionId = crypto.randomUUID();
      setSessionIds(prev => ({ ...prev, [activeTab]: newSessionId }));
      return newSessionId;
    }
    return sessionIds[activeTab];
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
    
    const userMessage: Message = {
      id: crypto.randomUUID(),
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
      
      // Prepare metadata with all required fields
      const metadata = {
        tenantId: currentTenant?.id || 'default-tenant',
        farmerId: user?.id || 'default-farmer',
        language: language,
        landContext: land ? {
          id: land.id,
          name: land.name,
          soil_type: land.soil_type,
          area_acres: land.area_acres,
          current_crop: land.current_crop
        } : null
      };
      
      const { data, error } = await supabase.functions.invoke('ai-agriculture-chat', {
        body: {
          messages: [{ role: 'user', content: finalMessage }],
          sessionId,
          landId,
          language,
          metadata
        }
      });
      
      if (error) throw error;
      
      const aiMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.response || t('chat.errorOccurred'),
        timestamp: new Date(),
        structured: parseStructuredResponse(data.response)
      };
      
      setMessages(prev => ({
        ...prev,
        [activeTab]: [...(prev[activeTab] || []), aiMessage]
      }));
      
      // Store in database for training
      await storeMessageForTraining(userMessage, aiMessage, land);
      
    } catch (error) {
      console.error('Error sending message:', error);
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
    // Simple parsing logic - in production, use proper NLP or structured output from AI
    const structured: any = {};
    
    if (response.toLowerCase().includes('irrigation') || response.toLowerCase().includes('water')) {
      const irrigationMatch = response.match(/irrigation[^.]*\./gi);
      if (irrigationMatch) structured.irrigation = irrigationMatch[0];
    }
    
    if (response.toLowerCase().includes('fertilizer') || response.toLowerCase().includes('nutrient')) {
      const fertilizerMatch = response.match(/fertilizer[^.]*\./gi);
      if (fertilizerMatch) structured.fertilizer = fertilizerMatch[0];
    }
    
    if (response.toLowerCase().includes('pest') || response.toLowerCase().includes('disease')) {
      const pestMatch = response.match(/pest[^.]*\./gi);
      if (pestMatch) structured.pest = pestMatch[0];
    }
    
    if (response.toLowerCase().includes('weather') || response.toLowerCase().includes('rain')) {
      const weatherMatch = response.match(/weather[^.]*\./gi);
      if (weatherMatch) structured.weather = weatherMatch[0];
    }
    
    return Object.keys(structured).length > 0 ? structured : undefined;
  };

  const storeMessageForTraining = async (userMessage: Message, aiMessage: Message, land?: any) => {
    try {
      const trainingData = {
        tenant_id: currentTenant?.id,
        farmer_id: user?.id,
        land_id: land?.id,
        soil_type: land?.soil_type,
        land_size: land?.area_acres,
        crop_name: land?.current_crop,
        crop_stage: land?.cultivation_date ? calculateCropStage(land.cultivation_date) : null,
        weather_snapshot: { /* fetch current weather */ },
        ndvi_score: 0.72, // Simulated
        question_text: userMessage.content,
        ai_answer_text: aiMessage.content,
        language: language,
        timestamp: new Date().toISOString()
      };
      
      // Store in Supabase for future training
      // await supabase.from('ai_training_data').insert(trainingData);
      console.log('Training data prepared:', trainingData);
    } catch (error) {
      console.error('Error storing training data:', error);
    }
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
    const suggestions = activeTab === 'general' 
      ? [t('chat.weatherToday'), t('chat.cropSuggestion'), t('chat.marketPrices')]
      : [t('chat.whenToIrrigate'), t('chat.bestFertilizerNow'), t('chat.pestAlert'), t('chat.yieldEstimate')];
    return suggestions;
  };

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
          
          <Avatar className="h-10 w-10 border-2 border-primary/20">
            <AvatarImage src="/ai-avatar.png" />
            <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-white">
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
            </div>
          </div>
        </div>
        
      {/* Tabs - Mobile optimized horizontal scroll */}
      <div className="w-full overflow-x-auto scrollbar-hide">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="inline-flex w-auto min-w-full justify-start px-3 h-auto bg-transparent gap-2">
            <TabsTrigger 
              value="general"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-secondary data-[state=active]:text-white data-[state=inactive]:bg-muted/50 rounded-full px-4 py-1.5 text-sm transition-all"
            >
              <MessageSquare className="w-4 h-4 mr-1.5" />
              {t('chat.generalChat')}
            </TabsTrigger>
            {lands.map(land => (
              <TabsTrigger 
                key={land.id}
                value={land.id}
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-500 data-[state=active]:to-emerald-500 data-[state=active]:text-white data-[state=inactive]:bg-muted/50 rounded-full px-4 py-1.5 text-sm whitespace-nowrap transition-all"
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
          
          {(messages[activeTab] || []).map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3, type: "spring", stiffness: 500, damping: 30 }}
              className={cn(
                "flex gap-2 mb-4",
                message.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              {message.role === 'assistant' && (
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-white">
                    <Bot className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
              )}
              
              <div className={cn(
                "max-w-[85%] rounded-2xl p-3",
                message.role === 'user' 
                  ? 'bg-gradient-to-r from-primary to-secondary text-white' 
                  : 'bg-card border shadow-sm'
              )}>
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                
                {/* Structured sections for AI responses */}
                {message.role === 'assistant' && message.structured && (
                  <div className="mt-3 space-y-2">
                    {message.structured.irrigation && (
                      <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500">
                        <p className="text-xs font-medium text-blue-700 dark:text-blue-300">💧 {t('chat.irrigation')}</p>
                        <p className="text-xs mt-1">{message.structured.irrigation}</p>
                      </div>
                    )}
                    {message.structured.fertilizer && (
                      <div className="p-2 rounded-lg bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500">
                        <p className="text-xs font-medium text-green-700 dark:text-green-300">🌱 {t('chat.fertilizer')}</p>
                        <p className="text-xs mt-1">{message.structured.fertilizer}</p>
                      </div>
                    )}
                    {message.structured.pest && (
                      <div className="p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500">
                        <p className="text-xs font-medium text-red-700 dark:text-red-300">🐛 {t('chat.pest')}</p>
                        <p className="text-xs mt-1">{message.structured.pest}</p>
                      </div>
                    )}
                    {message.structured.weather && (
                      <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-900/20 border-l-4 border-purple-500">
                        <p className="text-xs font-medium text-purple-700 dark:text-purple-300">☁️ {t('chat.weather')}</p>
                        <p className="text-xs mt-1">{message.structured.weather}</p>
                      </div>
                    )}
                  </div>
                )}
                
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs opacity-70">
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {message.role === 'assistant' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handlePlayMessage(message.id, message.content)}
                    >
                      {playingMessageId === message.id && isSpeaking ? (
                        <VolumeX className="h-3 w-3" />
                      ) : (
                        <Volume2 className="h-3 w-3" />
                      )}
                    </Button>
                  )}
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

      {/* Suggestion Chips */}
      {messages[activeTab]?.length === 0 && (
        <div className="px-3 pb-2">
          <div className="flex flex-wrap gap-2">
            {getSuggestionChips().map((chip, index) => (
              <button
                key={index}
                onClick={() => sendMessage(chip)}
                className="px-3 py-1.5 text-xs font-medium rounded-full bg-secondary/20 hover:bg-secondary/30 transition-colors"
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