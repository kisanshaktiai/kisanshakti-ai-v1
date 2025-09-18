import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
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
import { useNavigate } from 'react-router-dom';
import { 
  Send, Mic, MicOff, ImageIcon, Volume2, VolumeX, Camera,
  Bot, User, Loader2, X, Sprout, Layers, MapPin, Check,
  Wheat, CloudRain, TreePine, Home, MessageSquare, Sparkles, ChevronLeft,
  Paperclip, Smile, MoreVertical, Phone, Video, Search, Settings, Copy,
  ThumbsUp, ThumbsDown, RefreshCw, Download, Share2, Maximize2, Zap,
  Shield, Heart, Star, TrendingUp, Clock, Calendar, ArrowUp, Plus
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
    { icon: CloudRain, label: 'Weather', query: 'What\'s the weather forecast?' },
    { icon: Wheat, label: 'Crop Care', query: 'How to care for my crops?' },
    { icon: TreePine, label: 'Pest Control', query: 'How to control pests?' },
    { icon: Sparkles, label: 'Fertilizer', query: 'Which fertilizer to use?' },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 p-3">
      {quickActions.map((action, idx) => (
        <motion.button
          key={idx}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: idx * 0.05 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onActionClick(action.query)}
          className="flex flex-col items-center gap-2 p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-all"
        >
          <div className="p-2 rounded-lg bg-primary/10">
            <action.icon className="w-5 h-5 text-primary" />
          </div>
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{action.label}</span>
        </motion.button>
      ))}
    </div>
  );
};

// Typing Indicator Component
const TypingIndicator = () => (
  <motion.div 
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: -20 }}
    className="flex items-start gap-2 px-4 py-2"
  >
    <Avatar className="w-8 h-8">
      <AvatarFallback className="bg-primary">
        <Bot className="w-4 h-4 text-white" />
      </AvatarFallback>
    </Avatar>
    <div className="px-3 py-2 rounded-2xl rounded-tl-sm bg-gray-100 dark:bg-gray-800">
      <div className="flex items-center gap-1">
        {[0, 0.15, 0.3].map((delay, i) => (
          <motion.div
            key={i}
            className="w-2 h-2 rounded-full bg-gray-500"
            animate={{
              y: [0, -5, 0],
            }}
            transition={{
              duration: 0.6,
              repeat: Infinity,
              delay,
            }}
          />
        ))}
      </div>
    </div>
  </motion.div>
);

