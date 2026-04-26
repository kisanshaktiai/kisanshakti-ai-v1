import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Languages, Check } from 'lucide-react';
import { useLanguageStore } from '@/stores/languageStore';
import { motion } from 'framer-motion';

export function LanguageSelector() {
  const { currentLanguage, availableLanguages, setLanguage } = useLanguageStore();
  const currentLang = availableLanguages.find(l => l.code === currentLanguage);

  const handleLanguageChange = (langCode: string) => {
    console.log('🌐 [LanguageSelector] User selected language:', langCode);
    setLanguage(langCode);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`Current language: ${currentLang?.nativeName || currentLanguage}`}
          className="shrink-0 h-9 w-9 sm:w-auto sm:px-3 rounded-full flex items-center justify-center gap-1.5 bg-card/80 border border-border/60 shadow-sm hover:bg-accent/50 active:scale-95 transition-all"
        >
          <Languages className="w-4 h-4 text-primary" aria-hidden="true" />
          <span className="hidden sm:inline text-xs font-semibold text-foreground">
            {currentLang?.nativeName}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="end" 
        className="min-w-[200px] border-border/50 shadow-lg"
      >
        {availableLanguages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => handleLanguageChange(lang.code)}
            className={`cursor-pointer transition-colors ${
              currentLanguage === lang.code 
                ? 'bg-primary/10 text-primary font-semibold' 
                : 'hover:bg-accent'
            }`}
          >
            <div className="flex items-center justify-between w-full gap-3">
              <div className="flex flex-col">
                <span className="font-medium">{lang.nativeName}</span>
                <span className="text-xs text-muted-foreground">
                  {lang.name}
                </span>
              </div>
              {currentLanguage === lang.code && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 500 }}
                >
                  <Check className="w-4 h-4 text-primary" aria-hidden="true" />
                </motion.div>
              )}
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}