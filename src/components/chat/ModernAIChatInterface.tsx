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
  Wheat, CloudRain, TreePine, Home, MessageSquare, Sparkles, ChevronLeft,
  Paperclip, Smile, MoreVertical, Phone, Video, Search, Settings, Copy,
  ThumbsUp, ThumbsDown, RefreshCw, Download, Share2, Maximize2
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
  isTyping?: boolean;
  status?: 'sending' | 'sent' | 'error';
  feedback?: 'positive' | 'negative';
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

// Quick Actions Component
const QuickActions = ({ onActionClick }: { onActionClick: (action: string) => void }) => {
  const quickActions = [
    { icon: CloudRain, label: 'Weather', query: 'What\'s the weather forecast for my area?' },
    { icon: Wheat, label: 'Crop Care', query: 'How should I care for my crops this week?' },
    { icon: TreePine, label: 'Pest Control', query: 'How to identify and control common pests?' },
    { icon: Sparkles, label: 'Fertilizer', query: 'What fertilizer should I use now?' },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 p-3">
      {quickActions.map((action, idx) => (
        <button
          key={idx}
          onClick={() => onActionClick(action.query)}
          className="flex items-center gap-3 p-3 rounded-2xl bg-gradient-to-r from-white/80 to-white/60 backdrop-blur-sm border border-white/50 shadow-sm hover:shadow-md hover:scale-105 transition-all duration-200"
        >
          <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10">
            <action.icon className="w-4 h-4 text-primary" />
          </div>
          <span className="text-xs font-medium text-gray-700">{action.label}</span>
        </button>
      ))}
    </div>
  );
};

