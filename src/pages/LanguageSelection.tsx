import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { RadioGroup } from '@/components/ui/radio-group';
import { useLanguageStore } from '@/stores/languageStore';
import { useTenant } from '@/contexts/TenantContext';
import { useAuthFlowStore } from '@/stores/authFlowStore';
import { Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { AppHeader } from '@/components/language/AppHeader';
import { LocationDetector } from '@/components/language/LocationDetector';
import { LanguageCard } from '@/components/language/LanguageCard';
import { LanguageConfirmDialog } from '@/components/language/LanguageConfirmDialog';

const stateLanguages: Record<string, string[]> = {
  'Andhra Pradesh': ['te', 'hi', 'en'],
  'Arunachal Pradesh': ['en', 'hi'],
  'Assam': ['as', 'bn', 'hi', 'en'],
  'Bihar': ['hi', 'ur', 'en'],
  'Chhattisgarh': ['hi', 'en'],
  'Goa': ['mr', 'hi', 'en'],
  'Gujarat': ['gu', 'hi', 'en'],
  'Haryana': ['hi', 'pa', 'en'],
  'Himachal Pradesh': ['hi', 'pa', 'en'],
  'Jharkhand': ['hi', 'bn', 'en'],
  'Karnataka': ['kn', 'en', 'hi'],
  'Kerala': ['ml', 'en', 'hi'],
  'Madhya Pradesh': ['hi', 'en'],
  'Maharashtra': ['mr', 'hi', 'en'],
  'Manipur': ['en', 'hi'],
  'Meghalaya': ['en', 'hi'],
  'Mizoram': ['en', 'hi'],
  'Nagaland': ['en', 'hi'],
  'Odisha': ['or', 'hi', 'en'],
  'Punjab': ['pa', 'hi', 'en'],
  'Rajasthan': ['hi', 'en'],
  'Sikkim': ['en', 'hi'],
  'Tamil Nadu': ['ta', 'en', 'hi'],
  'Telangana': ['te', 'en', 'hi'],
  'Tripura': ['bn', 'en', 'hi'],
  'Uttar Pradesh': ['hi', 'ur', 'en'],
  'Uttarakhand': ['hi', 'en'],
  'West Bengal': ['bn', 'hi', 'en'],
  'Delhi': ['hi', 'pa', 'ur', 'en'],
  'default': ['hi', 'en']
};

export default function LanguageSelection() {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const { availableLanguages, setLanguage, fetchLanguages } = useLanguageStore();
  const { refetch: fetchTenant } = useTenant();
  const [selectedLanguage, setSelectedLanguage] = useState<string>('');
  const [userState, setUserState] = useState<string>('');
  const [sortedLanguages, setSortedLanguages] = useState(availableLanguages);
  const [hasDetectedLocation, setHasDetectedLocation] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      await fetchTenant();
      await fetchLanguages();
    };
    loadData();
  }, []);

  const handleLocationDetected = (state: string, district: string) => {
    setUserState(state);
    setHasDetectedLocation(true);
    sortLanguagesByState(state);
  };

  const sortLanguagesByState = (state: string) => {
    const preferredOrder = stateLanguages[state] || stateLanguages.default;
    const sorted = [...availableLanguages].sort((a, b) => {
      const aIndex = preferredOrder.indexOf(a.code);
      const bIndex = preferredOrder.indexOf(b.code);
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      return 0;
    });
    setSortedLanguages(sorted);
  };

  const { markLanguageSelected, setStep } = useAuthFlowStore();
  
  const openConfirm = (code?: string) => {
    const target = code ?? selectedLanguage;
    if (target) {
      setSelectedLanguage(target);
      setConfirmOpen(true);
    }
  };

  const handleContinue = () => {
    if (selectedLanguage) {
      setLanguage(selectedLanguage);
      i18n.changeLanguage(selectedLanguage);
      localStorage.setItem('hasSelectedLanguage', 'true');
      markLanguageSelected();
      setStep('mobile');
      setConfirmOpen(false);
      // First-run: send through the standard permission onboarding before auth.
      const permsDone = localStorage.getItem('ks_permissions_onboarded') === 'true';
      navigate(permsDone ? '/auth' : '/permissions');
    }
  };

  return (
    <div className="min-h-mobile-screen bg-gradient-to-br from-primary/5 via-background to-accent/5 flex flex-col">
      <AppHeader />

      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-md mx-auto space-y-4">
          <div className="flex justify-center">
            <LocationDetector onLocationDetected={handleLocationDetected} />
          </div>

          <RadioGroup 
            value={selectedLanguage} 
            onValueChange={(code) => openConfirm(code)}
            className="space-y-3"
            aria-label="Select your preferred language"
          >
            {sortedLanguages.map((lang, index) => (
              <LanguageCard
                key={lang.code}
                code={lang.code}
                nativeName={lang.nativeName}
                englishName={lang.name}
                isSelected={selectedLanguage === lang.code}
                isRecommended={index === 0 && hasDetectedLocation && userState && userState !== 'default'}
                index={index}
                onSelect={(code) => openConfirm(code)}
              />
            ))}
          </RadioGroup>
        </div>
      </main>

      <footer className="sticky bottom-0 glassmorphism-strong border-t border-border/30 shadow-float">
        <div className="max-w-md mx-auto p-4">
          <Button
            onClick={() => openConfirm()}
            disabled={!selectedLanguage}
            variant="pill-gradient"
            size="lg"
            className="w-full group"
            aria-label={selectedLanguage ? `Continue with ${sortedLanguages.find(l => l.code === selectedLanguage)?.nativeName}` : 'Select a language to continue'}
          >
            <span className="text-lg">Continue</span>
            {selectedLanguage && (
              <motion.span 
                className="ml-2 text-sm opacity-90"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
              >
                ({sortedLanguages.find(l => l.code === selectedLanguage)?.nativeName})
              </motion.span>
            )}
            <Sparkles className="w-5 h-5 ml-2 group-hover:rotate-12 transition-transform" aria-hidden="true" />
          </Button>
        </div>
      </footer>

      <LanguageConfirmDialog
        open={confirmOpen && !!selectedLanguage}
        onOpenChange={setConfirmOpen}
        langCode={selectedLanguage}
        nativeName={sortedLanguages.find(l => l.code === selectedLanguage)?.nativeName || ''}
        englishName={sortedLanguages.find(l => l.code === selectedLanguage)?.name || ''}
        onConfirm={handleContinue}
      />
    </div>
  );
}