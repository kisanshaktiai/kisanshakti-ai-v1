import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Languages } from 'lucide-react';
import { useLanguageStore } from '@/stores/languageStore';

export function LanguageSelector() {
  const { currentLanguage, availableLanguages, setLanguage } = useLanguageStore();
  const currentLang = availableLanguages.find(l => l.code === currentLanguage);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Languages className="w-4 h-4" />
          <span className="hidden sm:inline">{currentLang?.nativeName}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[150px]">
        {availableLanguages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => setLanguage(lang.code)}
            className={currentLanguage === lang.code ? 'bg-accent' : ''}
          >
            <span className="font-medium">{lang.nativeName}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              {lang.name}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}