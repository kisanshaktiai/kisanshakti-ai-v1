import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
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
  Paperclip, Smile, MoreVertical, Copy, Type, Trees,
  ThumbsUp, ThumbsDown, RefreshCw, Download, Share2, Maximize2, Zap,
  Shield, Heart, Star, TrendingUp, Clock, Calendar, ArrowUp, Plus,
  Bug, Droplets, Info, PlayCircle, PauseCircle, ChevronRight, Minus, Bookmark
} from 'lucide-react';
import { format } from 'date-fns';
import { localDB } from '@/services/localDB';
import { WaveformVisualizer } from './WaveformVisualizer';
import { MessageSkeleton } from './MessageSkeleton';
import { ResponseSectionCard } from './ResponseSectionCard';
import { FeedbackDialog } from './FeedbackDialog';

// Crop to Emoji Mapping
const cropEmojiMap: Record<string, string> = {
  'Wheat': '🌾',
  'Rice': '🍚',
  'Corn': '🌽',
  'Maize': '🌽',
  'Sugarcane': '🎋',
  'Cotton': '🌿',
  'Soybean': '🫘',
  'Chickpea': '🫘',
  'Potato': '🥔',
  'Tomato': '🍅',
  'Onion': '🧅',
  'Cabbage': '🥬',
  'Carrot': '🥕',
  'Sunflower': '🌻',
  'Groundnut': '🥜',
  'Peanut': '🥜'
};

// Agronomic Term Highlighting
const agronomicTerms = [
  'NDVI', 'ETL', 'Trichoderma', 'IPM', 'Neem', 'NPK', 
  'Vermicompost', 'FYM', 'Mulching', 'Fertigation', 'GDD'
];

// Enhanced Markdown Renderer with Crop Emojis and Term Highlighting
const renderMarkdown = (text: string): React.ReactNode => {
  if (!text) return null;

  // Add crop emojis to text
  let enhancedText = text;
  Object.entries(cropEmojiMap).forEach(([crop, emoji]) => {
    const regex = new RegExp(`\\b${crop}\\b`, 'gi');
    enhancedText = enhancedText.replace(regex, `${crop} ${emoji}`);
  });

  // Add color-coded section styling for emojis with bold text
  enhancedText = enhancedText
    .replace(/🟢\s*\*\*([^*]+)\*\*/g, '<span class="text-emerald-600 dark:text-emerald-400 font-bold">🟢 $1</span>')
    .replace(/🟡\s*\*\*([^*]+)\*\*/g, '<span class="text-amber-600 dark:text-amber-400 font-bold">🟡 $1</span>')
    .replace(/🔴\s*\*\*([^*]+)\*\*/g, '<span class="text-rose-600 dark:text-rose-400 font-bold">🔴 $1</span>')
    .replace(/🟣\s*\*\*([^*]+)\*\*/g, '<span class="text-purple-600 dark:text-purple-400 font-bold">🟣 $1</span>')
    .replace(/🔵\s*\*\*([^*]+)\*\*/g, '<span class="text-blue-600 dark:text-blue-400 font-bold">🔵 $1</span>')
    // Handle ALL remaining bold text (not just emoji-prefixed)
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>');

  return (
    <ReactMarkdown
      rehypePlugins={[rehypeRaw]}
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({node, ...props}) => <h1 className="text-2xl font-bold mt-4 mb-2 first:mt-0 text-foreground" {...props} />,
        h2: ({node, ...props}) => <h2 className="text-xl font-bold mt-4 mb-2 first:mt-0 text-foreground" {...props} />,
        h3: ({node, ...props}) => <h3 className="text-lg font-semibold mt-3 mb-2 first:mt-0 text-foreground" {...props} />,
        ul: ({node, ...props}) => <ul className="list-disc list-inside my-2 space-y-1" {...props} />,
        ol: ({node, ...props}) => <ol className="list-decimal list-inside my-2 space-y-1" {...props} />,
        li: ({node, ...props}) => <li className="ml-2" {...props} />,
        table: ({node, ...props}) => (
          <div className="overflow-x-auto my-3">
            <table className="min-w-full border border-border rounded-lg overflow-hidden" {...props} />
          </div>
        ),
        thead: ({node, ...props}) => <thead className="bg-emerald-100 dark:bg-emerald-900/40" {...props} />,
        th: ({node, ...props}) => <th className="px-3 py-2 border border-border font-semibold text-left" {...props} />,
        td: ({node, ...props}) => <td className="px-3 py-2 border border-border" {...props} />,
        strong: ({node, ...props}) => <strong className="font-semibold text-foreground" {...props} />,
        em: ({node, ...props}) => <em className="italic text-muted-foreground" {...props} />,
        p: ({node, ...props}) => <p className="my-2 leading-relaxed" {...props} />,
        hr: ({node, ...props}) => <hr className="my-4 border-t-2 border-emerald-200 dark:border-emerald-800" {...props} />,
        blockquote: ({node, ...props}) => (
          <blockquote className="border-l-4 border-primary/50 pl-4 italic my-2 text-muted-foreground" {...props} />
        ),
        code: ({node, inline, ...props}: any) => 
          inline ? (
            <code className="px-1.5 py-0.5 rounded bg-muted/60 text-xs font-mono text-foreground" {...props} />
          ) : (
            <code className="block p-3 rounded-lg bg-muted/60 overflow-x-auto text-xs font-mono my-2" {...props} />
          )
      }}
    >
      {enhancedText}
    </ReactMarkdown>
  );
};

