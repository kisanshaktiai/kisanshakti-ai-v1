import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useModernVoice } from '@/contexts/ModernVoiceContext';
import { SimpleVoiceMicButton } from './SimpleVoiceMicButton';
import { VoiceOnboarding } from './VoiceOnboarding';
import { useLanguageStore } from '@/stores/languageStore';

export const ModernVoiceAssistant: React.FC = () => {
  const navigate = useNavigate();
  const { currentLanguage: appLanguage } = useLanguageStore();
  const {
    isListening,
    isSpeaking,
    transcript,
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

  // Sync voice language with app language
  useEffect(() => {
    if (appLanguage && isReady) {
      changeLanguage(appLanguage);
    }
  }, [appLanguage, isReady, changeLanguage]);

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
    <SimpleVoiceMicButton
      isListening={isListening}
      isSpeaking={isSpeaking}
      transcript={transcript}
      onStartListening={startListening}
      onStopListening={stopListening}
      error={error || undefined}
    />
  );
};
