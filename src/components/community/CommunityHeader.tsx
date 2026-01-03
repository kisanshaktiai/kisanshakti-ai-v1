import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Users, Bell, Search, X, ArrowLeft, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface CommunityHeaderProps {
  viewLanguage: string;
  onLanguageChange: (lang: string) => void;
}

interface Notification {
  id: string;
  type: 'like' | 'comment' | 'follow';
  message: string;
  time: string;
  read: boolean;
}

const mockNotifications: Notification[] = [
  { id: '1', type: 'like', message: 'Ramesh liked your post', time: '2m ago', read: false },
  { id: '2', type: 'comment', message: 'Suresh commented on your post', time: '5m ago', read: false },
  { id: '3', type: 'follow', message: 'Priya started following you', time: '1h ago', read: true },
];

export const CommunityHeader: React.FC<CommunityHeaderProps> = ({
  viewLanguage,
  onLanguageChange
}) => {
  const { t } = useTranslation('social');
  const navigate = useNavigate();
  const [showSearch, setShowSearch] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notifications, setNotifications] = useState(mockNotifications);

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleMarkAllRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })));
  };

  const handleBack = () => {
    navigate('/app');
  };


  return (
    <>
      <motion.header 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="sticky top-0 z-50 px-4 py-3 bg-background/80 backdrop-blur-2xl border-b border-border/30"
      >
        <div className="flex items-center justify-between">
          {/* Back Button & Logo */}
          <div className="flex items-center gap-2">
            {/* Back to Dashboard Button */}
            <motion.div whileTap={{ scale: 0.9 }}>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={handleBack}
                className="rounded-2xl bg-secondary/50 hover:bg-secondary h-11 w-11"
              >
                <ChevronLeft className="w-5 h-5 text-foreground" />
              </Button>
            </motion.div>
            
            <motion.div 
              className="relative"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary via-primary/80 to-primary/60 flex items-center justify-center shadow-lg shadow-primary/25">
                <Users className="w-5 h-5 text-primary-foreground" />
              </div>
              {/* Online indicator */}
              <motion.div 
                className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-success rounded-full border-2 border-background"
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </motion.div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">
                {t('social.header.title')}
              </h1>
              <p className="text-xs text-muted-foreground">
                {t('social.header.subtitle', '12,450 farmers online')}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <motion.div whileTap={{ scale: 0.9 }}>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => setShowSearch(true)}
                className="rounded-2xl bg-secondary/50 hover:bg-secondary h-11 w-11"
              >
                <Search className="w-5 h-5 text-muted-foreground" />
              </Button>
            </motion.div>
            
            <motion.div whileTap={{ scale: 0.9 }}>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => setShowNotifications(true)}
                className="rounded-2xl bg-secondary/50 hover:bg-secondary relative h-11 w-11"
              >
                <Bell className="w-5 h-5 text-muted-foreground" />
                {unreadCount > 0 && (
                  <motion.span 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center"
                  >
                    {unreadCount}
                  </motion.span>
                )}
              </Button>
            </motion.div>
          </div>
        </div>
      </motion.header>

      {/* Search Modal */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-background"
          >
            <div className="flex items-center gap-3 p-4 border-b border-border/50">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setShowSearch(false)}
                className="rounded-full"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('social.header.search_placeholder')}
                className="flex-1 h-12 rounded-2xl bg-secondary/50 border-0"
                autoFocus
              />
              {searchQuery && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setSearchQuery('')}
                  className="rounded-full"
                >
                  <X className="w-5 h-5" />
                </Button>
              )}
            </div>
            <div className="p-4">
              {!searchQuery ? (
                <div className="text-center py-12">
                  <Search className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">{t('social.search.placeholder')}</p>
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">{t('social.search.no_results')}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Notifications Panel */}
      <AnimatePresence>
        {showNotifications && (
          <motion.div
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            transition={{ type: 'spring', damping: 25 }}
            className="fixed inset-0 z-[100] bg-background"
          >
            <div className="flex items-center justify-between p-4 border-b border-border/50">
              <div className="flex items-center gap-3">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setShowNotifications(false)}
                  className="rounded-full"
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <h2 className="text-lg font-semibold">{t('social.notifications.title')}</h2>
              </div>
              {unreadCount > 0 && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={handleMarkAllRead}
                  className="text-primary"
                >
                  {t('social.notifications.mark_read')}
                </Button>
              )}
            </div>
            <div className="p-4 space-y-3">
              {notifications.length === 0 ? (
                <div className="text-center py-12">
                  <Bell className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">{t('social.notifications.empty')}</p>
                </div>
              ) : (
                notifications.map((notification) => (
                  <motion.div
                    key={notification.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "p-4 rounded-2xl border transition-colors",
                      notification.read 
                        ? "bg-card border-border/50" 
                        : "bg-primary/5 border-primary/20"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center text-lg",
                        notification.type === 'like' && "bg-destructive/10",
                        notification.type === 'comment' && "bg-info/10",
                        notification.type === 'follow' && "bg-success/10"
                      )}>
                        {notification.type === 'like' && '❤️'}
                        {notification.type === 'comment' && '💬'}
                        {notification.type === 'follow' && '👤'}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-foreground">{notification.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">{notification.time}</p>
                      </div>
                      {!notification.read && (
                        <div className="w-2 h-2 rounded-full bg-primary" />
                      )}
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
