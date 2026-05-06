import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Bell, Search, X, ArrowLeft, ChevronLeft, Globe, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface CommunityHeaderProps {
  viewLanguage: string;
  onLanguageChange: (lang: string) => void;
}

const LANGUAGES = [
  { code: 'hi', native: 'हिन्दी' },
  { code: 'en', native: 'English' },
  { code: 'mr', native: 'मराठी' },
  { code: 'ta', native: 'தமிழ்' },
  { code: 'te', native: 'తెలుగు' },
  { code: 'kn', native: 'ಕನ್ನಡ' },
  { code: 'ml', native: 'മലയാളം' },
  { code: 'gu', native: 'ગુજરાતી' },
  { code: 'bn', native: 'বাংলা' },
  { code: 'pa', native: 'ਪੰਜਾਬੀ' },
  { code: 'or', native: 'ଓଡ଼ିଆ' },
  { code: 'as', native: 'অসমীয়া' },
];

export const CommunityHeader: React.FC<CommunityHeaderProps> = ({
  viewLanguage,
  onLanguageChange,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [showSearch, setShowSearch] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showLangs, setShowLangs] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const currentLang = LANGUAGES.find((l) => l.code === viewLanguage) || LANGUAGES[0];

  return (
    <>
      <header className="sticky top-0 z-50 h-14 px-3 flex items-center justify-between bg-background border-b border-border">
        {/* Left: back + title */}
        <div className="flex items-center gap-1.5 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/app')}
            className="rounded-full h-10 w-10 -ml-1"
            aria-label="Back"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-base font-bold text-foreground tracking-tight truncate">
            {t('social.header.title') || 'Community'}
          </h1>
        </div>

        {/* Right: language pill + search + bell */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowLangs(true)}
            className="flex items-center gap-1 px-2.5 h-9 rounded-full bg-muted text-foreground text-sm font-medium"
            aria-label="Change language"
          >
            <Globe className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs">{currentLang.native}</span>
          </button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSearch(true)}
            className="rounded-full h-10 w-10"
            aria-label="Search"
          >
            <Search className="w-5 h-5 text-muted-foreground" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowNotifications(true)}
            className="rounded-full h-10 w-10"
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5 text-muted-foreground" />
          </Button>
        </div>
      </header>

      {/* Language picker sheet */}
      <AnimatePresence>
        {showLangs && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-overlay-dark/50"
            onClick={() => setShowLangs(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-0 inset-x-0 bg-background rounded-t-3xl border-t border-border max-h-[70vh] overflow-y-auto"
            >
              <div className="sticky top-0 bg-background px-4 py-3 border-b border-border">
                <p className="text-sm font-semibold">
                  {t('social.language.select_hint') || 'Read posts in'}
                </p>
              </div>
              <div className="p-2">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => {
                      onLanguageChange(lang.code);
                      setShowLangs(false);
                    }}
                    className={cn(
                      'w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-colors',
                      viewLanguage === lang.code
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-muted text-foreground'
                    )}
                  >
                    <span className="font-medium">{lang.native}</span>
                    {viewLanguage === lang.code && <Check className="w-5 h-5" />}
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search Modal */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-background"
          >
            <div className="flex items-center gap-3 p-4 border-b border-border">
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
                placeholder={t('social.header.search_placeholder') || 'Search'}
                className="flex-1 h-12 rounded-2xl bg-muted border-0"
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
            <div className="p-4 text-center py-12">
              <Search className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">
                {searchQuery
                  ? t('social.search.no_results') || 'No results yet'
                  : t('social.search.placeholder') || 'Search posts, farmers, hashtags'}
              </p>
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
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowNotifications(false)}
                  className="rounded-full"
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <h2 className="text-lg font-semibold">
                  {t('social.notifications.title') || 'Notifications'}
                </h2>
              </div>
            </div>
            <div className="text-center py-16 px-4">
              <Bell className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">
                {t('social.notifications.empty') || 'No notifications yet'}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
