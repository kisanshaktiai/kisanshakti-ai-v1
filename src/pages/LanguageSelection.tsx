import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useLanguageStore } from '@/stores/languageStore';
import { useTenant } from '@/contexts/TenantContext';
import { useAuthFlowStore } from '@/stores/authFlowStore';
import { useReverseGeocoding } from '@/hooks/useReverseGeocoding';
import { MapPin, Check, Leaf, Loader2, Sparkles, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10 flex flex-col">
      {/* Fixed Header with Logo - Modern Glassmorphism */}
      <header className="sticky top-0 z-50 glassmorphism-strong border-b border-border/30 shadow-lg">
        <div className="flex flex-col items-center py-4 px-4 space-y-3">
          {/* App Logo */}
          <motion.div 
            className="flex items-center justify-center"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            {tenant?.branding?.logo_url ? (
              <img 
                src={tenant.branding.logo_url} 
                alt={tenant?.branding?.company_name || tenant?.name || 'App Logo'}
                className="h-12 w-auto object-contain drop-shadow-lg"
                onError={(e) => {
                  // Fallback if image fails to load
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextElementSibling?.classList.remove('hidden');
                }}
              />
            ) : null}
            <div className={`flex items-center space-x-2 ${tenant?.branding?.logo_url ? 'hidden' : ''}`}>
              <div className="relative">
                <Leaf className="h-12 w-12 text-primary drop-shadow-lg" />
                <Sparkles className="absolute -top-1 -right-1 h-5 w-5 text-primary animate-pulse" />
              </div>
              <span className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                {tenant?.branding?.company_name || tenant?.name || 'KisanShakti'}
              </span>
            </div>
          </motion.div>
          
          {/* Title */}
          <div className="text-center space-y-1">
            <h1 className="text-xl font-bold text-foreground flex items-center justify-center gap-2">
              <Globe className="w-5 h-5 text-primary" />
              Select Your Language
            </h1>
            <p className="text-xs text-muted-foreground font-medium">
              अपनी भाषा चुनें | Choose your language
            </p>
          </div>

          {/* Location Status - Compact */}
          <AnimatePresence mode="wait">
            {detectingLocation && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center space-x-2 text-muted-foreground bg-primary/10 px-3 py-1.5 rounded-full"
              >
                <Loader2 className="w-3 h-3 animate-spin" />
                <span className="text-xs font-medium">Detecting location...</span>
              </motion.div>
            )}
            
            {!detectingLocation && locationDenied && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center space-x-1.5 text-xs text-warning bg-warning/10 px-3 py-1.5 rounded-full"
              >
                <MapPin className="w-3 h-3" />
                <span className="font-medium">Location access denied</span>
              </motion.div>
            )}
            
            {userState && userState !== 'default' && !detectingLocation && !locationDenied && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center space-x-1.5 text-xs bg-primary/10 text-primary px-3 py-1.5 rounded-full border border-primary/20"
              >
                <MapPin className="w-3 h-3" />
                <span className="font-bold">{userState}</span>
                {userDistrict && (
                  <>
                    <span className="text-muted-foreground">•</span>
                    <span className="font-medium text-muted-foreground">{userDistrict}</span>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* Scrollable Language List */}
      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-md mx-auto space-y-3">
          {sortedLanguages.map((lang, index) => (
            <motion.div
              key={lang.code}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Button
                variant={selectedLanguage === lang.code ? "pill-gradient" : "outline"}
                className={`w-full h-auto py-4 px-5 flex items-center justify-between relative transition-all hover:scale-[1.02] ${
                  selectedLanguage === lang.code ? 'shadow-glow' : ''
                }`}
                onClick={() => handleLanguageSelect(lang.code)}
              >
                <div className="flex items-center space-x-3">
                  <span className="text-2xl font-bold">{lang.nativeName}</span>
                  <span className="text-sm text-muted-foreground font-medium">({lang.name})</span>
                </div>
                
                {selectedLanguage === lang.code && (
                  <motion.div 
                    className="bg-white/20 backdrop-blur-sm rounded-full p-1.5"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  >
                    <Check className="w-5 h-5" />
                  </motion.div>
                )}
                
                {/* Recommended badge */}
                {index === 0 && hasDetectedLocation && userState && userState !== 'default' && (
                  <motion.span 
                    className="absolute -top-2 left-4 text-[10px] bg-primary text-primary-foreground px-3 py-1 rounded-full font-bold shadow-lg"
                    initial={{ y: -10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.3 }}
                  >
                    ✨ Recommended
                  </motion.span>
                )}
              </Button>
            </motion.div>
          ))}
        </div>
      </main>

      {/* Fixed Continue Button - Modern Glassmorphism */}
      <footer className="sticky bottom-0 glassmorphism-strong border-t border-border/30 shadow-float">
        <div className="max-w-md mx-auto p-4">
          <Button
            onClick={handleContinue}
            disabled={!selectedLanguage}
            variant="pill-gradient"
            size="lg"
            className="w-full group"
          >
            Continue
            {selectedLanguage && (
              <span className="ml-2 text-sm opacity-90 font-medium">
                ({sortedLanguages.find(l => l.code === selectedLanguage)?.nativeName})
              </span>
            )}
            <Sparkles className="w-4 h-4 ml-2 group-hover:rotate-12 transition-transform" />
          </Button>
        </div>
      </footer>
    </div>
  );
}