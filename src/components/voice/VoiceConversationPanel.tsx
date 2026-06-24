import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Volume2, VolumeX, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { WaveformVisualizer } from '@/components/chat/WaveformVisualizer';

interface VoiceConversationPanelProps {
  isOpen: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  transcript: string;
  language: string;
  suggestions?: string[];
  onClose: () => void;
  onStartListening: () => void;
  onStopListening: () => void;
  onMuteToggle: () => void;
  isMuted?: boolean;
}

const languageNames: Record<string, string> = {
  'en': 'English',
  'hi': 'हिंदी',
  'mr': 'मराठी',
  'ta': 'தமிழ்',
  'pa': 'ਪੰਜਾਬੀ',
  'te': 'తెలుగు',
  'bn': 'বাংলা',
  'ml': 'മലയാളം',
  'gu': 'ગુજરાતી',
  'kn': 'ಕನ್ನಡ',
  'or': 'ଓଡ଼ିଆ',
  'as': 'অসমীয়া',
  'ur': 'اردو',
  'sa': 'संस्कृत'
};

export function VoiceConversationPanel({
  isOpen,
  isListening,
  isSpeaking,
  transcript,
  language,
  suggestions = [],
  onClose,
  onStartListening,
  onStopListening,
  onMuteToggle,
  isMuted = false
}: VoiceConversationPanelProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm"
        >
          <div className="container max-w-2xl mx-auto h-full flex flex-col p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="text-sm">
                  {languageNames[language] || language}
                </Badge>
                {isListening && (
                  <Badge variant="default" className="animate-pulse">
                    Listening...
                  </Badge>
                )}
                {isSpeaking && (
                  <Badge variant="default" className="animate-pulse">
                    Speaking...
                  </Badge>
                )}
              </div>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Waveform Visualizer */}
            <div className="flex-1 flex items-center justify-center mb-8">
              <div className="w-full max-w-md">
                {(isListening || isSpeaking) && (
                  <div className="flex items-center justify-center gap-2">
                    {[0, 0.1, 0.2, 0.3, 0.4].map((delay, i) => (
                      <motion.div
                        key={i}
                        className="w-2 bg-primary rounded-full"
                        animate={{
                          height: ['20px', '60px', '20px'],
                        }}
                        transition={{
                          duration: 0.8,
                          repeat: Infinity,
                          delay,
                          ease: "easeInOut"
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Transcript Display */}
            <Card className="mb-6 p-6 min-h-[120px] flex items-center justify-center">
              {transcript ? (
                <p className="text-lg text-center">{transcript}</p>
              ) : (
                <p className="text-muted-foreground text-center">
                  {isListening 
                    ? "Speak now..." 
                    : "Tap the microphone to start"}
                </p>
              )}
            </Card>

            {/* Quick Suggestions */}
            {suggestions.length > 0 && !isListening && (
              <div className="mb-6">
                <p className="text-sm text-muted-foreground mb-3">Try saying:</p>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((suggestion, index) => (
                    <Badge 
                      key={index} 
                      variant="outline" 
                      className="cursor-pointer hover:bg-accent"
                    >
                      "{suggestion}"
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Control Buttons */}
            <div className="flex items-center justify-center gap-4">
              <Button
                variant="outline"
                size="icon"
                onClick={onMuteToggle}
                className="h-12 w-12"
              >
                {isMuted ? (
                  <VolumeX className="h-5 w-5" />
                ) : (
                  <Volume2 className="h-5 w-5" />
                )}
              </Button>

              <Button
                size="lg"
                onClick={isListening ? onStopListening : onStartListening}
                className={`h-20 w-20 rounded-full ${
                  isListening 
                    ? 'bg-destructive hover:bg-destructive/90 animate-pulse' 
                    : 'bg-primary hover:bg-primary/90'
                }`}
              >
                {isListening ? (
                  <MicOff className="h-8 w-8" />
                ) : (
                  <Mic className="h-8 w-8" />
                )}
              </Button>

              <div className="w-12" /> {/* Spacer for symmetry */}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}