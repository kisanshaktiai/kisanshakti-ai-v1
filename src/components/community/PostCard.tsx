import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  Volume2, VolumeX, Globe, MessageCircle, Share2, Bookmark,
  MoreHorizontal, CheckCircle2, Award, Mic, Pause,
  Sparkles, ChevronDown, ChevronUp, Flag,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useTranslateText } from '@/hooks/useTranslateText';
import { useCommunityTTS } from '@/hooks/useCommunityTTS';
import { useSavePost } from '@/hooks/useCommunityPosts';
import { useToggleReaction, useUserReactions, ReactionType } from '@/hooks/usePostReactions';
import { useReportPost } from '@/hooks/useCommunityComments';
import { CommunityPost } from '@/types/community';
import { toast } from 'sonner';
import { CommentsSheet } from './CommentsSheet';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FarmerAvatar } from './FarmerAvatar';
import { ReportReasonSheet, ReportReason } from './ReportReasonSheet';
import { ImageLightbox } from './ImageLightbox';

interface PostCardProps {
  post: CommunityPost;
  viewLanguage: string;
  isLiked?: boolean;
  isSaved?: boolean;
  onHashtagTap?: (tag: string) => void;
}

const REACTIONS: { key: ReactionType; emoji: string; label: string }[] = [
  { key: 'helpful', emoji: '🙏', label: 'Helpful' },
  { key: 'tried', emoji: '🌾', label: 'Tried This' },
  { key: 'thanks', emoji: '💚', label: 'Thank You' },
];

