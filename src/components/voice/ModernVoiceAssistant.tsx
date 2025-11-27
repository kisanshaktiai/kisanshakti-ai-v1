import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useModernVoice } from '@/contexts/ModernVoiceContext';
import { VoiceHUD } from './VoiceHUD';
import { VoiceOnboarding } from './VoiceOnboarding';
import { VoiceSuggestions } from './VoiceSuggestions';

export const ModernVoiceAssistant: React.FC = () => {
  const navigate = useNavigate();
  const {
    isListening,
    isSpeaking,
    currentLanguage,
    transcript,
    confidence,
    examples,
    isOnline,
    isReady,
    error,
    startListening,
    stopListening,
    changeLanguage,
    showOnboarding,
    completeOnboarding,
    skipOnboarding,
    setNavigationCallback,
  } = useModernVoice();

  // Set navigation callback on mount
  useEffect(() => {
    setNavigationCallback((route: string) => navigate(route));
  }, [navigate, setNavigationCallback]);

  // Don't render anything if onboarding is needed
  if (showOnboarding) {
    return <VoiceOnboarding onComplete={completeOnboarding} onSkip={skipOnboarding} />;
  }

  // Show loading state if voice service is still initializing
  if (!isReady) {
    console.log('[ModernVoiceAssistant] Voice service not ready yet');
    return null;
  }

  return (
    <>
      <VoiceHUD
        isListening={isListening}
        isSpeaking={isSpeaking}
        currentLanguage={currentLanguage}
        transcript={transcript}
        confidence={confidence}
        examples={examples}
        onStartListening={startListening}
        onStopListening={stopListening}
        onChangeLanguage={() => {
          // Cycle through all 14 Indian languages + English
          const languages = ['en', 'hi', 'mr', 'ta', 'pa', 'te', 'bn', 'gu', 'kn', 'ml', 'or', 'as', 'ur', 'sa'];
          const currentIndex = languages.indexOf(currentLanguage);
          const nextIndex = (currentIndex + 1) % languages.length;
          changeLanguage(languages[nextIndex]);
        }}
        isOnline={isOnline}
        error={error || undefined}
      />
      {!isListening && examples.length > 0 && (
        <VoiceSuggestions 
          suggestions={examples} 
          language={currentLanguage}
          onSuggestionClick={(suggestion) => {
            // Trigger voice recognition with this suggestion
            startListening();
          }}
          show={!isListening}
        />
      )}
    </>
  );
};
