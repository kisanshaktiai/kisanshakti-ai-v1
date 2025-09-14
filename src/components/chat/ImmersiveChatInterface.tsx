import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { useTranslation } from 'react-i18next';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { 
  Send, Mic, MicOff, Camera, Image as ImageIcon, Volume2, VolumeX, 
  Bot, User, MapPin, Loader2, X, Globe, 
  RefreshCw, ThumbsUp, ThumbsDown, Zap, Clock,
  Cloud, CloudOff, Languages, ChevronLeft, Plus,
  Wheat, Trees, Flower2, Sprout, Leaf, TreePine,
  CloudRain, Sun, Wind, Thermometer, Droplets,
  FileImage, ScanLine, MessageSquare, Sparkles
} from 'lucide-react';
import { format } from 'date-fns';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  landId?: string;
  landName?: string;
  attachments?: {
    type: 'image' | 'file';
    url: string;
    name: string;
  }[];
  metadata?: any;
  feedback?: 'positive' | 'negative';
}

interface ChatSession {
  id: string;
  title: string;
  landId?: string;
  landName?: string;
  type: 'general' | 'land_specific';
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  lastSyncedAt?: Date;
}

interface Land {
  id: string;
  name: string;
  village?: string;
  primary_crop?: string;
  current_crop?: string;
  soil_type?: string;
  area?: number;
  crop_history?: any[];
  weather_data?: any;
  ndvi_data?: any;
  health_score?: number;
}

// Crop icons mapping
const getCropIcon = (cropName?: string) => {
  if (!cropName) return Sprout;
  const crop = cropName.toLowerCase();
  if (crop.includes('wheat')) return Wheat;
  if (crop.includes('tree') || crop.includes('mango')) return Trees;
  if (crop.includes('flower') || crop.includes('rose')) return Flower2;
  if (crop.includes('pine') || crop.includes('evergreen')) return TreePine;
  if (crop.includes('leaf') || crop.includes('vegetable')) return Leaf;
  return Sprout;
};

// Health status color and badge
const getHealthStatus = (score?: number, soilType?: string) => {
  if (score !== undefined && score > 80) return { color: 'bg-success/20 text-success', text: '✓' };
  if (score !== undefined && score > 60) return { color: 'bg-warning/20 text-warning', text: '!' };
  if (score !== undefined && score <= 60) return { color: 'bg-destructive/20 text-destructive', text: '⚠' };
  
  // Fallback to soil type if no health score
  if (!soilType) return { color: 'bg-muted', text: '-' };
  const soil = soilType.toLowerCase();
  if (soil.includes('loamy')) return { color: 'bg-success/20 text-success', text: 'L' };
  if (soil.includes('clay')) return { color: 'bg-warning/20 text-warning', text: 'C' };
  if (soil.includes('sandy')) return { color: 'bg-info/20 text-info', text: 'S' };
  return { color: 'bg-muted', text: '-' };
};

