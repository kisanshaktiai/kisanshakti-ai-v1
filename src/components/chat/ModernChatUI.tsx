import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Bot, User, Copy, ThumbsUp, ThumbsDown, Share2, Check, Zap, CheckCircle, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ColorCodedCard } from './ColorCodedCard';
import { EnhancedSpeakerButton } from './EnhancedSpeakerButton';
import { RecommendationCards, type VisionAnalysisResult } from './RecommendationCards';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isPlaying?: boolean;
  feedback?: 'like' | 'dislike' | null;
  isCopied?: boolean;
  // Image/video support
  imageUrl?: string;
  imageUrls?: string[];
  videoUrl?: string;
  messageType?: 'text' | 'image_analysis' | 'video_analysis' | 'image_analysis_response' | 'video_analysis_response';
  // Full analysis result for detailed cards
  analysisResult?: VisionAnalysisResult;
  structuredResponse?: {
    cards: Array<{
      id: string;
      type: 'organic' | 'fertilizer' | 'pesticide' | 'warning' | 'success' | 'info' | 'hormone' | 'irrigation';
      title: string;
      content: string;
      color: string;
      gradient: string[];
      icon: string;
      priority: number;
    }>;
    language: string;
  };
  analytics?: {
    responseTime?: number;
    tokensUsed?: {
      prompt: number;
      completion: number;
      total: number;
    };
    queryComplexity?: string;
  };
}

interface ModernChatUIProps {
  message: Message;
  onCopy: (messageId: string, content: string) => void;
  onLike: (messageId: string, isLike: boolean) => void;
  onShare: (content: string) => void;
  onPlay: (messageId: string, content: string) => void;
}

// User bubble color variations
const USER_BUBBLE_GRADIENTS = [
  'from-primary via-primary-hover to-primary-glow',
  'from-[hsl(var(--chat-user-1))] via-[hsl(var(--chat-user-1-mid))] to-[hsl(var(--chat-user-1-end))]',
  'from-[hsl(var(--chat-user-2))] via-[hsl(var(--chat-user-2-mid))] to-[hsl(var(--chat-user-2-end))]',
  'from-[hsl(var(--chat-user-3))] via-[hsl(var(--chat-user-3-mid))] to-[hsl(var(--chat-user-3-end))]',
];

// ✅ Helper to check if URL is a valid storage URL (not base64)
const isValidStorageUrl = (url: string | undefined): boolean => {
  if (!url) return false;
  return url.startsWith('https://') || url.startsWith('http://');
};

// ✅ Check if URL is base64 data
const isBase64Image = (url: string | undefined): boolean => {
  if (!url) return false;
  return url.startsWith('data:image/') || url.startsWith('data:video/');
};

// ✅ Get display-ready image URL (handles base64 and storage URLs)
const getImageSrc = (url: string | undefined): string | undefined => {
  if (!url) return undefined;
  // Both base64 and https URLs can be used directly as img src
  return url;
};

// ✅ Check if image URL is usable (either storage or base64)
const isUsableImageUrl = (url: string | undefined): boolean => {
  return isValidStorageUrl(url) || isBase64Image(url);
};

