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
import { 
  Send, Mic, MicOff, Camera, ImageIcon, Volume2, VolumeX,
  Bot, User, Loader2, X, Plus, ChevronLeft, ChevronRight,
  Wheat, Trees, Flower2, Sprout, Leaf, TreePine,
  CloudRain, Sun, Wind, Thermometer, Droplets,
  Bug, Pill, BarChart, Calendar, MapPin, AlertCircle,
  Check, Sparkles, Zap, MessageSquare, ScanLine,
  Layers, Target, Activity, TrendingUp
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
  actionButtons?: {
    label: string;
    action: string;
    icon?: any;
  }[];
  metadata?: any;
}

interface Land {
  id: string;
  name: string;
  area_acres?: number;
  primary_crop?: string;
  soil_type?: string;
  location?: string;
  irrigation_type?: string;
  health_score?: number;
  ndvi?: number;
  weather_alerts?: number;
  pest_alerts?: number;
  [key: string]: any;
}

interface QuickPrompt {
  icon: any;
  label: string;
  prompt: string;
  category: string;
  color: string;
}

const cropIcons: Record<string, any> = {
  wheat: Wheat,
  rice: Sprout,
  cotton: Flower2,
  sugarcane: TreePine,
  vegetables: Leaf,
  fruits: Trees,
  default: Sprout
};

const getCropIcon = (cropType?: string) => {
  if (!cropType) return cropIcons.default;
  const crop = cropType.toLowerCase();
  for (const [key, icon] of Object.entries(cropIcons)) {
    if (crop.includes(key)) return icon;
  }
  return cropIcons.default;
};

const getHealthColor = (score?: number) => {
  if (!score) return 'text-muted-foreground';
  if (score >= 80) return 'text-success';
  if (score >= 60) return 'text-warning';
  return 'text-destructive';
};

