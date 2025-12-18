import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { PostCard } from './PostCard';
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
    authorAvatar: '👨‍🌾', // Default avatar emoji
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
  const { t } = useTranslation('social');
  
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

  return (
    <div className="px-4 space-y-4">
      {/* Pull to Refresh Indicator */}
      {isRefetching && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-center gap-2 py-4"
        >
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">
            {t('social.feed.refreshing', 'Refreshing...')}
          </span>
        </motion.div>
      )}

      {/* Refresh Button */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex justify-center"
      >
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefetching}
          className="rounded-full gap-2 bg-card/50 backdrop-blur-sm"
        >
          <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
          {t('social.feed.refresh', 'Refresh posts')}
        </Button>
      </motion.div>

      {/* Posts */}
      {transformedPosts.map((post, index) => (
        <motion.div
          key={post.id}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
        >
          <PostCard 
            post={post}
            viewLanguage={viewLanguage}
            isLiked={likedPostIds.includes(post.id)}
            isSaved={savedPostIds.includes(post.id)}
          />
        </motion.div>
      ))}

      {/* Loading State */}
      {isLoading && (
        <div className="flex justify-center py-8">
          <div className="flex flex-col items-center gap-3">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="w-10 h-10 rounded-full border-3 border-primary/30 border-t-primary"
            />
            <span className="text-sm text-muted-foreground">
              {t('social.feed.loading', 'Loading posts...')}
            </span>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && transformedPosts.length === 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center py-16"
        >
          <div className="text-6xl mb-4">🌱</div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            {filterByUser 
              ? t('social.empty.my_posts', 'You haven\'t posted yet')
              : t('social.empty.feed', 'No posts yet')}
          </h3>
          <p className="text-muted-foreground text-sm max-w-xs mx-auto">
            {filterByUser
              ? t('social.empty.my_posts_hint', 'Share your farming knowledge with the community!')
              : t('social.empty.feed_hint', 'Be the first to share your farming knowledge!')}
          </p>
        </motion.div>
      )}
    </div>
  );
};