// Message Bubble Component
const MessageBubble = ({ 
  message, 
  onFeedback, 
  onSpeak,
  isSpeaking 
}: { 
  message: Message; 
  onFeedback: (id: string, feedback: 'positive' | 'negative') => void;
  onSpeak: (content: string) => void;
  isSpeaking: boolean;
}) => {
  const isUser = message.role === 'user';
  const [showActions, setShowActions] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex gap-2 px-4 py-1 group",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      {/* Avatar */}
      {!isUser && (
        <Avatar className="w-8 h-8 mt-1">
          <AvatarFallback className="bg-primary">
            <Bot className="w-4 h-4 text-white" />
          </AvatarFallback>
        </Avatar>
      )}

      {/* Message Content */}
      <div className={cn(
        "max-w-[75%] space-y-1",
        isUser && "items-end"
      )}>
        <div
          className={cn(
            "px-3 py-2 rounded-2xl text-sm",
            isUser ? [
              "rounded-tr-sm bg-primary text-white",
            ] : [
              "rounded-tl-sm bg-gray-100 dark:bg-gray-800",
            ]
          )}
        >
          {message.content}

          {/* Attachments */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-2 space-y-1">
              {message.attachments.map((attachment, idx) => (
                <div key={idx} className="rounded-lg overflow-hidden">
                  {attachment.type === 'image' ? (
                    <img 
                      src={attachment.url} 
                      alt={attachment.name}
                      className="max-w-full rounded-lg"
                    />
                  ) : (
                    <div className="flex items-center gap-2 p-2 bg-white/10 rounded">
                      <Paperclip className="w-4 h-4" />
                      <span className="text-xs">{attachment.name}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Timestamp and Actions */}
        <div className={cn(
          "flex items-center gap-2 px-1",
          isUser ? "justify-end" : "justify-start"
        )}>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {format(message.timestamp, 'h:mm a')}
          </span>
          {message.status === 'sent' && isUser && (
            <Check className="w-3 h-3 text-gray-500" />
          )}
          
          {/* Message Actions for Assistant */}
          {!isUser && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => onSpeak(message.content)}
                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
              >
                {isSpeaking ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
              </button>
              <button
                onClick={() => navigator.clipboard.writeText(message.content)}
                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
              >
                <Copy className="w-3 h-3" />
              </button>
              <button
                onClick={() => onFeedback(message.id, 'positive')}
                className={cn(
                  "p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded",
                  message.feedback === 'positive' && "text-green-600"
                )}
              >
                <ThumbsUp className="w-3 h-3" />
              </button>
              <button
                onClick={() => onFeedback(message.id, 'negative')}
                className={cn(
                  "p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded",
                  message.feedback === 'negative' && "text-red-600"
                )}
              >
                <ThumbsDown className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export function ModernAIChatInterface() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuthStore();
  const navigate = useNavigate();
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
  const [isFirstMessage, setIsFirstMessage] = useState(true);
  
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Welcome message on first load
  useEffect(() => {
    if (messages.length === 1 && isFirstMessage) {
      toast({
        description: "🌱 Welcome! How can I help you with farming today?",
        duration: 3000
      });
      setIsFirstMessage(false);
    }
  }, [messages, isFirstMessage, toast]);

  // Load lands from API
  const loadLands = async () => {
    try {
      const lands = await landsApi.fetchLands();
      // Filter out lands without id and ensure type compatibility
      const validLands = lands.filter(land => land.id) as Land[];
      setLands(validLands);
    } catch (error) {
      console.error('Error loading lands:', error);
    }
  };

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
          console.error('Error loading session:', error);
        }
        existingSession = data;
      }

      if (existingSession) {
        setSessionId(existingSession.id);
        
        // Load cached messages
        const cachedMessages = localStorage.getItem(`chat_messages_${landId || 'general'}`);
        if (cachedMessages) {
          try {
            const parsed = JSON.parse(cachedMessages);
            setMessages(parsed);
          } catch (e) {
            console.error('Error parsing cached messages:', e);
            setMessages([]);
          }
        } else {
          setMessages([]);
        }
      } else {
        // Create new session
        const newSessionId = crypto.randomUUID();
        const { error: insertError } = await supabase
          .from('ai_chat_sessions')
          .insert({
            id: newSessionId,
            tenant_id: session.tenantId,
            farmer_id: session.farmerId,
            land_id: searchLandId,
            is_active: true,
            metadata: {
              language: i18n.language,
              created_from: 'modern_chat_ui'
            }
          });
          
        if (insertError) {
          console.error('Error creating session:', insertError);
        } else {
          setSessionId(newSessionId);
        }
        
        setMessages([]);
        localStorage.removeItem(`chat_messages_${landId || 'general'}`);
      }
      
      setShowQuickActions(true);
    } catch (error) {
      console.error('Error in loadChatSession:', error);
      setMessages([]);
    }
  };

  // Select a land
  const selectLand = (land: Land | null) => {
    setSelectedLand(land);
    setMessages([]);
    setShowQuickActions(true);
  };

  // Handle sending messages
  const sendMessage = async (messageText?: string) => {
    const textToSend = messageText || inputMessage.trim();
    if (!textToSend && !uploadedImage && !uploadedFile) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: textToSend,
      timestamp: new Date(),
      landId: selectedLand?.id,
      landName: selectedLand?.name,
      attachments: [],
      status: 'sending'
    };

    if (uploadedImage) {
      userMessage.attachments!.push({
        type: 'image',
        url: uploadedImage,
        name: 'Uploaded Image'
      });
    }

    if (uploadedFile) {
      userMessage.attachments!.push({
        type: 'file',
        url: URL.createObjectURL(uploadedFile),
        name: uploadedFile.name
      });
    }

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setUploadedImage(null);
    setUploadedFile(null);
    setIsLoading(true);
    setIsTyping(true);
    setShowQuickActions(false);

    // Cache user message
    const cachedMessages = JSON.parse(localStorage.getItem(`chat_messages_${selectedLand?.id || 'general'}`) || '[]');
    cachedMessages.push(userMessage);
    localStorage.setItem(`chat_messages_${selectedLand?.id || 'general'}`, JSON.stringify(cachedMessages));

    try {
      const { session } = useAuthStore.getState();
      const currentSessionId = sessionId;
      
      // Prepare request body
      const requestBody = {
        message: textToSend,
        sessionId: currentSessionId,
        landId: selectedLand?.id,
        language: i18n.language,
        context: {
          isOnline,
          hasImage: !!uploadedImage,
          hasFile: !!uploadedFile,
          selectedLand: selectedLand ? {
            id: selectedLand.id,
            name: selectedLand.name,
            area: selectedLand.area_acres,
            crop: selectedLand.primary_crop,
            soil: selectedLand.soil_type,
            location: selectedLand.location
          } : null
        },
        metadata: {
          userId: user?.id,
          farmerId: session?.farmerId,
          tenantId: session?.tenantId,
          timestamp: new Date().toISOString()
        }
      };

      console.log('Sending message with context:', requestBody);

      // Call the edge function
      const { data, error } = await supabase.functions.invoke('ai-agriculture-chat', {
        body: requestBody
      });

      if (error) {
        console.error('Edge function error:', error);
        throw error;
      }

      if (!data || !data.response) {
        throw new Error('Invalid response from AI service');
      }

      // Update user message status
      setMessages(prev => prev.map(m => 
        m.id === userMessage.id ? { ...m, status: 'sent' } : m
      ));

      // Add AI response
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.response,
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
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
      {/* Compact Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-2 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => navigate('/app')} 
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            
            <div className="flex items-center gap-2">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="bg-primary">
                  <Bot className="w-4 h-4 text-white" />
                </AvatarFallback>
              </Avatar>
              
              <div>
                <h2 className="font-semibold text-sm">AI Assistant</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {isOnline ? 'Online' : 'Offline'} {isTyping && '• Typing...'}
                </p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
              <Phone className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            </button>
            <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
              <Video className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            </button>
            <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
              <MoreVertical className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            </button>
          </div>
        </div>
        
        {/* Land Selection - Horizontal Scroll */}
        {lands.length > 0 && (
          <div className="mt-2 -mx-2 px-2">
            <ScrollArea className="w-full">
              <div className="flex gap-2 pb-1">
                <button
                  onClick={() => selectLand(null)}
                  className={cn(
                    "px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all",
                    !selectedLand 
                      ? "bg-primary text-white" 
                      : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                  )}
                >
                  General
                </button>
                
                {lands.map((land) => (
                  <button
                    key={land.id}
                    onClick={() => selectLand(land)}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all",
                      selectedLand?.id === land.id 
                        ? "bg-primary text-white" 
                        : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                    )}
                  >
                    {land.name}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto" ref={scrollAreaRef}>
        <div className="pb-2">
          {/* Show quick actions when no messages */}
          {messages.length === 0 && showQuickActions && (
            <div className="p-4">
              <div className="text-center mb-4">
                <Sparkles className="w-10 h-10 text-primary mx-auto mb-2" />
                <h3 className="text-base font-semibold">How can I help you today?</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {selectedLand 
                    ? `Ask about ${selectedLand.name}`
                    : 'Ask me anything about farming'}
                </p>
              </div>
              <QuickActions onActionClick={handleQuickAction} />
            </div>
          )}

          {/* Messages */}
          <AnimatePresence>
            {messages.map((message) => (
              <MessageBubble 
                key={message.id}
                message={message}
                onFeedback={handleFeedback}
                onSpeak={(content) => {
                  if (isSpeaking && speakingMessageId === message.id) {
                    stop();
                    setSpeakingMessageId(null);
                  } else {
                    speak(content);
                    setSpeakingMessageId(message.id);
                  }
                }}
                isSpeaking={isSpeaking && speakingMessageId === message.id}
              />
            ))}
          </AnimatePresence>

          {/* Typing Indicator */}
          <AnimatePresence>
            {isTyping && <TypingIndicator />}
          </AnimatePresence>

          {/* Suggested Replies */}
          {messages.length > 0 && messages[messages.length - 1].suggestions && (
            <div className="px-4 py-2">
              <ScrollArea className="w-full">
                <div className="flex gap-2">
                  {messages[messages.length - 1].suggestions!.map((suggestion, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleQuickAction(suggestion)}
                      className="px-3 py-1.5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors whitespace-nowrap"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          <div ref={messageEndRef} />
        </div>
      </div>

      {/* Attachments Preview */}
      <AnimatePresence>
        {(uploadedImage || uploadedFile) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="px-4 py-2 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700"
          >
            <div className="flex gap-2">
              {uploadedImage && (
                <div className="relative">
                  <img 
                    src={uploadedImage} 
                    alt="Upload preview"
                    className="h-16 w-16 object-cover rounded-lg"
                  />
                  <button
                    onClick={() => setUploadedImage(null)}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
              {uploadedFile && (
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                  <Paperclip className="w-4 h-4" />
                  <span className="text-xs truncate max-w-[100px]">{uploadedFile.name}</span>
                  <button
                    onClick={() => setUploadedFile(null)}
                    className="ml-1"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* WhatsApp-style Input Bar */}
      <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-2 py-2">
        <div className="flex items-end gap-1">
          {/* Attachment Button */}
          <button
            onClick={() => imageInputRef.current?.click()}
            className="p-2.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
          >
            <Plus className="w-5 h-5" />
          </button>

          {/* Input Field */}
          <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full">
            <textarea
              ref={inputRef}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Type a message"
              className="w-full px-4 py-2.5 bg-transparent resize-none focus:outline-none text-sm"
              rows={1}
              style={{
                maxHeight: '100px',
              }}
            />
          </div>

          {/* Send/Mic Button */}
          <button
            onClick={() => {
              if (inputMessage.trim()) {
                sendMessage();
              } else if (isSpeechSupported) {
                toggleListening();
              }
            }}
            disabled={isLoading}
            className={cn(
              "p-2.5 rounded-full transition-colors",
              inputMessage.trim() || isListening
                ? "bg-primary text-white"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
            )}
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : inputMessage.trim() ? (
              <Send className="w-5 h-5" />
            ) : isListening ? (
              <MicOff className="w-5 h-5" />
            ) : (
              <Mic className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

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
        onChange={handleFileUpload}
        className="hidden"
      />
    </div>
  );
}