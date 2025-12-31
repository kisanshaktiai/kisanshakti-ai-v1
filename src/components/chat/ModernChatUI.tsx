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
import { DiagnosisOnlyCard } from './DiagnosisOnlyCard';
import { SuggestionTypeSelector, type SuggestionType } from './SuggestionTypeSelector';
import { DecisionBrainCards, type DecisionBrainResponse } from './DecisionBrainCards';
import { DataAuditCards, type DataAudit } from './DataAuditCards';

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
  messageType?: 'text' | 'image_analysis' | 'video_analysis' | 'image_analysis_response' | 'video_analysis_response' | 'suggestion_selector' | 'targeted_solution' | 'orchestrator';
  // Full analysis result for detailed cards
  analysisResult?: VisionAnalysisResult;
  // For targeted solutions
  suggestionType?: SuggestionType;
  awaitingSuggestionSelection?: boolean;
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
  // ✅ NEW: Decision Brain structured response
  decisionBrainResponse?: DecisionBrainResponse;
  // ✅ NEW: Data Audit for debugging
  dataAudit?: DataAudit;
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
  onSuggestionSelect?: (messageId: string, type: SuggestionType) => void;
  isLoadingSuggestion?: boolean;
}

// Modern 2030-ready User bubble styling with glassmorphism - Using semantic tokens
const USER_BUBBLE_STYLES = {
  // Using semantic color tokens from design system
  gradients: [
    'from-primary via-primary/90 to-primary/80',
    'from-success via-success/90 to-success/80',
    'from-info via-info/90 to-info/80',
    'from-warning via-warning/90 to-warning/80',
  ],
  glow: [
    'shadow-[0_8px_32px_-8px_hsl(var(--primary)/0.5)]',
    'shadow-[0_8px_32px_-8px_hsl(var(--success)/0.5)]',
    'shadow-[0_8px_32px_-8px_hsl(var(--info)/0.5)]',
    'shadow-[0_8px_32px_-8px_hsl(var(--warning)/0.5)]',
  ],
  // Background overlays for glassmorphism
  overlay: [
    'bg-gradient-to-br from-white/20 via-white/10 to-transparent',
    'bg-gradient-to-br from-white/25 via-white/15 to-transparent',
  ]
};

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

