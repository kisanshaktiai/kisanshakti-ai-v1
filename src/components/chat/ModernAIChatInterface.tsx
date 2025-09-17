import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { useTranslation } from 'react-i18next';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { landsApi } from '@/services/landsApi';
import { 
  Send, Mic, MicOff, ImageIcon, Volume2, VolumeX, Camera, FileUp,
  Bot, User, Loader2, X, Sprout, Layers, MapPin, Check, ScanLine, Plus,
  Wheat, CloudRain, TreePine, Home
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
  suggestions?: string[];
  metadata?: any;
}

interface Land {
  id: string;
  name: string;
  area_acres?: number;
  primary_crop?: string;
  soil_type?: string;
  location?: string;
  [key: string]: any;
}

export function ModernAIChatInterface() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuthStore();
  const isOnline = useOfflineStatus();
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [selectedLand, setSelectedLand] = useState<Land | null>(null);
  const [lands, setLands] = useState<Land[]>([]);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [sessionId, setSessionId] = useState<string>(crypto.randomUUID());
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);

  // Speech recognition
  const { isListening, toggleListening, isSupported: isSpeechSupported } = useSpeechRecognition({
    onTranscript: (transcript) => {
      setInputMessage(prev => prev + ' ' + transcript);
    },
    language: i18n.language === 'hi' ? 'hi-IN' : 'en-US'
  });

  // Text to speech
  const { speak, stop, isSpeaking, isSupported: isTTSSupported } = useTextToSpeech({
    language: i18n.language === 'hi' ? 'hi-IN' : 'en-US',
    rate: 1.0,
    pitch: 1.0
  });

  // Load lands on mount
  useEffect(() => {
    if (user?.id) {
      loadLands();
    }
  }, [user]);

  // Load chat session when land changes
  useEffect(() => {
    if (selectedLand) {
      loadChatSession(selectedLand.id);
    } else {
      // Load general chat session
      loadChatSession(null);
    }
  }, [selectedLand]);

  // Load chat session for specific land
  const loadChatSession = async (landId: string | null) => {
    try {
      const { session } = useAuthStore.getState();
      if (!session?.farmerId || !session?.tenantId) return;

      // Try to find existing session
      const { data: existingSession } = await supabase
        .from('ai_chat_sessions')
        .select('*')
        .eq('tenant_id', session.tenantId)
        .eq('farmer_id', session.farmerId)
        .eq('land_id', landId || '00000000-0000-0000-0000-000000000000')
        .eq('is_active', true)
        .single();

      if (existingSession) {
        setSessionId(existingSession.id);
        // Load messages for this session
        const { data: sessionMessages } = await supabase
          .from('ai_chat_messages')
          .select('*')
          .eq('session_id', existingSession.id)
          .order('created_at', { ascending: true });

        if (sessionMessages) {
          setMessages(sessionMessages.map(msg => {
            const landContext = msg.land_context as any;
            return {
              id: msg.id,
              role: msg.role as 'user' | 'assistant' | 'system',
              content: msg.content,
              timestamp: new Date(msg.created_at),
              landId: landContext?.land_id,
              landName: landContext?.land_name,
              suggestions: landContext?.quick_replies
            };
          }));
        }
      } else {
        // Create new session
        const newSessionId = crypto.randomUUID();
        setSessionId(newSessionId);
        
        // Show welcome card for this land
        showWelcomeCard(landId);
      }
    } catch (error) {
      console.error('Error loading chat session:', error);
      showWelcomeCard(landId);
    }
  };

  // Show welcome card when switching lands
  const showWelcomeCard = (landId: string | null) => {
    const land = lands.find(l => l.id === landId);
    
    const welcomeMessage: Message = {
      id: 'welcome-' + (landId || 'general'),
      role: 'assistant',
      content: land 
        ? `🌾 Welcome to ${land.name}!\n\nArea: ${land.area_acres || 'N/A'} acres\nCrop: ${land.primary_crop || 'Not specified'}\nSoil: ${land.soil_type || 'Unknown'}\n\nHow can I help you with this land today?`
        : `👋 Hello! I'm your AI farming assistant.\n\n${lands.length > 0 ? 'Select a land above for specific advice, or ask me any general farming questions!' : 'I notice you haven\'t added any lands yet. Click "Add Land" to register your farm, or ask me any general farming questions!'}`,
      timestamp: new Date(),
      suggestions: land 
        ? ['Check weather', 'Irrigation schedule', 'Pest control', 'Fertilizer advice']
        : ['Weather forecast', 'Pest control', 'Fertilizer guide', 'Crop calendar']
    };
    
    setMessages([welcomeMessage]);
  };

  // Auto-scroll to bottom
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load user's lands using lands-api for proper tenant isolation
  const loadLands = async () => {
    try {
      console.log('Loading lands using lands-api...');
      const landsData = await landsApi.fetchLands();
      console.log('Lands data received:', landsData);
      
      // Filter and map lands data
      const validLands = (landsData || []).filter(land => land.id).map(land => ({
        id: land.id!,
        name: land.name || 'Unnamed Land',
        area_acres: land.area_acres,
        primary_crop: (land as any).crop_type || (land as any).primary_crop,
        soil_type: land.soil_type,
        location: (land as any).village || (land as any).location
      }));
      
      console.log('Valid lands processed:', validLands);
      setLands(validLands);
      
      // Cache for offline
      if (validLands.length > 0) {
        localStorage.setItem('cached_lands_ai', JSON.stringify(validLands));
      } else {
        // If no lands, check if we have cached lands
        const cachedLands = localStorage.getItem('cached_lands_ai');
        if (cachedLands) {
          const parsed = JSON.parse(cachedLands);
          console.log('Using cached lands:', parsed);
          setLands(parsed);
        }
      }
    } catch (error) {
      console.error('Error loading lands:', error);
      // Load from cache if offline or error
      const cachedLands = localStorage.getItem('cached_lands_ai');
      if (cachedLands) {
        setLands(JSON.parse(cachedLands));
      }
    }
  };

  // Handle land selection
  const selectLand = (land: Land | null) => {
    setSelectedLand(land);
    // Session loading will trigger from useEffect
  };

  // Handle TTS for individual messages
  const handleSpeakMessage = (message: Message) => {
    if (speakingMessageId === message.id) {
      stop();
      setSpeakingMessageId(null);
    } else {
      stop();
      speak(message.content);
      setSpeakingMessageId(message.id);
    }
  };

  // Send message
  const sendMessage = async () => {
    if (!inputMessage.trim() && !uploadedImage && !uploadedFile) return;

    // Prepare attachments
    const attachments: Message['attachments'] = [];
    if (uploadedImage) {
      attachments.push({
        type: 'image',
        url: uploadedImage,
        name: 'uploaded-image.jpg'
      });
    }
    if (uploadedFile) {
      attachments.push({
        type: 'file',
        url: URL.createObjectURL(uploadedFile),
        name: uploadedFile.name
      });
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: inputMessage,
      timestamp: new Date(),
      landId: selectedLand?.id,
      landName: selectedLand?.name,
      attachments: attachments.length > 0 ? attachments : undefined
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setUploadedImage(null);
    setUploadedFile(null);
    setIsLoading(true);
    setIsTyping(true);

    try {
      const { session } = useAuthStore.getState();
      
      // Create session if needed
      if (!sessionId || sessionId === crypto.randomUUID()) {
        const newSessionId = crypto.randomUUID();
        setSessionId(newSessionId);
        
        // Create session in database
        await supabase.from('ai_chat_sessions').insert({
          id: newSessionId,
          tenant_id: session?.tenantId,
          farmer_id: session?.farmerId,
          land_id: selectedLand?.id,
          session_type: selectedLand ? 'land_specific' : 'general',
          session_title: selectedLand ? `Chat about ${selectedLand.name}` : 'General farming chat'
        });
      }

      const { data, error } = await supabase.functions.invoke('ai-agriculture-chat', {
        body: {
          messages: messages.slice(-10).map(msg => ({
            role: msg.role,
            content: msg.content
          })).concat({
            role: 'user',
            content: inputMessage
          }),
          landId: selectedLand?.id,
          imageUrl: uploadedImage,
          fileContent: uploadedFile ? await uploadedFile.text() : undefined,
          sessionId: sessionId,
          tenantId: session?.tenantId,
          farmerId: session?.farmerId
        }
      });

      if (error) throw error;

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.message || 'I apologize, but I could not process your request. Please try again.',
        timestamp: new Date(),
        landId: selectedLand?.id,
        landName: selectedLand?.name,
        suggestions: data.quickReplies
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Auto-speak response if enabled
      if (voiceEnabled && isTTSSupported) {
        speak(assistantMessage.content);
        setSpeakingMessageId(assistantMessage.id);
      }

    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: isOnline 
          ? 'I apologize, but I encountered an error. Please try again.'
          : 'You are offline. Some features may be limited.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
      
      toast({
        title: t('common.error'),
        description: 'Failed to get AI response',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
      setIsTyping(false);
    }
  };

  // Handle image upload
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

  // Handle file upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      toast({
        title: 'File attached',
        description: `${file.name} (${(file.size / 1024).toFixed(1)}KB)`,
      });
    }
  };

  // Handle camera capture
  const handleCameraCapture = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          setUploadedImage(e.target?.result as string);
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Header with AI Title and Land Cards */}
      <div className="bg-background/95 backdrop-blur-lg border-b shadow-sm">
        <div className="px-3 py-2">
          {/* AI Assistant Title */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold">AI Farming Assistant</h2>
            </div>
            <Badge variant={isOnline ? 'default' : 'secondary'} className="text-xs">
              {isOnline ? 'Online' : 'Offline'}
            </Badge>
          </div>
          
          {/* Land Selection - Tiny Cards */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
            {/* General/All Lands Option */}
            <button
              onClick={() => selectLand(null)}
              className={cn(
                "shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                !selectedLand 
                  ? "bg-primary text-primary-foreground shadow-sm" 
                  : "bg-card hover:bg-muted border"
              )}
            >
              <div className="flex items-center gap-1.5">
                <Layers className="w-3 h-3" />
                <span>General</span>
              </div>
            </button>

            {/* Individual Land Cards - Tiny */}
            {lands && lands.length > 0 ? (
              lands.map((land) => (
                <button
                  key={land.id}
                  onClick={() => selectLand(land)}
                  className={cn(
                    "shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                    selectedLand?.id === land.id
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-card hover:bg-muted border"
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <Sprout className="w-3 h-3" />
                    <span className="max-w-[80px] truncate">{land.name}</span>
                    {land.area_acres && (
                      <span className="text-[10px] opacity-70">
                        {land.area_acres}ac
                      </span>
                    )}
                  </div>
                </button>
              ))
            ) : (
              <button
                onClick={() => window.location.href = '/lands/add'}
                className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all bg-card hover:bg-muted border border-dashed"
              >
                <div className="flex items-center gap-1.5">
                  <Plus className="w-3 h-3" />
                  <span>Add Land</span>
                </div>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Full Screen Chat Messages Area */}
      <ScrollArea className="flex-1 px-4" ref={scrollAreaRef}>
        <div className="py-4 space-y-4 max-w-4xl mx-auto">
          <AnimatePresence mode="popLayout">
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className={cn(
                  "flex gap-3",
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                {message.role === 'assistant' && (
                  <Avatar className="w-8 h-8 shrink-0">
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      <Bot className="w-4 h-4" />
                    </AvatarFallback>
                  </Avatar>
                )}
                
                <div className={cn(
                  "max-w-[85%] space-y-2",
                  message.role === 'user' ? 'items-end' : 'items-start'
                )}>
                {message.role === 'system' ? (
                    <div className="text-xs text-center text-muted-foreground py-1">
                      {message.content}
                    </div>
                  ) : message.id.startsWith('welcome') ? (
                    // Welcome Card with enhanced styling
                    <Card className="p-4 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                          {selectedLand ? <Wheat className="w-4 h-4 text-primary" /> : <Home className="w-4 h-4 text-primary" />}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium mb-2 whitespace-pre-wrap">{message.content}</p>
                          {message.suggestions && (
                            <div className="flex flex-wrap gap-2 mt-3">
                              {message.suggestions.map((suggestion, idx) => (
                                <Button
                                  key={idx}
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setInputMessage(suggestion)}
                                  className="text-xs"
                                >
                                  {suggestion}
                                </Button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  ) : (
                    <Card className={cn(
                      "p-3 shadow-sm",
                      message.role === 'user' 
                        ? 'bg-primary text-primary-foreground ml-auto' 
                        : 'bg-card'
                    )}>
                      {message.landName && (
                        <div className="flex items-center gap-1 mb-2 text-xs opacity-70">
                          <MapPin className="w-3 h-3" />
                          {message.landName}
                        </div>
                      )}
                      
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      
                      {message.attachments && message.attachments.length > 0 && (
                        <div className="mt-2 space-y-2">
                          {message.attachments.map((attachment, idx) => (
                            attachment.type === 'image' ? (
                              <img 
                                key={idx}
                                src={attachment.url} 
                                alt={attachment.name}
                                className="rounded-lg max-h-48 object-cover"
                              />
                            ) : (
                              <div key={idx} className="flex items-center gap-2 p-2 rounded bg-muted/50">
                                <FileUp className="w-4 h-4" />
                                <span className="text-xs">{attachment.name}</span>
                              </div>
                            )
                          ))}
                        </div>
                      )}
                      
                      {message.suggestions && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {message.suggestions.map((suggestion, idx) => (
                            <Button
                              key={idx}
                              size="sm"
                              variant="outline"
                              onClick={() => setInputMessage(suggestion)}
                              className="text-xs"
                            >
                              {suggestion}
                            </Button>
                          ))}
                        </div>
                      )}
                      
                      {/* TTS Button for Assistant Messages */}
                      {message.role === 'assistant' && isTTSSupported && (
                        <div className="flex justify-end mt-2">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleSpeakMessage(message)}
                            className="h-6 w-6"
                          >
                            {speakingMessageId === message.id ? (
                              <VolumeX className="w-3 h-3" />
                            ) : (
                              <Volume2 className="w-3 h-3" />
                            )}
                          </Button>
                        </div>
                      )}
                    </Card>
                  )}
                  
                  {message.role !== 'system' && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
                      <span>{format(message.timestamp, 'HH:mm')}</span>
                      {message.role === 'assistant' && (
                        <Check className="w-3 h-3 text-success" />
                      )}
                    </div>
                  )}
                </div>
                
                {message.role === 'user' && (
                  <Avatar className="w-8 h-8 shrink-0">
                    <AvatarFallback>
                      <User className="w-4 h-4" />
                    </AvatarFallback>
                  </Avatar>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          
          {isTyping && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2 text-muted-foreground"
            >
              <Bot className="w-4 h-4" />
              <span className="text-sm">AI is thinking</span>
              <Loader2 className="w-3 h-3 animate-spin" />
            </motion.div>
          )}
          
          <div ref={messageEndRef} />
        </div>
      </ScrollArea>

      {/* WhatsApp Style Input Area */}
      <div className="border-t bg-muted/5">
        {/* Upload Previews */}
        {(uploadedImage || uploadedFile) && (
          <div className="px-4 pt-2 flex items-center gap-2">
            {uploadedImage && (
              <div className="relative inline-block">
                <img 
                  src={uploadedImage} 
                  alt="Upload preview" 
                  className="h-16 rounded-lg object-cover"
                />
                <Button
                  size="icon"
                  variant="destructive"
                  onClick={() => setUploadedImage(null)}
                  className="absolute -top-2 -right-2 h-5 w-5"
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            )}
            {uploadedFile && (
              <div className="relative inline-flex items-center gap-2 px-3 py-2 bg-muted rounded-lg">
                <FileUp className="w-4 h-4" />
                <span className="text-xs">{uploadedFile.name}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setUploadedFile(null)}
                  className="h-5 w-5"
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            )}
          </div>
        )}
        
        <div className="p-3">
          <div className="flex items-center gap-2 max-w-4xl mx-auto">
            {/* WhatsApp-style input container */}
            <div className="flex-1 flex items-center bg-background border border-border rounded-full shadow-sm">
              {/* Emoji Button */}
              <Button
                size="icon"
                variant="ghost"
                className="h-10 w-10 rounded-full hover:bg-transparent"
                title="Emoji"
              >
                <span className="text-xl">😊</span>
              </Button>
              
              {/* Text Input */}
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Type a message"
                className="flex-1 bg-transparent px-2 py-2.5 focus:outline-none placeholder:text-muted-foreground text-sm"
              />
              
              {/* Attachment Button */}
              <Button
                size="icon"
                variant="ghost"
                onClick={() => imageInputRef.current?.click()}
                className="h-10 w-10 rounded-full hover:bg-transparent"
                title="Attach file"
              >
                <svg className="w-5 h-5 text-muted-foreground" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M11.5 22C10.1193 22 8.81451 21.4504 7.87513 20.5096C6.93576 19.5688 6.38571 18.3459 6.38571 16.9583V7.04167C6.38571 6.13748 6.73959 5.26815 7.3751 4.63179C8.01061 3.99544 8.87971 3.64583 9.78571 3.64583C10.6917 3.64583 11.5608 3.99544 12.1963 4.63179C12.8318 5.26815 13.1857 6.13748 13.1857 7.04167V15.7917C13.1857 16.2612 13.0086 16.7116 12.6906 17.0304C12.3727 17.3492 11.9382 17.5208 11.5 17.5208C11.0618 17.5208 10.6273 17.3492 10.3094 17.0304C9.99143 16.7116 9.81429 16.2612 9.81429 15.7917V7.91667H11.5V15.7917H13.1857V7.04167C13.1857 6.13748 12.8318 5.26815 12.1963 4.63179C11.5608 3.99544 10.6917 3.64583 9.78571 3.64583" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </Button>
              
              {/* Camera Button */}
              <Button
                size="icon"
                variant="ghost"
                onClick={handleCameraCapture}
                className="h-10 w-10 rounded-full hover:bg-transparent"
                title="Camera"
              >
                <Camera className="w-5 h-5 text-muted-foreground" />
              </Button>
              
              {/* Hidden inputs */}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.txt"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
            
            {/* Send/Voice Button - WhatsApp style */}
            {inputMessage.trim() || uploadedImage || uploadedFile ? (
              <Button
                onClick={sendMessage}
                disabled={isLoading}
                size="icon"
                className="h-10 w-10 rounded-full bg-green-500 hover:bg-green-600 shadow-sm transition-colors"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 text-white animate-spin" />
                ) : (
                  <Send className="w-5 h-5 text-white" />
                )}
              </Button>
            ) : (
              <Button
                size="icon"
                variant="ghost"
                onClick={toggleListening}
                className={cn(
                  "h-10 w-10 rounded-full transition-colors",
                  isListening 
                    ? "bg-red-500 hover:bg-red-600 animate-pulse" 
                    : "bg-green-500 hover:bg-green-600"
                )}
                title={isListening ? "Stop Recording" : "Hold to record"}
              >
                <Mic className="w-5 h-5 text-white" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}