// Contextual Prompt Generator based on AI response
const generateContextualPrompts = (lastMessage: string): string[] => {
  const prompts: string[] = [];
  const lowerText = lastMessage.toLowerCase();

  // Pest-related
  if (lowerText.includes('pest') || lowerText.includes('insect')) {
    prompts.push('Show pest-specific organic spray schedule');
    prompts.push('What are natural predators for this pest?');
  }
  
  // Disease-related
  if (lowerText.includes('disease') || lowerText.includes('fungus')) {
    prompts.push('Give preventive measures for this disease');
    prompts.push('Recommend organic fungicide alternatives');
  }
  
  // Soil-related
  if (lowerText.includes('soil') || lowerText.includes('nutrient')) {
    prompts.push('Give organic soil booster plan');
    prompts.push('Show NPK ratio for my crop');
  }
  
  // NDVI/Crop health
  if (lowerText.includes('ndvi') || lowerText.includes('stress') || lowerText.includes('health')) {
    prompts.push('Show crop stress alert zones');
    prompts.push('Explain NDVI interpretation for my field');
  }
  
  // Water-related
  if (lowerText.includes('water') || lowerText.includes('irrigation')) {
    prompts.push('Give weather-based irrigation schedule');
    prompts.push('Calculate water requirement per acre');
  }
  
  // Fertilizer-related
  if (lowerText.includes('fertilizer') || lowerText.includes('npk')) {
    prompts.push('Show precision fertilizer application timeline');
    prompts.push('Organic vs synthetic fertilizer comparison');
  }
  
  // Harvest/Yield
  if (lowerText.includes('harvest') || lowerText.includes('yield')) {
    prompts.push('Optimal harvest timing and indicators');
    prompts.push('Post-harvest storage best practices');
  }

  // Default prompts if no specific matches
  if (prompts.length === 0) {
    prompts.push('What should I do next for my crop?');
    prompts.push('Any weather alerts to watch for?');
    prompts.push('Show current crop growth stage advice');
  }

  return prompts.slice(0, 5); // Max 5 prompts
};

// Parse AI response into colored sections
interface ParsedSection {
  emoji: string;
  title: string;
  content: string;
  sectionType: 'organic' | 'fertilizer' | 'pest' | 'water' | 'income' | 'other';
}

const parseAIResponseIntoSections = (content: string): ParsedSection[] => {
  const sections: ParsedSection[] = [];
  
  // Define section patterns with their types
  const sectionPatterns = [
    { emoji: '🟢', type: 'organic' as const, keywords: ['organic', 'natural', 'biological'] },
    { emoji: '🟡', type: 'fertilizer' as const, keywords: ['fertilizer', 'nutrient', 'npk'] },
    { emoji: '🔴', type: 'pest' as const, keywords: ['pest', 'disease', 'alert', 'critical'] },
    { emoji: '🔵', type: 'water' as const, keywords: ['water', 'irrigation', 'rainfall'] },
    { emoji: '🟣', type: 'income' as const, keywords: ['income', 'market', 'price', 'profit'] }
  ];
  
  // Split content by emoji markers
  const emojiRegex = /[🟢🟡🔴🔵🟣]\s*([^\n]+)\n([\s\S]*?)(?=[🟢🟡🔴🔵🟣]|$)/g;
  let match;
  
  while ((match = emojiRegex.exec(content)) !== null) {
    const emoji = match[0][0]; // First character is the emoji
    const title = match[1].trim().replace(/\*\*/g, ''); // Remove ** from title
    const sectionContent = match[2].trim();
    
    // Determine section type based on emoji
    const pattern = sectionPatterns.find(p => p.emoji === emoji);
    const sectionType = pattern?.type || 'other';
    
    sections.push({
      emoji,
      title,
      content: sectionContent,
      sectionType
    });
  }
  
  // If no sections found, return the whole content as one section
  if (sections.length === 0) {
    sections.push({
      emoji: '💬',
      title: 'Response',
      content: content,
      sectionType: 'other'
    });
  }
  
  return sections;
};

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
  isReading?: boolean;
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

// Enhanced Quick Actions Component
const QuickActions = ({ onActionClick, collapsed = false }: { onActionClick: (action: string) => void; collapsed?: boolean }) => {
  const quickActions = [
    { 
      icon: CloudRain, 
      label: 'Weather', 
      query: 'What\'s the weather forecast?',
      gradient: 'from-blue-400 to-blue-600',
      description: 'Get weather updates'
    },
    { 
      icon: Wheat, 
      label: 'Crop Care', 
      query: 'How to care for my crops?',
      gradient: 'from-green-400 to-green-600',
      description: 'Crop management tips'
    },
    { 
      icon: Bug, 
      label: 'Pest Control', 
      query: 'How to control pests?',
      gradient: 'from-orange-400 to-orange-600',
      description: 'Pest solutions'
    },
    { 
      icon: Droplets, 
      label: 'Fertilizer', 
      query: 'Which fertilizer to use?',
      gradient: 'from-purple-400 to-purple-600',
      description: 'Fertilizer guidance'
    },
  ];

  if (collapsed) {
    return (
      <div className="flex gap-2 p-3 overflow-x-auto no-scrollbar">
        {quickActions.map((action, idx) => (
          <motion.button
            key={idx}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05, type: "spring", stiffness: 300 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onActionClick(action.query)}
            className="p-2 rounded-full bg-gradient-to-r shadow-lg hover:shadow-xl transition-all backdrop-blur-sm"
            style={{
              background: `linear-gradient(135deg, ${action.gradient.split(' ')[1]}, ${action.gradient.split(' ')[3]})`
            }}
          >
            <action.icon className="w-4 h-4 text-white" />
          </motion.button>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 p-4">
      {quickActions.map((action, idx) => (
        <motion.button
          key={idx}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ 
            delay: idx * 0.05, 
            type: "spring", 
            stiffness: 300,
            damping: 20 
          }}
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onActionClick(action.query)}
          className={cn(
            "relative overflow-hidden rounded-2xl p-4",
            "bg-gradient-to-br backdrop-blur-md",
            "border border-white/20 shadow-lg hover:shadow-xl",
            "transition-all duration-300"
          )}
        >
          <div className={cn(
            "absolute inset-0 bg-gradient-to-br opacity-90",
            action.gradient
          )} />
          <div className="relative z-10 flex flex-col items-center gap-2">
            <div className="p-3 rounded-full bg-white/20 backdrop-blur-sm">
              <action.icon className="w-6 h-6 text-white" />
            </div>
            <span className="text-sm font-semibold text-white">{action.label}</span>
            <span className="text-xs text-white/80 text-center">{action.description}</span>
          </div>
        </motion.button>
      ))}
    </div>
  );
};

