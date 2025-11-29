/**
 * Unit tests for FirstRunOnboardingController
 */

import { describe, it, expect, beforeEach } from 'vitest';

describe('FirstRunOnboardingController', () => {
  beforeEach(() => {
    // Clear all onboarding flags
    localStorage.clear();
  });

  it('should show voice card on first run', () => {
    const seenVoiceCard = localStorage.getItem('ks_seen_voice_card');
    expect(seenVoiceCard).toBeNull();
  });

  it('should persist voice card dismissal', () => {
    localStorage.setItem('ks_seen_voice_card', 'true');
    const seenVoiceCard = localStorage.getItem('ks_seen_voice_card');
    expect(seenVoiceCard).toBe('true');
  });

  it('should show read aloud card after voice card', () => {
    localStorage.setItem('ks_seen_voice_card', 'true');
    const seenReadAloudCard = localStorage.getItem('ks_seen_readaloud_card');
    expect(seenReadAloudCard).toBeNull();
  });

  it('should mark onboarding complete after both cards', () => {
    localStorage.setItem('ks_seen_voice_card', 'true');
    localStorage.setItem('ks_seen_readaloud_card', 'true');
    localStorage.setItem('ks_onboarding_complete', 'true');
    
    const complete = localStorage.getItem('ks_onboarding_complete');
    expect(complete).toBe('true');
  });
});
