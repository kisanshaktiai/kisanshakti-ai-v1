import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useLanguageStore } from '@/stores/languageStore';
import { CommunityHeader } from '@/components/community/CommunityHeader';
import { CommunityFeed } from '@/components/community/CommunityFeed';
import { CreatePostFAB } from '@/components/community/CreatePostFAB';
import { CreatePostModal } from '@/components/community/CreatePostModal';
import { CommunityTabs } from '@/components/community/CommunityTabs';
import { TrendingTopics } from '@/components/community/TrendingTopics';
import { CommunityGroups } from '@/components/community/CommunityGroups';
import { QuickPostCreator } from '@/components/community/QuickPostCreator';
import { LanguageSelector } from '@/components/community/LanguageSelector';
import { BottomNavigation } from '@/components/BottomNavigation';
import { CommunityTab } from '@/types/community';
import { useSavedPostsFull } from '@/hooks/useCommunityPosts';
import { PostCard } from '@/components/community/PostCard';
import { formatDistanceToNow } from 'date-fns';
import { Bookmark } from 'lucide-react';

const CommunityPage: React.FC = () => {
  const { t } = useTranslation('social');
  const { currentLanguage } = useLanguageStore();
  const [activeTab, setActiveTab] = useState<CommunityTab>('feed');
  const [isCreatePostOpen, setIsCreatePostOpen] = useState(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [viewLanguage, setViewLanguage] = useState(currentLanguage);

  // Fetch saved posts for saved tab
  const { data: savedPosts = [], isLoading: savedLoading } = useSavedPostsFull();

  // Sync view language with app language
  useEffect(() => {
    setViewLanguage(currentLanguage);
  }, [currentLanguage]);

  // Transform saved posts to UI format
  const transformedSavedPosts = savedPosts.map((post: any) => ({
    id: post.id,
    authorId: post.farmer_id,
    authorName: post.farmer?.farmer_name || 'Anonymous Farmer',
    authorAvatar: '👨‍🌾',
    authorLocation: post.farmer?.location || 'Unknown location',
    authorBadge: post.farmer?.is_verified ? 'verified' : null,
    originalLanguage: post.language_code || 'en',
    originalContent: post.content || '',
    imageUrl: post.media_urls?.images?.[0],
    mediaUrls: post.media_urls?.images || [],
    reactions: {
      helpful: Math.floor((post.likes_count || 0) * 0.5),
      tried: Math.floor((post.likes_count || 0) * 0.3),
      thanks: Math.floor((post.likes_count || 0) * 0.2),
    },
    likesCount: post.likes_count || 0,
    commentCount: post.comments_count || 0,
    sharesCount: post.shares_count || 0,
    savesCount: post.saves_count || 0,
    timestamp: post.created_at 
      ? formatDistanceToNow(new Date(post.created_at), { addSuffix: true })
      : 'Just now',
    createdAt: post.created_at || new Date().toISOString(),
    tags: post.hashtags || [],
    hasVoiceNote: post.metadata?.hasVoiceNote || false,
    isVerified: post.farmer?.is_verified || false,
  }));

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-secondary/20">
      {/* Glassmorphism Header */}
      <CommunityHeader 
        viewLanguage={viewLanguage}
        onLanguageChange={setViewLanguage}
      />

      {/* Language Selector Pill */}
      <div className="sticky top-16 z-40 px-4 py-2 bg-background/80 backdrop-blur-2xl border-b border-border/20">
        <LanguageSelector 
          selectedLanguage={viewLanguage}
          onLanguageChange={setViewLanguage}
        />
      </div>

      {/* Navigation Tabs */}
      <CommunityTabs 
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Main Content Area */}
      <main className="pb-32 pt-2">
        <AnimatePresence mode="wait">
          {activeTab === 'feed' && (
            <motion.div
              key="feed"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              {/* Quick Post Creator - Voice First */}
              <QuickPostCreator 
                language={viewLanguage}
                onExpandToFull={() => setIsCreatePostOpen(true)}
              />
              <CommunityFeed viewLanguage={viewLanguage} />
            </motion.div>
          )}

          {activeTab === 'groups' && (
            <motion.div
              key="groups"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <CommunityGroups 
                viewLanguage={viewLanguage}
                onModalStateChange={setIsGroupModalOpen}
              />
            </motion.div>
          )}

          {activeTab === 'trending' && (
            <motion.div
              key="trending"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <TrendingTopics viewLanguage={viewLanguage} />
            </motion.div>
          )}

          {activeTab === 'saved' && (
            <motion.div
              key="saved"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="px-4 py-4"
            >
              {savedLoading ? (
                <div className="flex justify-center py-16">
                  <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
                </div>
              ) : transformedSavedPosts.length > 0 ? (
                <div className="space-y-4">
                  {transformedSavedPosts.map((post: any) => (
                    <PostCard 
                      key={post.id}
                      post={post}
                      viewLanguage={viewLanguage}
                      isSaved={true}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-16">
                  <div className="w-20 h-20 mx-auto mb-4 rounded-3xl bg-secondary/50 flex items-center justify-center">
                    <Bookmark className="w-10 h-10 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    {t('social.empty.saved')}
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    {t('social.empty.saved_hint')}
                  </p>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'my-posts' && (
            <motion.div
              key="my-posts"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <QuickPostCreator 
                language={viewLanguage}
                onExpandToFull={() => setIsCreatePostOpen(true)}
              />
              <CommunityFeed viewLanguage={viewLanguage} filterByUser />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Floating Create Post Button - Hide when modals are open */}
      {!isCreatePostOpen && !isGroupModalOpen && (
        <CreatePostFAB onClick={() => setIsCreatePostOpen(true)} />
      )}

      {/* Create Post Modal */}
      <CreatePostModal 
        isOpen={isCreatePostOpen}
        onClose={() => setIsCreatePostOpen(false)}
        defaultLanguage={currentLanguage}
      />

      <BottomNavigation onMenuOpen={() => {}} />
    </div>
  );
};

export default CommunityPage;