export function ModernChatUI({ message, onCopy, onLike, onShare, onPlay, onSuggestionSelect, isLoadingSuggestion }: ModernChatUIProps) {
  const { i18n } = useTranslation();
  const isUser = message.role === 'user';
  const currentLanguage = i18n.language || 'hi';
  
  // Get consistent gradient and glow based on message id hash
  const userStyleIndex = useMemo(() => {
    if (!isUser) return 0;
    const hash = message.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return hash % USER_BUBBLE_STYLES.gradients.length;
  }, [message.id, isUser]);
  
  const userGradient = USER_BUBBLE_STYLES.gradients[userStyleIndex];
  const userGlow = USER_BUBBLE_STYLES.glow[userStyleIndex];
  
  // ✅ FIXED: Get first valid image URL - check all possible sources
  const displayImageUrl = useMemo(() => {
    const url = getImageSrc(message.imageUrl) || 
           (message.imageUrls?.length ? getImageSrc(message.imageUrls[0]) : undefined);
    console.log(`[ModernChatUI] Message ${message.id} imageUrl:`, { 
      imageUrl: message.imageUrl, 
      imageUrls: message.imageUrls, 
      displayUrl: url?.substring(0, 100) 
    });
    return url;
  }, [message.imageUrl, message.imageUrls, message.id]);
  
  // ✅ FIXED: For user image/video messages, show ONLY the image (no text/cards)
  const isUserImageMessage = isUser && (message.messageType === 'image_analysis' || message.messageType === 'video_analysis');
  
  // ✅ Enhanced text formatter - handles numbered lists, bullets, line breaks, and FILTERS placeholder content
  const formatAIResponse = (text: string) => {
    if (!text) return null;
    
    // Step 0: ✅ FIX - Filter out template placeholder lines with "None", "N/A" or empty values
    // These indicate backend template failures that should not be shown to users
    const placeholderPatterns = [
      /^[•\-\*]\s*(None|N\/A)\s*$/i,                     // • None, • N/A
      /^[•\-\*]\s*\S+\s*-\s*N\/A\s*$/i,                  // • पाणी - N/A
      /^[•\-\*]\s*No treatment required\s*-\s*N\/A\s*$/i, // • No treatment required - N/A
      /^\d+\.\s*.*None.*घाला\s*$/i,                      // 1. ...None घाला
      /^\d+\.\s*अर्ध्?या?\s*पाण्यात\s*None\s*घाला\s*$/i, // अर्ध्या पाण्यात None घाला
      /^🛒\s*Materials:\s*$/i,                            // Empty Materials section header
      /^🧪\s*Mixing:\s*$/i,                               // Empty Mixing section header  
      /^[•\-\*]\s*$/,                                     // Empty bullet point
    ];
    
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
    
    // Step 4: Split into lines and filter out placeholder lines
    const lines = formatted.split('\n').filter(line => {
      const trimmed = line.trim();
      if (!trimmed) return true; // Keep empty lines for spacing
      
      // Filter out placeholder patterns
      for (const pattern of placeholderPatterns) {
        if (pattern.test(trimmed)) {
          console.log('[ModernChatUI] Filtered placeholder line:', trimmed);
          return false;
        }
      }
      
      // Also filter lines that are just "- N/A" or have None as the main content
      if (/^\s*[•\-\*]?\s*(None|N\/A|null|undefined)\s*$/i.test(trimmed)) {
        return false;
      }
      
      return true;
    });
    
    // Step 5.5: ✅ CRITICAL FIX: If all lines were filtered, show fallback message
    if (lines.length === 0 || lines.every(line => !line.trim())) {
      console.log('[ModernChatUI] All lines filtered - showing fallback');
      const fallbackMessage = "मला समजले आहे. कृपया पुन्हा एकदा विचारा किंवा अधिक माहिती द्या. / Please ask again or provide more details.";
      return [
        <div key="fallback" className="mb-1.5 leading-relaxed text-sm md:text-base text-muted-foreground italic">
          {fallbackMessage}
        </div>
      ];
    }
    
    // Step 6: Render remaining lines
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
  const hasDecisionBrainResponse = !isUser && message.decisionBrainResponse;
  const hasDataAudit = !isUser && message.dataAudit;
  
  // ✅ Check if this is a targeted solution (user already selected suggestion type)
  const isTargetedSolution = message.messageType === 'targeted_solution' && message.suggestionType;
  
  // ✅ Check if awaiting suggestion selection (show diagnosis + selector)
  // Also check for crop mismatch - don't show selector if mismatch
  const isCropMismatch = hasAnalysisResult && message.analysisResult?.cropDetected?.matchesLandCrop === false;
  const awaitingSuggestion = hasAnalysisResult && 
    message.awaitingSuggestionSelection === true && 
    !isTargetedSolution &&
    !isCropMismatch;
  
  // ✅ FIXED: Only hide placeholder for USER messages, not assistant responses
  // Assistant responses should ALWAYS be shown even if they contain these strings
  const isPlaceholderContent = isUser && (
    message.content.includes('[📷') || 
    message.content.includes('[🎥') || 
    message.content === 'Analysis complete' ||
    message.content.includes('uploaded for analysis') ||
    message.content.includes('captured for analysis') ||
    message.content.includes('फोटो विश्लेषण') ||
    message.content.includes('वीडियो विश्लेषण') ||
    message.content.includes('फोटो विश्लेषणासाठी') ||
    message.content.includes('Photo for analysis') ||
    message.content.includes('Video for analysis')
  );
  
  // ✅ NEW: Check if assistant response is empty/error - show fallback
  const isEmptyAssistantResponse = !isUser && (!message.content || message.content.trim().length < 10) && 
    !hasAnalysisResult && !hasStructuredCards && !hasDecisionBrainResponse;
  
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
          whileHover={{ scale: 1.01, y: -1 }}
          whileTap={{ scale: 0.99 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
          className={cn(
            "relative",
            "transition-all duration-300",
            isUser
              ? cn(
                  // Modern 2030 glassmorphism user bubble with semantic tokens
                  "rounded-2xl rounded-tr-md",
                  "bg-gradient-to-br", userGradient,
                  "text-primary-foreground",
                  // Glassmorphism border with semantic tokens
                  "border border-primary-foreground/20",
                  // Backdrop blur for glass effect
                  "backdrop-blur-md",
                  userGlow,
                  "px-4 py-3",
                  // Modern glass shine overlay
                  "before:absolute before:inset-0 before:rounded-2xl before:rounded-tr-md",
                  "before:bg-gradient-to-t before:from-transparent before:via-primary-foreground/5 before:to-primary-foreground/15",
                  "before:pointer-events-none",
                  // Subtle inner shadow for depth
                  "after:absolute after:inset-0 after:rounded-2xl after:rounded-tr-md",
                  "after:shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]",
                  "after:pointer-events-none"
                )
              : cn(
                  // AI message bubble with semantic tokens
                  "bg-card/95 backdrop-blur-sm",
                  "border border-border/50",
                  "rounded-2xl rounded-tl-md",
                  "shadow-lg shadow-foreground/5",
                  "p-0 overflow-hidden"
                )
          )}
        >
          {/* User bubble glass highlight band */}
          {isUser && (
            <div className="absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-primary-foreground/20 via-primary-foreground/5 to-transparent rounded-t-2xl pointer-events-none" />
          )}
          
          {/* AI Shimmer Effect */}
          {!isUser && (
            <div className="absolute inset-0 rounded-[20px] overflow-hidden pointer-events-none">
              <div className="absolute top-0 -left-full h-full w-1/2 bg-gradient-to-r from-transparent via-white/5 to-transparent skew-x-12 animate-[shimmer_3s_infinite]" />
            </div>
          )}
          
          {/* ✅ NEW FLOW: Diagnosis Only + Suggestion Selector (awaiting user choice) */}
          {awaitingSuggestion ? (
            <>
              {/* Diagnosis Only Card (no recommendations) */}
              <div className="p-3">
                <DiagnosisOnlyCard 
                  analysis={message.analysisResult!} 
                  imageUrl={displayImageUrl}
                  language={currentLanguage} 
                />
              </div>
              
              {/* Suggestion Type Selector */}
              <div className="p-3 pt-0">
                <SuggestionTypeSelector
                  onSelect={(type) => onSuggestionSelect?.(message.id, type)}
                  isLoading={isLoadingSuggestion}
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
          ) : isTargetedSolution && hasAnalysisResult ? (
            <>
              {/* Full Recommendation Cards for targeted solution */}
              <div className="p-3">
                <RecommendationCards 
                  analysis={message.analysisResult!} 
                  language={currentLanguage}
                  suggestionType={message.suggestionType}
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
          ) : hasAnalysisResult ? (
            <>
              {/* Fallback: Full Recommendation Cards (for old messages without awaitingSuggestionSelection flag) */}
              <div className="p-3">
                <DiagnosisOnlyCard 
                  analysis={message.analysisResult!} 
                  imageUrl={displayImageUrl}
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
          ) : hasDecisionBrainResponse ? (
            <>
              <DecisionBrainCards response={message.decisionBrainResponse!} />
              {/* Timestamp */}
              <div className="flex items-center justify-between text-xs mt-2 opacity-60 text-muted-foreground px-3 pb-2.5">
                <span>
                  {new Date(message.timestamp).toLocaleTimeString([], { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </span>
                {message.analytics?.responseTime && (
                  <span className="flex items-center gap-1 text-success">
                    ⚡ {message.analytics.responseTime}ms
                  </span>
                )}
              </div>
            </>
          ) : hasStructuredCards ? (
            <>
              <div className="space-y-2 p-3">
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
          ) : isUserImageMessage ? (
            // ✅ FIXED: User image/video messages - show ONLY the image (no text)
            <>
              {displayImageUrl && (
                <div className="p-1">
                  <div className="relative rounded-xl overflow-hidden shadow-sm border-2 border-white/20">
                    <img 
                      src={displayImageUrl} 
                      alt="Uploaded"
                      className="w-full max-h-48 object-cover"
                      loading="lazy"
                      onError={(e) => {
                        console.error('[ModernChatUI] Image load error:', displayImageUrl?.substring(0, 100));
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    <div className="absolute bottom-2 right-2">
                      <Badge variant="secondary" className="bg-black/60 text-white text-xs">
                        {message.messageType === 'video_analysis' ? '🎥 Video' : '📷 Photo'}
                      </Badge>
                    </div>
                  </div>
                </div>
              )}
              {/* Timestamp */}
              <div className="flex items-center justify-end text-xs opacity-60 text-primary-foreground/80 px-2 pb-2">
                <span>
                  {new Date(message.timestamp).toLocaleTimeString([], { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </span>
              </div>
            </>
          ) : (
            <>
              {/* Display attached images */}
              {displayImageUrl && (
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
                        console.error('[ModernChatUI] Image load error:', displayImageUrl?.substring(0, 100));
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
              
              {/* ✅ NEW: Data Audit Cards for debugging - shows what data was found/missing */}
              {hasDataAudit && message.dataAudit && (
                <div className="px-3 pb-2">
                  <DataAuditCards audit={message.dataAudit} />
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
