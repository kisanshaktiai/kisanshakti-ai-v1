import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useLanguageStore } from '@/stores/languageStore';
import { useTenant } from '@/contexts/TenantContext';
import { useAuthFlowStore } from '@/stores/authFlowStore';
import { useReverseGeocoding } from '@/hooks/useReverseGeocoding';
import { MapPin, Check, Leaf, Loader2 } from 'lucide-react';

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
  const { availableLanguages, setLanguage, fetchLanguages } = useLanguageStore();
  const { tenant, refetch: fetchTenant } = useTenant();
  const { reverseGeocode, isLoading: isGeocodingLoading } = useReverseGeocoding();
  const [selectedLanguage, setSelectedLanguage] = useState<string>('');
  const [userState, setUserState] = useState<string>('');
  const [userDistrict, setUserDistrict] = useState<string>('');
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [sortedLanguages, setSortedLanguages] = useState(availableLanguages);
  const [locationDenied, setLocationDenied] = useState(false);
  const [hasDetectedLocation, setHasDetectedLocation] = useState(false);
  const locationStored = useRef<{ latitude: number; longitude: number; state?: string; district?: string } | null>(null);

  useEffect(() => {
    // Fetch tenant and languages when component mounts
    const loadData = async () => {
      await fetchTenant();
      await fetchLanguages();
    };
    loadData();
    
    // Check if we have cached location
    const cachedLocation = localStorage.getItem('userLocation');
    if (cachedLocation) {
      try {
        const parsed = JSON.parse(cachedLocation);
        const cacheTime = parsed.timestamp || 0;
        const now = Date.now();
        
        // Use cache if less than 1 hour old
        if (now - cacheTime < 3600000) {
          setUserState(parsed.state || '');
          setUserDistrict(parsed.district || '');
          sortLanguagesByState(parsed.state || 'default');
          setHasDetectedLocation(true);
          locationStored.current = parsed;
        } else {
          detectUserLocation();
        }
      } catch {
        detectUserLocation();
      }
    } else {
      detectUserLocation();
    }
  }, []);

  const detectUserLocation = async () => {
    setDetectingLocation(true);
    try {
      if (!navigator.geolocation) {
        setDetectingLocation(false);
        sortLanguagesByState('default');
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          
          // Use reverse geocoding to get accurate state
          const result = await reverseGeocode(latitude, longitude);
          
          // Store location with timestamp
          const locationData = {
            latitude,
            longitude,
            state: result.state,
            district: result.district,
            timestamp: Date.now()
          };
          
          locationStored.current = locationData;
          localStorage.setItem('userLocation', JSON.stringify(locationData));
          
          setUserState(result.state);
          setUserDistrict(result.district || '');
          setHasDetectedLocation(true);
          sortLanguagesByState(result.state);
          setDetectingLocation(false);
        },
        (error) => {
          console.warn('Location permission denied or error:', error);
          setDetectingLocation(false);
          setLocationDenied(true);
          
          // Try to get approximate location from IP
          tryIPBasedLocation();
        },
        {
          enableHighAccuracy: false, // Use low accuracy for faster detection
          timeout: 10000,
          maximumAge: 600000 // Cache for 10 minutes
        }
      );
    } catch (error) {
      console.error('Location detection error:', error);
      setDetectingLocation(false);
      sortLanguagesByState('default');
    }
  };

  const tryIPBasedLocation = async () => {
    try {
      // Use ip-api.com for free IP-based geolocation
      const response = await fetch('http://ip-api.com/json/?fields=status,country,regionName,lat,lon');
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success' && data.country === 'India') {
          // Map region names to our state names
          const stateMapping: Record<string, string> = {
            'National Capital Territory of Delhi': 'Delhi',
            'Orissa': 'Odisha',
            'Pondicherry': 'Puducherry',
            // Add more mappings as needed
          };
          
          const mappedState = stateMapping[data.regionName] || data.regionName;
          setUserState(mappedState);
          sortLanguagesByState(mappedState);
        }
      }
    } catch (error) {
      console.warn('IP-based location failed:', error);
      sortLanguagesByState('default');
    }
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
    <div className="min-h-screen bg-gradient-primary flex flex-col">
      {/* Fixed Header with Logo */}
      <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-sm border-b border-border">
        <div className="flex flex-col items-center py-2 px-4 space-y-2">
          {/* App Logo */}
          <div className="flex items-center justify-center">
            {tenant?.branding?.logo_url ? (
              <img 
                src={tenant.branding.logo_url} 
                alt={tenant?.branding?.company_name || tenant?.name || 'App Logo'}
                className="h-10 w-auto object-contain"
                onError={(e) => {
                  // Fallback if image fails to load
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextElementSibling?.classList.remove('hidden');
                }}
              />
            ) : null}
            <div className={`flex items-center space-x-2 ${tenant?.branding?.logo_url ? 'hidden' : ''}`}>
              <Leaf className="h-10 w-10 text-primary" />
              <span className="text-xl font-bold text-primary">
                {tenant?.branding?.company_name || tenant?.name || 'KisanShakti'}
              </span>
            </div>
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

      {/* Location Status - Single Line */}
      {detectingLocation && (
        <div className="flex items-center space-x-2 text-muted-foreground animate-pulse">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span className="text-xs">Detecting your location...</span>
        </div>
      )}
      
      {!detectingLocation && locationDenied && (
        <div className="flex items-center space-x-1 text-xs text-status-warning">
          <MapPin className="w-3 h-3" />
          <span>Location access denied, showing default</span>
        </div>
      )}
      
      {userState && userState !== 'default' && !detectingLocation && !locationDenied && (
        <div className="flex items-center space-x-1 text-xs text-muted-foreground">
          <MapPin className="w-3 h-3 text-primary" />
          <span className="font-medium">{userState}</span>
          {userDistrict && (
            <>
              <span>•</span>
              <span>{userDistrict}</span>
            </>
          )}
        </div>
      )}
        </div>
      </header>

      {/* Scrollable Language List */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-md mx-auto px-4 py-6 space-y-3">
          {sortedLanguages.map((lang, index) => (
            <Button
              key={lang.code}
              variant={selectedLanguage === lang.code ? "default" : "outline"}
              className="w-full h-16 flex items-center justify-between px-4 relative transition-all hover:scale-[1.02]"
              onClick={() => handleLanguageSelect(lang.code)}
            >
              <div className="flex items-center space-x-3">
                <span className="text-xl font-medium">{lang.nativeName}</span>
                <span className="text-sm text-muted-foreground">({lang.name})</span>
              </div>
              
              {selectedLanguage === lang.code && (
                <div className="bg-primary text-primary-foreground rounded-full p-1">
                  <Check className="w-4 h-4" />
                </div>
              )}
              
        {/* Show badge for recommended language */}
        {index === 0 && hasDetectedLocation && userState && userState !== 'default' && (
          <span className="absolute -top-2 left-4 text-[10px] bg-primary text-primary-foreground px-2 py-0.5 rounded-full animate-pulse">
            Recommended for {userState}
          </span>
        )}
            </Button>
          ))}
        </div>
      </main>

      {/* Fixed Continue Button */}
      <footer className="sticky bottom-0 bg-background/90 backdrop-blur-sm border-t border-border">
        <div className="max-w-md mx-auto p-4">
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
      </footer>
    </div>
  );
}