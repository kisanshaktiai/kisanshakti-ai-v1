import React, { useState } from 'react';
import { motion, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { 
  Volume2, VolumeX, Globe, MessageCircle, Share2, Bookmark, 
  MoreHorizontal, CheckCircle2, Award, Mic, Pause, Play,
  ThumbsUp, Heart, Sparkles, ChevronDown, ChevronUp
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useTranslateText } from '@/hooks/useTranslateText';
import { useCommunityTTS } from '@/hooks/useCommunityTTS';
import { useLikePost, useSavePost } from '@/hooks/useCommunityPosts';
import { CommunityPost } from '@/types/community';

interface PostCardProps {
  post: CommunityPost;
  viewLanguage: string;
  isLiked?: boolean;
  isSaved?: boolean;
}

const REACTIONS = [
  { key: 'helpful', emoji: '🙏', label: 'Helpful' },
  { key: 'tried', emoji: '🌾', label: 'Tried This' },
  { key: 'thanks', emoji: '💚', label: 'Thank You' },
];

export const PostCard: React.FC<PostCardProps> = ({ 
  post, 
  viewLanguage,
  isLiked: initialIsLiked = false,
  isSaved: initialIsSaved = false
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [isSaved, setIsSaved] = useState(initialIsSaved);
  const [isLiked, setIsLiked] = useState(initialIsLiked);
  const [userReaction, setUserReaction] = useState<string | null>(null);
  
  // Mutations
  const likePostMutation = useLikePost();
  const savePostMutation = useSavePost();
  
  // Translation hook
  const { 
    translatedText, 
    isTranslating, 
    error: translationError 
  } = useTranslateText(post.originalContent, post.originalLanguage, viewLanguage);

  // TTS hook
  const { 
    speak, 
    stop, 
    isSpeaking, 
    isLoading: ttsLoading 
  } = useCommunityTTS();

  // Swipe gesture handling
  const x = useMotionValue(0);
  const saveOpacity = useTransform(x, [-100, -50, 0], [1, 0.5, 0]);
  const translateOpacity = useTransform(x, [0, 50, 100], [0, 0.5, 1]);

  const needsTranslation = post.originalLanguage !== viewLanguage;
  const displayContent = showOriginal ? post.originalContent : (translatedText || post.originalContent);

  const handleSwipeEnd = (event: any, info: PanInfo) => {
    if (info.offset.x < -50) {
      // Swipe left - Save
      handleSave();
    } else if (info.offset.x > 50) {
      // Swipe right - Show original
      setShowOriginal(!showOriginal);
    }
  };

  const handleTTS = () => {
    if (isSpeaking) {
      stop();
    } else {
      speak(displayContent, viewLanguage);
    }
  };

  const handleReaction = (reactionKey: string) => {
    setUserReaction(userReaction === reactionKey ? null : reactionKey);
    // Could track reactions separately via post_interactions table
  };

  const handleLike = () => {
    const newIsLiked = !isLiked;
    setIsLiked(newIsLiked);
    likePostMutation.mutate({ postId: post.id, isLiked });
  };

  const handleSave = () => {
    const newIsSaved = !isSaved;
    setIsSaved(newIsSaved);
    savePostMutation.mutate({ postId: post.id, isSaved });
  };

  return (
    <motion.div
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.2}
      onDragEnd={handleSwipeEnd}
      style={{ x }}
      className="relative"
    >
      {/* Swipe Indicators */}
      <motion.div 
        style={{ opacity: saveOpacity }}
        className="absolute right-0 top-1/2 -translate-y-1/2 -translate-x-4 z-0"
      >
        <div className="flex items-center gap-2 text-primary">
          <Bookmark className="w-6 h-6" />
          <span className="text-sm font-medium">Save</span>
        </div>
      </motion.div>
      
      <motion.div 
        style={{ opacity: translateOpacity }}
        className="absolute left-0 top-1/2 -translate-y-1/2 translate-x-4 z-0"
      >
        <div className="flex items-center gap-2 text-primary">
          <Globe className="w-6 h-6" />
          <span className="text-sm font-medium">Original</span>
        </div>
      </motion.div>

      {/* Main Card */}
      <motion.article
        className={cn(
          "relative bg-card/80 backdrop-blur-xl rounded-3xl border border-border/50",
          "shadow-lg shadow-black/5 overflow-hidden",
          isSaved && "ring-2 ring-primary/30"
        )}
      >
        {/* Author Header */}
        <div className="flex items-center justify-between p-4 pb-3">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className="relative">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-2xl">
                {post.authorAvatar}
              </div>
              {post.authorBadge && (
                <div className={cn(
                  "absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center",
                  post.authorBadge === 'expert' && "bg-warning",
                  post.authorBadge === 'verified' && "bg-info"
                )}>
                  {post.authorBadge === 'expert' && <Award className="w-3 h-3 text-warning-foreground" />}
                  {post.authorBadge === 'verified' && <CheckCircle2 className="w-3 h-3 text-info-foreground" />}
                </div>
              )}
            </div>
            
            {/* Author Info */}
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-foreground">{post.authorName}</h3>
                {post.hasVoiceNote && (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 bg-primary/10 rounded-full">
                    <Mic className="w-3 h-3 text-primary" />
                    <span className="text-[10px] text-primary font-medium">Voice</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{post.authorLocation} • {post.timestamp}</p>
            </div>
          </div>

          <Button variant="ghost" size="icon" className="rounded-full">
            <MoreHorizontal className="w-5 h-5 text-muted-foreground" />
          </Button>
        </div>

        {/* Content */}
        <div className="px-4 pb-3">
          {/* Translation Badge */}
          {needsTranslation && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 mb-2"
            >
              {isTranslating ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                  </motion.div>
                  <span>Translating...</span>
                </div>
              ) : (
                <button
                  onClick={() => setShowOriginal(!showOriginal)}
                  className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>{showOriginal ? 'Show translated' : 'Show original'}</span>
                </button>
              )}
            </motion.div>
          )}

          {/* Post Text */}
          <p className={cn(
            "text-foreground leading-relaxed",
            !isExpanded && "line-clamp-3"
          )}>
            {displayContent}
          </p>

          {/* Expand/Collapse */}
          {post.originalContent.length > 150 && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-1 mt-1 text-sm text-primary font-medium"
            >
              {isExpanded ? (
                <>
                  <span>Show less</span>
                  <ChevronUp className="w-4 h-4" />
                </>
              ) : (
                <>
                  <span>Read more</span>
                  <ChevronDown className="w-4 h-4" />
                </>
              )}
            </button>
          )}

          {/* Tags */}
          {post.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {post.tags.map((tag, index) => (
                <span
                  key={index}
                  className="px-2.5 py-1 bg-secondary/50 text-secondary-foreground text-xs rounded-full"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Image */}
        {post.imageUrl && (
          <div className="relative aspect-[4/3] mx-4 mb-3 rounded-2xl overflow-hidden">
            <img
              src={post.imageUrl}
              alt="Post image"
              className="w-full h-full object-cover"
            />
            
            {/* TTS Button on Image */}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleTTS}
              disabled={ttsLoading}
              className={cn(
                "absolute bottom-3 right-3 p-3 rounded-full",
                "bg-black/50 backdrop-blur-md border border-white/20",
                "text-white transition-all duration-200",
                isSpeaking && "bg-primary"
              )}
            >
              {ttsLoading ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                >
                  <Sparkles className="w-5 h-5" />
                </motion.div>
              ) : isSpeaking ? (
                <Pause className="w-5 h-5" />
              ) : (
                <Volume2 className="w-5 h-5" />
              )}
            </motion.button>
          </div>
        )}

        {/* Reactions Bar */}
        <div className="px-4 pb-3">
          <div className="flex items-center justify-between py-2 border-t border-border/50">
            {/* Reaction Buttons */}
            <div className="flex items-center gap-1">
              {REACTIONS.map((reaction) => (
                <motion.button
                  key={reaction.key}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => handleReaction(reaction.key)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full",
                    "text-sm transition-all duration-200",
                    userReaction === reaction.key
                      ? "bg-primary/15 text-primary"
                      : "hover:bg-secondary/50 text-muted-foreground"
                  )}
                >
                  <span>{reaction.emoji}</span>
                  <span className="font-medium">
                    {post.reactions[reaction.key as keyof typeof post.reactions] + (userReaction === reaction.key ? 1 : 0)}
                  </span>
                </motion.button>
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1">
              <Button 
                variant="ghost" 
                size="sm"
                className="rounded-full gap-1.5 text-muted-foreground"
              >
                <MessageCircle className="w-4 h-4" />
                <span>{post.commentCount}</span>
              </Button>
              
              <Button 
                variant="ghost" 
                size="icon"
                className="rounded-full text-muted-foreground"
              >
                <Share2 className="w-4 h-4" />
              </Button>
              
              <Button 
                variant="ghost" 
                size="icon"
                onClick={handleSave}
                className={cn(
                  "rounded-full",
                  isSaved ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Bookmark className={cn("w-4 h-4", isSaved && "fill-current")} />
              </Button>

              {/* TTS Button (if no image) */}
              {!post.imageUrl && (
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={handleTTS}
                  disabled={ttsLoading}
                  className={cn(
                    "rounded-full",
                    isSpeaking ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {ttsLoading ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    >
                      <Sparkles className="w-4 h-4" />
                    </motion.div>
                  ) : isSpeaking ? (
                    <VolumeX className="w-4 h-4" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </motion.article>
    </motion.div>
  );
};
