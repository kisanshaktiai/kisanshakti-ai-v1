/**
 * FirstRunOnboardingController - Manages first-run onboarding cards
 * Shows exactly 2 cards in sequence: Voice How-to → Read Aloud
 */

import React, { useState, useEffect } from 'react';
import { VoiceHowToCard } from './VoiceHowToCard';
import { ReadAloudCard } from './ReadAloudCard';

const STORAGE_KEYS = {
  VOICE_CARD: 'ks_seen_voice_card',
  READALOUD_CARD: 'ks_seen_readaloud_card',
  ONBOARDING_COMPLETE: 'ks_onboarding_complete'
};

export const FirstRunOnboardingController: React.FC = () => {
  const [showVoiceCard, setShowVoiceCard] = useState(false);
  const [showReadAloudCard, setShowReadAloudCard] = useState(false);

  useEffect(() => {
    // Check if onboarding is complete
    const onboardingComplete = localStorage.getItem(STORAGE_KEYS.ONBOARDING_COMPLETE);
    
    if (!onboardingComplete) {
      // Check individual card states
      const seenVoiceCard = localStorage.getItem(STORAGE_KEYS.VOICE_CARD);
      const seenReadAloudCard = localStorage.getItem(STORAGE_KEYS.READALOUD_CARD);

      if (!seenVoiceCard) {
        setShowVoiceCard(true);
      } else if (!seenReadAloudCard) {
        setShowReadAloudCard(true);
      } else {
        // Both cards seen, mark onboarding complete
        localStorage.setItem(STORAGE_KEYS.ONBOARDING_COMPLETE, 'true');
      }
    }
  }, []);

  const handleVoiceCardDismiss = () => {
    localStorage.setItem(STORAGE_KEYS.VOICE_CARD, 'true');
    setShowVoiceCard(false);
    
    // Show read aloud card next
    const seenReadAloudCard = localStorage.getItem(STORAGE_KEYS.READALOUD_CARD);
    if (!seenReadAloudCard) {
      // Small delay for smooth transition
      setTimeout(() => {
        setShowReadAloudCard(true);
      }, 300);
    } else {
      // Onboarding complete
      localStorage.setItem(STORAGE_KEYS.ONBOARDING_COMPLETE, 'true');
    }
  };

  const handleReadAloudCardDismiss = () => {
    localStorage.setItem(STORAGE_KEYS.READALOUD_CARD, 'true');
    setShowReadAloudCard(false);
    
    // Onboarding complete
    localStorage.setItem(STORAGE_KEYS.ONBOARDING_COMPLETE, 'true');
  };

  // Export function to reset onboarding (for settings)
  const resetOnboarding = () => {
    Object.values(STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
    setShowVoiceCard(true);
    setShowReadAloudCard(false);
  };

  // Expose reset function globally for settings page
  useEffect(() => {
    (window as any).__resetOnboarding = resetOnboarding;
    return () => {
      delete (window as any).__resetOnboarding;
    };
  }, []);

  if (!showVoiceCard && !showReadAloudCard) {
    return null;
  }

  return (
    <>
      {showVoiceCard && <VoiceHowToCard onDismiss={handleVoiceCardDismiss} />}
      {showReadAloudCard && <ReadAloudCard onDismiss={handleReadAloudCardDismiss} />}
    </>
  );
};
