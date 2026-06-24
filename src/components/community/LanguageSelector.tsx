import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Globe, ChevronDown, Check, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Language {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
}

const INDIAN_LANGUAGES: Language[] = [
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳' },
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी', flag: '🇮🇳' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', flag: '🇮🇳' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', flag: '🇮🇳' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', flag: '🇮🇳' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം', flag: '🇮🇳' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', flag: '🇮🇳' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', flag: '🇮🇳' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', flag: '🇮🇳' },
  { code: 'or', name: 'Odia', nativeName: 'ଓଡ଼ିଆ', flag: '🇮🇳' },
  { code: 'as', name: 'Assamese', nativeName: 'অসমীয়া', flag: '🇮🇳' },
];

interface LanguageSelectorProps {
  selectedLanguage: string;
  onLanguageChange: (lang: string) => void;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  selectedLanguage,
  onLanguageChange
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  
  const currentLang = INDIAN_LANGUAGES.find(l => l.code === selectedLanguage) || INDIAN_LANGUAGES[0];

  return (
    <div className="relative">
      {/* Selected Language Pill */}
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-full",
          "bg-primary/10 border border-primary/20",
          "text-sm font-medium text-primary",
          "transition-all duration-200",
          isOpen && "bg-primary/20 border-primary/40"
        )}
      >
        <Globe className="w-4 h-4" />
        <span>{currentLang.nativeName}</span>
        <ChevronDown className={cn(
          "w-4 h-4 transition-transform duration-200",
          isOpen && "rotate-180"
        )} />
      </motion.button>

      {/* Auto-translate hint */}
      <span className="ml-2 text-xs text-muted-foreground">
        ✨ {t('social.language.auto_translate')}
      </span>

      {/* Language Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />

            {/* Dropdown Menu */}
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="absolute top-full left-0 mt-2 w-64 z-50 bg-card/95 backdrop-blur-xl rounded-2xl border border-border shadow-2xl overflow-hidden"
            >
              <div className="p-3 border-b border-border">
                <p className="text-xs text-muted-foreground font-medium">
                  🌐 {t('social.language.select_hint')}
                </p>
              </div>
              
              <div className="max-h-72 overflow-y-auto p-2">
                {INDIAN_LANGUAGES.map((lang) => (
                  <motion.button
                    key={lang.code}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      onLanguageChange(lang.code);
                      setIsOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl",
                      "transition-all duration-200",
                      selectedLanguage === lang.code
                        ? "bg-primary/15 text-primary"
                        : "hover:bg-muted/50 text-foreground"
                    )}
                  >
                    <span className="text-lg">{lang.flag}</span>
                    <div className="flex-1 text-left">
                      <p className="font-medium text-sm">{lang.nativeName}</p>
                      <p className="text-xs text-muted-foreground">{lang.name}</p>
                    </div>
                    {selectedLanguage === lang.code && (
                      <Check className="w-4 h-4 text-primary" />
                    )}
                  </motion.button>
                ))}
              </div>

              <div className="p-3 border-t border-border bg-muted/30">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>{t('social.language.listen_hint')}</span>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
