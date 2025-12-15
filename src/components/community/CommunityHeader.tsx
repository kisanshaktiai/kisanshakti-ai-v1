import React from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Users, Bell, Search, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CommunityHeaderProps {
  viewLanguage: string;
  onLanguageChange: (lang: string) => void;
}

export const CommunityHeader: React.FC<CommunityHeaderProps> = ({
  viewLanguage,
  onLanguageChange
}) => {
  const { t } = useTranslation('social');

  return (
    <motion.header 
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="sticky top-0 z-50 px-4 py-3 bg-background/70 backdrop-blur-xl border-b border-border/30"
    >
      <div className="flex items-center justify-between">
        {/* Logo & Title */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg shadow-primary/20">
              <Users className="w-5 h-5 text-primary-foreground" />
            </div>
            {/* Online indicator */}
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-background animate-pulse" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground tracking-tight">
              {t('social.header.title', 'किसान समुदाय')}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t('social.header.subtitle', '12,450 farmers online')}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="icon"
            className="rounded-xl bg-secondary/50 hover:bg-secondary"
          >
            <Search className="w-5 h-5 text-muted-foreground" />
          </Button>
          
          <Button 
            variant="ghost" 
            size="icon"
            className="rounded-xl bg-secondary/50 hover:bg-secondary relative"
          >
            <Bell className="w-5 h-5 text-muted-foreground" />
            {/* Notification badge */}
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
              3
            </span>
          </Button>
        </div>
      </div>
    </motion.header>
  );
};
