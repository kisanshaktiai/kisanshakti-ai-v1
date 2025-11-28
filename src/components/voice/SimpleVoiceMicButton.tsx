import React, { useState, useEffect, useRef } from 'react';
import { Mic, Volume2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useLanguageStore } from '@/stores/languageStore';
import { useTenant } from '@/contexts/TenantContext';
import { useAuthStore } from '@/stores/authStore';

interface VoiceSuggestion {
  id: string;
  intent_id: string;
  patterns: string[];
  route: string;
  response_template: Record<string, string>;
}

interface SimpleVoiceMicButtonProps {
  isListening: boolean;
  isSpeaking: boolean;
  transcript: string;
  onStartListening: () => void;
  onStopListening: () => void;
  error?: string;
}

export const SimpleVoiceMicButton: React.FC<SimpleVoiceMicButtonProps> = ({
  isListening,
  isSpeaking,
  transcript,
  onStartListening,
  onStopListening,
  error,
}) => {
  const { currentLanguage } = useLanguageStore();
  const { tenant } = useTenant();
  const { user } = useAuthStore();
  const [suggestions, setSuggestions] = useState<VoiceSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSpeakingSuggestion, setIsSpeakingSuggestion] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch suggestions from database when user holds the mic
  useEffect(() => {
    if (isHolding && !showSuggestions) {
      fetchSuggestions();
    }
  }, [isHolding, showSuggestions]);

  const fetchSuggestions = async () => {
    try {
      const { data, error } = await supabase
        .from('voice_navigation_intents')
        .select('id, intent_id, patterns, route, response_template')
        .eq('tenant_id', tenant?.id || user?.tenantId)
        .eq('language_code', currentLanguage || 'en')
        .eq('is_active', true)
        .eq('action', 'navigate')
        .limit(6);

      if (error) throw error;

      if (data && data.length > 0) {
        setSuggestions(data as VoiceSuggestion[]);
        setShowSuggestions(true);
        
        // Read welcome message aloud
        speakText(getWelcomeMessage());
      }
    } catch (err) {
      console.error('Error fetching suggestions:', err);
    }
  };

  const getWelcomeMessage = () => {
    const messages: Record<string, string> = {
      'hi': 'आप क्या करना चाहते हैं? कुछ सुझाव यहां हैं',
      'en': 'What would you like to do? Here are some suggestions',
      'mr': 'तुम्हाला काय करायचे आहे? येथे काही सूचना आहेत',
      'ta': 'நீங்கள் என்ன செய்ய விரும்புகிறீர்கள்? இதோ சில பரிந்துரைகள்',
      'pa': 'ਤੁਸੀਂ ਕੀ ਕਰਨਾ ਚਾਹੁੰਦੇ ਹੋ? ਇੱਥੇ ਕੁਝ ਸੁਝਾਅ ਹਨ',
    };
    return messages[currentLanguage || 'en'] || messages['en'];
  };

  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      // Cancel any ongoing speech
      window.speechSynthesis.cancel();
      
      setIsSpeakingSuggestion(true);
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = getLanguageCode();
      utterance.rate = 0.9;
      utterance.onend = () => setIsSpeakingSuggestion(false);
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

  const handleSuggestionClick = (suggestion: VoiceSuggestion) => {
    // Stop any speech
    window.speechSynthesis.cancel();
    
    // Speak the response
    const responseText = suggestion.response_template[currentLanguage || 'en'] || 
                         suggestion.response_template['en'] || 
                         'Opening...';
    speakText(responseText);
    
    // Close suggestions
    setShowSuggestions(false);
    setIsHolding(false);
    onStopListening();
    
    // Navigate after a short delay
    setTimeout(() => {
      if (suggestion.route) {
        window.location.hash = suggestion.route;
      }
    }, 500);
  };

  const handlePressStart = () => {
    setIsHolding(true);
    onStartListening();
  };

  const handlePressEnd = () => {
    setIsHolding(false);
    setShowSuggestions(false);
    window.speechSynthesis.cancel();
    
    // Small delay before stopping to ensure last words are captured
    timeoutRef.current = setTimeout(() => {
      onStopListening();
    }, 300);
  };

  const handlePressCancel = () => {
    setIsHolding(false);
    setShowSuggestions(false);
    window.speechSynthesis.cancel();
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    onStopListening();
  };

  return (
    <>
      {/* Floating Mic Button - Fixed Position Bottom Right, Smaller */}
      <motion.div
        className="fixed bottom-24 right-6 z-50"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
      >
        <div className="relative">
          {/* Pulse Animation */}
          <AnimatePresence>
            {isHolding && (
              <>
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: [1, 1.5, 2], opacity: [0.5, 0.2, 0] }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: "easeOut"
                  }}
                  className="absolute inset-0 -m-6 rounded-full bg-primary"
                />
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: [1, 1.3, 1.6], opacity: [0.4, 0.2, 0] }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: "easeOut",
                    delay: 0.5
                  }}
                  className="absolute inset-0 -m-4 rounded-full bg-primary"
                />
              </>
            )}
          </AnimatePresence>

          <button
            onMouseDown={handlePressStart}
            onMouseUp={handlePressEnd}
            onMouseLeave={handlePressCancel}
            onTouchStart={handlePressStart}
            onTouchEnd={handlePressEnd}
            onTouchCancel={handlePressCancel}
            className={cn(
              "relative w-14 h-14 rounded-full shadow-lg transition-all duration-300",
              "flex items-center justify-center",
              "focus:outline-none focus:ring-4 focus:ring-primary/30",
              isHolding
                ? "bg-primary scale-110 shadow-primary/50" 
                : "bg-gradient-to-br from-primary/90 to-primary/70 hover:scale-105 active:scale-95"
            )}
            aria-label={isListening ? "Release to send" : "Hold to speak"}
          >
            {/* Mic Icon */}
            <Mic 
              className={cn(
                "relative z-10 transition-all duration-300",
                isHolding ? "w-6 h-6 text-white" : "w-5 h-5 text-white"
              )} 
              strokeWidth={2.5}
            />
          </button>
        </div>
      </motion.div>

      {/* Suggestions Panel - Shows when holding mic */}
      <AnimatePresence>
        {isHolding && showSuggestions && suggestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed bottom-44 right-6 w-80 max-w-[calc(100vw-3rem)] z-50"
          >
            <div className="bg-background/95 backdrop-blur-xl border border-border/20 rounded-2xl shadow-2xl p-4">
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border/20">
                <Volume2 className={cn(
                  "w-4 h-4",
                  isSpeakingSuggestion ? "text-primary animate-pulse" : "text-primary"
                )} />
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
                      {suggestion.response_template[currentLanguage || 'en'] || suggestion.response_template['en']}
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
        {(transcript || error) && !showSuggestions && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-44 right-6 max-w-xs z-50"
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
