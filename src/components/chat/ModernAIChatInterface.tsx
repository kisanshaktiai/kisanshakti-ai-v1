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
  Send, Mic, MicOff, ImageIcon, Volume2, VolumeX,
  Bot, User, Loader2, X, Sprout, Layers, MapPin, Check, ScanLine
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
  
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
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
      // Add welcome message
      const welcomeMessage: Message = {
        id: 'welcome',
        role: 'assistant',
        content: t('chat.welcome', `Hello! I'm your AI farming assistant. How can I help you today?`),
        timestamp: new Date(),
        suggestions: ['Weather forecast', 'Pest control', 'Fertilizer guide', 'Crop calendar']
      };
      setMessages([welcomeMessage]);
    }
  }, [user]);

  // Auto-scroll to bottom
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load user's lands using lands-api for proper tenant isolation
  const loadLands = async () => {
    try {
      const landsData = await landsApi.fetchLands();
      // Filter and map lands data
      const validLands = (landsData || []).filter(land => land.id).map(land => ({
        id: land.id!,
        name: land.name || 'Unnamed Land',
        area_acres: land.area_acres,
        primary_crop: (land as any).crop_type || (land as any).primary_crop,
        soil_type: land.soil_type,
        location: (land as any).village || (land as any).location
      }));
      setLands(validLands);
      
      // Cache for offline
      if (validLands.length > 0) {
        localStorage.setItem('cached_lands_ai', JSON.stringify(validLands));
      }
    } catch (error) {
      console.error('Error loading lands:', error);
      // Load from cache if offline
      const cachedLands = localStorage.getItem('cached_lands_ai');
      if (cachedLands) {
        setLands(JSON.parse(cachedLands));
      }
    }
  };

  // Handle land selection
  const selectLand = (land: Land | null) => {
    setSelectedLand(land);
    
    if (land) {
      const contextMessage: Message = {
        id: crypto.randomUUID(),
        role: 'system',
        content: `Switched to ${land.name}`,
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, contextMessage]);
    }
  };

  // Send message
  const sendMessage = async () => {
    if (!inputMessage.trim() && !uploadedImage) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: inputMessage,
      timestamp: new Date(),
      landId: selectedLand?.id,
      landName: selectedLand?.name,
      attachments: uploadedImage ? [{
        type: 'image',
        url: uploadedImage,
        name: 'uploaded-image.jpg'
      }] : undefined
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setUploadedImage(null);
    setIsLoading(true);
    setIsTyping(true);

    try {
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
          sessionId: crypto.randomUUID()
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

      // Speak response if enabled
      if (voiceEnabled && isTTSSupported) {
        speak(assistantMessage.content);
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

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Minimal Header with Tiny Land Cards */}
      <div className="bg-background/95 backdrop-blur-lg border-b">
        <div className="px-3 py-2">
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
            {lands.map((land) => (
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
            ))}
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
                            <img 
                              key={idx}
                              src={attachment.url} 
                              alt={attachment.name}
                              className="rounded-lg max-h-48 object-cover"
                            />
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

      {/* Compact Input Area */}
      <div className="border-t bg-background/95 backdrop-blur-lg">
        {uploadedImage && (
          <div className="px-4 pt-2">
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
          </div>
        )}
        
        <div className="p-3 max-w-4xl mx-auto">
          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              <textarea
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
                  : "Ask me anything about farming..."
                }
                className="w-full min-h-[40px] max-h-[100px] px-3 py-2 pr-20 rounded-xl border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground text-sm"
                style={{ 
                  scrollbarWidth: 'thin',
                  lineHeight: '1.5'
                }}
              />
              
              <div className="absolute right-2 bottom-2 flex items-center gap-1">
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => imageInputRef.current?.click()}
                  className="h-6 w-6"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                </Button>
                
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => window.location.href = '/app/insta-scan'}
                  className="h-6 w-6"
                >
                  <ScanLine className="w-3.5 h-3.5" />
                </Button>
                
                {isSpeechSupported && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={toggleListening}
                    className={cn("h-6 w-6", isListening && "text-destructive")}
                  >
                    {isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                  </Button>
                )}
              </div>
            </div>
            
            <Button
              onClick={sendMessage}
              disabled={(!inputMessage.trim() && !uploadedImage) || isLoading}
              size="icon"
              className="h-9 w-9 rounded-xl bg-primary hover:bg-primary/90 shadow-lg"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}