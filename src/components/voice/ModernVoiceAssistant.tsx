import React, { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useModernVoice } from '@/contexts/ModernVoiceContext';
import { SimpleVoiceMicButton } from './SimpleVoiceMicButton';
import { useLanguageStore } from '@/stores/languageStore';

export const ModernVoiceAssistant: React.FC = () => {
  const navigate = useNavigate();
  const { currentLanguage: appLanguage } = useLanguageStore();
  const {
    isListening,
    isSpeaking,
    transcript,
    isReady,
    isSupported,
    error,
    isVoiceModeActive,
    startListening,
    stopListening,
    changeLanguage,
    showOnboarding,
    completeOnboarding,
    skipOnboarding,
    setNavigationCallback,
    hideVoiceMode,
  } = useModernVoice();

  // Memoize navigation callback to prevent infinite loop
  const handleNavigation = useCallback((route: string) => {
    navigate(route);
  }, [navigate]);

  // Set navigation callback on mount only
  useEffect(() => {
    setNavigationCallback(handleNavigation);
  }, [handleNavigation, setNavigationCallback]);

  // Sync voice language with app language
  useEffect(() => {
    if (appLanguage && isReady) {
      changeLanguage(appLanguage);
    }
  }, [appLanguage, isReady, changeLanguage]);

  // PHASE 1 FIX: Removed duplicate VoiceOnboarding flow
  // Voice onboarding is now handled ONLY by FirstRunOnboardingController
  // This ensures single, consistent onboarding without nested/duplicate cards
  console.log('[ModernVoiceAssistant] Using app language:', appLanguage);
  console.log('[ModernVoiceAssistant] Onboarding managed by FirstRunOnboardingController');

  // Only render mic button when voice mode is active
  console.log('[ModernVoiceAssistant] Render check:', { 
    isVoiceModeActive, 
    isReady, 
    isSupported,
    willRender: isVoiceModeActive 
  });
  
  if (!isVoiceModeActive) {
    console.log('[ModernVoiceAssistant] Voice mode not active - not rendering mic');
    return null;
  }

  console.log('[ModernVoiceAssistant] Rendering SimpleVoiceMicButton');
  return (
    <SimpleVoiceMicButton
      isListening={isListening}
      isSpeaking={isSpeaking}
      transcript={transcript}
      isReady={isReady}
      isSupported={isSupported}
      onStartListening={startListening}
      onStopListening={stopListening}
      onClose={hideVoiceMode}
      error={error || undefined}
    />
  );
};
