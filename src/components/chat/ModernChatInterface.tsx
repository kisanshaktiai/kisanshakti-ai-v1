import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { useTranslation } from 'react-i18next';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { cn } from '@/lib/utils';
import { 
  Send, Mic, MicOff, Camera, Paperclip, Volume2, VolumeX, 
  Bot, User, MapPin, Loader2, X, Globe, 
  RefreshCw, ThumbsUp, ThumbsDown, Zap, Clock,
  Cloud, CloudOff, Languages, Image as ImageIcon,
  Wheat, Trees, Flower2, Sprout, Leaf, TreePine
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
  soil_type?: string;
  area?: number;
  crop_history?: any[];
  weather_data?: any;
  ndvi_data?: any;
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

// Soil type color coding
const getSoilStatusColor = (soilType?: string) => {
  if (!soilType) return 'bg-muted';
  const soil = soilType.toLowerCase();
  if (soil.includes('loamy')) return 'bg-success/20 text-success';
  if (soil.includes('clay')) return 'bg-warning/20 text-warning';
  if (soil.includes('sandy')) return 'bg-info/20 text-info';
  return 'bg-muted';
};

export function ModernChatInterface() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuthStore();
  const isOnline = useOfflineStatus();
  
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [selectedLandId, setSelectedLandId] = useState<string>('general');
  const [lands, setLands] = useState<Land[]>([]);
  const [quickActions] = useState(['Check Weather', 'Soil Report', 'Fertilizer Advice', 'Disease Detection']);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [showLanguageSelector, setShowLanguageSelector] = useState(false);
  
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

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

  // Auto-scroll to bottom
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

  const loadLands = async () => {
    try {
      if (!user?.id) {
        console.log('No user ID available for loading lands');
        return;
      }
      
      const { data, error } = await supabase
        .from('lands')
        .select('*')
        .eq('farmer_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading lands:', error);
        throw error;
      }
      
      setLands(data || []);
      // Cache lands for offline use
      if (data) {
        localStorage.setItem('cached_lands', JSON.stringify(data));
      }
    } catch (error) {
      console.error('Error loading lands:', error);
      // Load from cache if offline or error
      const cachedLands = localStorage.getItem('cached_lands');
      if (cachedLands) {
        setLands(JSON.parse(cachedLands));
      }
    }
  };

  const loadOrCreateSession = async () => {
    try {
      // Try to load existing session
      const { data: sessionData, error: sessionError } = await supabase
        .from('chat_sessions')
        .select('*, chat_messages(*)')
        .eq('user_id', user?.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(); // Use maybeSingle instead of single to avoid error when no data

      if (sessionData && !sessionError) {
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
        // Create new session
        createNewSession('general');
      }
    } catch (error) {
      console.error('Error loading session:', error);
      // Create offline session
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
      
      // Create message from InstaScan
      const contextMessage = `I just scanned a ${context.cropName} crop. 
Condition: ${context.cropCondition}. 
${context.diseases.length > 0 ? `Diseases detected: ${context.diseases.join(', ')}. ` : ''}
Initial suggestions: ${context.suggestions.join('. ')}. 
Please provide detailed guidance.`;
      
      setInputMessage(contextMessage);
      if (context.imageUrl) {
        setUploadedImage(context.imageUrl);
      }
      
      // Auto-send after component mounts
      setTimeout(() => sendMessage(), 500);
    }
  };

  const switchLandContext = (landId: string) => {
    setSelectedLandId(landId);
    createNewSession(landId);
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() && !uploadedImage && !uploadedFile) return;
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

    if (uploadedFile) {
      userMessage.attachments?.push({
        type: 'file',
        url: URL.createObjectURL(uploadedFile),
        name: uploadedFile.name
      });
    }

    // Add message to session
    const updatedMessages = [...currentSession.messages, userMessage];
    setCurrentSession(prev => prev ? { ...prev, messages: updatedMessages } : null);
    setInputMessage('');
    setUploadedImage(null);
    setUploadedFile(null);
    setIsLoading(true);
    setIsTyping(true);

    try {
      // Get land context if specific land is selected
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

      // Call AI with land context
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

      // Add assistant message
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

    // Save feedback to database - update existing message
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
      title: 'Thank you for your feedback!',
      description: 'This helps us improve our AI responses.',
    });
  };

  const handleQuickAction = (action: string) => {
    const prompts: Record<string, string> = {
      'Check Weather': 'What is the weather forecast for my area?',
      'Soil Report': 'Can you analyze my soil condition and provide recommendations?',
      'Fertilizer Advice': 'What fertilizers should I use for optimal crop growth?',
      'Disease Detection': 'Help me identify any diseases in my crops.'
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

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadedFile(file);
    }
  };

  const saveToLocalStorage = (session: ChatSession) => {
    localStorage.setItem(`chat_session_${session.id}`, JSON.stringify(session));
    localStorage.setItem('cached_lands', JSON.stringify(lands));
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-full overflow-hidden">
      {/* Compact Header with Land Selection */}
      <div className="bg-card/95 backdrop-blur-sm border-b px-3 py-2">
        {/* Top Row - Status and Actions */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {isOnline ? (
                <>
                  <Cloud className="w-3 h-3 mr-1" />
                  {t('common.online')}
                </>
              ) : (
                <>
                  <CloudOff className="w-3 h-3 mr-1" />
                  {t('common.offline')}
                </>
              )}
            </Badge>
            {currentSession?.lastSyncedAt && !isOnline && (
              <span className="text-xs text-muted-foreground">
                <Zap className="w-3 h-3 inline mr-1" />
                Last synced: {format(currentSession.lastSyncedAt, 'h:mm a')}
              </span>
            )}
          </div>
          <div className="flex gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => setShowLanguageSelector(!showLanguageSelector)}
            >
              <Languages className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => loadOrCreateSession()}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => setVoiceEnabled(!voiceEnabled)}
            >
              {voiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Land Selection Row */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <Button
            variant={selectedLandId === 'general' ? 'default' : 'outline'}
            size="sm"
            className="shrink-0 h-8"
            onClick={() => switchLandContext('general')}
          >
            <Globe className="w-3 h-3 mr-1" />
            {t('chat.generalChat')}
          </Button>
          
          {lands.length === 0 ? (
            <span className="text-xs text-muted-foreground py-2 px-3">
              {t('chat.addLandHint')}
            </span>
          ) : (
            lands.map(land => {
              const CropIcon = getCropIcon(land.primary_crop);
              return (
                <Button
                  key={land.id}
                  variant={selectedLandId === land.id ? 'default' : 'outline'}
                  size="sm"
                  className="shrink-0 h-8 gap-1"
                  onClick={() => switchLandContext(land.id)}
                >
                  <CropIcon className="w-3 h-3" />
                  <span className="max-w-[100px] truncate">{land.name}</span>
                  <Badge className={cn("ml-1 h-4 px-1 text-[10px]", getSoilStatusColor(land.soil_type))}>
                    {land.soil_type?.slice(0, 3).toUpperCase() || 'N/A'}
                  </Badge>
                </Button>
              );
            })
          )}
        </div>
      </div>

      {/* Messages Area - Maximized */}
      <ScrollArea className="flex-1 px-3 py-4" ref={scrollAreaRef}>
        <div className="space-y-4 max-w-4xl mx-auto">
          {currentSession?.messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex gap-3",
                message.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              {/* Avatar */}
              {message.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
              )}

              {/* Message Bubble */}
              <div
                className={cn(
                  "group relative max-w-[85%] md:max-w-[70%]",
                  message.role === 'user' ? 'order-1' : 'order-2'
                )}
              >
                {/* Land Badge for AI Messages */}
                {message.role === 'assistant' && message.landName && (
                  <Badge variant="secondary" className="mb-1 text-xs">
                    <MapPin className="w-3 h-3 mr-1" />
                    {message.landName}
                  </Badge>
                )}

                <div
                  className={cn(
                    "rounded-2xl px-4 py-3 backdrop-blur-sm",
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card/90 border border-border/50 shadow-sm'
                  )}
                >
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {message.content}
                  </p>
                  
                  {/* Attachments */}
                  {message.attachments?.map((attachment, idx) => (
                    <div key={idx} className="mt-2">
                      {attachment.type === 'image' ? (
                        <img 
                          src={attachment.url} 
                          alt={attachment.name}
                          className="rounded-lg max-w-full"
                        />
                      ) : (
                        <div className="flex items-center gap-2 p-2 bg-background/50 rounded">
                          <Paperclip className="w-4 h-4" />
                          <span className="text-xs">{attachment.name}</span>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Timestamp */}
                  <p className={cn(
                    "text-[10px] mt-1",
                    message.role === 'user' ? 'text-primary-foreground/70' : 'text-muted-foreground'
                  )}>
                    {format(message.timestamp, 'h:mm a')}
                  </p>
                </div>

                {/* Feedback Buttons for AI Messages */}
                {message.role === 'assistant' && (
                  <div className="flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      size="icon"
                      variant="ghost"
                      className={cn(
                        "h-6 w-6",
                        message.feedback === 'positive' && "text-success"
                      )}
                      onClick={() => provideFeedback(message.id, 'positive')}
                    >
                      <ThumbsUp className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className={cn(
                        "h-6 w-6",
                        message.feedback === 'negative' && "text-destructive"
                      )}
                      onClick={() => provideFeedback(message.id, 'negative')}
                    >
                      <ThumbsDown className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>

              {/* User Avatar */}
              {message.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shrink-0 order-2">
                  <User className="w-4 h-4 text-primary-foreground" />
                </div>
              )}
            </div>
          ))}

          {/* Typing Indicator */}
          {isTyping && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/20 flex items-center justify-center">
                <Bot className="w-4 h-4 text-primary" />
              </div>
              <div className="bg-card/90 border border-border/50 rounded-2xl px-4 py-3">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          {/* Empty State */}
          {(!currentSession || currentSession.messages.length === 0) && !isTyping && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/20 flex items-center justify-center mb-4">
                <Bot className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{t('chat.welcome')}</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                {lands.length === 0 ? t('chat.addLandHint') : t('chat.askAnything')}
              </p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Quick Actions */}
      <div className="px-3 py-2 border-t bg-card/50 backdrop-blur-sm">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {quickActions.map((action) => (
            <Button
              key={action}
              variant="outline"
              size="sm"
              className="shrink-0 h-7 text-xs"
              onClick={() => handleQuickAction(action)}
            >
              {action}
            </Button>
          ))}
        </div>
      </div>

      {/* Attachment Preview */}
      {(uploadedImage || uploadedFile) && (
        <div className="px-3 py-2 border-t bg-card/50 backdrop-blur-sm">
          <div className="flex gap-2">
            {uploadedImage && (
              <div className="relative">
                <img
                  src={uploadedImage}
                  alt="Upload"
                  className="h-16 w-16 object-cover rounded-lg"
                />
                <Button
                  size="icon"
                  variant="destructive"
                  className="absolute -top-1 -right-1 h-5 w-5"
                  onClick={() => setUploadedImage(null)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
            {uploadedFile && (
              <div className="relative flex items-center gap-2 p-2 bg-accent rounded-lg">
                <Paperclip className="w-4 h-4" />
                <span className="text-xs max-w-[100px] truncate">{uploadedFile.name}</span>
                <Button
                  size="icon"
                  variant="destructive"
                  className="h-5 w-5"
                  onClick={() => setUploadedFile(null)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom Input Dock */}
      <div className="border-t bg-card/95 backdrop-blur-sm p-3">
        <div className="flex items-end gap-2 max-w-4xl mx-auto">
          {/* Multi-line Input */}
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
              placeholder={t('chat.typeMessage')}
              disabled={isLoading}
              className="w-full resize-none rounded-2xl bg-muted/50 border-0 px-4 py-2.5 text-sm placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[40px] max-h-[120px] transition-all"
              rows={1}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-1">
            {/* File Upload */}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileUpload}
              accept="*/*"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="h-10 w-10 rounded-full"
            >
              <Paperclip className="h-5 w-5" />
            </Button>

            {/* Camera */}
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
              className="h-10 w-10 rounded-full"
            >
              <Camera className="h-5 w-5" />
            </Button>

            {/* Voice/Send Button */}
            {inputMessage.trim() || uploadedImage || uploadedFile ? (
              <Button
                type="button"
                size="icon"
                onClick={sendMessage}
                disabled={isLoading}
                className="h-10 w-10 rounded-full bg-primary hover:bg-primary/90"
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
                className="h-10 w-10 rounded-full"
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