// Enhanced Typing Indicator with Breathing Avatar Animation
const TypingIndicator = () => (
  <motion.div 
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: -20 }}
    className="flex items-start gap-3 px-4 py-2"
  >
    <motion.div
      animate={{
        scale: [1, 1.1, 1],
      }}
      transition={{
        duration: 2,
        repeat: Infinity,
        ease: "easeInOut"
      }}
    >
      <Avatar className="w-8 h-8 ring-2 ring-primary/20">
        <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-green-600">
          <Bot className="w-4 h-4 text-white" />
        </AvatarFallback>
      </Avatar>
    </motion.div>
    <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-white/80 dark:bg-gray-800/80 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50">
      <div className="flex items-center gap-1.5">
        {[0, 0.2, 0.4].map((delay, i) => (
          <motion.div
            key={i}
            className="w-2 h-2 rounded-full bg-gradient-to-br from-emerald-500 to-green-600"
            animate={{
              scale: [1, 1.5, 1],
              opacity: [0.5, 1, 0.5],
            }}
            transition={{
              duration: 1,
              repeat: Infinity,
              delay,
              ease: "easeInOut"
            }}
          />
        ))}
      </div>
    </div>
  </motion.div>
);

// Land Welcome Card
const LandWelcomeCard = ({ land }: { land: Land }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="mx-4 mt-4 p-4 rounded-2xl bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800"
  >
    <div className="flex items-start gap-3">
      <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/50">
        <Trees className="w-5 h-5 text-green-600 dark:text-green-400" />
      </div>
      <div className="flex-1">
        <h3 className="font-semibold text-green-900 dark:text-green-100">{land.name}</h3>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          {land.area_acres && (
            <div className="flex items-center gap-1 text-green-700 dark:text-green-300">
              <Layers className="w-3 h-3" />
              <span>{land.area_acres} acres</span>
            </div>
          )}
          {land.primary_crop && (
            <div className="flex items-center gap-1 text-green-700 dark:text-green-300">
              <Wheat className="w-3 h-3" />
              <span>{land.primary_crop}</span>
            </div>
          )}
          {land.soil_type && (
            <div className="flex items-center gap-1 text-green-700 dark:text-green-300">
              <Sprout className="w-3 h-3" />
              <span>{land.soil_type}</span>
            </div>
          )}
          {land.location && (
            <div className="flex items-center gap-1 text-green-700 dark:text-green-300">
              <MapPin className="w-3 h-3" />
              <span>{land.location}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  </motion.div>
);

// Enhanced Message Bubble Component with Modern 2030 Design
const MessageBubble = ({ 
  message, 
  onFeedback, 
  onSpeak,
  onCopy,
  onShare,
  onSave,
  onAskAgain,
  isSpeaking,
  fontSize 
}: { 
  message: Message; 
  onFeedback: (id: string, feedback: 'positive' | 'negative') => void;
  onSpeak: (id: string, content: string) => void;
  onCopy: (content: string) => void;
  onShare: (content: string) => void;
  onSave: (content: string) => void;
  onAskAgain: (content: string) => void;
  isSpeaking: boolean;
  fontSize: number;
}) => {
  const isUser = message.role === 'user';
  const [expanded, setExpanded] = useState(false);
  const shouldTruncate = message.content.length > 500;
  const displayContent = expanded || !shouldTruncate 
    ? message.content 
    : message.content.slice(0, 500) + '...';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className={cn(
        "flex gap-2 px-3 py-2 group",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      {/* Avatar with Speaking Animation */}
      {!isUser && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ 
            scale: isSpeaking ? [1, 1.15, 1] : 1
          }}
          transition={{ 
            delay: 0.1, 
            type: "spring",
            duration: isSpeaking ? 0.8 : 0.3,
            repeat: isSpeaking ? Infinity : 0
          }}
          className="flex-shrink-0 mt-1"
        >
          <Avatar className={cn(
            "w-9 h-9 ring-2 shadow-md transition-all",
            isSpeaking ? "ring-emerald-500 ring-4" : "ring-primary/10"
          )}>
            <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-green-600">
              <Bot className="w-5 h-5 text-white" />
            </AvatarFallback>
          </Avatar>
        </motion.div>
      )}

      {/* Message Content Container */}
      <div className={cn(
        "flex flex-col gap-2 max-w-[85%] min-w-[200px]",
        isUser && "items-end"
      )}>
        {/* Message Bubble */}
        <motion.div
          whileHover={{ scale: 1.005 }}
          className={cn(
            "relative px-4 py-3 rounded-3xl shadow-lg",
            "transition-all duration-300",
            isUser ? [
              "rounded-tr-md bg-gradient-to-br from-primary via-primary-600 to-primary-700",
              "text-white shadow-primary/20"
            ] : [
              "rounded-tl-md bg-gradient-to-br from-white to-gray-50",
              "dark:from-gray-800 dark:to-gray-850",
              "border border-gray-100 dark:border-gray-700/50",
              "shadow-gray-200/50 dark:shadow-gray-900/50"
            ]
          )}
          style={{ fontSize: `${fontSize}px`, lineHeight: '1.6' }}
        >
          {/* Content with Markdown Rendering or Section Cards */}
          <div className={cn(
            "break-words whitespace-pre-wrap",
            !isUser && "text-gray-800 dark:text-gray-100"
          )}>
            {isUser ? (
              displayContent
            ) : (
              (() => {
                // Parse AI response into sections
                const sections = parseAIResponseIntoSections(displayContent);
                
                // If we have multiple sections with emoji markers, render as cards
                if (sections.length > 1 || (sections.length === 1 && sections[0].emoji !== '💬')) {
                  return (
                    <div className="space-y-3 -mx-4 -my-3">
                      {sections.map((section, idx) => (
                        <ResponseSectionCard
                          key={idx}
                          emoji={section.emoji}
                          title={section.title}
                          content={section.content}
                          sectionType={section.sectionType}
                          isExpanded={idx === 0} // First section expanded by default
                        />
                      ))}
                    </div>
                  );
                }
                
                // Otherwise render as normal markdown
                return renderMarkdown(displayContent);
              })()
            )}
          </div>

          {shouldTruncate && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setExpanded(!expanded)}
              className={cn(
                "mt-3 text-xs font-semibold underline",
                isUser ? "text-white/90" : "text-primary"
              )}
            >
              {expanded ? '↑ Show less' : '↓ Read more'}
            </motion.button>
          )}

          {/* Attachments */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-3 space-y-2">
              {message.attachments.map((attachment, idx) => (
                <motion.div 
                  key={idx} 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="rounded-2xl overflow-hidden shadow-md"
                >
                  {attachment.type === 'image' ? (
                    <img 
                      src={attachment.url} 
                      alt={attachment.name}
                      className="max-w-full rounded-2xl"
                    />
                  ) : (
                    <div className="flex items-center gap-2 p-3 bg-white/20 rounded-xl">
                      <Paperclip className="w-4 h-4" />
                      <span className="text-xs">{attachment.name}</span>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Timestamp */}
        <div className={cn(
          "flex items-center gap-1.5 px-2",
          isUser ? "justify-end" : "justify-start"
        )}>
          <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">
            {format(message.timestamp, 'h:mm a')}
          </span>
          {message.status === 'sent' && isUser && (
            <Check className="w-3 h-3 text-green-500" />
          )}
        </div>

        {/* Action Buttons Below Message - AI Messages Only */}
        {!isUser && (
          <motion.div 
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex items-center gap-1.5 px-2 flex-wrap"
          >
            {/* Read Aloud Button */}
            <motion.button
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onSpeak(message.id, message.content)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all text-xs font-medium shadow-sm",
                isSpeaking 
                  ? "bg-emerald-600 text-white shadow-emerald-500/30" 
                  : "bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700"
              )}
            >
              {isSpeaking ? (
                <>
                  <PauseCircle className="w-3.5 h-3.5" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <PlayCircle className="w-3.5 h-3.5" />
                  <span>Read</span>
                </>
              )}
            </motion.button>

            {/* Copy Button */}
            <motion.button
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onCopy(message.content)}
              className="p-2 rounded-full bg-white dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-gray-200 dark:border-gray-700 transition-all shadow-sm"
              title="Copy"
            >
              <Copy className="w-3.5 h-3.5" />
            </motion.button>

            {/* Save Advice Button */}
            <motion.button
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onSave(message.content)}
              className="p-2 rounded-full bg-white dark:bg-gray-800 hover:bg-amber-50 dark:hover:bg-amber-900/20 border border-gray-200 dark:border-gray-700 transition-all shadow-sm"
              title="Save Advice"
            >
              <Bookmark className="w-3.5 h-3.5" />
            </motion.button>

            {/* Ask Again Button */}
            <motion.button
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onAskAgain(message.content)}
              className="p-2 rounded-full bg-white dark:bg-gray-800 hover:bg-purple-50 dark:hover:bg-purple-900/20 border border-gray-200 dark:border-gray-700 transition-all shadow-sm"
              title="Ask Again"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </motion.button>

            {/* Share Button */}
            <motion.button
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onShare(message.content)}
              className="p-2 rounded-full bg-white dark:bg-gray-800 hover:bg-green-50 dark:hover:bg-green-900/20 border border-gray-200 dark:border-gray-700 transition-all shadow-sm"
              title="Share"
            >
              <Share2 className="w-3.5 h-3.5" />
            </motion.button>

            {/* Like Button */}
            <motion.button
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onFeedback(message.id, 'positive')}
              className={cn(
                "p-2 rounded-full transition-all shadow-sm",
                message.feedback === 'positive' 
                  ? "bg-green-500 text-white" 
                  : "bg-white dark:bg-gray-800 hover:bg-green-50 dark:hover:bg-green-900/20 border border-gray-200 dark:border-gray-700"
              )}
              title="Like"
            >
              <ThumbsUp className={cn(
                "w-3.5 h-3.5",
                message.feedback === 'positive' && "fill-current"
              )} />
            </motion.button>

            {/* Dislike Button */}
            <motion.button
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onFeedback(message.id, 'negative')}
              className={cn(
                "p-2 rounded-full transition-all shadow-sm",
                message.feedback === 'negative' 
                  ? "bg-red-500 text-white" 
                  : "bg-white dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-900/20 border border-gray-200 dark:border-gray-700"
              )}
              title="Dislike"
            >
              <ThumbsDown className={cn(
                "w-3.5 h-3.5",
                message.feedback === 'negative' && "fill-current"
              )} />
            </motion.button>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};

