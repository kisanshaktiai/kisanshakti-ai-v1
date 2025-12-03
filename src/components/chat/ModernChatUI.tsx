import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Bot, User, Copy, ThumbsUp, ThumbsDown, Share2, Check, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ColorCodedCard } from './ColorCodedCard';
import { EnhancedSpeakerButton } from './EnhancedSpeakerButton';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isPlaying?: boolean;
  feedback?: 'like' | 'dislike' | null;
  isCopied?: boolean;
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

// User bubble color variations based on message index
const USER_BUBBLE_GRADIENTS = [
  'from-primary via-primary-hover to-primary-glow',
  'from-[hsl(var(--chat-user-1))] via-[hsl(var(--chat-user-1-mid))] to-[hsl(var(--chat-user-1-end))]',
  'from-[hsl(var(--chat-user-2))] via-[hsl(var(--chat-user-2-mid))] to-[hsl(var(--chat-user-2-end))]',
  'from-[hsl(var(--chat-user-3))] via-[hsl(var(--chat-user-3-mid))] to-[hsl(var(--chat-user-3-end))]',
];

export function ModernChatUI({ message, onCopy, onLike, onShare, onPlay }: ModernChatUIProps) {
  const isUser = message.role === 'user';
  
  // Get consistent gradient based on message id hash
  const userGradient = useMemo(() => {
    if (!isUser) return '';
    const hash = message.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return USER_BUBBLE_GRADIENTS[hash % USER_BUBBLE_GRADIENTS.length];
  }, [message.id, isUser]);
  
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
      .replace(/([^\n\d])(\d+\.)\s+/g, '$1\n$2 ')  // Add newline before "1. 2. 3."
      .replace(/([^\n])([१२३४५६७८९०]+\.)\s+/g, '$1\n$2 ')  // Hindi numbers
      .replace(/([^\n])([•·\-])\s+(?=[A-Za-z\u0900-\u097F])/g, '$1\n$2 ')  // Bullet points
      .replace(/([^\n])(🟢|🟡|🔴|🟣|🔵|⚠️|✅|ℹ️|🌱|💧|🌾|📅|🎯|💰|📊|🏦|💵)/g, '$1\n\n$2')  // Emoji markers
      .replace(/([।:])(\s*)(?=[A-Za-z\u0900-\u097F])/g, '$1\n');  // After colons/devanagari end
    
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
      
      // Detect line type for styling
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
        {/* Bubble Content */}
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
          
          {/* Color-Coded Cards (if available) */}
          {!isUser && message.structuredResponse?.cards && message.structuredResponse.cards.length > 0 ? (
            <>
              <div className="space-y-2">
                {message.structuredResponse.cards.map((card, index) => (
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
              {/* Message Text with Enhanced Formatting */}
              <div 
                className={cn(
                  "relative z-10 px-4 py-3",
                  isUser ? "text-primary-foreground" : "text-foreground"
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
              language={navigator.language || 'en-IN'}
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
