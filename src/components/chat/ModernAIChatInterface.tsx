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
  ThumbsUp, ThumbsDown, RefreshCw, Download, Share2, Maximize2, Zap,
  Shield, Heart, Star, TrendingUp, Clock, Calendar, ArrowUp, Sun, Moon
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

// Modern Quick Actions Component with Glassmorphism
const QuickActions = ({ onActionClick }: { onActionClick: (action: string) => void }) => {
  const quickActions = [
    { icon: CloudRain, label: 'Weather', query: 'What\'s the weather forecast for my area?', gradient: 'from-blue-400 to-cyan-400' },
    { icon: Wheat, label: 'Crop Care', query: 'How should I care for my crops this week?', gradient: 'from-amber-400 to-orange-400' },
    { icon: TreePine, label: 'Pest Control', query: 'How to identify and control common pests?', gradient: 'from-green-400 to-emerald-400' },
    { icon: Sparkles, label: 'Fertilizer', query: 'What fertilizer should I use now?', gradient: 'from-purple-400 to-pink-400' },
    { icon: Shield, label: 'Disease', query: 'How to prevent crop diseases?', gradient: 'from-red-400 to-rose-400' },
    { icon: TrendingUp, label: 'Market', query: 'Current market prices for my crops?', gradient: 'from-indigo-400 to-blue-400' },
  ];

  return (
    <ScrollArea className="w-full">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex gap-3 p-4 pb-2"
      >
        {quickActions.map((action, idx) => (
          <motion.button
            key={idx}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: idx * 0.05, type: "spring", stiffness: 260, damping: 20 }}
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onActionClick(action.query)}
            className="min-w-[120px] p-4 rounded-3xl bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl border border-white/30 dark:border-gray-700/30 shadow-xl hover:shadow-2xl transition-all duration-300 group"
          >
            <div className={cn(
              "w-12 h-12 rounded-2xl bg-gradient-to-br flex items-center justify-center mb-3 mx-auto",
              "shadow-lg group-hover:shadow-xl transition-all duration-300",
              action.gradient
            )}>
              <action.icon className="w-6 h-6 text-white" />
            </div>
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200 block">{action.label}</span>
          </motion.button>
        ))}
      </motion.div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
};

// Modern Typing Indicator with Wave Animation
const TypingIndicator = () => (
  <motion.div 
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: -20 }}
    className="flex items-start gap-3 px-4 py-2"
  >
    <div className="relative">
      <Avatar className="w-10 h-10 ring-2 ring-primary/20 ring-offset-2">
        <AvatarFallback className="bg-gradient-to-br from-primary to-primary/80">
          <Bot className="w-5 h-5 text-white" />
        </AvatarFallback>
      </Avatar>
      <motion.div 
        className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full"
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
    </div>
    <div className="max-w-[200px] relative">
      <div className="px-4 py-3 rounded-3xl rounded-tl-lg bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border border-gray-200/50 dark:border-gray-700/50 shadow-lg">
        <div className="flex items-center gap-1">
          {[0, 0.2, 0.4].map((delay, i) => (
            <motion.div
              key={i}
              className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-primary to-primary/60"
              animate={{
                y: [0, -8, 0],
                scale: [1, 1.2, 1],
              }}
              transition={{
                duration: 0.8,
                repeat: Infinity,
                delay,
                ease: "easeInOut"
              }}
            />
          ))}
        </div>
      </div>
      {/* Chat bubble tail */}
      <div className="absolute -left-2 top-3 w-4 h-4 bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border-l border-t border-gray-200/50 dark:border-gray-700/50 rotate-45 -z-10" />
    </div>
  </motion.div>
);

