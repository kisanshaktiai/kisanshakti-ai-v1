import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useLanguageStore } from '@/stores/languageStore';
import { useTenantStore } from '@/stores/tenantStore';
import { useAuthFlowStore } from '@/stores/authFlowStore';
import { MapPin, Check, Leaf } from 'lucide-react';

// State-wise language preferences with more comprehensive mapping
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
  const { availableLanguages, setLanguage } = useLanguageStore();
  const { tenant } = useTenantStore();
  const [selectedLanguage, setSelectedLanguage] = useState<string>('');
  const [userState, setUserState] = useState<string>('');
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [sortedLanguages, setSortedLanguages] = useState(availableLanguages);
  const [locationDenied, setLocationDenied] = useState(false);
  const locationStored = useRef<GeolocationCoordinates | null>(null);

  useEffect(() => {
    detectUserLocation();
  }, []);

  const detectUserLocation = async () => {
    setDetectingLocation(true);
    try {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const { latitude, longitude } = position.coords;
            // Store location in memory
            locationStored.current = position.coords;
            
            // Get state from coordinates (simplified for demo)
            const detectedState = getStateFromCoordinates(latitude, longitude);
            setUserState(detectedState);
            sortLanguagesByState(detectedState);
            setDetectingLocation(false);
          },
          (error) => {
            console.error('Location error:', error);
            setDetectingLocation(false);
            setLocationDenied(true);
            sortLanguagesByState('default');
          },
          {
            timeout: 5000,
            maximumAge: 300000 // Cache location for 5 minutes
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
    // Simplified state detection based on major city coordinates
    // In production, use proper reverse geocoding API
    
    // Delhi NCR
    if (lat >= 28.4 && lat <= 28.9 && lng >= 76.8 && lng <= 77.4) {
      return 'Delhi';
    }
    // Mumbai/Maharashtra
    else if (lat >= 18.8 && lat <= 19.3 && lng >= 72.7 && lng <= 73.1) {
      return 'Maharashtra';
    }
    // Bangalore/Karnataka
    else if (lat >= 12.8 && lat <= 13.2 && lng >= 77.4 && lng <= 77.8) {
      return 'Karnataka';
    }
    // Chennai/Tamil Nadu
    else if (lat >= 12.9 && lat <= 13.3 && lng >= 80.1 && lng <= 80.4) {
      return 'Tamil Nadu';
    }
    // Kolkata/West Bengal
    else if (lat >= 22.4 && lat <= 22.7 && lng >= 88.2 && lng <= 88.5) {
      return 'West Bengal';
    }
    // Hyderabad/Telangana
    else if (lat >= 17.2 && lat <= 17.6 && lng >= 78.3 && lng <= 78.7) {
      return 'Telangana';
    }
    // Ahmedabad/Gujarat
    else if (lat >= 22.9 && lat <= 23.2 && lng >= 72.4 && lng <= 72.7) {
      return 'Gujarat';
    }
    // Pune/Maharashtra
    else if (lat >= 18.4 && lat <= 18.7 && lng >= 73.7 && lng <= 74.0) {
      return 'Maharashtra';
    }
    // Chandigarh/Punjab
    else if (lat >= 30.6 && lat <= 30.8 && lng >= 76.6 && lng <= 76.9) {
      return 'Punjab';
    }
    
    return 'default';
  };

  const sortLanguagesByState = (state: string) => {
    const preferredOrder = stateLanguages[state] || stateLanguages.default;
    
    // Create a custom sort that puts local language first, then Hindi, then English, then others
    const sorted = [...availableLanguages].sort((a, b) => {
      const aIndex = preferredOrder.indexOf(a.code);
      const bIndex = preferredOrder.indexOf(b.code);
      
      // If both are in preferred list, sort by their order
      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }
      
      // If only a is in preferred list, it comes first
      if (aIndex !== -1) return -1;
      
      // If only b is in preferred list, it comes first
      if (bIndex !== -1) return 1;
      
      // For languages not in preferred list, maintain their original order
      return 0;
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
      
      // Store location in localStorage if available
      if (locationStored.current) {
        localStorage.setItem('userLocation', JSON.stringify({
          latitude: locationStored.current.latitude,
          longitude: locationStored.current.longitude,
          state: userState
        }));
      }
      
      markLanguageSelected();
      setStep('mobile');
      navigate('/auth');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-earth flex flex-col">
      {/* Fixed Header with Logo */}
      <div className="flex-shrink-0 p-4 bg-card/50 backdrop-blur-sm border-b border-border">
        <div className="flex flex-col items-center space-y-2">
          {/* App Logo */}
          <div className="flex items-center space-x-2">
            {tenant?.whiteLabel?.brand_identity?.logo_url ? (
              <img 
                src={tenant.whiteLabel.brand_identity.logo_url} 
                alt={tenant.whiteLabel.brand_identity.company_name || tenant.name}
                className="h-10 w-auto object-contain"
              />
            ) : (
              <div className="flex items-center space-x-2">
                <Leaf className="h-10 w-10 text-primary" />
                <span className="text-xl font-bold text-primary">KisanShakti</span>
              </div>
            )}
          </div>
          
          {/* Title */}
          <div className="text-center">
            <h1 className="text-lg font-semibold text-foreground">
              Select Your Language
            </h1>
            <p className="text-xs text-muted-foreground">
              अपनी भाषा चुनें | Choose your language
            </p>
          </div>

          {/* Location Status */}
          {detectingLocation && (
            <div className="flex items-center space-x-2 text-muted-foreground">
              <MapPin className="w-3 h-3 animate-pulse" />
              <span className="text-xs">Detecting location...</span>
            </div>
          )}
          
          {userState && userState !== 'default' && !detectingLocation && (
            <div className="flex items-center space-x-1 text-xs text-muted-foreground">
              <MapPin className="w-3 h-3" />
              <span>{userState}</span>
            </div>
          )}
        </div>
      </div>

      {/* Scrollable Language List */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="max-w-md mx-auto space-y-2">
          {sortedLanguages.map((lang, index) => (
            <Button
              key={lang.code}
              variant={selectedLanguage === lang.code ? "default" : "outline"}
              className="w-full h-16 flex items-center justify-between px-4 relative transition-all"
              onClick={() => handleLanguageSelect(lang.code)}
            >
              <div className="flex items-center space-x-3">
                <span className="text-xl font-medium">{lang.nativeName}</span>
                <span className="text-sm text-muted-foreground">({lang.name})</span>
              </div>
              
              {selectedLanguage === lang.code && (
                <div className="absolute right-4 bg-primary text-primary-foreground rounded-full p-1">
                  <Check className="w-4 h-4" />
                </div>
              )}
              
              {/* Show badge for recommended language */}
              {index === 0 && userState && userState !== 'default' && (
                <span className="absolute -top-2 left-4 text-[10px] bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
                  Recommended
                </span>
              )}
            </Button>
          ))}
        </div>
      </div>

      {/* Fixed Continue Button */}
      <div className="flex-shrink-0 p-4 bg-card/50 backdrop-blur-sm border-t border-border">
        <div className="max-w-md mx-auto">
          <Button
            onClick={handleContinue}
            disabled={!selectedLanguage}
            className="w-full h-12"
            size="lg"
          >
            Continue
            {selectedLanguage && (
              <span className="ml-2 text-sm opacity-80">
                ({sortedLanguages.find(l => l.code === selectedLanguage)?.nativeName})
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}