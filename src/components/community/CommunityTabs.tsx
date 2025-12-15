import React from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Home, TrendingUp, Bookmark, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CommunityTab } from '@/types/community';

interface CommunityTabsProps {
  activeTab: CommunityTab;
  onTabChange: (tab: CommunityTab) => void;
}

const tabs: { id: CommunityTab; icon: React.ElementType; labelKey: string; defaultLabel: string }[] = [
  { id: 'feed', icon: Home, labelKey: 'social.tabs.feed', defaultLabel: 'Feed' },
  { id: 'trending', icon: TrendingUp, labelKey: 'social.tabs.trending', defaultLabel: 'Trending' },
  { id: 'saved', icon: Bookmark, labelKey: 'social.tabs.saved', defaultLabel: 'Saved' },
  { id: 'my-posts', icon: User, labelKey: 'social.tabs.my_posts', defaultLabel: 'My Posts' },
];

export const CommunityTabs: React.FC<CommunityTabsProps> = ({
  activeTab,
  onTabChange
}) => {
  const { t } = useTranslation('social');

  return (
    <div className="sticky top-[7.5rem] z-30 px-4 py-2 bg-background/60 backdrop-blur-xl">
      <div className="flex items-center gap-2 p-1 bg-secondary/50 rounded-2xl">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;

          return (
            <motion.button
              key={tab.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "relative flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl",
                "text-sm font-medium transition-colors duration-200",
                isActive 
                  ? "text-primary-foreground" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 bg-primary rounded-xl shadow-lg"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">
                  {t(tab.labelKey, tab.defaultLabel)}
                </span>
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};