const getHealthBadge = (score?: number) => {
  if (!score) return { label: 'Unknown', color: 'secondary' };
  if (score >= 80) return { label: 'Excellent', color: 'default' };
  if (score >= 60) return { label: 'Good', color: 'secondary' };
  return { label: 'Needs Attention', color: 'destructive' };
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
  const [showQuickPrompts, setShowQuickPrompts] = useState(true);
  
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const landScrollRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);

  // Quick prompts organized by category
  const quickPrompts: QuickPrompt[] = [
    { icon: CloudRain, label: 'Weather Forecast', prompt: 'What is the weather forecast for the next 7 days for my farm?', category: 'weather', color: 'bg-blue-500/10 text-blue-600' },
    { icon: Bug, label: 'Pest Control', prompt: 'How can I control pests in my crops?', category: 'pest', color: 'bg-red-500/10 text-red-600' },
    { icon: Pill, label: 'Fertilizer Guide', prompt: 'What fertilizers should I use and when?', category: 'fertilizer', color: 'bg-green-500/10 text-green-600' },
    { icon: Droplets, label: 'Irrigation Schedule', prompt: 'When and how much should I irrigate my crops?', category: 'water', color: 'bg-cyan-500/10 text-cyan-600' },
    { icon: BarChart, label: 'Yield Prediction', prompt: 'What is the expected yield for my crops?', category: 'analytics', color: 'bg-purple-500/10 text-purple-600' },
    { icon: Calendar, label: 'Crop Calendar', prompt: 'Show me the complete crop calendar and activities', category: 'schedule', color: 'bg-orange-500/10 text-orange-600' }
  ];

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
        content: t('chat.welcome', `Hello! I'm your AI farming assistant. I can help you with weather forecasts, pest control, fertilizer recommendations, and much more. Select a land above to get specific advice, or ask me anything about farming!`),
        timestamp: new Date(),
        suggestions: ['Check weather', 'Pest control tips', 'Fertilizer guide', 'Crop calendar']
      };
      setMessages([welcomeMessage]);
    }
  }, [user]);

  // Auto-scroll to bottom
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load user's lands
  const loadLands = async () => {
    try {
      if (!user?.id) return;
      
      // Use fetch API to avoid TypeScript depth issues
      const fetchLands = async () => {
        const result = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL || 'https://qfklkkzxemsbeniyugiz.supabase.co'}/rest/v1/lands?farmer_id=eq.${user.id}&is_deleted=eq.false&order=created_at.desc`,
          {
            headers: {
              'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFma2xra3p4ZW1zYmVuaXl1Z2l6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0MjcxNjUsImV4cCI6MjA2ODAwMzE2NX0.dUnGp7wbwYom1FPbn_4EGf3PWjgmr8mXwL2w2SdYOh4',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFma2xra3p4ZW1zYmVuaXl1Z2l6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0MjcxNjUsImV4cCI6MjA2ODAwMzE2NX0.dUnGp7wbwYom1FPbn_4EGf3PWjgmr8mXwL2w2SdYOh4'}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        if (result.ok) {
          return await result.json();
        }
        return null;
      };

      const landsData = await fetchLands();
      
      if (landsData && Array.isArray(landsData)) {
        // Add mock data for demo
        const enhancedLands = landsData.map((land: any) => ({
          id: land.id,
          name: land.name,
          area_acres: land.area_acres,
          primary_crop: land.primary_crop,
          soil_type: land.soil_type,
          location: land.location,
          irrigation_type: land.irrigation_type,
          health_score: Math.floor(Math.random() * 40) + 60,
          ndvi: Math.random() * 0.4 + 0.6,
          weather_alerts: Math.floor(Math.random() * 3),
          pest_alerts: Math.floor(Math.random() * 2)
        }));
        
        setLands(enhancedLands);
        
        // Cache for offline
        if (enhancedLands.length > 0) {
          localStorage.setItem('cached_lands_ai', JSON.stringify(enhancedLands));
        }
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
    setShowQuickPrompts(false);
    
    if (land) {
      const contextMessage: Message = {
        id: crypto.randomUUID(),
        role: 'system',
        content: `Context switched to ${land.name}`,
        timestamp: new Date()
      };
      
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `I'm now focused on your ${land.name} farm. This is a ${land.area || 'N/A'} acre ${land.crop_type || 'mixed crop'} farm with ${land.soil_type || 'unspecified'} soil. How can I help you optimize this land?`,
        timestamp: new Date(),
        landId: land.id,
        landName: land.name,
        actionButtons: [
          { label: 'Check Health', action: 'health', icon: Activity },
          { label: 'Weather Alert', action: 'weather', icon: CloudRain },
          { label: 'Pest Status', action: 'pest', icon: Bug },
          { label: 'Recommendations', action: 'recommend', icon: Sparkles }
        ]
      };
      
      setMessages(prev => [...prev, contextMessage, assistantMessage]);
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
    setShowQuickPrompts(false);

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

  // Handle quick prompt selection
  const handleQuickPrompt = (prompt: string) => {
    setInputMessage(prompt);
    setShowQuickPrompts(false);
  };

  // Handle action button clicks
  const handleActionButton = (action: string) => {
    const actionPrompts: Record<string, string> = {
      health: `Analyze the health status of my ${selectedLand?.name} farm and provide recommendations`,
      weather: `What are the weather conditions and alerts for my ${selectedLand?.name} farm?`,
      pest: `Check for pest risks and provide prevention measures for my ${selectedLand?.crop_type} crops`,
      recommend: `Give me personalized recommendations for my ${selectedLand?.name} farm based on current conditions`
    };
    
    setInputMessage(actionPrompts[action] || '');
    if (actionPrompts[action]) {
      sendMessage();
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

  // Scroll lands horizontally
  const scrollLands = (direction: 'left' | 'right') => {
    if (landScrollRef.current) {
      const scrollAmount = 200;
      landScrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Modern Header with Land Selection */}
      <div className="bg-background/95 backdrop-blur-lg border-b shadow-sm">
        {/* AI Assistant Header */}
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
                <Bot className="w-6 h-6 text-primary-foreground" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-success rounded-full border-2 border-background" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">AI Farm Assistant</h1>
              <p className="text-xs text-muted-foreground">
                {selectedLand ? `Analyzing ${selectedLand.name}` : 'Select a land for specific advice'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {voiceEnabled && isTTSSupported && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setVoiceEnabled(!voiceEnabled)}
                className="h-8 w-8"
              >
                {isSpeaking ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </Button>
            )}
            <Badge variant={isOnline ? 'default' : 'secondary'} className="text-xs">
              {isOnline ? 'Online' : 'Offline'}
            </Badge>
          </div>
        </div>

        {/* Land Selection Carousel */}
        <div className="relative px-2 pb-3">
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => scrollLands('left')}
              className="h-8 w-8 shrink-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            
            <div 
              ref={landScrollRef}
              className="flex gap-2 overflow-x-auto scrollbar-hide scroll-smooth flex-1"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {/* All Lands Option */}
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => selectLand(null)}
                className={cn(
                  "shrink-0 px-4 py-2 rounded-xl border-2 transition-all",
                  !selectedLand 
                    ? "bg-primary text-primary-foreground border-primary shadow-lg" 
                    : "bg-card border-border hover:border-primary/50"
                )}
              >
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4" />
                  <span className="font-medium text-sm">All Lands</span>
                </div>
              </motion.button>

              {/* Individual Land Cards */}
              {lands.map((land) => {
                const Icon = getCropIcon(land.crop_type);
                const healthBadge = getHealthBadge(land.health_score);
                const isSelected = selectedLand?.id === land.id;
                
                return (
                  <motion.button
                    key={land.id}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => selectLand(land)}
                    className={cn(
                      "shrink-0 min-w-[180px] p-3 rounded-xl border-2 transition-all",
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary shadow-lg"
                        : "bg-card border-border hover:border-primary/50"
                    )}
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4" />
                          <span className="font-semibold text-sm truncate max-w-[100px]">
                            {land.name}
                          </span>
                        </div>
                        <Badge 
                          variant={isSelected ? 'secondary' : healthBadge.color as any}
                          className="text-xs px-1.5 py-0"
                        >
                          {land.health_score}%
                        </Badge>
                      </div>
                      
                      <div className="flex items-center gap-3 text-xs">
                        <span className={cn("flex items-center gap-1", isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                          <MapPin className="w-3 h-3" />
                          {land.area || 'N/A'} acres
                        </span>
                        {land.weather_alerts && land.weather_alerts > 0 && (
                          <span className="flex items-center gap-1 text-warning">
                            <AlertCircle className="w-3 h-3" />
                            {land.weather_alerts}
                          </span>
                        )}
                        {land.pest_alerts && land.pest_alerts > 0 && (
                          <span className="flex items-center gap-1 text-destructive">
                            <Bug className="w-3 h-3" />
                            {land.pest_alerts}
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2 text-xs">
                        <span className={cn("truncate", isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                          {land.crop_type || 'No crop'} • {land.soil_type || 'Unknown soil'}
                        </span>
                      </div>
                    </div>
                  </motion.button>
                );
              })}

              {/* Add New Land */}
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => window.location.href = '/lands/add'}
                className="shrink-0 min-w-[120px] p-3 rounded-xl border-2 border-dashed border-border hover:border-primary/50 bg-card/50"
              >
                <div className="flex flex-col items-center justify-center gap-1 py-2">
                  <Plus className="w-5 h-5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Add Land</span>
                </div>
              </motion.button>
            </div>

            <Button
              size="icon"
              variant="ghost"
              onClick={() => scrollLands('right')}
              className="h-8 w-8 shrink-0"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Chat Messages Area */}
      <ScrollArea className="flex-1 px-4" ref={scrollAreaRef}>
        <div className="py-4 space-y-4 max-w-3xl mx-auto">
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
                      
                      {message.actionButtons && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {message.actionButtons.map((button, idx) => {
                            const Icon = button.icon;
                            return (
                              <Button
                                key={idx}
                                size="sm"
                                variant={message.role === 'user' ? 'secondary' : 'outline'}
                                onClick={() => handleActionButton(button.action)}
                                className="text-xs"
                              >
                                {Icon && <Icon className="w-3 h-3 mr-1" />}
                                {button.label}
                              </Button>
                            );
                          })}
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

      {/* Quick Prompts */}
      <AnimatePresence>
        {showQuickPrompts && messages.length <= 1 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="px-4 pb-2"
          >
            <div className="grid grid-cols-2 gap-2 max-w-3xl mx-auto">
              {quickPrompts.slice(0, 4).map((prompt, idx) => {
                const Icon = prompt.icon;
                return (
                  <Button
                    key={idx}
                    variant="outline"
                    onClick={() => handleQuickPrompt(prompt.prompt)}
                    className={cn(
                      "h-auto p-3 justify-start text-left",
                      prompt.color
                    )}
                  >
                    <Icon className="w-4 h-4 mr-2 shrink-0" />
                    <span className="text-xs line-clamp-2">{prompt.label}</span>
                  </Button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modern Input Area */}
      <div className="border-t bg-background/95 backdrop-blur-lg">
        {uploadedImage && (
          <div className="px-4 pt-2">
            <div className="relative inline-block">
              <img 
                src={uploadedImage} 
                alt="Upload preview" 
                className="h-20 rounded-lg object-cover"
              />
              <Button
                size="icon"
                variant="destructive"
                onClick={() => setUploadedImage(null)}
                className="absolute -top-2 -right-2 h-6 w-6"
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          </div>
        )}
        
        <div className="p-4 max-w-3xl mx-auto">
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
                className="w-full min-h-[44px] max-h-[120px] px-4 py-2.5 pr-24 rounded-2xl border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground text-sm"
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
                  className="h-7 w-7"
                >
                  <ImageIcon className="w-4 h-4" />
                </Button>
                
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => window.location.href = '/app/insta-scan'}
                  className="h-7 w-7"
                >
                  <ScanLine className="w-4 h-4" />
                </Button>
                
                {isSpeechSupported && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={toggleListening}
                    className={cn("h-7 w-7", isListening && "text-destructive")}
                  >
                    {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </Button>
                )}
              </div>
            </div>
            
            <Button
              onClick={sendMessage}
              disabled={(!inputMessage.trim() && !uploadedImage) || isLoading}
              size="icon"
              className="h-11 w-11 rounded-xl bg-primary hover:bg-primary/90 shadow-lg"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}