// Font Size Control Component
const FontSizeControl = ({ fontSize, onChange }: { fontSize: number; onChange: (size: number) => void }) => (
  <motion.div
    initial={{ scale: 0 }}
    animate={{ scale: 1 }}
    className="fixed bottom-24 right-4 z-50 bg-white dark:bg-gray-800 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 p-2 flex items-center gap-2"
  >
    <button
      onClick={() => onChange(Math.max(12, fontSize - 2))}
      className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
    >
      <Minus className="w-4 h-4" />
    </button>
    <span className="px-2 text-sm font-medium min-w-[3rem] text-center">{fontSize}px</span>
    <button
      onClick={() => onChange(Math.min(24, fontSize + 2))}
      className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
    >
      <Plus className="w-4 h-4" />
    </button>
  </motion.div>
);

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
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [showQuickActions, setShowQuickActions] = useState(true);
  const [fontSize, setFontSize] = useState(14);
  const [showFontControl, setShowFontControl] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [offlineBannerVisible, setOfflineBannerVisible] = useState(false);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyLoadError, setHistoryLoadError] = useState<string | null>(null);
  
  // Persistent session ID management
  const [sessionId, setSessionId] = useState<string>(() => {
    const stored = localStorage.getItem('current_chat_session_id');
    return stored || crypto.randomUUID();
  });
  
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

  // Get audio stream for waveform visualization
  useEffect(() => {
    if (isListening) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => setAudioStream(stream))
        .catch(err => console.error('Error accessing microphone:', err));
    } else {
      if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
        setAudioStream(null);
      }
    }
  }, [isListening, audioStream]);

  // Persist session ID
  useEffect(() => {
    localStorage.setItem('current_chat_session_id', sessionId);
  }, [sessionId]);

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

  // Offline banner management
  useEffect(() => {
    if (!isOnline) {
      setOfflineBannerVisible(true);
    } else {
      setOfflineBannerVisible(false);
    }
  }, [isOnline]);

  // Initialize IndexedDB for offline caching
  useEffect(() => {
    localDB.initialize();
  }, []);

  // Load lands from API
  const loadLands = async () => {
    try {
      const lands = await landsApi.fetchLands();
      const validLands = lands.filter(land => land.id) as Land[];
      setLands(validLands);
    } catch (error) {
      console.error('Error loading lands:', error);
    }
  };

  // Load chat session for specific land with proper session ID management and isolation
  const loadChatSession = async (landId: string | null, retryCount = 0) => {
    setIsLoadingHistory(true);
    setHistoryLoadError(null);
    
    try {
      const { session } = useAuthStore.getState();
      if (!session?.farmerId || !session?.tenantId) {
        console.error('Missing session context:', session);
        setHistoryLoadError('Missing authentication context');
        setIsLoadingHistory(false);
        return;
      }

      console.log('Loading chat session for land:', landId, 'Session:', session);
      
      const searchLandId = landId || null;
      
      // Try to find existing session with STRICT isolation
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
          throw error;
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
          throw error;
        }
        existingSession = data;
      }

      if (existingSession) {
        // Use existing session ID
        setSessionId(existingSession.id);
        localStorage.setItem(`chat_session_${landId || 'general'}`, existingSession.id);
        
        // Load messages from database with STRICT isolation
        try {
          const { data: dbMessages, error: messagesError } = await supabase
            .from('ai_chat_messages')
            .select('*')
            .eq('session_id', existingSession.id)
            .eq('tenant_id', session.tenantId)  // ✓ Explicit tenant filter
            .eq('farmer_id', session.farmerId)  // ✓ Explicit farmer filter
            .order('created_at', { ascending: true });
          
          if (messagesError) {
            console.error('Error loading messages from DB:', messagesError);
            throw messagesError;
          } else if (dbMessages && dbMessages.length > 0) {
            // Convert database messages to UI format
            const formattedMessages = dbMessages.map((msg: any) => ({
              id: msg.id,
              role: msg.role,
              content: msg.content,
              timestamp: new Date(msg.created_at),
              attachments: msg.image_urls || msg.attachments || []
            }));
            setMessages(formattedMessages);
            // Update localStorage cache
            localStorage.setItem(`chat_messages_${landId || 'general'}`, JSON.stringify(formattedMessages));
            console.log(`Loaded ${formattedMessages.length} messages from database`);
          } else {
            setMessages([]);
            console.log('No messages found for this session');
          }
        } catch (e) {
          console.error('Error loading messages:', e);
          throw e;
        }
      } else {
        // Check if we have a stored session ID for this land
        const storedSessionId = localStorage.getItem(`chat_session_${landId || 'general'}`);
        const newSessionId = storedSessionId || crypto.randomUUID();
        
        // Create new session only if needed
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
          
        if (insertError && insertError.code !== '23505') { // Ignore duplicate key errors
          console.error('Error creating session:', insertError);
          throw insertError;
        } else {
          setSessionId(newSessionId);
          localStorage.setItem(`chat_session_${landId || 'general'}`, newSessionId);
          console.log('Created new session:', newSessionId);
        }
        
        setMessages([]);
        localStorage.removeItem(`chat_messages_${landId || 'general'}`);
      }
      
      setShowQuickActions(true);
      setIsLoadingHistory(false);
    } catch (error) {
      console.error('Error in loadChatSession:', error);
      setHistoryLoadError('Failed to load chat history');
      
      // Retry logic (max 2 retries)
      if (retryCount < 2) {
        console.log(`Retrying... (${retryCount + 1}/2)`);
        setTimeout(() => loadChatSession(landId, retryCount + 1), 1000);
      } else {
        setMessages([]);
        setIsLoadingHistory(false);
        toast({
          title: 'Failed to load chat history',
          description: 'Please try again',
          variant: 'destructive'
        });
      }
    }
  };

  // Select a land
  const selectLand = (land: Land | null) => {
    setSelectedLand(land);
    setMessages([]);
    setShowQuickActions(true);
  };

  // Handle text-to-speech
  const handleSpeak = (messageId: string, content: string) => {
    if (isSpeaking && speakingMessageId === messageId) {
      stop();
      setSpeakingMessageId(null);
    } else {
      stop(); // Stop any ongoing speech
      speak(content);
      setSpeakingMessageId(messageId);
    }
  };

  // Handle sending messages with proper session ID persistence
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
      
      // Validate session data
      if (!session?.farmerId || !session?.tenantId) {
        console.error('Missing session data:', session);
        toast({ title: t('chat.errors.sessionMissing'), variant: 'destructive' });
        setIsLoading(false);
        setIsTyping(false);
        return;
      }
      
      // Use the persistent session ID
      const currentSessionId = sessionId;
      
      // Prepare request body with messages array format
      const requestBody = {
        messages: [
          {
            role: 'user',
            content: textToSend
          }
        ],
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
          farmerId: session.farmerId,
          tenantId: session.tenantId,
          timestamp: new Date().toISOString()
        }
      };

      console.log('Sending message with session ID:', currentSessionId, 'and metadata:', requestBody.metadata);

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

      // Add AI response with contextual prompts
      const contextualPrompts = generateContextualPrompts(data.response);
      const finalSuggestions = data.quickReplies?.length > 0 
        ? data.quickReplies 
        : contextualPrompts;

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.response,
        timestamp: new Date(),
        landId: selectedLand?.id,
        landName: selectedLand?.name,
        suggestions: finalSuggestions,
        status: 'sent'
      };

      setMessages(prev => [...prev, assistantMessage]);
      
      // Cache AI response
      const updatedCache = JSON.parse(localStorage.getItem(`chat_messages_${selectedLand?.id || 'general'}`) || '[]');
      updatedCache.push(assistantMessage);
      localStorage.setItem(`chat_messages_${selectedLand?.id || 'general'}`, JSON.stringify(updatedCache));
      
      // Auto-speak response if enabled
      if (voiceEnabled && isTTSSupported) {
        speak(assistantMessage.content);
        setSpeakingMessageId(assistantMessage.id);
      }

    } catch (error) {
      console.error('Error sending message:', error);
      
      // Add error message with retry option
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: isOnline 
          ? '❌ I apologize, but I encountered an error. Please try again.'
          : '📵 You are offline. Some features may be limited.',
        timestamp: new Date(),
        status: 'error'
      };
      
      setMessages(prev => [...prev, errorMessage]);
      
      toast({
        title: t('common.error'),
        description: 'Failed to get AI response. Please retry.',
        variant: 'destructive',
        action: (
          <Button 
            size="sm" 
            onClick={() => sendMessage(textToSend)}
            className="bg-white text-red-600"
          >
            Retry
          </Button>
        )
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

  // Feedback dialog state
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [feedbackMessageId, setFeedbackMessageId] = useState<string | null>(null);
  const [feedbackType, setFeedbackType] = useState<'positive' | 'negative' | null>(null);

  // Handle message feedback (opens dialog)
  const handleFeedback = (messageId: string, feedback: 'positive' | 'negative') => {
    const message = messages.find(m => m.id === messageId);
    if (!message) return;

    // Update UI immediately
    setMessages(prev => prev.map(m => 
      m.id === messageId ? { ...m, feedback } : m
    ));

    // Open feedback dialog for optional comment
    setFeedbackMessageId(messageId);
    setFeedbackType(feedback);
    setFeedbackDialogOpen(true);
  };

  // Submit feedback with optional comment
  const submitFeedback = async (feedback: 'positive' | 'negative', comment?: string) => {
    if (!feedbackMessageId) return;

    const message = messages.find(m => m.id === feedbackMessageId);
    if (!message) return;

    try {
      const { session } = useAuthStore.getState();
      if (!session?.farmerId || !session?.tenantId) {
        toast({
          title: 'Error',
          description: 'Session information missing',
          variant: 'destructive'
        });
        return;
      }

      // Save feedback to database
      const { error: updateError } = await supabase
        .from('ai_chat_messages')
        .update({
          feedback_rating: feedback === 'positive' ? 5 : 1,
          feedback_text: comment,
          feedback_timestamp: new Date().toISOString(),
          is_training_candidate: feedback === 'positive' // Mark positive feedback as training candidate
        })
        .eq('id', feedbackMessageId);

      if (updateError) {
        console.error('Error saving feedback:', updateError);
        throw updateError;
      }

      // If positive feedback, trigger training data collection
      if (feedback === 'positive') {
        try {
          await supabase.functions.invoke('ai-agriculture-chat', {
            body: { 
              action: 'collect_training_data',
              messageId: feedbackMessageId,
              tenantId: session.tenantId,
              farmerId: session.farmerId
            }
          });
        } catch (trainingError) {
          console.error('Error triggering training data collection:', trainingError);
          // Don't show error to user - this is background work
        }
      }

      toast({
        description: '✅ Thank you for your feedback!',
        duration: 2000
      });
    } catch (error) {
      console.error('Error submitting feedback:', error);
      toast({
        title: 'Error',
        description: 'Failed to save feedback. Please try again.',
        variant: 'destructive'
      });
    }
  };

  // Handle copy message
  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content);
    toast({ 
      description: '✅ Copied to clipboard!',
      duration: 2000
    });
  };

  // Handle share message
  const handleShare = (content: string) => {
    if (navigator.share) {
      navigator.share({
        title: 'KisanShakti AI Advice',
        text: content
      }).catch(() => {
        handleCopy(content);
      });
    } else {
      handleCopy(content);
      toast({ 
        description: '✅ Copied! Share it with others.',
        duration: 2000
      });
    }
  };

  // Handle save advice to local storage
  const handleSave = async (content: string) => {
    try {
      const { session } = useAuthStore.getState();
      if (!session?.farmerId) return;

      // Save to IndexedDB using saveFarmerAlert
      await localDB.saveFarmerAlert({
        id: crypto.randomUUID(),
        farmer_id: session.farmerId,
        tenant_id: session.tenantId,
        land_id: selectedLand?.id || '',
        title: 'Saved AI Advice',
        message: content,
        alert_type: 'saved_advice',
        priority: 'low',
        ai_reasoning: null,
        action_required: null,
        data_source: { source: 'ai_chat', timestamp: new Date().toISOString() },
        schedule_id: null,
        is_read: false,
        is_actioned: false,
        actioned_at: null,
        expires_at: null,
        created_at: new Date().toISOString()
      });

      toast({
        description: '🪴 Advice saved successfully!',
        duration: 2000
      });
    } catch (error) {
      console.error('Error saving advice:', error);
      toast({
        description: '❌ Failed to save advice',
        variant: 'destructive'
      });
    }
  };

  // Handle ask again (re-prompt)
  const handleAskAgain = (content: string) => {
    // Extract the last user message that led to this response
    const lastUserMsg = messages.filter(m => m.role === 'user').pop();
    if (lastUserMsg) {
      sendMessage(lastUserMsg.content);
      toast({
        description: '🔄 Re-asking your question...',
        duration: 2000
      });
    }
  };

  // Common emojis for farmers
  const farmerEmojis = ['🌾', '🌱', '🌿', '🌻', '🌽', '🍅', '🥬', '☀️', '🌧️', '🚜', '👨‍🌾', '👩‍🌾'];

  return (
    <div className="flex flex-col h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950">
      {/* Offline Banner */}
      <AnimatePresence>
        {offlineBannerVisible && (
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className="bg-amber-500 text-white px-4 py-2 text-center text-sm font-medium"
          >
            📵 You are offline — messages will sync when connected
          </motion.div>
        )}
      </AnimatePresence>

      {/* Enhanced Sticky Header */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-md border-b border-gray-200/50 dark:border-gray-700/50 px-3 py-2 sticky top-0 z-40"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate('/app')} 
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-all"
            >
              <ChevronLeft className="w-5 h-5" />
            </motion.button>
            
            <div className="flex items-center gap-2">
              <Avatar className="w-9 h-9 ring-2 ring-primary/20">
                <AvatarFallback className="bg-gradient-to-br from-primary to-primary-600">
                  <Bot className="w-5 h-5 text-white" />
                </AvatarFallback>
              </Avatar>
              
              <div>
                <h2 className="font-semibold text-sm">AI Farm Assistant</h2>
                <div className="flex items-center gap-2 text-xs">
                  <span className={cn(
                    "w-2 h-2 rounded-full",
                    isOnline ? "bg-green-500" : "bg-gray-400"
                  )} />
                  <span className="text-gray-500 dark:text-gray-400">
                    {isOnline ? 'Online' : 'Offline'} {isTyping && '• Typing...'}
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowFontControl(!showFontControl)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-all"
            >
              <Type className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            </motion.button>
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-all"
            >
              <MoreVertical className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            </motion.button>
          </div>
        </div>
        
        {/* Enhanced Land Selection - Horizontal Scroll with Gradients */}
        {lands.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mt-2 -mx-3 px-3"
          >
            <ScrollArea className="w-full">
              <div className="flex gap-2 pb-1">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => selectLand(null)}
                  className={cn(
                    "px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all",
                    "shadow-sm hover:shadow-md",
                    !selectedLand 
                      ? "bg-gradient-to-r from-primary to-primary-600 text-white" 
                      : "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600"
                  )}
                >
                  <span className="flex items-center gap-1">
                    <Home className="w-3 h-3" />
                    General
                  </span>
                </motion.button>
                
                {lands.map((land, idx) => (
                  <motion.button
                    key={land.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => selectLand(land)}
                    className={cn(
                      "px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all",
                      "shadow-sm hover:shadow-md",
                      selectedLand?.id === land.id 
                        ? "bg-gradient-to-r from-green-500 to-emerald-600 text-white" 
                        : "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600"
                    )}
                  >
                    <span className="flex items-center gap-1">
                      <Trees className="w-3 h-3" />
                      {land.name}
                    </span>
                  </motion.button>
                ))}
              </div>
            </ScrollArea>
          </motion.div>
        )}
      </motion.div>

      {/* Land Welcome Card */}
      {selectedLand && messages.length === 0 && (
        <LandWelcomeCard land={selectedLand} />
      )}

      {/* Messages Area with Better Scrolling */}
      <div className="flex-1 overflow-y-auto relative" ref={scrollAreaRef}>
        <div className="pb-2">
          {/* Loading History Skeleton */}
          {isLoadingHistory && (
            <div className="space-y-4 p-4">
              <MessageSkeleton />
              <MessageSkeleton />
              <MessageSkeleton />
            </div>
          )}

          {/* History Load Error with Retry */}
          {historyLoadError && !isLoadingHistory && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4"
            >
              <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800 rounded-lg p-4 text-center">
                <p className="text-sm text-rose-600 dark:text-rose-400 mb-2">{historyLoadError}</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => loadChatSession(selectedLand?.id || null)}
                  className="text-xs"
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Retry
                </Button>
              </div>
            </motion.div>
          )}

          {/* Enhanced Quick Actions */}
          {!isLoadingHistory && messages.length === 0 && showQuickActions && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4"
            >
              <div className="text-center mb-6">
                <motion.div
                  animate={{ 
                    rotate: [0, 10, -10, 10, 0],
                    scale: [1, 1.1, 1]
                  }}
                  transition={{ 
                    duration: 2,
                    repeat: Infinity,
                    repeatDelay: 3
                  }}
                >
                  <Sparkles className="w-12 h-12 text-primary mx-auto mb-3" />
                </motion.div>
                <h3 className="text-lg font-bold bg-gradient-to-r from-primary to-primary-600 bg-clip-text text-transparent">
                  How can I help you today?
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {selectedLand 
                    ? `Ask about ${selectedLand.name} - ${selectedLand.primary_crop || 'your farm'}`
                    : 'Ask me anything about farming'}
                </p>
              </div>
              <QuickActions onActionClick={handleQuickAction} />
            </motion.div>
          )}

          {/* Messages with Enhanced Animations */}
          <AnimatePresence mode="popLayout">
            {messages.map((message, idx) => (
              <MessageBubble 
                key={message.id}
                message={message}
                onFeedback={handleFeedback}
                onSpeak={handleSpeak}
                onCopy={handleCopy}
                onShare={handleShare}
                onSave={handleSave}
                onAskAgain={handleAskAgain}
                isSpeaking={isSpeaking && speakingMessageId === message.id}
                fontSize={fontSize}
              />
            ))}
          </AnimatePresence>

          {/* Enhanced Typing Indicator */}
          <AnimatePresence>
            {isTyping && <TypingIndicator />}
          </AnimatePresence>

          {/* Enhanced Follow-up Questions Section */}
          {messages.length > 0 && messages[messages.length - 1].role === 'assistant' && messages[messages.length - 1].suggestions && (
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="px-4 py-4 bg-gradient-to-r from-emerald-50/50 to-green-50/50 dark:from-emerald-900/10 dark:to-green-900/10 rounded-2xl mx-3 mb-2"
            >
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-primary" />
                <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                  💬 Would you like to know:
                </h4>
              </div>
              <ScrollArea className="w-full">
                <div className="flex flex-col gap-2">
                  {messages[messages.length - 1].suggestions!.map((suggestion, idx) => (
                    <motion.button
                      key={idx}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.4 + (idx * 0.08) }}
                      whileHover={{ scale: 1.02, x: 4 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleQuickAction(suggestion)}
                      className="px-4 py-3 rounded-xl bg-white dark:bg-gray-800 border border-emerald-200 dark:border-emerald-800 text-sm font-medium hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:border-emerald-300 dark:hover:border-emerald-700 transition-all text-left shadow-sm hover:shadow-md group"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                          {idx + 1}️⃣
                        </span>
                        <span className="flex-1 text-gray-700 dark:text-gray-300 group-hover:text-emerald-700 dark:group-hover:text-emerald-300">
                          {suggestion}
                        </span>
                        <ChevronRight className="w-4 h-4 text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </motion.button>
                  ))}
                </div>
              </ScrollArea>
            </motion.div>
          )}

          <div ref={messageEndRef} />
        </div>
      </div>

      {/* Collapsed Quick Actions Bar */}
      {messages.length > 0 && showQuickActions && (
        <QuickActions onActionClick={handleQuickAction} collapsed />
      )}

      {/* Font Size Control */}
      <AnimatePresence>
        {showFontControl && (
          <FontSizeControl fontSize={fontSize} onChange={setFontSize} />
        )}
      </AnimatePresence>

      {/* Attachments Preview */}
      <AnimatePresence>
        {(uploadedImage || uploadedFile) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="px-4 py-3 bg-white/80 dark:bg-gray-800/80 backdrop-blur-md border-t border-gray-200/50 dark:border-gray-700/50"
          >
            <div className="flex gap-2">
              {uploadedImage && (
                <motion.div 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="relative group"
                >
                  <img 
                    src={uploadedImage} 
                    alt="Upload preview"
                    className="h-20 w-20 object-cover rounded-xl"
                  />
                  <motion.button
                    whileHover={{ scale: 1.2 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setUploadedImage(null)}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg"
                  >
                    <X className="w-3 h-3" />
                  </motion.button>
                </motion.div>
              )}
              {uploadedFile && (
                <motion.div 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  whileTap={{ x: -100, opacity: 0 }}
                  onAnimationComplete={() => uploadedFile && setUploadedFile(null)}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-xl"
                >
                  <Paperclip className="w-4 h-4" />
                  <span className="text-xs truncate max-w-[100px]">{uploadedFile.name}</span>
                  <button
                    onClick={() => setUploadedFile(null)}
                    className="ml-1"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Emoji Picker */}
      <AnimatePresence>
        {showEmojiPicker && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-20 left-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-3 z-50"
          >
            <div className="grid grid-cols-6 gap-2">
              {farmerEmojis.map((emoji, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setInputMessage(prev => prev + emoji);
                    setShowEmojiPicker(false);
                  }}
                  className="text-2xl hover:scale-125 transition-transform"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Waveform Visualizer */}
      <WaveformVisualizer isListening={isListening} stream={audioStream} />

      {/* Enhanced WhatsApp-style Floating Input Dock */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-md border-t border-gray-200/50 dark:border-gray-700/50 px-3 py-3"
      >
        <div className="flex items-end gap-2">
          {/* Left Side Actions */}
          <div className="flex gap-1">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="p-2.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              <Smile className="w-5 h-5" />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => imageInputRef.current?.click()}
              className="p-2.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              <Paperclip className="w-5 h-5" />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={handleCameraCapture}
              className="p-2.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              <Camera className="w-5 h-5" />
            </motion.button>
          </div>

          {/* Floating Glass Input Field */}
          <motion.div 
            whileFocus={{ scale: 1.02 }}
            className="flex-1 bg-gray-100/80 dark:bg-gray-700/80 backdrop-blur-sm rounded-3xl border border-gray-200/50 dark:border-gray-600/50"
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
              placeholder={isListening ? "Listening..." : "Type a message"}
              className="w-full px-4 py-3 bg-transparent resize-none focus:outline-none text-sm"
              rows={1}
              style={{
                maxHeight: '100px',
                fontSize: `${fontSize}px`
              }}
              dir={i18n.language === 'ar' || i18n.language === 'ur' ? 'rtl' : 'ltr'}
            />
          </motion.div>

          {/* Morphing Send/Mic Button */}
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
              disabled={isLoading || (!isOnline && !inputMessage.trim())}
            className={cn(
              "p-3 rounded-full transition-all shadow-lg",
              inputMessage.trim() || isListening
                ? "bg-gradient-to-r from-primary to-primary-600 text-white"
                : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
            )}
          >
            <AnimatePresence mode="wait">
              {isLoading ? (
                <motion.div
                  key="loading"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1, rotate: 360 }}
                  exit={{ scale: 0 }}
                  transition={{ rotate: { duration: 1, repeat: Infinity, ease: "linear" } }}
                >
                  <Loader2 className="w-5 h-5" />
                </motion.div>
              ) : inputMessage.trim() ? (
                <motion.div
                  key="send"
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0, rotate: 180 }}
                >
                  <Send className="w-5 h-5" />
                </motion.div>
              ) : isListening ? (
                <motion.div
                  key="mic-off"
                  initial={{ scale: 0 }}
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ repeat: Infinity, duration: 1 }}
                >
                  <MicOff className="w-5 h-5" />
                </motion.div>
              ) : (
                <motion.div
                  key="mic"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                >
                  <Mic className="w-5 h-5" />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>
        </div>

        {/* Offline Status Bar */}
        <AnimatePresence>
          {!isOnline && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-2 px-3 py-1.5 bg-orange-100 dark:bg-orange-900/30 rounded-lg"
            >
              <p className="text-xs text-orange-800 dark:text-orange-200 text-center">
                📵 You're offline. Messages will be sent when connection is restored.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
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

      {/* Feedback Dialog */}
      <FeedbackDialog
        open={feedbackDialogOpen}
        onClose={() => {
          setFeedbackDialogOpen(false);
          setFeedbackMessageId(null);
          setFeedbackType(null);
        }}
        onSubmit={submitFeedback}
        feedbackType={feedbackType}
        messageContent={
          messages.find(m => m.id === feedbackMessageId)?.content || ''
        }
      />

      {/* Custom Styles for Animations */}
      <style>{`
        @keyframes pulse-once {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }
        .animate-pulse-once {
          animation: pulse-once 2s ease-in-out;
        }
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
