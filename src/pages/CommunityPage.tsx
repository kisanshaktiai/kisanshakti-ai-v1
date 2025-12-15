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
import { LanguageSelector } from '@/components/community/LanguageSelector';
import { BottomNavigation } from '@/components/BottomNavigation';
import { CommunityTab } from '@/types/community';

const CommunityPage: React.FC = () => {
  const { t } = useTranslation('social');
  const { currentLanguage } = useLanguageStore();
  const [activeTab, setActiveTab] = useState<CommunityTab>('feed');
  const [isCreatePostOpen, setIsCreatePostOpen] = useState(false);
  const [viewLanguage, setViewLanguage] = useState(currentLanguage);

  // Sync view language with app language
  useEffect(() => {
    setViewLanguage(currentLanguage);
  }, [currentLanguage]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-community-bg-start via-community-bg-mid to-community-bg-end">
      {/* Glassmorphism Header */}
      <CommunityHeader 
        viewLanguage={viewLanguage}
        onLanguageChange={setViewLanguage}
      />

      {/* Language Selector Pill */}
      <div className="sticky top-16 z-40 px-4 py-2 bg-background/60 backdrop-blur-xl border-b border-border/30">
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
              <CommunityFeed viewLanguage={viewLanguage} />
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
              className="px-4 py-8 text-center"
            >
              <div className="text-6xl mb-4">🔖</div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                {t('social.empty.saved', 'Saved posts will appear here')}
              </h3>
              <p className="text-muted-foreground text-sm">
                {t('social.empty.saved_hint', 'Swipe left on any post to save it')}
              </p>
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
              <CommunityFeed viewLanguage={viewLanguage} filterByUser />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Floating Create Post Button */}
      <CreatePostFAB onClick={() => setIsCreatePostOpen(true)} />

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