// Message Bubble Component with Modern Design
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
  const [expanded, setExpanded] = useState(false);
  const shouldTruncate = message.content.length > 500;
  const displayContent = shouldTruncate && !expanded 
    ? message.content.slice(0, 500) + '...' 
    : message.content;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 20 }}
      className={cn(
        "flex gap-3 px-4 py-2 group",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      {/* Avatar */}
      {!isUser && (
        <div className="relative">
          <Avatar className="w-10 h-10 ring-2 ring-primary/20 ring-offset-2">
            <AvatarFallback className="bg-gradient-to-br from-primary to-primary/80">
              <Bot className="w-5 h-5 text-white" />
            </AvatarFallback>
          </Avatar>
          <motion.div 
            className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        </div>
      )}

      {/* Message Content */}
      <div className={cn(
        "max-w-[75%] relative",
        isUser && "items-end"
      )}>
        <motion.div
          whileHover={{ scale: 1.01 }}
          className={cn(
            "relative px-4 py-3 rounded-3xl shadow-lg backdrop-blur-xl",
            "border transition-all duration-300",
            isUser ? [
              "rounded-tr-lg bg-gradient-to-br from-primary/90 to-primary text-white",
              "border-primary/30 shadow-primary/20"
            ] : [
              "rounded-tl-lg bg-white/80 dark:bg-gray-800/80",
              "border-gray-200/50 dark:border-gray-700/50",
              "hover:shadow-xl"
            ]
          )}
        >
          {/* Message text */}
          <div className="text-sm leading-relaxed">
            {displayContent}
          </div>

          {/* Read more button */}
          {shouldTruncate && (
            <button
              onClick={() => setExpanded(!expanded)}
              className={cn(
                "mt-2 text-xs font-medium underline",
                isUser ? "text-white/90" : "text-primary"
              )}
            >
              {expanded ? 'Show less' : 'Read more'}
            </button>
          )}

          {/* Attachments */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-3 space-y-2">
              {message.attachments.map((attachment, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ scale: 1.05 }}
                  className="relative group"
                >
                  {attachment.type === 'image' ? (
                    <img 
                      src={attachment.url} 
                      alt={attachment.name}
                      className="rounded-2xl max-w-full max-h-48 object-cover shadow-md"
                    />
                  ) : (
                    <div className="flex items-center gap-2 p-2 rounded-xl bg-white/50 dark:bg-black/20">
                      <FileUp className="w-4 h-4" />
                      <span className="text-xs truncate">{attachment.name}</span>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          )}

          {/* Timestamp and status */}
          <div className={cn(
            "flex items-center gap-2 mt-2 text-xs",
            isUser ? "text-white/70" : "text-gray-500 dark:text-gray-400"
          )}>
            <Clock className="w-3 h-3" />
            {format(message.timestamp, 'h:mm a')}
            {message.status === 'sending' && <Loader2 className="w-3 h-3 animate-spin" />}
            {message.status === 'sent' && <Check className="w-3 h-3" />}
          </div>

          {/* Chat bubble tail */}
          <div className={cn(
            "absolute top-3 w-4 h-4 rotate-45 -z-10",
            isUser ? [
              "-right-2 bg-gradient-to-br from-primary/90 to-primary",
              "border-r border-t border-primary/30"
            ] : [
              "-left-2 bg-white/80 dark:bg-gray-800/80",
              "border-l border-t border-gray-200/50 dark:border-gray-700/50"
            ]
          )} />
        </motion.div>

        {/* Message Actions - Floating micro-buttons */}
        {!isUser && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => onSpeak(message.content)}
              className="p-1.5 rounded-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border border-gray-200/50 dark:border-gray-700/50 shadow-md hover:shadow-lg transition-all"
            >
              {isSpeaking ? <VolumeX className="w-3.5 h-3.5 text-gray-600" /> : <Volume2 className="w-3.5 h-3.5 text-gray-600" />}
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => navigator.clipboard.writeText(message.content)}
              className="p-1.5 rounded-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border border-gray-200/50 dark:border-gray-700/50 shadow-md hover:shadow-lg transition-all"
            >
              <Copy className="w-3.5 h-3.5 text-gray-600" />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => onFeedback(message.id, 'positive')}
              className={cn(
                "p-1.5 rounded-full backdrop-blur-xl border shadow-md hover:shadow-lg transition-all",
                message.feedback === 'positive' 
                  ? "bg-green-100 border-green-300" 
                  : "bg-white/80 dark:bg-gray-800/80 border-gray-200/50 dark:border-gray-700/50"
              )}
            >
              <ThumbsUp className={cn(
                "w-3.5 h-3.5",
                message.feedback === 'positive' ? "text-green-600" : "text-gray-600"
              )} />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => onFeedback(message.id, 'negative')}
              className={cn(
                "p-1.5 rounded-full backdrop-blur-xl border shadow-md hover:shadow-lg transition-all",
                message.feedback === 'negative' 
                  ? "bg-red-100 border-red-300" 
                  : "bg-white/80 dark:bg-gray-800/80 border-gray-200/50 dark:border-gray-700/50"
              )}
            >
              <ThumbsDown className={cn(
                "w-3.5 h-3.5",
                message.feedback === 'negative' ? "text-red-600" : "text-gray-600"
              )} />
            </motion.button>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};

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
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
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

  // Trigger celebration effect on first message
  useEffect(() => {
    if (messages.length === 1 && isFirstMessage) {
      // Simple celebration effect instead of confetti
      toast({
        description: "🎉 Welcome! Let's start farming smart!",
        duration: 3000
      });
      setIsFirstMessage(false);
    }
  }, [messages, isFirstMessage, toast]);

  // Load lands from API
  const loadLands = async () => {
    try {
      const { data, error } = await landsApi.getLands();
      if (error) throw error;
      setLands(data || []);
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

  // Handle emoji selection
  const handleEmojiSelect = (emoji: string) => {
    setInputMessage(prev => prev + emoji);
    setShowEmojiPicker(false);
    inputRef.current?.focus();
  };

  const commonEmojis = ['😊', '👍', '❤️', '🌱', '🌾', '🌧️', '☀️', '🚜', '🌽', '🍅'];

  return (
    <div className={cn(
      "flex flex-col h-screen bg-gradient-to-b from-background via-background/95 to-background",
      expandedView && "fixed inset-0 z-50"
    )}>
      {/* Modern Sticky Header with Glassmorphism */}
      <motion.div 
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        className="sticky top-0 z-40 bg-white/70 dark:bg-gray-900/70 backdrop-blur-2xl border-b border-gray-200/20 dark:border-gray-700/20 shadow-xl"
      >
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <motion.button 
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => window.history.back()} 
              className="p-2.5 hover:bg-gray-100/50 dark:hover:bg-gray-800/50 rounded-2xl transition-all backdrop-blur-xl"
            >
              <ChevronLeft className="w-5 h-5" />
            </motion.button>
            
            {/* Animated AI Avatar */}
            <div className="relative">
              <motion.div 
                animate={{ 
                  scale: [1, 1.05, 1],
                }}
                transition={{ 
                  duration: 3, 
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary via-primary/80 to-primary/60 flex items-center justify-center shadow-xl"
              >
                <Bot className="w-7 h-7 text-white" />
              </motion.div>
              <motion.div 
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className={cn(
                  "absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white dark:border-gray-900",
                  isOnline ? "bg-gradient-to-br from-green-400 to-green-600" : "bg-gray-400"
                )} 
              />
            </div>
            
            <div>
              <h2 className="font-bold text-lg bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                AI Farm Assistant
              </h2>
              <div className="flex items-center gap-2">
                <span className={cn(
                  "text-xs font-medium px-2 py-0.5 rounded-full",
                  isOnline 
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" 
                    : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400"
                )}>
                  {isOnline ? '● Online' : '○ Offline'}
                </span>
                {isTyping && (
                  <span className="text-xs text-primary animate-pulse">
                    AI is typing...
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <motion.button 
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="p-2.5 hover:bg-gray-100/50 dark:hover:bg-gray-800/50 rounded-2xl transition-all backdrop-blur-xl"
            >
              <Phone className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </motion.button>
            <motion.button 
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="p-2.5 hover:bg-gray-100/50 dark:hover:bg-gray-800/50 rounded-2xl transition-all backdrop-blur-xl"
            >
              <Video className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </motion.button>
            <motion.button 
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setExpandedView(!expandedView)}
              className="p-2.5 hover:bg-gray-100/50 dark:hover:bg-gray-800/50 rounded-2xl transition-all backdrop-blur-xl"
            >
              <Maximize2 className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </motion.button>
          </div>
        </div>
        
        {/* Land Context Pills */}
        {lands.length > 0 && (
          <div className="px-4 pb-3">
            <ScrollArea className="w-full">
              <div className="flex gap-2">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => selectLand(null)}
                  className={cn(
                    "px-4 py-2 rounded-2xl text-xs font-semibold transition-all whitespace-nowrap",
                    "backdrop-blur-xl border shadow-md",
                    !selectedLand 
                      ? "bg-gradient-to-r from-primary to-primary/80 text-white border-primary/30 shadow-primary/20" 
                      : "bg-white/70 dark:bg-gray-800/70 text-gray-700 dark:text-gray-300 border-gray-200/50 dark:border-gray-700/50 hover:shadow-lg"
                  )}
                >
                  <Home className="w-3.5 h-3.5 inline mr-1.5" />
                  General Chat
                </motion.button>
                
                {lands.map((land) => (
                  <motion.button
                    key={land.id}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => selectLand(land)}
                    className={cn(
                      "px-4 py-2 rounded-2xl text-xs font-semibold transition-all whitespace-nowrap",
                      "backdrop-blur-xl border shadow-md flex items-center gap-1.5",
                      selectedLand?.id === land.id 
                        ? "bg-gradient-to-r from-primary to-primary/80 text-white border-primary/30 shadow-primary/20" 
                        : "bg-white/70 dark:bg-gray-800/70 text-gray-700 dark:text-gray-300 border-gray-200/50 dark:border-gray-700/50 hover:shadow-lg"
                    )}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    {land.name}
                    {land.area_acres && (
                      <span className="opacity-80">({land.area_acres} acres)</span>
                    )}
                  </motion.button>
                ))}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>
        )}
      </motion.div>

      {/* Messages Area with New Message Pulse */}
      <ScrollArea className="flex-1 px-2" ref={scrollAreaRef}>
        <div className="py-4 space-y-2">
          {/* Show quick actions when no messages */}
          {messages.length === 0 && showQuickActions && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-8"
            >
              <Sparkles className="w-12 h-12 text-primary mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">How can I help you today?</h3>
              <p className="text-sm text-muted-foreground mb-6">
                {selectedLand 
                  ? `Ask me anything about ${selectedLand.name}`
                  : 'Select a topic or ask me anything about farming'}
              </p>
              <QuickActions onActionClick={handleQuickAction} />
            </motion.div>
          )}

          {/* Messages */}
          <AnimatePresence mode="popLayout">
            {messages.map((message, index) => (
              <motion.div
                key={message.id}
                layout
                className={cn(
                  index === messages.length - 1 && message.role === 'assistant' && 
                  "animate-pulse-border"
                )}
              >
                <MessageBubble 
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
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Typing Indicator */}
          <AnimatePresence>
            {isTyping && <TypingIndicator />}
          </AnimatePresence>

          {/* Suggested Replies Carousel */}
          {messages.length > 0 && messages[messages.length - 1].suggestions && (
            <ScrollArea className="w-full mt-4">
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-2 px-4 pb-2"
              >
                {messages[messages.length - 1].suggestions!.map((suggestion, idx) => (
                  <motion.button
                    key={idx}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.05 }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleQuickAction(suggestion)}
                    className="px-4 py-2 rounded-2xl bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl border border-primary/30 text-sm font-medium text-primary hover:bg-primary/10 transition-all whitespace-nowrap shadow-md hover:shadow-lg"
                  >
                    {suggestion}
                  </motion.button>
                ))}
              </motion.div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          )}

          <div ref={messageEndRef} />
        </div>
      </ScrollArea>

      {/* Attachments Preview */}
      <AnimatePresence>
        {(uploadedImage || uploadedFile) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="px-4 py-2 bg-white/50 dark:bg-gray-900/50 backdrop-blur-xl"
          >
            <div className="flex gap-2 overflow-x-auto">
              {uploadedImage && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0, x: -100 }}
                  whileHover={{ scale: 1.05 }}
                  className="relative group"
                >
                  <img 
                    src={uploadedImage} 
                    alt="Upload preview"
                    className="h-20 w-20 object-cover rounded-2xl shadow-lg"
                  />
                  <motion.button
                    whileHover={{ scale: 1.2 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setUploadedImage(null)}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </motion.button>
                </motion.div>
              )}
              {uploadedFile && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0, x: -100 }}
                  whileHover={{ scale: 1.05 }}
                  className="relative group flex items-center gap-2 px-3 py-2 bg-white/80 dark:bg-gray-800/80 rounded-2xl shadow-lg backdrop-blur-xl"
                >
                  <FileUp className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium truncate max-w-[150px]">
                    {uploadedFile.name}
                  </span>
                  <motion.button
                    whileHover={{ scale: 1.2 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setUploadedFile(null)}
                    className="ml-2"
                  >
                    <X className="w-4 h-4 text-red-500" />
                  </motion.button>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Glass Input Dock */}
      <motion.div 
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        className="sticky bottom-0 bg-white/70 dark:bg-gray-900/70 backdrop-blur-2xl border-t border-gray-200/20 dark:border-gray-700/20 shadow-2xl"
      >
        <div className="p-4 space-y-3">
          {/* Emoji Picker */}
          <AnimatePresence>
            {showEmojiPicker && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="flex gap-2 p-3 bg-white/80 dark:bg-gray-800/80 rounded-3xl backdrop-blur-xl shadow-lg"
              >
                {commonEmojis.map((emoji, idx) => (
                  <motion.button
                    key={idx}
                    whileHover={{ scale: 1.2 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => handleEmojiSelect(emoji)}
                    className="text-2xl hover:bg-gray-100/50 dark:hover:bg-gray-700/50 rounded-xl p-1"
                  >
                    {emoji}
                  </motion.button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex gap-2 items-end">
            {/* Floating Micro Action Buttons */}
            <div className="flex gap-1">
              <motion.button
                whileHover={{ scale: 1.1, rotate: 15 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="p-3 rounded-2xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border border-gray-200/50 dark:border-gray-700/50 shadow-lg hover:shadow-xl transition-all"
              >
                <Smile className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </motion.button>
              
              <motion.button
                whileHover={{ scale: 1.1, rotate: -15 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => imageInputRef.current?.click()}
                className="p-3 rounded-2xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border border-gray-200/50 dark:border-gray-700/50 shadow-lg hover:shadow-xl transition-all"
              >
                <ImageIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </motion.button>
              
              <motion.button
                whileHover={{ scale: 1.1, rotate: 15 }}
                whileTap={{ scale: 0.9 }}
                onClick={handleCameraCapture}
                className="p-3 rounded-2xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border border-gray-200/50 dark:border-gray-700/50 shadow-lg hover:shadow-xl transition-all"
              >
                <Camera className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </motion.button>
              
              <motion.button
                whileHover={{ scale: 1.1, rotate: -15 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => fileInputRef.current?.click()}
                className="p-3 rounded-2xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border border-gray-200/50 dark:border-gray-700/50 shadow-lg hover:shadow-xl transition-all"
              >
                <Paperclip className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </motion.button>
            </div>

            {/* Input Field with Expansion Animation */}
            <motion.div 
              animate={{ 
                scale: inputMessage ? 1.02 : 1,
              }}
              className="flex-1 relative"
            >
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
                placeholder={selectedLand 
                  ? `Ask about ${selectedLand.name}...` 
                  : "Type your message..."}
                className="w-full px-5 py-3 pr-12 rounded-3xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border border-gray-200/50 dark:border-gray-700/50 shadow-lg focus:shadow-xl focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none transition-all"
                rows={1}
                style={{
                  minHeight: '48px',
                  maxHeight: '120px',
                  height: inputMessage.split('\n').length > 1 ? 'auto' : '48px'
                }}
              />
            </motion.div>

            {/* Morphing Send/Mic FAB */}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => {
                if (inputMessage.trim()) {
                  sendMessage();
                } else if (isSpeechSupported) {
                  toggleListening();
                }
              }}
              disabled={isLoading}
              className={cn(
                "p-3 rounded-full shadow-xl transition-all",
                "backdrop-blur-xl border",
                inputMessage.trim() || isListening
                  ? "bg-gradient-to-br from-primary to-primary/80 border-primary/30 shadow-primary/30"
                  : "bg-white/80 dark:bg-gray-800/80 border-gray-200/50 dark:border-gray-700/50",
                isLoading && "opacity-50 cursor-not-allowed"
              )}
            >
              <AnimatePresence mode="wait">
                {isLoading ? (
                  <motion.div
                    key="loading"
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    exit={{ scale: 0, rotate: 180 }}
                  >
                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                  </motion.div>
                ) : inputMessage.trim() ? (
                  <motion.div
                    key="send"
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    exit={{ scale: 0, rotate: 180 }}
                  >
                    <Send className="w-5 h-5 text-white" />
                  </motion.div>
                ) : isListening ? (
                  <motion.div
                    key="mic-off"
                    initial={{ scale: 0 }}
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  >
                    <MicOff className="w-5 h-5 text-white" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="mic"
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    exit={{ scale: 0, rotate: 180 }}
                  >
                    <Mic className={cn(
                      "w-5 h-5",
                      inputMessage.trim() || isListening ? "text-white" : "text-gray-600 dark:text-gray-400"
                    )} />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.button>
          </div>
        </div>
      </motion.div>

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

      {/* Custom styles for pulse animation */}
      <style jsx>{`
        @keyframes pulse-border {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4);
          }
          50% {
            box-shadow: 0 0 0 8px rgba(34, 197, 94, 0);
          }
        }
        .animate-pulse-border {
          animation: pulse-border 2s ease-in-out;
        }
      `}</style>
    </div>
  );
}