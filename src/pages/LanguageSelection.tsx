import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useLanguageStore } from '@/stores/languageStore';
import { useTenantStore } from '@/stores/tenantStore';
import { useAuthFlowStore } from '@/stores/authFlowStore';
import { MapPin, Check, ArrowLeft } from 'lucide-react';

// State-wise language preferences
const stateLanguages: Record<string, string[]> = {
  'Maharashtra': ['mr', 'hi', 'en'],
  'Punjab': ['pa', 'hi', 'en'],
  'Tamil Nadu': ['ta', 'en', 'hi'],
  'West Bengal': ['bn', 'hi', 'en'],
  'Gujarat': ['gu', 'hi', 'en'],
  'Andhra Pradesh': ['te', 'en', 'hi'],
  'Telangana': ['te', 'en', 'hi'],
  'Karnataka': ['kn', 'en', 'hi'],
  'Kerala': ['ml', 'en', 'hi'],
  'default': ['hi', 'en', 'pa', 'mr', 'ta', 'te', 'bn', 'gu']
};

export default function LanguageSelection() {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const { availableLanguages, setLanguage } = useLanguageStore();
  const { tenant } = useTenantStore();
  const [selectedLanguage, setSelectedLanguage] = useState<string>('');
  const [userState, setUserState] = useState<string>('');
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [sortedLanguages, setSortedLanguages] = useState(availableLanguages);

  useEffect(() => {
    detectUserLocation();
  }, []);

  const detectUserLocation = async () => {
    setDetectingLocation(true);
    try {
      // Get user's location
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const { latitude, longitude } = position.coords;
            // In production, use reverse geocoding API to get state
            // For demo, we'll simulate based on coordinates
            const detectedState = getStateFromCoordinates(latitude, longitude);
            setUserState(detectedState);
            sortLanguagesByState(detectedState);
            setDetectingLocation(false);
          },
          (error) => {
            console.error('Location error:', error);
            setDetectingLocation(false);
            sortLanguagesByState('default');
          }
        );
      } else {
        setDetectingLocation(false);
        sortLanguagesByState('default');
      }
    } catch (error) {
      console.error('Location detection error:', error);
      setDetectingLocation(false);
      sortLanguagesByState('default');
    }
  };

  const getStateFromCoordinates = (lat: number, lng: number): string => {
    // Simplified state detection based on coordinates
    // In production, use proper reverse geocoding
    if (lat >= 18.5 && lat <= 22.5 && lng >= 72.5 && lng <= 80.5) {
      return 'Maharashtra';
    } else if (lat >= 29.5 && lat <= 32.5 && lng >= 73.5 && lng <= 77.5) {
      return 'Punjab';
    } else if (lat >= 8 && lat <= 13.5 && lng >= 76.5 && lng <= 80.5) {
      return 'Tamil Nadu';
    } else if (lat >= 21.5 && lat <= 27.5 && lng >= 85.5 && lng <= 89.5) {
      return 'West Bengal';
    } else if (lat >= 20 && lat <= 25 && lng >= 68.5 && lng <= 74.5) {
      return 'Gujarat';
    }
    return 'default';
  };

  const sortLanguagesByState = (state: string) => {
    const preferredOrder = stateLanguages[state] || stateLanguages.default;
    const sorted = [...availableLanguages].sort((a, b) => {
      const aIndex = preferredOrder.indexOf(a.code);
      const bIndex = preferredOrder.indexOf(b.code);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
    setSortedLanguages(sorted);
  };

  const handleLanguageSelect = (langCode: string) => {
    setSelectedLanguage(langCode);
  };

  const { markLanguageSelected, setStep } = useAuthFlowStore();
  
  const handleContinue = () => {
    if (selectedLanguage) {
      setLanguage(selectedLanguage);
      i18n.changeLanguage(selectedLanguage);
      localStorage.setItem('hasSelectedLanguage', 'true');
      markLanguageSelected();
      setStep('mobile');
      navigate('/auth');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-earth flex flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md p-6 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-foreground">
            Select Your Language
          </h1>
          <p className="text-sm text-muted-foreground">
            अपनी भाषा चुनें / ਆਪਣੀ ਭਾਸ਼ਾ ਚੁਣੋ
          </p>
        </div>

        {/* Location Detection */}
        {detectingLocation && (
          <div className="flex items-center justify-center space-x-2 text-muted-foreground">
            <MapPin className="w-4 h-4 animate-pulse" />
            <span className="text-sm">Detecting your location...</span>
          </div>
        )}

        {userState && userState !== 'default' && (
          <div className="text-center text-sm text-muted-foreground">
            Location: {userState}
          </div>
        )}

        {/* Language Grid */}
        <div className="grid grid-cols-2 gap-3">
          {sortedLanguages.map((lang) => (
            <Button
              key={lang.code}
              variant={selectedLanguage === lang.code ? "default" : "outline"}
              className="h-20 flex flex-col items-center justify-center space-y-1 relative"
              onClick={() => handleLanguageSelect(lang.code)}
            >
              {selectedLanguage === lang.code && (
                <Check className="absolute top-2 right-2 w-4 h-4" />
              )}
              <span className="text-lg font-medium">{lang.nativeName}</span>
              <span className="text-xs opacity-70">{lang.name}</span>
            </Button>
          ))}
        </div>

        {/* Continue Button */}
        <Button
          onClick={handleContinue}
          disabled={!selectedLanguage}
          className="w-full h-12"
          size="lg"
        >
          Continue
        </Button>
      </Card>
    </div>
  );
}