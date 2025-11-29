import React from 'react';
import { useModernVoice } from '@/contexts/ModernVoiceContext';
import { Mic, Volume2 } from 'lucide-react';

export const VoiceIndicator: React.FC = () => {
  const { isListening, isSpeaking } = useModernVoice();
  
  if (!isListening && !isSpeaking) return null;

  return (
    <>
      {/* Hidden aria-live region for screen readers */}
      <div 
        aria-live="polite" 
        id="voice-announcer" 
        className="sr-only"
      />
      
      {/* Visual indicator */}
      <div 
        className="fixed bottom-20 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-lg text-white text-sm font-medium shadow-lg animate-in slide-in-from-bottom-2"
        style={{ 
          backgroundColor: isListening ? 'hsl(var(--destructive))' : 'hsl(var(--primary))'
        }}
        aria-hidden="true"
      >
        {isListening ? (
          <>
            <Mic className="h-4 w-4 animate-pulse" />
            <span>Listening...</span>
          </>
        ) : (
          <>
            <Volume2 className="h-4 w-4 animate-pulse" />
            <span>Speaking...</span>
          </>
        )}
      </div>
    </>
  );
};
