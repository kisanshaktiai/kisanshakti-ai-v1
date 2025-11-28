import React, { useState, useEffect, useRef } from 'react';
import { Mic, Volume2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useLanguageStore } from '@/stores/languageStore';
import { useTenant } from '@/contexts/TenantContext';
import { useAuthStore } from '@/stores/authStore';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';

interface VoiceSuggestion {
  id: string;
  intent_name: string;
  patterns: string[];
  route: string;
  response_text: string;
  display_order: number;
}

interface SimpleVoiceMicButtonProps {
  isListening: boolean;
  isSpeaking: boolean;
  transcript: string;
  isReady: boolean;
  isSupported: boolean;
  onStartListening: () => void;
  onStopListening: () => void;
  onClose: () => void;
  error?: string;
}

export const SimpleVoiceMicButton: React.FC<SimpleVoiceMicButtonProps> = ({
  isListening,
  isSpeaking,
  transcript,
  isReady,
  isSupported,
  onStartListening,
  onStopListening,
  onClose,
  error,
}) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { currentLanguage } = useLanguageStore();
  const { tenant } = useTenant();
  const { user } = useAuthStore();
  const [suggestions, setSuggestions] = useState<VoiceSuggestion[]>([]);
  const [showPanel, setShowPanel] = useState(false);
  const [isSpeakingSuggestion, setIsSpeakingSuggestion] = useState(false);
  const isPressedRef = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Pre-fetch suggestions on mount to avoid race conditions
  useEffect(() => {
    console.log('[Voice] Component mounted, pre-fetching suggestions');
    fetchSuggestions();
  }, []);

  const fetchSuggestions = async () => {
    try {
      console.log('[Voice] Fetching suggestions...');
      const { data: { user: authUser } } = await supabase.auth.getUser();
      
      if (!authUser) {
        console.error('[Voice] No user found');
        return;
      }

      // Get user's tenant from profile
      const { data: profile } = await supabase
        .from('farmers')
        .select('tenant_id')
        .eq('id', authUser.id)
        .single();

      const language = currentLanguage || 'en';
      console.log('[Voice] Using language:', language);

      // Fetch active voice navigation intents - be flexible with tenant_id
      const query = supabase
        .from('voice_navigation_intents')
        .select('id, intent_id, patterns, route, response_template, priority')
        .eq('language_code', language)
        .eq('is_active', true)
        .order('priority', { ascending: true })
        .limit(6);

      // Only filter by tenant_id if profile exists
      if (profile?.tenant_id) {
        query.eq('tenant_id', profile.tenant_id);
        console.log('[Voice] Filtering by tenant_id:', profile.tenant_id);
      }

      const { data: intents, error } = await query;

      if (error) {
        console.error('[Voice] Error fetching suggestions:', error);
        return;
      }

      console.log('[Voice] Fetched suggestions:', intents?.length || 0);
      if (intents && intents.length > 0) {
        // Transform the data to match our interface
        const transformedSuggestions = intents.map((intent, index) => ({
          id: intent.id,
          intent_name: intent.intent_id,
          patterns: Array.isArray(intent.patterns) 
            ? (intent.patterns as any[]).map(p => String(p))
            : [],
          route: intent.route || '',
          response_text: typeof intent.response_template === 'object' 
            ? (intent.response_template as any)[language] || ''
            : '',
          display_order: index
        }));
        setSuggestions(transformedSuggestions);
      }
    } catch (error) {
      console.error('[Voice] Error in fetchSuggestions:', error);
    }
  };

  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = getLanguageCode();
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  };

  const getLanguageCode = (): string => {
    const langMap: Record<string, string> = {
      'en': 'en-US',
      'hi': 'hi-IN',
      'mr': 'mr-IN',
      'ta': 'ta-IN',
      'pa': 'pa-IN',
    };
    return langMap[currentLanguage || 'en'] || 'en-US';
  };

  const getWelcomeMessage = () => {
    const messages: Record<string, string> = {
      'hi': 'आप कहाँ जाना चाहते हैं?',
      'en': 'Where would you like to go?',
      'mr': 'तुम्ही कुठे जाऊ इच्छिता?',
      'ta': 'நீங்கள் எங்கே செல்ல விரும்புகிறீர்கள்?',
      'pa': 'ਤੁਸੀਂ ਕਿੱਥੇ ਜਾਣਾ ਚਾਹੁੰਦੇ ਹੋ?',
    };
    return messages[currentLanguage || 'en'] || messages['en'];
  };

  const handleSuggestionClick = async (suggestion: VoiceSuggestion) => {
    if (isSpeakingSuggestion) return;
    
    console.log('[Voice] Suggestion clicked:', suggestion.intent_name);
    setIsSpeakingSuggestion(true);
    
    // Stop any ongoing speech
    window.speechSynthesis.cancel();
    
    // Speak response
    if (suggestion.response_text) {
      speakText(suggestion.response_text);
    }
    
    // Close panel
    isPressedRef.current = false;
    setShowPanel(false);
    onStopListening();
    
    // Navigate after a short delay
    setTimeout(() => {
      setIsSpeakingSuggestion(false);
      if (suggestion.route) {
        navigate(suggestion.route);
      }
    }, 1500);
  };

  const handlePressStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    console.log('[Voice] Press START, isReady:', isReady, 'isSupported:', isSupported);
    
    // Check if service is ready
    if (!isReady || !isSupported) {
      console.warn('[VoiceMic] Service not ready or not supported');
      toast({
        title: "Voice Not Ready",
        description: isSupported 
          ? "Voice service is initializing. Please wait a moment..."
          : "Your browser doesn't support voice recognition. Try Chrome, Edge, or Safari.",
        variant: isSupported ? "default" : "destructive",
      });
      return;
    }
    
    if (isPressedRef.current) {
      console.log('[VoiceMic] Already pressed, ignoring duplicate event');
      return;
    }
    
    isPressedRef.current = true;
    
    // Show panel immediately since suggestions are pre-loaded
    if (suggestions.length > 0) {
      setShowPanel(true);
      
      // Speak welcome message
      const welcomeMessage = getWelcomeMessage();
      speakText(welcomeMessage);
    }
    
    onStartListening();
  };

  const handlePressEnd = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    console.log('[Voice] Press END');
    isPressedRef.current = false;
    setShowPanel(false);
    window.speechSynthesis.cancel();
    
    // Small delay before stopping to ensure last words are captured
    timeoutRef.current = setTimeout(() => {
      onStopListening();
    }, 300);
  };

  const handlePressCancel = (e: React.TouchEvent) => {
    e.preventDefault();
    console.log('[Voice] Press CANCEL');
    isPressedRef.current = false;
    setShowPanel(false);
    window.speechSynthesis.cancel();
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    onStopListening();
  };

  return (
    <>
      {/* Close Button - Top Right */}
      <motion.button
        key="voice-close-button"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0, opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        className="fixed top-6 right-6 z-50 w-10 h-10 rounded-full bg-background/80 backdrop-blur-sm border border-border/20 shadow-lg flex items-center justify-center hover:bg-muted/80 transition-colors"
        aria-label="Close voice navigation"
      >
        <X className="w-5 h-5 text-muted-foreground" />
      </motion.button>

      {/* Floating Mic Button - Fixed Position Bottom Right */}
      <motion.div
        key="voice-mic-button"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed bottom-6 right-6 z-50"
        onMouseDown={handlePressStart}
        onMouseUp={handlePressEnd}
        onMouseLeave={handlePressEnd}
        onTouchStart={handlePressStart}
        onTouchEnd={handlePressEnd}
        onTouchCancel={handlePressCancel}
      >
        <div className="relative">
          {/* Pulse Animation - Only shows while physically pressing */}
          <AnimatePresence>
            {showPanel && (
              <>
                <motion.div
                  key="pulse-1"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 0.3 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ 
                    duration: 1.5, 
                    repeat: Infinity,
                    ease: "easeInOut" 
                  }}
                  className="absolute inset-0 rounded-full bg-primary"
                  style={{ filter: "blur(8px)" }}
                />
                <motion.div
                  key="pulse-2"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1.2, opacity: 0.2 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ 
                    duration: 1.5, 
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: 0.3
                  }}
                  className="absolute inset-0 rounded-full bg-primary"
                  style={{ filter: "blur(12px)" }}
                />
              </>
            )}
          </AnimatePresence>

          {/* Main Mic Button */}
          <button
            className={cn(
              "relative w-14 h-14 rounded-full shadow-lg transition-all duration-300",
              "flex items-center justify-center",
              "focus:outline-none focus:ring-4 focus:ring-primary/30",
              !isReady || !isSupported
                ? "bg-muted opacity-50 cursor-not-allowed"
                : showPanel
                  ? "bg-primary scale-110 shadow-primary/50" 
                  : "bg-gradient-to-br from-primary/90 to-primary/70 hover:scale-105 active:scale-95"
            )}
            aria-label={!isReady ? "Voice service loading..." : "Voice navigation"}
            disabled={!isReady || !isSupported}
          >
            <Mic 
              className={cn(
                "relative z-10 transition-all duration-300",
                !isReady || !isSupported
                  ? "text-muted-foreground"
                  : showPanel ? "w-6 h-6 text-white" : "w-5 h-5 text-white"
              )} 
              strokeWidth={2.5}
            />
          </button>
        </div>
      </motion.div>

      {/* Suggestions Panel - Shows ONLY while holding */}
      <AnimatePresence>
        {showPanel && suggestions.length > 0 && (
          <motion.div
            key="suggestions-panel"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed bottom-24 right-6 w-80 max-w-[calc(100vw-3rem)] z-50"
          >
            <div className="bg-background/95 backdrop-blur-xl border border-border/20 rounded-2xl shadow-2xl p-4">
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border/20">
                <Volume2 className="w-4 h-4 text-primary animate-pulse" />
                <p className="text-sm font-semibold text-foreground">
                  {currentLanguage === 'hi' && 'कुछ सुझाव'}
                  {currentLanguage === 'en' && 'Suggestions'}
                  {currentLanguage === 'mr' && 'सूचना'}
                  {currentLanguage === 'ta' && 'பரிந்துரைகள்'}
                  {currentLanguage === 'pa' && 'ਸੁਝਾਅ'}
                  {!['hi', 'en', 'mr', 'ta', 'pa'].includes(currentLanguage || '') && 'Suggestions'}
                </p>
              </div>
              
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion.id}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-primary/10 transition-colors group"
                  >
                    <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                      "{suggestion.patterns[0]}"
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {suggestion.response_text}
                    </p>
                  </button>
                ))}
              </div>
              
              <div className="mt-3 pt-3 border-t border-border/20">
                <p className="text-xs text-muted-foreground text-center">
                  {currentLanguage === 'hi' && 'या बोलें...'}
                  {currentLanguage === 'en' && 'Or speak naturally...'}
                  {currentLanguage === 'mr' && 'किंवा बोला...'}
                  {currentLanguage === 'ta' && 'அல்லது பேசுங்கள்...'}
                  {currentLanguage === 'pa' && 'ਜਾਂ ਬੋਲੋ...'}
                  {!['hi', 'en', 'mr', 'ta', 'pa'].includes(currentLanguage || '') && 'Or speak naturally...'}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Transcript Display - Only show when not showing suggestions */}
      <AnimatePresence>
        {(transcript || error) && !showPanel && (
          <motion.div
            key="transcript-display"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-24 right-6 max-w-xs z-50"
          >
            <div className={cn(
              "px-4 py-3 rounded-2xl shadow-xl backdrop-blur-xl border",
              error 
                ? "bg-destructive/10 border-destructive/20 text-destructive" 
                : "bg-background/95 border-border/20"
            )}>
              {error ? (
                <p className="text-sm font-medium">{error}</p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground mb-1">
                    {isListening ? "Listening..." : isSpeaking ? "Processing..." : "Done"}
                  </p>
                  <p className="text-sm font-medium">{transcript}</p>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
