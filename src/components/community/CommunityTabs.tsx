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
  onTabChange,
}) => {
  const { t } = useTranslation();

  return (
    <div className="sticky top-14 z-30 px-3 py-2 bg-background border-b border-border">
      <div className="flex items-center gap-1 p-1 bg-muted rounded-2xl">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;

          return (
            <motion.button
              key={tab.id}
              whileTap={{ scale: 0.96 }}
              onClick={() => onTabChange(tab.id)}
              aria-label={t(tab.labelKey)}
              className={cn(
                'relative flex items-center justify-center gap-1.5 py-2 rounded-xl',
                'text-sm font-medium transition-all duration-200',
                isActive
                  ? 'flex-[2] bg-primary text-primary-foreground shadow-sm'
                  : 'flex-1 text-muted-foreground'
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {isActive && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  className="text-xs whitespace-nowrap overflow-hidden"
                >
                  {t(tab.labelKey)}
                </motion.span>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};
