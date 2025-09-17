import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
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
      if (!session?.farmerId || !session?.tenantId) {
        console.error('Missing session context:', session);
        return;
      }

      console.log('Loading chat session for land:', landId, 'Session:', session);
      
      // Use null for general chat, actual land_id for land-specific
      const searchLandId = landId || null;
      
      // Try to find existing session
      let existingSession = null;
      if (searchLandId) {
        const { data, error } = await supabase
          .from('ai_chat_sessions')
          .select('*')
          .eq('tenant_id', session.tenantId)
          .eq('farmer_id', session.farmerId)
          .eq('land_id', searchLandId)
          .eq('is_active', true)
          .maybeSingle();
          
        if (error) {
          console.error('Error loading session:', error);
        }
        existingSession = data;
      } else {
        // For general chat, check for null land_id
        const { data, error } = await supabase
          .from('ai_chat_sessions')
          .select('*')
          .eq('tenant_id', session.tenantId)
          .eq('farmer_id', session.farmerId)
          .is('land_id', null)
          .eq('is_active', true)
          .maybeSingle();
          
        if (error) {
          console.error('Error loading general session:', error);
        }
        existingSession = data;
      }

      if (existingSession) {
        console.log('Found existing session:', existingSession.id);
        setSessionId(existingSession.id);
        
        // Load messages for this session
        const { data: sessionMessages, error: messagesError } = await supabase
          .from('ai_chat_messages')
          .select('*')
          .eq('session_id', existingSession.id)
          .eq('tenant_id', session.tenantId)
          .eq('farmer_id', session.farmerId)
          .order('created_at', { ascending: true });

        if (messagesError) {
          console.error('Error loading messages:', messagesError);
        }

        if (sessionMessages && sessionMessages.length > 0) {
          console.log('Loaded messages:', sessionMessages.length);
          setMessages(sessionMessages.map(msg => {
            const landContext = msg.land_context as any;
            const attachmentsData = msg.attachments as any;
            return {
              id: msg.id,
              role: msg.role as 'user' | 'assistant' | 'system',
              content: msg.content,
              timestamp: new Date(msg.created_at),
              landId: landContext?.land_id,
              landName: landContext?.land_name,
              suggestions: Array.isArray(landContext?.quick_replies) ? landContext.quick_replies : undefined,
              attachments: attachmentsData
            };
          }));
        } else {
          // No messages in database, check local cache
          const cachedMessages = JSON.parse(localStorage.getItem(`chat_messages_${landId || 'general'}`) || '[]');
          if (cachedMessages.length > 0) {
            setMessages(cachedMessages);
          } else {
            showWelcomeCard(landId);
          }
        }
      } else {
        // Create new session
        const newSessionId = crypto.randomUUID();
        console.log('Creating new session:', newSessionId);
        
        const { error: insertError } = await supabase
          .from('ai_chat_sessions')
          .insert({
            id: newSessionId,
            tenant_id: session.tenantId,
            farmer_id: session.farmerId,
            land_id: searchLandId,
            session_type: searchLandId ? 'land_specific' : 'general',
            session_title: searchLandId ? `Chat about ${lands.find(l => l.id === searchLandId)?.name || 'Land'}` : 'General farming chat',
            metadata: {
              language: i18n.language,
              created_from: 'web_app'
            }
          });
          
        if (insertError) {
          console.error('Error creating session:', insertError);
        } else {
          setSessionId(newSessionId);
        }
        
        // Show welcome card for this land
        showWelcomeCard(landId);
      }
    } catch (error) {
      console.error('Error in loadChatSession:', error);
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
    
    // Cache message locally for offline support
    const cachedMessages = JSON.parse(localStorage.getItem(`chat_messages_${selectedLand?.id || 'general'}`) || '[]');
    cachedMessages.push(userMessage);
    localStorage.setItem(`chat_messages_${selectedLand?.id || 'general'}`, JSON.stringify(cachedMessages));

    try {
      const { session } = useAuthStore.getState();
      
      // Ensure we have a valid session ID
      let currentSessionId = sessionId;
      if (!currentSessionId || currentSessionId === crypto.randomUUID()) {
        const newSessionId = crypto.randomUUID();
        console.log('Creating new session for message:', newSessionId);
        
        // Create session in database
        const { error: sessionError } = await supabase.from('ai_chat_sessions').insert({
          id: newSessionId,
          tenant_id: session?.tenantId,
          farmer_id: session?.farmerId,
          land_id: selectedLand?.id || null,
          session_type: selectedLand ? 'land_specific' : 'general',
          session_title: selectedLand ? `Chat about ${selectedLand.name}` : 'General farming chat',
          metadata: {
            language: i18n.language,
            initial_message: inputMessage
          }
        });
        
        if (sessionError) {
          console.error('Error creating session:', sessionError);
          throw sessionError;
        }
        
        currentSessionId = newSessionId;
        setSessionId(newSessionId);
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
          sessionId: currentSessionId,  // Use currentSessionId here
          tenantId: session?.tenantId,
          farmerId: session?.farmerId,
          language: i18n.language
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
      
      // Cache AI response locally
      const cachedMessages = JSON.parse(localStorage.getItem(`chat_messages_${selectedLand?.id || 'general'}`) || '[]');
      cachedMessages.push(assistantMessage);
      localStorage.setItem(`chat_messages_${selectedLand?.id || 'general'}`, JSON.stringify(cachedMessages));
      
      // Update session's last activity
      await supabase
        .from('ai_chat_sessions')
        .update({ 
          updated_at: new Date().toISOString(),
          metadata: {
            last_message_at: new Date().toISOString(),
            message_count: messages.length + 2,
            language: i18n.language
          }
        })
        .eq('id', currentSessionId);
      
      // Save analytics data
      const today = new Date().toISOString().split('T')[0];
      await supabase
        .from('ai_chat_analytics')
        .upsert({
          tenant_id: session?.tenantId,
          farmer_id: session?.farmerId,
          date: today,
          total_messages: messages.length + 2,
          total_sessions: 1,
          avg_response_time_ms: data.responseTime || 0,
          topics: {
            land_specific: selectedLand ? 1 : 0,
            general: selectedLand ? 0 : 1
          }
        }, {
          onConflict: 'tenant_id,farmer_id,date',
          ignoreDuplicates: false
        });

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
    <div className="flex flex-col h-screen bg-[#e8ddd4]">
      {/* WhatsApp-style Header */}
      <div className="bg-[#075e54] text-white shadow-md">
        <div className="flex items-center gap-3 px-3 py-2">
          {/* Back Button */}
          <button 
            onClick={() => window.history.back()} 
            className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          
          {/* AI Avatar */}
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
            <Bot className="w-6 h-6" />
          </div>
          
          {/* Title */}
          <div className="flex-1">
            <h2 className="font-semibold text-base">AI Farming Assistant</h2>
            <p className="text-xs opacity-90">{isOnline ? 'Online' : 'Offline'}</p>
          </div>
          
          {/* Menu */}
          <button className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
            </svg>
          </button>
        </div>
        
        {/* Land Selection with horizontal scroll */}
        {lands.length > 0 && (
          <div className="px-3 pb-2">
            <ScrollArea className="w-full">
              <div className="flex gap-2 pb-1">
                <button
                  onClick={() => selectLand(null)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1 rounded-full transition-all whitespace-nowrap text-xs font-medium",
                    !selectedLand 
                      ? "bg-white text-[#075e54]" 
                      : "bg-white/20 text-white hover:bg-white/30"
                  )}
                >
                  <Home className="w-3 h-3" />
                  <span>General</span>
                </button>
                
                {lands.map((land) => (
                  <button
                    key={land.id}
                    onClick={() => selectLand(land)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1 rounded-full transition-all whitespace-nowrap text-xs font-medium",
                      selectedLand?.id === land.id
                        ? "bg-white text-[#075e54]"
                        : "bg-white/20 text-white hover:bg-white/30"
                    )}
                  >
                    <MapPin className="w-3 h-3" />
                    <span>{land.name || `${land.area_acres || 0} acres`}</span>
                  </button>
                ))}
              </div>
              <ScrollBar orientation="horizontal" className="hidden" />
            </ScrollArea>
          </div>
        )}
      </div>

      {/* Messages area */}
      <ScrollArea className="flex-1 px-2" ref={scrollAreaRef}>
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
        
        {/* WhatsApp-style Input Area */}
        <div className="bg-[#f0f2f5] px-3 py-2">
          <div className="flex items-center gap-2">
            {/* Emoji Button */}
            <button className="p-2 hover:bg-gray-200 rounded-full transition-colors">
              <svg className="w-5 h-5 text-[#54656f]" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M8 14s1.5 2 4 2 4-2 4-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="9" cy="9" r="1" fill="currentColor"/>
                <circle cx="15" cy="9" r="1" fill="currentColor"/>
              </svg>
            </button>
            
            {/* Input Container */}
            <div className="flex-1 flex items-center bg-white rounded-3xl shadow-sm">
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
                className="flex-1 px-4 py-2 bg-transparent focus:outline-none text-sm"
              />
              
              {/* Attachment Button */}
              <button 
                onClick={() => imageInputRef.current?.click()}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors mr-1"
              >
                <svg className="w-4 h-4 text-[#54656f] transform rotate-45" viewBox="0 0 24 24" fill="none">
                  <path d="M11.5 22C10.12 22 8.82 21.45 7.88 20.51C6.94 19.57 6.39 18.35 6.39 16.96V7.04C6.39 6.14 6.74 5.27 7.38 4.63C8.01 4 8.88 3.65 9.79 3.65C10.69 3.65 11.56 4 12.2 4.63C12.83 5.27 13.19 6.14 13.19 7.04V15.79C13.19 16.26 13.01 16.71 12.69 17.03C12.37 17.35 11.94 17.52 11.5 17.52C11.06 17.52 10.63 17.35 10.31 17.03C9.99 16.71 9.81 16.26 9.81 15.79V7.92H11.5V15.79H13.19V7.04C13.19 6.14 12.83 5.27 12.2 4.63C11.56 4 10.69 3.65 9.79 3.65" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              
              {/* Camera Button */}
              <button 
                onClick={handleCameraCapture}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors mr-2"
              >
                <Camera className="w-4 h-4 text-[#54656f]" />
              </button>
            </div>
            
            {/* Send/Voice Button */}
            <button
              onClick={inputMessage.trim() ? sendMessage : toggleListening}
              disabled={isLoading}
              className={cn(
                "p-2.5 rounded-full transition-all shadow-sm",
                inputMessage.trim() 
                  ? "bg-[#25d366] hover:bg-[#128c7e]" 
                  : isListening 
                    ? "bg-red-500 hover:bg-red-600 animate-pulse"
                    : "bg-[#008069] hover:bg-[#017561]"
              )}
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 text-white animate-spin" />
              ) : inputMessage.trim() ? (
                <Send className="w-5 h-5 text-white" />
              ) : (
                <Mic className="w-5 h-5 text-white" />
              )}
            </button>
            
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
        </div>
      </div>
    </div>
  );
}