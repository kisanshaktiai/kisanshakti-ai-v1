import React from 'react';
import { motion } from 'framer-motion';
import { Bot, User, Copy, ThumbsUp, ThumbsDown, Share2, Volume2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ColorCodedCard } from './ColorCodedCard';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isPlaying?: boolean;
  feedback?: 'like' | 'dislike' | null;
  isCopied?: boolean;
  // Color-coded cards
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
}

interface ModernChatUIProps {
  message: Message;
  onCopy: (messageId: string, content: string) => void;
  onLike: (messageId: string, isLike: boolean) => void;
  onShare: (content: string) => void;
  onPlay: (messageId: string, content: string) => void;
}

export function ModernChatUI({ message, onCopy, onLike, onShare, onPlay }: ModernChatUIProps) {
  const isUser = message.role === 'user';
  
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
            <AvatarFallback className="bg-gradient-to-br from-primary via-primary-hover to-primary-glow text-white">
              <Bot className="h-5 w-5" />
            </AvatarFallback>
          </Avatar>
        </motion.div>
      )}

      {/* Message Bubble */}
      <div className={cn(
        "max-w-[80%] md:max-w-[70%]",
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
              ? "bg-gradient-to-br from-primary via-primary-hover to-primary rounded-tr-sm text-white shadow-chat-user px-4 py-3"
              : "bg-card/60 border border-border/50 rounded-tl-sm shadow-chat-ai p-0 overflow-hidden"
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
              <div>
                {message.structuredResponse.cards.map((card, index) => (
                  <ColorCodedCard key={card.id} card={card} index={index} />
                ))}
              </div>
              {/* Timestamp for cards */}
              <div className="text-xs mt-2 opacity-60 text-muted-foreground px-3 pb-2.5">
                {new Date(message.timestamp).toLocaleTimeString([], { 
                  hour: '2-digit', 
                  minute: '2-digit' 
                })}
              </div>
            </>
          ) : (
            <>
              {/* Message Text */}
              <div className={cn(
                "text-sm md:text-base leading-relaxed whitespace-pre-wrap break-words relative z-10 px-4 py-3",
                isUser ? "text-white" : "text-foreground"
              )}>
                {message.content}
              </div>
              {/* Timestamp for text */}
              <div className={cn(
                "text-xs mt-2 opacity-60",
                isUser ? "text-white/80 px-4 pb-3" : "text-muted-foreground px-3 pb-2.5"
              )}>
                {new Date(message.timestamp).toLocaleTimeString([], { 
                  hour: '2-digit', 
                  minute: '2-digit' 
                })}
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
            {/* Copy Button */}
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

            {/* Text-to-Speech Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onPlay(message.id, message.content)}
              className={cn(
                "h-7 w-7 hover:bg-muted/50 hover:scale-110 transition-all",
                message.isPlaying && "text-primary animate-pulse"
              )}
            >
              <Volume2 className="h-3.5 w-3.5" />
            </Button>

            {/* Share Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onShare(message.content)}
              className="h-7 w-7 hover:bg-muted/50 hover:scale-110 transition-all"
            >
              <Share2 className="h-3.5 w-3.5" />
            </Button>

            {/* Divider */}
            <div className="h-4 w-px bg-border/50 mx-1" />

            {/* Like Button */}
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

            {/* Dislike Button */}
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
            <AvatarFallback className="bg-muted text-muted-foreground">
              <User className="h-5 w-5" />
            </AvatarFallback>
          </Avatar>
        </motion.div>
      )}
    </motion.div>
  );
}
