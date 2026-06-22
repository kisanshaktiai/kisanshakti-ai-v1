import React from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { PostCard } from './PostCard';
import { PostCardSkeletonList } from './PostCardSkeleton';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCommunityPosts, useUserLikedPosts, useUserSavedPosts, SocialPost } from '@/hooks/useCommunityPosts';
import { formatDistanceToNow } from 'date-fns';
import { CommunityPost } from '@/types/community';

interface CommunityFeedProps {
  viewLanguage: string;
  filterByUser?: boolean;
}

// Transform database post to UI-friendly format
const transformPost = (post: SocialPost): CommunityPost => {
  const mediaUrls = post.media_urls?.images || [];
  const imageUrl = mediaUrls[0] || undefined;
  
  // Create timestamp from created_at
  const timestamp = post.created_at 
    ? formatDistanceToNow(new Date(post.created_at), { addSuffix: true })
    : 'Just now';

  return {
    id: post.id,
    authorId: post.farmer_id,
    authorName: post.farmer?.farmer_name || 'Anonymous Farmer',
    authorAvatar: '',
    authorLocation: post.farmer?.location || 'Unknown location',
    authorBadge: post.farmer?.is_verified ? 'verified' : null,
    originalLanguage: post.language_code || 'en',
    originalContent: post.content || '',
    imageUrl,
    mediaUrls,
    reactions: {
      helpful: (post as any).helpful_count || 0,
      tried: (post as any).tried_count || 0,
      thanks: (post as any).thanks_count || 0,
    },
    likesCount: post.likes_count || 0,
    commentCount: post.comments_count || 0,
    sharesCount: post.shares_count || 0,
    savesCount: post.saves_count || 0,
    timestamp,
    createdAt: post.created_at || new Date().toISOString(),
    tags: post.hashtags || [],
    hasVoiceNote: post.metadata?.hasVoiceNote || false,
    isVerified: post.farmer?.is_verified || false,
  };
};

export const CommunityFeed: React.FC<CommunityFeedProps> = ({
  viewLanguage,
  filterByUser = false
}) => {
  const { t } = useTranslation();
  
  // Fetch real data from database
  const { 
    data: posts, 
    isLoading, 
    isRefetching,
    refetch 
  } = useCommunityPosts({ filterByUser, viewLanguage });
  
  const { data: likedPostIds = [] } = useUserLikedPosts();
  const { data: savedPostIds = [] } = useUserSavedPosts();

  const handleRefresh = async () => {
    await refetch();
  };

  // Transform posts to UI format
  const transformedPosts = (posts || []).map(transformPost);

  if (isLoading) {
    return (
      <div className="px-3 py-2">
        <PostCardSkeletonList count={3} />
      </div>
    );
  }

  return (
    <div className="px-3 space-y-4">
      {isRefetching && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-center gap-2 py-2"
        >
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          <span className="text-xs text-muted-foreground">
            {t('social.feed.refreshing')}
          </span>
        </motion.div>
      )}

      <div className="flex justify-center">
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefetching}
          className="rounded-full gap-2 bg-card h-8 text-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
          {t('social.feed.refresh')}
        </Button>
      </div>

      {transformedPosts.map((post, index) => (
        <motion.div
          key={post.id}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: Math.min(index * 0.05, 0.3) }}
        >
          <PostCard
            post={post}
            viewLanguage={viewLanguage}
            isLiked={likedPostIds.includes(post.id)}
            isSaved={savedPostIds.includes(post.id)}
          />
        </motion.div>
      ))}

      {transformedPosts.length === 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center py-12"
        >
          <div className="w-20 h-20 mx-auto mb-4 rounded-3xl bg-primary/10 flex items-center justify-center">
            <span className="text-3xl">🌾</span>
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            {filterByUser
              ? t('social.empty.my_posts') || 'No posts yet'
              : t('social.empty.feed') || 'Be the first to share'}
          </h3>
          <p className="text-muted-foreground text-sm max-w-xs mx-auto mb-4">
            {filterByUser
              ? t('social.empty.my_posts_hint') || 'Share your first farming tip above'
              : t('social.empty.feed_hint') || 'Tap the mic and share what you learned today'}
          </p>
        </motion.div>
      )}
    </div>
  );
};
