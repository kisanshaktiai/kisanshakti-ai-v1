import React from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Home, TrendingUp, Bookmark, User, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CommunityTab } from '@/types/community';

interface CommunityTabsProps {
  activeTab: CommunityTab;
  onTabChange: (tab: CommunityTab) => void;
}

const tabs: { id: CommunityTab; icon: React.ElementType; labelKey: string }[] = [
  { id: 'feed', icon: Home, labelKey: 'social.tabs.feed' },
  { id: 'groups', icon: Users, labelKey: 'social.tabs.groups' },
  { id: 'trending', icon: TrendingUp, labelKey: 'social.tabs.trending' },
  { id: 'saved', icon: Bookmark, labelKey: 'social.tabs.saved' },
  { id: 'my-posts', icon: User, labelKey: 'social.tabs.my_posts' },
];

export const CommunityTabs: React.FC<CommunityTabsProps> = ({
  activeTab,
  onTabChange
}) => {
  const { t } = useTranslation();

  return (
    <div className="sticky top-[7.5rem] z-30 px-4 py-2 bg-background/80 backdrop-blur-2xl">
      <div className="flex items-center gap-1.5 p-1.5 bg-secondary/40 rounded-2xl backdrop-blur-sm">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;

          return (
            <motion.button
              key={tab.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "relative flex-1 flex items-center justify-center gap-1.5 py-3 px-3 rounded-xl",
                "text-sm font-medium transition-all duration-300",
                isActive 
                  ? "text-primary-foreground" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 bg-primary rounded-xl shadow-lg shadow-primary/25"
                  transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline text-xs">
                  {t(tab.labelKey)}
                </span>
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};
