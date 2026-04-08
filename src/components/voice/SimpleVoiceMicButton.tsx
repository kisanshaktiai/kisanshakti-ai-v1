import React, { useState, useEffect, useRef } from 'react';
import { Mic, Volume2, X, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useLanguageStore } from '@/stores/languageStore';
import { useTenant } from '@/contexts/TenantContext';
import { useAuthStore } from '@/stores/authStore';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { getVoicePlatformInfo, getUnsupportedMessage } from '@/services/voice/voicePlatformDetector';

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
  console.log('[SimpleVoiceMicButton] Component rendering with props:', {
    isListening,
    isSpeaking,
    isReady,
    isSupported
  });

  const navigate = useNavigate();
  const { toast } = useToast();
  const { currentLanguage } = useLanguageStore();
  const { tenant } = useTenant();
  const { user } = useAuthStore();
  const [suggestions, setSuggestions] = useState<VoiceSuggestion[]>([]);
  const [showPanel, setShowPanel] = useState(false);
  const [isSpeakingSuggestion, setIsSpeakingSuggestion] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const isPressedRef = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Pre-fetch suggestions on mount and show welcome
  useEffect(() => {
    console.log('[SimpleVoiceMicButton] Component mounted, pre-fetching suggestions');
    fetchSuggestions();
    
    // Show welcome message briefly - no auto-show suggestions
    const welcomeTimer = setTimeout(() => {
      setShowWelcome(false);
    }, 3000);
    
    return () => {
      clearTimeout(welcomeTimer);
    };
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

  const getHoldToSpeakText = () => {
    const texts: Record<string, string> = {
      'hi': 'दबाए रखें और बोलें',
      'en': 'Hold & speak',
      'mr': 'दाबा आणि बोला',
      'ta': 'அழுத்தி பேசுங்கள்',
      'pa': 'ਦਬਾਓ ਤੇ ਬੋਲੋ',
    };
    return texts[currentLanguage || 'en'] || texts['en'];
  };

  const getListeningText = () => {
    const texts: Record<string, string> = {
      'hi': 'सुन रहा हूं...',
      'en': 'Listening...',
      'mr': 'ऐकत आहे...',
      'ta': 'கேட்கிறேன்...',
      'pa': 'ਸੁਣ ਰਿਹਾ ਹਾਂ...',
    };
    return texts[currentLanguage || 'en'] || texts['en'];
  };

  const getYouCanSayText = () => {
    const texts: Record<string, string> = {
      'hi': 'आप कह सकते हैं',
      'en': 'You can say',
      'mr': 'तुम्ही म्हणू शकता',
      'ta': 'நீங்கள் சொல்லலாம்',
      'pa': 'ਤੁਸੀਂ ਕਹਿ ਸਕਦੇ ਹੋ',
    };
    return texts[currentLanguage || 'en'] || texts['en'];
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
    // Only preventDefault for touch events on this button — don't block page scroll
    if ('touches' in e) {
      e.stopPropagation();
    } else {
      e.preventDefault();
    }
    console.log('[Voice] Press START, isReady:', isReady, 'isSupported:', isSupported);
    
    // Check if service is ready
    if (!isReady || !isSupported) {
      console.warn('[VoiceMic] Service not ready or not supported');
      
      // Get detailed platform info for better error message
      const platformInfo = getVoicePlatformInfo();
      const message = getUnsupportedMessage(currentLanguage, platformInfo.unsupportedReason);
      
      toast({
        title: message.title,
        description: message.description,
        variant: isSupported ? "default" : "destructive",
        duration: 6000, // Longer duration for actionable messages
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
    if ('touches' in e) {
      e.stopPropagation();
    } else {
      e.preventDefault();
    }
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
    e.stopPropagation();
    console.log('[Voice] Press CANCEL');
    isPressedRef.current = false;
    setShowPanel(false);
    window.speechSynthesis.cancel();
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    onStopListening();
  };

  console.log('[SimpleVoiceMicButton] About to render JSX');
  
  return (
    <>
      {console.log('[SimpleVoiceMicButton] Rendering close button and mic button')}
      
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

      {/* Floating Mic Button Container - Above Bottom Nav */}
      <motion.div
        key="voice-mic-button-container"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed bottom-28 right-4 z-50 flex flex-col items-center gap-3"
      >
        {/* Modern Glassmorphic Welcome Tooltip */}
        <AnimatePresence>
          {showWelcome && !showPanel && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.9 }}
              className="absolute -top-20 left-1/2 -translate-x-1/2 whitespace-nowrap"
            >
              <div className="relative">
                {/* Glassmorphic bubble */}
                <div className="bg-gradient-to-r from-primary/95 to-primary/80 backdrop-blur-xl px-5 py-3 rounded-2xl shadow-2xl border border-white/20">
                  <p className="text-sm font-semibold text-white flex items-center gap-2">
                    <motion.span
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 1, repeat: Infinity }}
                    >
                      👆
                    </motion.span>
                    {getHoldToSpeakText()}
                  </p>
                </div>
                {/* Arrow pointing to mic */}
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-primary/90 rotate-45" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Listening State Indicator - Above mic button */}
        <AnimatePresence>
          {showPanel && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="absolute -top-16 left-1/2 -translate-x-1/2"
            >
              <div className="bg-background/95 backdrop-blur-xl px-4 py-2 rounded-full border border-primary/30 shadow-lg flex items-center gap-2">
                <motion.div
                  animate={{ scale: [1, 1.3, 1] }}
                  transition={{ duration: 0.8, repeat: Infinity }}
                  className="w-3 h-3 bg-primary rounded-full"
                />
                <span className="text-sm font-medium text-primary">
                  {getListeningText()}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mic Button with Press-and-Hold */}
        <div 
          className="relative"
          onMouseDown={handlePressStart}
          onMouseUp={handlePressEnd}
          onMouseLeave={handlePressEnd}
          onTouchStart={handlePressStart}
          onTouchEnd={handlePressEnd}
          onTouchCancel={handlePressCancel}
        >
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

          {/* Idle Pulse Animation - Shows when not pressing */}
          <AnimatePresence>
            {!showPanel && isReady && isSupported && (
              <motion.div
                key="idle-pulse"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.1, 0.3] }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ 
                  duration: 2, 
                  repeat: Infinity,
                  ease: "easeInOut" 
                }}
                className="absolute inset-0 rounded-full bg-primary"
                style={{ filter: "blur(10px)" }}
              />
            )}
          </AnimatePresence>

          {/* 2030 Modern Mic Button */}
          <button
            className={cn(
              "relative w-[72px] h-[72px] rounded-full transition-all duration-300",
              "flex items-center justify-center touch-manipulation",
              "focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/40",
              !isReady || !isSupported
                ? "bg-muted/50 opacity-50 cursor-not-allowed"
                : showPanel
                  ? "bg-gradient-to-br from-primary via-primary to-primary/80 scale-110" 
                  : "bg-gradient-to-br from-primary to-primary/70 hover:scale-105 active:scale-95",
              "shadow-[0_8px_32px_rgba(var(--primary),0.4)]"
            )}
            aria-label={!isReady ? "Voice service loading..." : "Press and hold for voice navigation"}
            disabled={!isReady || !isSupported}
          >
            {/* Inner glow ring when active */}
            {showPanel && (
              <div className="absolute inset-2 rounded-full bg-white/20 animate-pulse" />
            )}
            
            <Mic 
              className={cn(
                "relative z-10 transition-all duration-300",
                !isReady || !isSupported
                  ? "text-muted-foreground"
                  : showPanel ? "w-8 h-8 text-white" : "w-7 h-7 text-white"
              )} 
              strokeWidth={2.5}
            />
          </button>
        </div>

        {/* Always-Visible Instruction Text */}
        {!showWelcome && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xs text-muted-foreground text-center font-medium bg-background/80 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-sm"
          >
            {showPanel ? getListeningText() : getHoldToSpeakText()}
          </motion.p>
        )}
      </motion.div>

      {/* 2030 Modern Suggestions Panel - Bottom Sheet */}
      <AnimatePresence>
        {showPanel && suggestions.length > 0 && (
          <motion.div
            key="suggestions-panel"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-x-0 bottom-28 z-40 px-4"
          >
            <div className="bg-background/98 backdrop-blur-2xl border border-border/30 rounded-3xl shadow-2xl overflow-hidden">
              {/* Modern Header */}
              <div className="px-5 py-4 bg-gradient-to-r from-primary/10 to-transparent border-b border-border/20">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                    <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 1.5, repeat: Infinity }}>
                      <Volume2 className="w-5 h-5 text-primary" />
                    </motion.div>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{getYouCanSayText()}</p>
                    {isListening && (
                      <p className="text-xs text-primary flex items-center gap-1">
                        <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                        {getListeningText()}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Modern Suggestions Grid */}
              <div className="p-4 grid grid-cols-2 gap-3 max-h-[40vh] overflow-y-auto">
                {suggestions.map((suggestion, index) => (
                  <motion.button
                    key={suggestion.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="flex flex-col items-start p-4 rounded-2xl bg-muted/50 hover:bg-primary/10 border border-transparent hover:border-primary/30 transition-all active:scale-95"
                  >
                     <p className="text-sm font-medium text-foreground mb-1">
                       "{suggestion.patterns[0]}"
                     </p>
                     <p className="text-xs text-muted-foreground line-clamp-2">
                       {suggestion.response_text}
                     </p>
                   </motion.button>
                 ))}
               </div>
             </div>
           </motion.div>
         )}
       </AnimatePresence>

      {/* Live Transcript Display - Above Bottom Nav */}
      <AnimatePresence>
        {transcript && showPanel && (
          <motion.div
            key="transcript"
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-44 right-4 max-w-xs z-50"
          >
            <div className="bg-background/95 backdrop-blur-xl border-2 border-primary rounded-2xl shadow-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <motion.div
                  animate={{ scale: [1, 1.3, 1] }}
                  transition={{ duration: 0.8, repeat: Infinity }}
                  className="w-2 h-2 bg-primary rounded-full"
                />
                <p className="text-xs font-semibold text-primary">
                  {getListeningText()}
                </p>
              </div>
              <p className="text-sm text-foreground leading-relaxed">{transcript}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error/Status Display */}
      <AnimatePresence>
        {error && !showPanel && (
          <motion.div
            key="error-display"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-44 right-4 max-w-xs z-50"
          >
            <div className="px-4 py-3 rounded-2xl shadow-xl backdrop-blur-xl border-2 bg-destructive/10 border-destructive/30 text-destructive">
              <p className="text-sm font-medium">{error}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