export const PostCard: React.FC<PostCardProps> = ({
  post,
  viewLanguage,
  isSaved: initialIsSaved = false,
  onHashtagTap,
}) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [isSaved, setIsSaved] = useState(initialIsSaved);
  const [localReactions, setLocalReactions] = useState<Record<ReactionType, number>>({
    helpful: post.reactions.helpful,
    tried: post.reactions.tried,
    thanks: post.reactions.thanks,
  });
  const [userReactionsList, setUserReactionsList] = useState<ReactionType[]>([]);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const savePostMutation = useSavePost();
  const toggleReactionMutation = useToggleReaction();
  const reportPostMutation = useReportPost();

  const { data: allUserReactions } = useUserReactions();

  useEffect(() => {
    if (allUserReactions && allUserReactions[post.id]) {
      setUserReactionsList(allUserReactions[post.id]);
    }
  }, [allUserReactions, post.id]);

  const { translatedText, isTranslating } = useTranslateText(
    post.originalContent,
    post.originalLanguage,
    viewLanguage
  );

  const { speak, stop, isSpeaking, isLoading: ttsLoading } = useCommunityTTS();

  const needsTranslation = post.originalLanguage !== viewLanguage;
  const displayContent = showOriginal
    ? post.originalContent
    : translatedText || post.originalContent;

  const handleTTS = () => {
    if (isSpeaking) stop();
    else speak(displayContent, viewLanguage);
  };

  const handleReaction = (key: ReactionType) => {
    const has = userReactionsList.includes(key);
    if (has) {
      setUserReactionsList((p) => p.filter((r) => r !== key));
      setLocalReactions((p) => ({ ...p, [key]: Math.max(0, p[key] - 1) }));
    } else {
      setUserReactionsList((p) => [...p, key]);
      setLocalReactions((p) => ({ ...p, [key]: p[key] + 1 }));
    }
    toggleReactionMutation.mutate({ postId: post.id, reactionType: key, hasReaction: has });
  };

  const handleSave = () => {
    const wasSaved = isSaved;
    setIsSaved(!wasSaved);
    savePostMutation.mutate(
      { postId: post.id, isSaved: wasSaved },
      { onError: () => setIsSaved(wasSaved) }
    );
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${post.authorName}'s farming tip`,
          text: post.originalContent.substring(0, 100),
          url: window.location.href,
        });
      } else {
        await navigator.clipboard.writeText(post.originalContent);
        toast.success(t('social.post.share_copied') || 'Copied');
      }
    } catch {
      /* cancelled */
    }
  };

  const handleReportSubmit = (reason: ReportReason) => {
    reportPostMutation.mutate(
      { postId: post.id, reason },
      {
        onSuccess: () => {
          toast.success(t('social.report.thanks') || 'Reported. Thank you.', {
            action: { label: t('common.undo') || 'Undo', onClick: () => {} },
            duration: 5000,
          });
        },
      }
    );
  };

  return (
    <>
      <article
        className={cn(
          'relative bg-card rounded-3xl border border-border overflow-hidden',
          'shadow-sm',
          isSaved && 'ring-2 ring-primary/30'
        )}
      >
        {/* Author */}
        <div className="flex items-center justify-between p-4 pb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative flex-shrink-0">
              <FarmerAvatar name={post.authorName} seed={post.authorId} size="md" />
              {post.authorBadge && (
                <div
                  className={cn(
                    'absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center border-2 border-card',
                    post.authorBadge === 'expert' && 'bg-warning',
                    post.authorBadge === 'verified' && 'bg-info'
                  )}
                >
                  {post.authorBadge === 'expert' && (
                    <Award className="w-3 h-3 text-warning-foreground" />
                  )}
                  {post.authorBadge === 'verified' && (
                    <CheckCircle2 className="w-3 h-3 text-info-foreground" />
                  )}
                </div>
              )}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-foreground truncate">{post.authorName}</h3>
                {post.hasVoiceNote && (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 bg-primary/10 rounded-full">
                    <Mic className="w-3 h-3 text-primary" />
                    <span className="text-[10px] text-primary font-medium">
                      {t('social.post.voice') || 'Voice'}
                    </span>
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {post.authorLocation} • {post.timestamp}
              </p>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full flex-shrink-0">
                <MoreHorizontal className="w-5 h-5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setReportOpen(true)} className="text-destructive">
                <Flag className="w-4 h-4 mr-2" />
                {t('social.post.report') || 'Report post'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Content */}
        <div className="px-4 pb-3">
          {needsTranslation && (
            <div className="flex items-center gap-2 mb-2">
              {isTranslating ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                  </motion.div>
                  <span>{t('social.post.translating') || 'Translating…'}</span>
                </div>
              ) : (
                <button
                  onClick={() => setShowOriginal(!showOriginal)}
                  className="flex items-center gap-1.5 text-xs text-primary"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>
                    {showOriginal
                      ? t('social.post.show_translated') || 'Show translated'
                      : t('social.post.show_original') || 'Show original'}
                  </span>
                </button>
              )}
            </div>
          )}

          <p className={cn('text-foreground leading-relaxed', !isExpanded && 'line-clamp-3')}>
            {displayContent}
          </p>

          {post.originalContent.length > 150 && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-1 mt-1 text-sm text-primary font-medium"
            >
              {isExpanded ? (
                <>
                  <span>{t('social.post.show_less') || 'Show less'}</span>
                  <ChevronUp className="w-4 h-4" />
                </>
              ) : (
                <>
                  <span>{t('social.post.read_more') || 'Read more'}</span>
                  <ChevronDown className="w-4 h-4" />
                </>
              )}
            </button>
          )}

          {post.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {post.tags.map((tag, i) => (
                <button
                  key={i}
                  onClick={() => onHashtagTap?.(tag)}
                  className="px-2.5 py-1 bg-muted text-foreground text-xs rounded-full active:scale-95 transition-transform"
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Image */}
        {post.imageUrl && (
          <button
            onClick={() => setLightboxSrc(post.imageUrl!)}
            className="block w-full px-4 pb-3"
          >
            <div className="aspect-[4/3] rounded-2xl overflow-hidden bg-muted">
              <img
                src={post.imageUrl}
                alt="Post"
                loading="lazy"
                className="w-full h-full object-cover"
              />
            </div>
          </button>
        )}

        {/* Action Bar */}
        <div className="px-4 pb-3">
          <div className="flex items-center justify-between py-2 border-t border-border gap-2">
            {/* Reactions */}
            <div className="flex items-center gap-1 flex-shrink min-w-0">
              {REACTIONS.map((reaction) => {
                const active = userReactionsList.includes(reaction.key);
                return (
                  <motion.button
                    key={reaction.key}
                    whileTap={{ scale: 0.92 }}
                    onClick={() => handleReaction(reaction.key)}
                    aria-label={reaction.label}
                    className={cn(
                      'flex items-center gap-1 px-2 py-1.5 rounded-full text-sm transition-colors',
                      active ? 'bg-primary/15 text-primary' : 'text-muted-foreground'
                    )}
                  >
                    <span className="text-base leading-none">{reaction.emoji}</span>
                    <span className="font-medium text-xs">{localReactions[reaction.key]}</span>
                  </motion.button>
                );
              })}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCommentsOpen(true)}
                className="rounded-full gap-1 px-2 text-muted-foreground h-9"
              >
                <MessageCircle className="w-4 h-4" />
                <span className="text-xs">{post.commentCount}</span>
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={handleTTS}
                disabled={ttsLoading}
                className={cn(
                  'rounded-full h-9 w-9',
                  isSpeaking ? 'text-primary' : 'text-muted-foreground'
                )}
                aria-label="Listen"
              >
                {ttsLoading ? (
                  <Sparkles className="w-4 h-4 animate-spin" />
                ) : isSpeaking ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={handleShare}
                className="rounded-full h-9 w-9 text-muted-foreground"
                aria-label="Share"
              >
                <Share2 className="w-4 h-4" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={handleSave}
                className={cn(
                  'rounded-full h-9 w-9',
                  isSaved ? 'text-primary' : 'text-muted-foreground'
                )}
                aria-label="Save"
              >
                <Bookmark className={cn('w-4 h-4', isSaved && 'fill-current')} />
              </Button>
            </div>
          </div>
        </div>
      </article>

      <CommentsSheet
        postId={post.id}
        isOpen={commentsOpen}
        onClose={() => setCommentsOpen(false)}
      />
      <ReportReasonSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        onSubmit={handleReportSubmit}
      />
      <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
    </>
  );
};