export function ModernChatUI({ message, onCopy, onLike, onShare, onPlay }: ModernChatUIProps) {
  const { i18n } = useTranslation();
  const isUser = message.role === 'user';
  const currentLanguage = i18n.language || 'hi';
  
  // ✅ CRITICAL: Hide user messages for image/video analysis
  // The analysis result is shown ONLY in the AI response card (single source of truth)
  if (isUser && (message.messageType === 'image_analysis' || message.messageType === 'video_analysis')) {
    return null;
  }
  
  // Get consistent gradient based on message id hash
  const userGradient = useMemo(() => {
    if (!isUser) return '';
    const hash = message.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return USER_BUBBLE_GRADIENTS[hash % USER_BUBBLE_GRADIENTS.length];
  }, [message.id, isUser]);
  
  // ✅ Get first valid image URL
  const displayImageUrl = useMemo(() => {
    return getImageSrc(message.imageUrl) || 
           (message.imageUrls?.length ? getImageSrc(message.imageUrls[0]) : undefined);
  }, [message.imageUrl, message.imageUrls]);
  
  // ✅ Enhanced text formatter - handles numbered lists, bullets, and line breaks
  const formatAIResponse = (text: string) => {
    if (!text) return null;
    
    // Step 1: Clean markdown symbols
    let formatted = text
      .replace(/\*\*(.*?)\*\*/g, '$1')  // Remove **bold**
      .replace(/\*(.*?)\*/g, '$1')      // Remove *italic*
      .replace(/^#{1,6}\s+/gm, '')      // Remove ## headers
      .replace(/^-{3,}$/gm, '');        // Remove --- separators
    
    // Step 2: Force newlines before numbered points
    formatted = formatted
      .replace(/([^\n\d])(\d+\.)\s+/g, '$1\n$2 ')
      .replace(/([^\n])([१२३४५६७८९०]+\.)\s+/g, '$1\n$2 ')
      .replace(/([^\n])([•·\-])\s+(?=[A-Za-z\u0900-\u097F])/g, '$1\n$2 ')
      .replace(/([^\n])(🟢|🟡|🔴|🟣|🔵|⚠️|✅|ℹ️|🌱|💧|🌾|📅|🎯|💰|📊|🏦|💵)/g, '$1\n\n$2')
      .replace(/([।:])(\s*)(?=[A-Za-z\u0900-\u097F])/g, '$1\n');
    
    // Step 3: Clean up multiple newlines
    formatted = formatted
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\n+/, '')
      .trim();
    
    // Step 4: Split into lines and render
    const lines = formatted.split('\n');
    
    return lines.map((line, idx) => {
      const trimmedLine = line.trim();
      if (!trimmedLine) {
        return <div key={idx} className="h-2" />;
      }
      
      const isNumberedPoint = /^(\d+\.|[१२३४५६७८९०]+\.)/.test(trimmedLine);
      const isBulletPoint = /^[•·\-\*]/.test(trimmedLine);
      const isEmojiSection = /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(trimmedLine);
      const isCostLine = /₹|रू|cost|price|savings/i.test(trimmedLine);
      const isHighlight = /expected|increase|benefit|लाभ|फायदा|वाढ/i.test(trimmedLine);
      
      return (
        <div 
          key={idx} 
          className={cn(
            "mb-1.5 last:mb-0 leading-relaxed text-sm md:text-base",
            isNumberedPoint && "pl-4 border-l-2 border-primary/40 ml-1 py-0.5 bg-primary/5 rounded-r",
            isBulletPoint && "pl-4 ml-1",
            isEmojiSection && "font-semibold mt-3 first:mt-0 text-foreground",
            isCostLine && "text-success font-medium",
            isHighlight && "text-primary/90"
          )}
        >
          {trimmedLine}
        </div>
      );
    });
  };

  // Check if this is an analysis response with full details
  const hasAnalysisResult = !isUser && message.analysisResult;
  const hasStructuredCards = !isUser && message.structuredResponse?.cards?.length > 0;
  
  // ✅ Check if content is a placeholder that should be hidden
  const isPlaceholderContent = message.content.includes('[📷') || 
    message.content.includes('[🎥') || 
    message.content === 'Analysis complete' ||
    message.content.includes('uploaded for analysis') ||
    message.content.includes('captured for analysis');
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ 
        duration: 0.4, 
        type: "spring", 
        stiffness: 400, 
        damping: 30 
      }}
      className={cn(
        "flex gap-3 mb-4 group",
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      {/* AI Avatar - Left Side */}
      {!isUser && (
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 25 }}
        >
          <Avatar className="h-9 w-9 border-2 border-primary/20 shadow-lg">
            <AvatarFallback className="bg-gradient-to-br from-primary via-primary-hover to-primary-glow text-primary-foreground">
              <Bot className="h-5 w-5" />
            </AvatarFallback>
          </Avatar>
        </motion.div>
      )}

      {/* Message Bubble */}
      <div className={cn(
        isUser ? "max-w-[80%] md:max-w-[70%]" : "max-w-full md:max-w-[95%]",
        isUser && "flex flex-col items-end"
      )}>
        <motion.div
          whileHover={{ scale: 1.01 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
          className={cn(
            "relative rounded-2xl backdrop-blur-xl",
            "transition-all duration-300",
            isUser
              ? `bg-gradient-to-br ${userGradient} rounded-tr-sm text-primary-foreground shadow-lg px-4 py-3`
              : "bg-card/80 border border-border/50 rounded-tl-sm shadow-chat-ai p-0 overflow-hidden"
          )}
        >
          {/* AI Shimmer Effect */}
          {!isUser && (
            <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
              <div className="absolute top-0 -left-full h-full w-1/2 bg-gradient-to-r from-transparent via-white/5 to-transparent skew-x-12 animate-[shimmer_3s_infinite]" />
            </div>
          )}
          
          {/* ✅ CRITICAL: Full Vision Analysis Cards (single source of truth) */}
          {hasAnalysisResult ? (
            <>
              {/* Image with Analyzed badge */}
              {displayImageUrl && (
                <div className="relative">
                  <img 
                    src={displayImageUrl} 
                    alt="Analyzed" 
                    className="w-full aspect-video object-cover"
                    loading="lazy"
                    onError={(e) => {
                      // Hide broken images
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                  <div className="absolute top-2 right-2">
                    <Badge className="bg-green-500 text-white shadow-lg">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      {currentLanguage === 'hi' ? 'विश्लेषित' : currentLanguage === 'mr' ? 'विश्लेषित' : 'Analyzed'}
                    </Badge>
                  </div>
                  {/* Video indicator */}
                  {(message.messageType === 'video_analysis_response' || message.videoUrl) && (
                    <div className="absolute bottom-2 left-2">
                      <Badge variant="secondary" className="bg-black/60 text-white">
                        <Play className="h-3 w-3 mr-1" />
                        Video
                      </Badge>
                    </div>
                  )}
                </div>
              )}
              
              {/* Full Recommendation Cards */}
              <div className="p-3">
                <RecommendationCards 
                  analysis={message.analysisResult!} 
                  language={currentLanguage} 
                />
              </div>
              
              {/* Timestamp */}
              <div className="flex items-center justify-between text-xs mt-2 opacity-60 text-muted-foreground px-3 pb-2.5">
                <span>
                  {new Date(message.timestamp).toLocaleTimeString([], { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </span>
              </div>
            </>
          ) : hasStructuredCards ? (
            <>
              <div className="space-y-2">
                {message.structuredResponse!.cards.map((card, index) => (
                  <ColorCodedCard key={card.id} card={card} index={index} />
                ))}
              </div>
              {/* Timestamp & Token Usage */}
              <div className="flex items-center justify-between text-xs mt-2 opacity-60 text-muted-foreground px-3 pb-2.5">
                <span>
                  {new Date(message.timestamp).toLocaleTimeString([], { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </span>
                {message.analytics?.tokensUsed?.total && (
                  <span className="flex items-center gap-1 text-primary/70">
                    <Zap className="h-3 w-3" />
                    {message.analytics.tokensUsed.total.toLocaleString()} tokens
                  </span>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Display attached images - but NOT for analysis placeholders */}
              {displayImageUrl && !isPlaceholderContent && (
                <div className={cn(
                  isUser ? "p-1 pb-2" : "px-3 pt-3"
                )}>
                  <div className={cn(
                    "relative rounded-xl overflow-hidden shadow-sm",
                    isUser ? "border-2 border-white/20" : "border border-border/30"
                  )}>
                    <img 
                      src={displayImageUrl} 
                      alt="Uploaded"
                      className={cn(
                        "w-full object-cover",
                        isUser ? "max-h-48" : "max-h-64"
                      )}
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                </div>
              )}
              
              {/* Multiple images support */}
              {message.imageUrls && message.imageUrls.length > 1 && (
                <div className={cn(
                  "grid grid-cols-2 gap-2",
                  isUser ? "p-1 pb-2" : "px-3 pt-3"
                )}>
                  {message.imageUrls.slice(1).map((url, idx) => (
                    <div key={idx} className={cn(
                      "relative rounded-lg overflow-hidden",
                      isUser ? "border-2 border-white/20" : "border border-border/30"
                    )}>
                      <img 
                        src={getImageSrc(url)} 
                        alt={`Upload ${idx + 2}`}
                        className="w-full h-32 object-cover"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}
              
              {/* Message Text - hide placeholder content */}
              {!isPlaceholderContent && (
                <div 
                  className={cn(
                    "relative z-10 px-4 py-3",
                    isUser ? "text-primary-foreground" : "text-foreground",
                    message.imageUrl && "pt-2"
                  )}
                  data-message-id={message.id}
                >
                  {isUser ? (
                    <span className="text-sm md:text-base leading-relaxed whitespace-pre-wrap break-words">
                      {message.content}
                    </span>
                  ) : (
                    formatAIResponse(message.content)
                  )}
                </div>
              )}
              
              {/* Timestamp & Token Usage */}
              <div className={cn(
                "flex items-center justify-between text-xs mt-1 opacity-60",
                isUser ? "text-primary-foreground/80 px-4 pb-3" : "text-muted-foreground px-3 pb-2.5"
              )}>
                <span>
                  {new Date(message.timestamp).toLocaleTimeString([], { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </span>
                {!isUser && message.analytics?.tokensUsed?.total && (
                  <span className="flex items-center gap-1 text-primary/70">
                    <Zap className="h-3 w-3" />
                    {message.analytics.tokensUsed.total.toLocaleString()} tokens
                  </span>
                )}
              </div>
            </>
          )}
        </motion.div>

        {/* Action Buttons - AI Messages Only */}
        {!isUser && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex items-center gap-1 mt-2 px-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          >
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onCopy(message.id, message.content)}
              className="h-7 w-7 hover:bg-muted/50 hover:scale-110 transition-all"
            >
              {message.isCopied ? (
                <Check className="h-3.5 w-3.5 text-success" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>

            <EnhancedSpeakerButton
              messageId={message.id}
              content={message.content}
              language={currentLanguage}
              isPlaying={message.isPlaying}
              onPlayStateChange={() => onPlay(message.id, message.content)}
            />

            <Button
              variant="ghost"
              size="icon"
              onClick={() => onShare(message.content)}
              className="h-7 w-7 hover:bg-muted/50 hover:scale-110 transition-all"
            >
              <Share2 className="h-3.5 w-3.5" />
            </Button>

            <div className="h-4 w-px bg-border/50 mx-1" />

            <Button
              variant="ghost"
              size="icon"
              onClick={() => onLike(message.id, true)}
              className={cn(
                "h-7 w-7 hover:bg-muted/50 hover:scale-110 transition-all",
                message.feedback === 'like' && "text-success"
              )}
            >
              <ThumbsUp className={cn(
                "h-3.5 w-3.5",
                message.feedback === 'like' && "fill-current"
              )} />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => onLike(message.id, false)}
              className={cn(
                "h-7 w-7 hover:bg-muted/50 hover:scale-110 transition-all",
                message.feedback === 'dislike' && "text-destructive"
              )}
            >
              <ThumbsDown className={cn(
                "h-3.5 w-3.5",
                message.feedback === 'dislike' && "fill-current"
              )} />
            </Button>
          </motion.div>
        )}
      </div>

      {/* User Avatar - Right Side */}
      {isUser && (
        <motion.div
          initial={{ scale: 0, rotate: 180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 25 }}
        >
          <Avatar className="h-9 w-9 border-2 border-primary/20 shadow-lg">
            <AvatarFallback className="bg-gradient-to-br from-secondary to-muted text-secondary-foreground">
              <User className="h-5 w-5" />
            </AvatarFallback>
          </Avatar>
        </motion.div>
      )}
    </motion.div>
  );
}
