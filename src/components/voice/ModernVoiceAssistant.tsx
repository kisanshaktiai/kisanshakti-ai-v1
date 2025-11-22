import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useModernVoice } from '@/contexts/ModernVoiceContext';
import { VoiceHUD } from './VoiceHUD';
import { VoiceOnboarding } from './VoiceOnboarding';

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

  if (showOnboarding) {
    return <VoiceOnboarding onComplete={completeOnboarding} onSkip={skipOnboarding} />;
  }

  return (
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
        // Cycle through languages
        const languages = ['en', 'hi', 'mr', 'ta', 'pa'];
        const currentIndex = languages.indexOf(currentLanguage);
        const nextIndex = (currentIndex + 1) % languages.length;
        changeLanguage(languages[nextIndex]);
      }}
      isOnline={isOnline}
      error={error || undefined}
    />
  );
};