export function ImmersiveChatInterface() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const isOnline = useOfflineStatus();
  
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [selectedLandId, setSelectedLandId] = useState<string>('general');
  const [lands, setLands] = useState<Land[]>([]);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [showHeaderFooter, setShowHeaderFooter] = useState(false);
  
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const touchStartY = useRef<number>(0);

  // Quick actions for easy access
  const quickActions = [
    { icon: CloudRain, label: t('chat.checkWeather', 'Check Weather'), action: 'weather' },
    { icon: Droplets, label: t('chat.soilReport', 'Soil Report'), action: 'soil' },
    { icon: Sparkles, label: t('chat.fertilizerAdvice', 'Fertilizer Advice'), action: 'fertilizer' },
    { icon: ScanLine, label: t('chat.diseaseDetection', 'Disease Detection'), action: 'disease' }
  ];

  // Speech recognition hook
  const { isListening, toggleListening, isSupported: isSpeechSupported } = useSpeechRecognition({
    onTranscript: (transcript) => {
      setInputMessage(prev => prev + ' ' + transcript);
    },
    language: i18n.language === 'hi' ? 'hi-IN' : 'en-US'
  });

  // Text to speech hook
  const { speak, stop, isSpeaking, isSupported: isTTSSupported } = useTextToSpeech({
    language: i18n.language === 'hi' ? 'hi-IN' : 'en-US',
    rate: 0.9,
    pitch: 1.0
  });

  // Load lands and initialize
  useEffect(() => {
    if (user?.id) {
      loadLands();
      loadOrCreateSession();
      handleInstaScanContext();
    }
  }, [user]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [currentSession?.messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textAreaRef.current) {
      textAreaRef.current.style.height = 'auto';
      const scrollHeight = textAreaRef.current.scrollHeight;
      textAreaRef.current.style.height = Math.min(scrollHeight, 120) + 'px';
    }
  }, [inputMessage]);

  // Handle swipe to reveal header/footer
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touchEndY = e.changedTouches[0].clientY;
    const deltaY = touchEndY - touchStartY.current;
    
    // Swipe down from top to show header
    if (touchStartY.current < 50 && deltaY > 50) {
      setShowHeaderFooter(true);
      setTimeout(() => setShowHeaderFooter(false), 3000);
    }
  };

  const loadLands = async () => {
    try {
      if (!user?.id) return;
      
      const { data, error } = await supabase
        .from('lands')
        .select('*')
        .eq('farmer_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Add mock health scores for demo
      const landsWithHealth = (data || []).map(land => ({
        ...land,
        health_score: Math.floor(Math.random() * 40) + 60 // Random 60-100
      }));
      
      setLands(landsWithHealth);
      
      // Cache for offline
      if (data) {
        localStorage.setItem('cached_lands', JSON.stringify(landsWithHealth));
      }
    } catch (error) {
      console.error('Error loading lands:', error);
      // Load from cache if offline
      const cachedLands = localStorage.getItem('cached_lands');
      if (cachedLands) {
        setLands(JSON.parse(cachedLands));
      }
    }
  };

  const loadOrCreateSession = async () => {
    try {
      const { data: sessionData, error } = await supabase
        .from('chat_sessions')
        .select('*, chat_messages(*)')
        .eq('user_id', user?.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sessionData && !error) {
        const formattedSession: ChatSession = {
          id: sessionData.id,
          title: sessionData.title,
          landId: sessionData.land_id,
          landName: sessionData.land_id ? lands.find(l => l.id === sessionData.land_id)?.name : undefined,
          type: sessionData.type as 'general' | 'land_specific',
          messages: sessionData.chat_messages.map((msg: any) => ({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            timestamp: new Date(msg.created_at),
            landId: msg.land_id,
            landName: msg.land_name,
            attachments: msg.attachments,
            metadata: msg.metadata,
            feedback: msg.feedback
          })),
          createdAt: new Date(sessionData.created_at),
          updatedAt: new Date(sessionData.updated_at),
          lastSyncedAt: new Date()
        };
        setCurrentSession(formattedSession);
      } else {
        createNewSession('general');
      }
    } catch (error) {
      console.error('Error loading session:', error);
      createNewSession('general');
    }
  };

  const createNewSession = async (landId: string) => {
    const land = lands.find(l => l.id === landId);
    const newSession: ChatSession = {
      id: crypto.randomUUID(),
      title: land ? `${land.name} Chat` : t('chat.generalChat'),
      landId: land?.id,
      landName: land?.name,
      type: landId === 'general' ? 'general' : 'land_specific',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    if (isOnline && user?.id) {
      try {
        await supabase.from('chat_sessions').insert({
          id: newSession.id,
          user_id: user.id,
          land_id: newSession.landId,
          land_name: newSession.landName,
          title: newSession.title,
          type: newSession.type
        });
      } catch (error) {
        console.error('Error creating session:', error);
      }
    }

    setCurrentSession(newSession);
    saveToLocalStorage(newSession);
  };

  const handleInstaScanContext = () => {
    const instaScanContext = sessionStorage.getItem('instaScanContext');
    if (instaScanContext) {
      const context = JSON.parse(instaScanContext);
      sessionStorage.removeItem('instaScanContext');
      
      const contextMessage = `I just scanned a ${context.cropName} crop. 
Condition: ${context.cropCondition}. 
${context.diseases.length > 0 ? `Diseases detected: ${context.diseases.join(', ')}. ` : ''}
Initial suggestions: ${context.suggestions.join('. ')}. 
Please provide detailed guidance.`;
      
      setInputMessage(contextMessage);
      if (context.imageUrl) {
        setUploadedImage(context.imageUrl);
      }
      
      setTimeout(() => sendMessage(), 500);
    }
  };

  const switchLandContext = (landId: string) => {
    setSelectedLandId(landId);
    createNewSession(landId);
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() && !uploadedImage) return;
    if (!currentSession) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: inputMessage,
      timestamp: new Date(),
      landId: currentSession.landId,
      landName: currentSession.landName,
      attachments: []
    };

    if (uploadedImage) {
      userMessage.attachments?.push({
        type: 'image',
        url: uploadedImage,
        name: 'uploaded-image.jpg'
      });
    }

    const updatedMessages = [...currentSession.messages, userMessage];
    setCurrentSession(prev => prev ? { ...prev, messages: updatedMessages } : null);
    setInputMessage('');
    setUploadedImage(null);
    setIsLoading(true);
    setIsTyping(true);

    try {
      let landContext = null;
      if (currentSession.landId) {
        const land = lands.find(l => l.id === currentSession.landId);
        if (land) {
          landContext = {
            landName: land.name,
            soilType: land.soil_type,
            area: land.area,
            primaryCrop: land.primary_crop,
            cropHistory: land.crop_history,
            weatherData: land.weather_data,
            ndviData: land.ndvi_data
          };
        }
      }

      const { data, error } = await supabase.functions.invoke('ai-agriculture-chat', {
        body: {
          messages: updatedMessages.map(msg => ({
            role: msg.role,
            content: msg.content
          })),
          landContext,
          imageUrl: uploadedImage,
          sessionId: currentSession.id,
          language: i18n.language
        }
      });

      if (error) throw error;

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.response,
        timestamp: new Date(),
        landId: currentSession.landId,
        landName: currentSession.landName,
        metadata: data.metadata
      };

      const finalMessages = [...updatedMessages, assistantMessage];
      setCurrentSession(prev => prev ? { 
        ...prev, 
        messages: finalMessages,
        lastSyncedAt: new Date()
      } : null);

      // Speak response if enabled
      if (voiceEnabled && isTTSSupported) {
        speak(data.response);
      }

      // Save to database if online
      if (isOnline && user?.id) {
        await saveMessageToDatabase(userMessage);
        await saveMessageToDatabase(assistantMessage);
      }

      saveToLocalStorage(currentSession);
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: t('common.error'),
        description: isOnline ? 'Failed to get response' : 'You are offline. Some features may be limited.',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
      setIsTyping(false);
    }
  };

  const saveMessageToDatabase = async (message: Message) => {
    if (!currentSession || !user?.id) return;
    
    try {
      await supabase.from('chat_messages').insert({
        session_id: currentSession.id,
        role: message.role,
        content: message.content,
        land_id: message.landId,
        land_name: message.landName,
        attachments: message.attachments,
        metadata: message.metadata
      });
    } catch (error) {
      console.error('Error saving message:', error);
    }
  };

  const provideFeedback = async (messageId: string, feedback: 'positive' | 'negative') => {
    setCurrentSession(prev => {
      if (!prev) return null;
      return {
        ...prev,
        messages: prev.messages.map(msg => 
          msg.id === messageId ? { ...msg, feedback } : msg
        )
      };
    });

    if (isOnline && currentSession) {
      try {
        await supabase.from('chat_messages')
          .update({ feedback })
          .eq('id', messageId);
      } catch (error) {
        console.error('Error saving feedback:', error);
      }
    }

    toast({
      title: t('chat.feedbackThanks', 'Thank you for your feedback!'),
      description: t('chat.feedbackHelps', 'This helps us improve our AI responses.'),
    });
  };

  const handleQuickAction = (action: string) => {
    const prompts: Record<string, string> = {
      'weather': t('chat.weatherPrompt', 'What is the weather forecast for my area?'),
      'soil': t('chat.soilPrompt', 'Can you analyze my soil condition and provide recommendations?'),
      'fertilizer': t('chat.fertilizerPrompt', 'What fertilizers should I use for optimal crop growth?'),
      'disease': t('chat.diseasePrompt', 'Help me identify any diseases in my crops.')
    };
    setInputMessage(prompts[action] || action);
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setUploadedImage(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const saveToLocalStorage = (session: ChatSession) => {
    localStorage.setItem(`chat_session_${session.id}`, JSON.stringify(session));
  };

  const openInstaScan = () => {
    navigate('/app/insta-scan');
  };

  return (
    <div 
      className="fixed inset-0 flex flex-col bg-gradient-to-b from-background to-muted/20"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Hidden Header - Swipe to reveal */}
      <div className={cn(
        "absolute top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-b transition-transform duration-300",
        showHeaderFooter ? "translate-y-0" : "-translate-y-full"
      )}>
        <div className="flex items-center justify-between p-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold">{t('chat.title', 'KisanShakti AI')}</h1>
          <div className="flex gap-1">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setVoiceEnabled(!voiceEnabled)}
            >
              {voiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
            <Badge variant={isOnline ? 'default' : 'secondary'}>
              {isOnline ? <Cloud className="w-3 h-3" /> : <CloudOff className="w-3 h-3" />}
            </Badge>
          </div>
        </div>
      </div>

      {/* Land Selection Row */}
      <div className="bg-card/90 backdrop-blur-sm border-b px-3 py-2 z-40">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {/* General Chat */}
          <button
            onClick={() => switchLandContext('general')}
            className={cn(
              "shrink-0 px-3 py-1.5 rounded-full flex items-center gap-2 text-xs font-medium transition-all",
              selectedLandId === 'general' 
                ? "bg-primary text-primary-foreground shadow-lg scale-105" 
                : "bg-card border hover:bg-accent"
            )}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{t('chat.general', 'General')}</span>
          </button>
          
          {/* Land Cards */}
          {lands.map(land => {
            const CropIcon = getCropIcon(land.primary_crop || land.current_crop);
            const healthStatus = getHealthStatus(land.health_score, land.soil_type);
            
            return (
              <button
                key={land.id}
                onClick={() => switchLandContext(land.id)}
                className={cn(
                  "shrink-0 px-3 py-1.5 rounded-full flex items-center gap-2 text-xs font-medium transition-all",
                  selectedLandId === land.id 
                    ? "bg-primary text-primary-foreground shadow-lg scale-105" 
                    : "bg-card border hover:bg-accent"
                )}
              >
                <CropIcon className="w-3.5 h-3.5" />
                <span className="max-w-[80px] truncate">{land.name}</span>
                <Badge className={cn("h-4 px-1 text-[9px]", healthStatus.color)}>
                  {healthStatus.text}
                </Badge>
              </button>
            );
          })}
          
          {/* Add Land Hint */}
          {lands.length === 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card/50 border border-dashed">
              <Plus className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {t('chat.addLandHint', 'Add lands to unlock personalized advice')}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Chat Messages Area */}
      <ScrollArea className="flex-1 px-3 py-4" ref={scrollAreaRef}>
        <div className="space-y-4 max-w-2xl mx-auto pb-safe">
          {currentSession?.messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex gap-3 animate-fade-in",
                message.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              {/* AI Avatar */}
              {message.role === 'assistant' && (
                <div className="w-10 h-10 rounded-full glass-morphism flex items-center justify-center shrink-0">
                  <Bot className="w-5 h-5 text-primary" />
                </div>
              )}

              {/* Message Bubble */}
              <div className={cn(
                "group relative max-w-[85%]",
                message.role === 'user' ? 'order-1' : 'order-2'
              )}>
                {/* Land Context Badge */}
                {message.role === 'assistant' && message.landName && (
                  <Badge variant="outline" className="mb-2 text-[10px] py-0.5">
                    <MapPin className="w-3 h-3 mr-1" />
                    {t('chat.adviceFor', 'Advice for')}: {message.landName}
                  </Badge>
                )}

                {/* Message Content */}
                <div
                  className={cn(
                    "rounded-2xl px-4 py-3",
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'glass-morphism'
                  )}
                >
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {message.content}
                  </p>
                  
                  {/* Image Attachments */}
                  {message.attachments?.map((attachment, idx) => (
                    <div key={idx} className="mt-3">
                      {attachment.type === 'image' && (
                        <img 
                          src={attachment.url} 
                          alt={attachment.name}
                          className="rounded-lg max-w-full shadow-md"
                        />
                      )}
                    </div>
                  ))}

                  {/* Timestamp & Sync Status */}
                  <div className="flex items-center gap-2 mt-2">
                    <span className={cn(
                      "text-[10px]",
                      message.role === 'user' ? 'text-primary-foreground/70' : 'text-muted-foreground'
                    )}>
                      {format(message.timestamp, 'h:mm a')}
                    </span>
                    {!isOnline && (
                      <Badge variant="outline" className="h-4 text-[9px] px-1">
                        <Zap className="w-2.5 h-2.5 mr-0.5" />
                        {t('chat.cached', 'Cached')}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Feedback & TTS for AI Messages */}
                {message.role === 'assistant' && (
                  <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      size="icon"
                      variant="ghost"
                      className={cn(
                        "h-7 w-7",
                        message.feedback === 'positive' && "text-success"
                      )}
                      onClick={() => provideFeedback(message.id, 'positive')}
                    >
                      <ThumbsUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className={cn(
                        "h-7 w-7",
                        message.feedback === 'negative' && "text-destructive"
                      )}
                      onClick={() => provideFeedback(message.id, 'negative')}
                    >
                      <ThumbsDown className="h-3.5 w-3.5" />
                    </Button>
                    {isTTSSupported && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => speak(message.content)}
                      >
                        <Volume2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* User Avatar */}
              {message.role === 'user' && (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shrink-0 order-2">
                  <span className="text-primary-foreground text-sm font-semibold">
                    👩‍🌾
                  </span>
                </div>
              )}
            </div>
          ))}

          {/* Typing Indicator */}
          {isTyping && (
            <div className="flex items-center gap-3 animate-fade-in">
              <div className="w-10 h-10 rounded-full glass-morphism flex items-center justify-center">
                <Bot className="w-5 h-5 text-primary animate-pulse" />
              </div>
              <div className="glass-morphism rounded-2xl px-4 py-3">
                <div className="flex gap-1.5">
                  <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          {/* Empty State */}
          {(!currentSession || currentSession.messages.length === 0) && !isTyping && (
            <div className="flex flex-col items-center justify-center py-12 text-center animate-fade-in">
              <div className="w-16 h-16 rounded-full glass-morphism flex items-center justify-center mb-4">
                <Bot className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">
                {t('chat.welcome', 'Welcome to KisanShakti AI')}
              </h3>
              <p className="text-sm text-muted-foreground max-w-xs">
                {lands.length === 0 
                  ? t('chat.addLandPrompt', 'Add your lands to get personalized farming advice')
                  : t('chat.startPrompt', 'Ask me anything about farming, weather, or your crops')
                }
              </p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Quick Actions Pills */}
      <div className="bg-card/50 backdrop-blur-sm px-3 py-2 border-t">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {quickActions.map(({ icon: Icon, label, action }) => (
            <button
              key={action}
              onClick={() => handleQuickAction(action)}
              className="shrink-0 px-3 py-1.5 rounded-full bg-card border text-xs font-medium hover:bg-accent transition-colors flex items-center gap-1.5"
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Attachment Preview */}
      {uploadedImage && (
        <div className="bg-card/50 backdrop-blur-sm px-3 py-2 border-t">
          <div className="relative inline-block">
            <img
              src={uploadedImage}
              alt="Upload"
              className="h-20 w-20 object-cover rounded-lg shadow-md"
            />
            <Button
              size="icon"
              variant="destructive"
              className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
              onClick={() => setUploadedImage(null)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Bottom Input Dock */}
      <div className="bg-card/95 backdrop-blur-md border-t p-3 pb-safe">
        <div className="flex items-end gap-2 max-w-2xl mx-auto">
          {/* Expanding Text Input */}
          <div className="flex-1 relative">
            <textarea
              ref={textAreaRef}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder={t('chat.typeMessage', 'Type your message...')}
              disabled={isLoading}
              className="w-full resize-none rounded-2xl glass-morphism px-4 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 min-h-[44px] max-h-[120px] transition-all"
              rows={1}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-1">
            {/* Camera/Gallery */}
            <input
              ref={imageInputRef}
              type="file"
              className="hidden"
              onChange={handleImageUpload}
              accept="image/*"
              capture="environment"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => imageInputRef.current?.click()}
              disabled={isLoading}
              className="h-11 w-11 rounded-full"
            >
              <Camera className="h-5 w-5" />
            </Button>

            {/* InstaScan */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={openInstaScan}
              disabled={isLoading}
              className="h-11 w-11 rounded-full"
            >
              <ScanLine className="h-5 w-5" />
            </Button>

            {/* Voice Input or Send */}
            {inputMessage.trim() || uploadedImage ? (
              <Button
                type="button"
                size="icon"
                onClick={sendMessage}
                disabled={isLoading}
                className="h-11 w-11 rounded-full bg-primary hover:bg-primary/90"
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-primary-foreground" />
                ) : (
                  <Send className="h-5 w-5 text-primary-foreground" />
                )}
              </Button>
            ) : (
              <Button
                type="button"
                variant={isListening ? "destructive" : "default"}
                size="icon"
                onClick={isSpeechSupported ? toggleListening : undefined}
                disabled={isLoading || !isSpeechSupported}
                className="h-11 w-11 rounded-full"
              >
                {isListening ? (
                  <MicOff className="h-5 w-5 animate-pulse" />
                ) : (
                  <Mic className="h-5 w-5" />
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}