// Typing Indicator Component
const TypingIndicator = () => (
  <div className="flex items-center gap-2 p-3">
    <Avatar className="w-8 h-8">
      <AvatarFallback className="bg-gradient-to-br from-primary to-primary/80">
        <Bot className="w-4 h-4 text-white" />
      </AvatarFallback>
    </Avatar>
    <div className="flex gap-1 p-3 rounded-2xl bg-gray-100">
      <motion.div
        className="w-2 h-2 rounded-full bg-gray-400"
        animate={{ y: [0, -5, 0] }}
        transition={{ duration: 0.5, repeat: Infinity, delay: 0 }}
      />
      <motion.div
        className="w-2 h-2 rounded-full bg-gray-400"
        animate={{ y: [0, -5, 0] }}
        transition={{ duration: 0.5, repeat: Infinity, delay: 0.1 }}
      />
      <motion.div
        className="w-2 h-2 rounded-full bg-gray-400"
        animate={{ y: [0, -5, 0] }}
        transition={{ duration: 0.5, repeat: Infinity, delay: 0.2 }}
      />
    </div>
  </div>
);

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
  const [showQuickActions, setShowQuickActions] = useState(true);
  const [expandedView, setExpandedView] = useState(false);
  
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
              attachments: attachmentsData,
              status: 'sent'
            };
          }));
          setShowQuickActions(false);
        } else {
          // No messages, show welcome
          showWelcomeMessage(landId);
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
        
        showWelcomeMessage(landId);
      }
    } catch (error) {
      console.error('Error in loadChatSession:', error);
      showWelcomeMessage(landId);
    }
  };

  // Show welcome message
  const showWelcomeMessage = (landId: string | null) => {
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
        : ['Weather forecast', 'Pest control', 'Fertilizer guide', 'Crop calendar'],
      status: 'sent'
    };
    
    setMessages([welcomeMessage]);
    setShowQuickActions(true);
  };

  // Auto-scroll to bottom
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load user's lands
  const loadLands = async () => {
    try {
      console.log('Loading lands using lands-api...');
      const landsData = await landsApi.fetchLands();
      console.log('Lands data received:', landsData);
      
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
      
      if (validLands.length > 0) {
        localStorage.setItem('cached_lands_ai', JSON.stringify(validLands));
      } else {
        const cachedLands = localStorage.getItem('cached_lands_ai');
        if (cachedLands) {
          const parsed = JSON.parse(cachedLands);
          console.log('Using cached lands:', parsed);
          setLands(parsed);
        }
      }
    } catch (error) {
      console.error('Error loading lands:', error);
      const cachedLands = localStorage.getItem('cached_lands_ai');
      if (cachedLands) {
        setLands(JSON.parse(cachedLands));
      }
    }
  };

  // Handle land selection
  const selectLand = (land: Land | null) => {
    setSelectedLand(land);
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

  // Copy message
  const copyMessage = (content: string) => {
    navigator.clipboard.writeText(content);
    toast({
      description: 'Message copied to clipboard',
      duration: 2000
    });
  };

  // Regenerate response
  const regenerateResponse = async () => {
    if (messages.length < 2) return;
    
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    if (lastUserMessage) {
      // Remove last assistant message
      setMessages(prev => prev.filter(m => m.id !== messages[messages.length - 1].id));
      // Resend the user message
      await sendMessage(lastUserMessage.content);
    }
  };

  // Send message
  const sendMessage = async (messageText?: string) => {
    const textToSend = messageText || inputMessage;
    if (!textToSend.trim() && !uploadedImage && !uploadedFile) return;

    setShowQuickActions(false);

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
      content: textToSend,
      timestamp: new Date(),
      landId: selectedLand?.id,
      landName: selectedLand?.name,
      attachments: attachments.length > 0 ? attachments : undefined,
      status: 'sending'
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setUploadedImage(null);
    setUploadedFile(null);
    setIsLoading(true);
    setIsTyping(true);
    
    // Update message status
    setTimeout(() => {
      setMessages(prev => prev.map(m => 
        m.id === userMessage.id ? { ...m, status: 'sent' } : m
      ));
    }, 500);
    
    // Cache message locally
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
        
        const { error: sessionError } = await supabase.from('ai_chat_sessions').insert({
          id: newSessionId,
          tenant_id: session?.tenantId,
          farmer_id: session?.farmerId,
          land_id: selectedLand?.id || null,
          session_type: selectedLand ? 'land_specific' : 'general',
          session_title: selectedLand ? `Chat about ${selectedLand.name}` : 'General farming chat',
          metadata: {
            language: i18n.language,
            initial_message: textToSend
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
            content: textToSend
          }),
          landId: selectedLand?.id,
          imageUrl: uploadedImage,
          fileContent: uploadedFile ? await uploadedFile.text() : undefined,
          sessionId: currentSessionId,
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
        suggestions: data.quickReplies,
        status: 'sent'
      };

      setMessages(prev => [...prev, assistantMessage]);
      
      // Cache AI response
      const updatedCache = JSON.parse(localStorage.getItem(`chat_messages_${selectedLand?.id || 'general'}`) || '[]');
      updatedCache.push(assistantMessage);
      localStorage.setItem(`chat_messages_${selectedLand?.id || 'general'}`, JSON.stringify(updatedCache));
      
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
      
      // Save analytics
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
        timestamp: new Date(),
        status: 'error'
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

  // Handle quick action
  const handleQuickAction = (query: string) => {
    setInputMessage(query);
    sendMessage(query);
  };

  // Handle message feedback
  const handleFeedback = (messageId: string, feedback: 'positive' | 'negative') => {
    setMessages(prev => prev.map(m => 
      m.id === messageId ? { ...m, feedback } : m
    ));
    
    toast({
      description: 'Thank you for your feedback!',
      duration: 2000
    });
  };

  return (
    <div className={cn(
      "flex flex-col h-screen bg-gradient-to-b from-[#e5f4e3] via-[#f0f8ef] to-white",
      expandedView && "fixed inset-0 z-50"
    )}>
      {/* Modern Header with Glass Effect */}
      <div className="bg-white/80 backdrop-blur-xl border-b border-gray-200/50 shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => window.history.back()} 
              className="p-2 hover:bg-gray-100 rounded-full transition-all"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center shadow-md">
                <Bot className="w-6 h-6 text-white" />
              </div>
              <div className={cn(
                "absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white",
                isOnline ? "bg-green-500" : "bg-gray-400"
              )} />
            </div>
            
            <div>
              <h2 className="font-semibold text-gray-900">AI Farm Assistant</h2>
              <p className="text-xs text-gray-500">{isOnline ? 'Online' : 'Offline'} • {isTyping ? 'Typing...' : 'Active now'}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button className="p-2 hover:bg-gray-100 rounded-full transition-all">
              <Search className="w-5 h-5 text-gray-600" />
            </button>
            <button 
              onClick={() => setExpandedView(!expandedView)}
              className="p-2 hover:bg-gray-100 rounded-full transition-all"
            >
              <Maximize2 className="w-5 h-5 text-gray-600" />
            </button>
            <button className="p-2 hover:bg-gray-100 rounded-full transition-all">
              <MoreVertical className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>
        
        {/* Land Selection Pills */}
        {lands.length > 0 && (
          <div className="px-4 pb-3">
            <ScrollArea className="w-full">
              <div className="flex gap-2">
                <button
                  onClick={() => selectLand(null)}
                  className={cn(
                    "px-4 py-2 rounded-full text-xs font-medium transition-all whitespace-nowrap",
                    "hover:scale-105 transform",
                    !selectedLand 
                      ? "bg-gradient-to-r from-green-500 to-green-600 text-white shadow-md" 
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  )}
                >
                  <Home className="w-3 h-3 inline mr-1" />
                  General
                </button>
                
                {lands.map((land) => (
                  <button
                    key={land.id}
                    onClick={() => selectLand(land)}
                    className={cn(
                      "px-4 py-2 rounded-full text-xs font-medium transition-all whitespace-nowrap",
                      "hover:scale-105 transform",
                      selectedLand?.id === land.id
                        ? "bg-gradient-to-r from-green-500 to-green-600 text-white shadow-md"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    )}
                  >
                    <MapPin className="w-3 h-3 inline mr-1" />
                    {land.name || `${land.area_acres || 0} acres`}
                  </button>
                ))}
              </div>
              <ScrollBar orientation="horizontal" className="hidden" />
            </ScrollArea>
          </div>
        )}
      </div>

      {/* Messages Area with Enhanced Styling */}
      <ScrollArea className="flex-1 px-3 py-4" ref={scrollAreaRef}>
        <div className="max-w-4xl mx-auto space-y-4">
          {/* Show Quick Actions when no messages */}
          {showQuickActions && messages.length <= 1 && (
            <QuickActions onActionClick={handleQuickAction} />
          )}
          
          <AnimatePresence mode="popLayout">
            {messages.map((message, index) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.95 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className={cn(
                  "flex gap-3",
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                {message.role === 'assistant' && (
                  <Avatar className="w-8 h-8 shadow-sm">
                    <AvatarFallback className="bg-gradient-to-br from-green-400 to-green-600">
                      <Bot className="w-4 h-4 text-white" />
                    </AvatarFallback>
                  </Avatar>
                )}
                
                <div className={cn(
                  "max-w-[85%] md:max-w-[70%] space-y-2",
                  message.role === 'user' ? 'items-end' : 'items-start'
                )}>
                  {message.role === 'system' ? (
                    <div className="text-xs text-center text-gray-500 py-1">
                      {message.content}
                    </div>
                  ) : message.id.startsWith('welcome') ? (
                    // Enhanced Welcome Card
                    <motion.div
                      initial={{ scale: 0.9 }}
                      animate={{ scale: 1 }}
                      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-green-50 to-blue-50 p-5 shadow-lg border border-green-200/50"
                    >
                      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-green-200/30 to-blue-200/30 rounded-full blur-3xl" />
                      <div className="relative">
                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded-xl bg-white/80 shadow-sm">
                            {selectedLand ? <Wheat className="w-5 h-5 text-green-600" /> : <Home className="w-5 h-5 text-green-600" />}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-800 mb-3 whitespace-pre-wrap">{message.content}</p>
                            {message.suggestions && (
                              <div className="flex flex-wrap gap-2">
                                {message.suggestions.map((suggestion, idx) => (
                                  <button
                                    key={idx}
                                    onClick={() => {
                                      setInputMessage(suggestion);
                                      sendMessage(suggestion);
                                    }}
                                    className="px-3 py-1.5 text-xs font-medium bg-white/80 hover:bg-white text-green-700 rounded-full border border-green-200 shadow-sm hover:shadow-md transition-all hover:scale-105"
                                  >
                                    {suggestion}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <div className={cn(
                      "relative group",
                      message.role === 'user' ? 'ml-auto' : ''
                    )}>
                      <div className={cn(
                        "rounded-2xl px-4 py-3 shadow-sm",
                        message.role === 'user' 
                          ? 'bg-gradient-to-r from-green-500 to-green-600 text-white' 
                          : 'bg-white border border-gray-200',
                        message.status === 'error' && 'border-red-300 bg-red-50'
                      )}>
                        {message.landName && (
                          <div className="flex items-center gap-1 mb-2 text-xs opacity-80">
                            <MapPin className="w-3 h-3" />
                            {message.landName}
                          </div>
                        )}
                        
                        <p className={cn(
                          "text-sm whitespace-pre-wrap",
                          message.role === 'assistant' && 'text-gray-800'
                        )}>{message.content}</p>
                        
                        {message.attachments && message.attachments.length > 0 && (
                          <div className="mt-3 space-y-2">
                            {message.attachments.map((attachment, idx) => (
                              attachment.type === 'image' ? (
                                <img 
                                  key={idx}
                                  src={attachment.url} 
                                  alt={attachment.name}
                                  className="rounded-xl max-h-48 object-cover shadow-md"
                                />
                              ) : (
                                <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-white/20">
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
                              <button
                                key={idx}
                                onClick={() => {
                                  setInputMessage(suggestion);
                                  sendMessage(suggestion);
                                }}
                                className="px-3 py-1 text-xs bg-white/20 hover:bg-white/30 rounded-full transition-all"
                              >
                                {suggestion}
                              </button>
                            ))}
                          </div>
                        )}
                        
                        {/* Message Actions */}
                        {message.role === 'assistant' && (
                          <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleSpeakMessage(message)}
                              className="p-1 hover:bg-gray-100 rounded transition-all"
                              title="Read aloud"
                            >
                              {speakingMessageId === message.id ? (
                                <VolumeX className="w-3 h-3 text-gray-500" />
                              ) : (
                                <Volume2 className="w-3 h-3 text-gray-500" />
                              )}
                            </button>
                            <button
                              onClick={() => copyMessage(message.content)}
                              className="p-1 hover:bg-gray-100 rounded transition-all"
                              title="Copy"
                            >
                              <Copy className="w-3 h-3 text-gray-500" />
                            </button>
                            {index === messages.length - 1 && (
                              <button
                                onClick={regenerateResponse}
                                className="p-1 hover:bg-gray-100 rounded transition-all"
                                title="Regenerate"
                              >
                                <RefreshCw className="w-3 h-3 text-gray-500" />
                              </button>
                            )}
                            <button
                              onClick={() => handleFeedback(message.id, 'positive')}
                              className={cn(
                                "p-1 hover:bg-gray-100 rounded transition-all",
                                message.feedback === 'positive' && "bg-green-100"
                              )}
                              title="Good response"
                            >
                              <ThumbsUp className="w-3 h-3 text-gray-500" />
                            </button>
                            <button
                              onClick={() => handleFeedback(message.id, 'negative')}
                              className={cn(
                                "p-1 hover:bg-gray-100 rounded transition-all",
                                message.feedback === 'negative' && "bg-red-100"
                              )}
                              title="Poor response"
                            >
                              <ThumbsDown className="w-3 h-3 text-gray-500" />
                            </button>
                          </div>
                        )}
                      </div>
                      
                      {/* Status indicator */}
                      {message.status && (
                        <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                          {message.status === 'sending' && <Loader2 className="w-3 h-3 animate-spin" />}
                          {message.status === 'sent' && <Check className="w-3 h-3" />}
                          {message.status === 'error' && <X className="w-3 h-3 text-red-500" />}
                          <span>{format(message.timestamp, 'HH:mm')}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                {message.role === 'user' && (
                  <Avatar className="w-8 h-8 shadow-sm">
                    <AvatarFallback className="bg-gradient-to-br from-blue-400 to-blue-600">
                      <User className="w-4 h-4 text-white" />
                    </AvatarFallback>
                  </Avatar>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          
          {/* Typing Indicator */}
          {isTyping && <TypingIndicator />}
          
          <div ref={messageEndRef} />
        </div>
      </ScrollArea>

      {/* Modern Input Area */}
      <div className="bg-white border-t border-gray-200">
        {/* Upload Previews */}
        {(uploadedImage || uploadedFile) && (
          <div className="px-4 pt-3 flex items-center gap-2">
            {uploadedImage && (
              <div className="relative group">
                <img 
                  src={uploadedImage} 
                  alt="Upload preview" 
                  className="h-16 w-16 rounded-lg object-cover shadow-sm"
                />
                <button
                  onClick={() => setUploadedImage(null)}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
            {uploadedFile && (
              <div className="relative group flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg">
                <FileUp className="w-4 h-4 text-gray-600" />
                <span className="text-xs text-gray-600">{uploadedFile.name}</span>
                <button
                  onClick={() => setUploadedFile(null)}
                  className="ml-2 text-red-500 hover:text-red-600"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        )}
        
        {/* Input Container */}
        <div className="p-3">
          <div className="flex items-center gap-2">
            {/* Emoji Button */}
            <button className="p-2.5 hover:bg-gray-100 rounded-full transition-all">
              <Smile className="w-5 h-5 text-gray-500" />
            </button>
            
            {/* Input Field */}
            <div className="flex-1 relative">
              <div className="flex items-center bg-gray-100 rounded-full">
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
                  placeholder="Type your message..."
                  className="flex-1 px-4 py-3 bg-transparent focus:outline-none text-sm"
                  disabled={isLoading}
                />
                
                {/* Attachment Options */}
                <button 
                  onClick={() => imageInputRef.current?.click()}
                  className="p-2 hover:bg-gray-200 rounded-full transition-all mr-1"
                >
                  <Paperclip className="w-4 h-4 text-gray-500" />
                </button>
                
                <button 
                  onClick={handleCameraCapture}
                  className="p-2 hover:bg-gray-200 rounded-full transition-all mr-2"
                >
                  <Camera className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            </div>
            
            {/* Send/Voice Button */}
            <button
              onClick={inputMessage.trim() || uploadedImage || uploadedFile ? () => sendMessage() : toggleListening}
              disabled={isLoading}
              className={cn(
                "p-3 rounded-full transition-all shadow-lg hover:scale-110 transform",
                inputMessage.trim() || uploadedImage || uploadedFile
                  ? "bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700" 
                  : isListening 
                    ? "bg-red-500 hover:bg-red-600 animate-pulse"
                    : "bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
              )}
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 text-white animate-spin" />
              ) : inputMessage.trim() || uploadedImage || uploadedFile ? (
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