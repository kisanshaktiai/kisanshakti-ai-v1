/**
 * Voice Navigation Unit Tests
 * Tests robust transcript handling, confidence checks, cooldowns, and TTS cancellation
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock dependencies
const mockNavigate = jest.fn();
const mockToast = jest.fn();
const mockSpeak = jest.fn(() => Promise.resolve());
const mockStop = jest.fn();
const mockStartListening = jest.fn();
const mockStopListening = jest.fn();

let onTranscriptCallback: ((text: string, confidence?: number) => void) | undefined;

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

jest.mock('@/hooks/useTextToSpeech', () => ({
  useTextToSpeech: () => ({
    speak: mockSpeak,
    stop: mockStop,
    isSpeaking: false,
  }),
}));

jest.mock('@/hooks/useSpeechRecognition', () => ({
  useSpeechRecognition: (opts: any) => {
    onTranscriptCallback = opts.onTranscript;
    return {
      isListening: false,
      startListening: mockStartListening,
      stopListening: mockStopListening,
      isSupported: true,
    };
  },
}));

jest.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => ({ currentLanguage: 'en' }),
}));

describe('Voice Navigation - Transcript Handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should navigate to home on "home" command with high confidence', async () => {
    // Simulate voice provider initialization
    const { VoiceNavigationProvider } = require('@/contexts/VoiceNavigationContext');
    
    // Trigger transcript with high confidence
    if (onTranscriptCallback) {
      await onTranscriptCallback('home', 0.9);
    }

    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(mockStopListening).toHaveBeenCalled();
    expect(mockStop).toHaveBeenCalled();
    expect(mockSpeak).toHaveBeenCalledWith(expect.stringContaining('Home'));
    expect(mockNavigate).toHaveBeenCalledWith('/app');
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Voice Command',
      })
    );
  });

  it('should reject low-confidence transcript', async () => {
    if (onTranscriptCallback) {
      await onTranscriptCallback('home', 0.3);
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Voice not clear',
        variant: 'destructive',
      })
    );
  });

  it('should prevent rapid duplicate commands with per-command cooldown', async () => {
    if (onTranscriptCallback) {
      await onTranscriptCallback('home', 0.9);
      await onTranscriptCallback('home', 0.9); // Immediate duplicate
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    // Should only navigate once
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it('should enforce global throttle between different commands', async () => {
    if (onTranscriptCallback) {
      await onTranscriptCallback('home', 0.9);
      // Immediately try different command (within global cooldown)
      await onTranscriptCallback('weather', 0.9);
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    // Should only execute first command
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/app'); // home route
  });

  it('should use word-boundary matching to prevent false positives', async () => {
    if (onTranscriptCallback) {
      await onTranscriptCallback('homework', 0.9); // Contains "home" but not word-boundary match
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Command not recognized',
      })
    );
  });

  it('should cancel prior TTS before new speech', async () => {
    if (onTranscriptCallback) {
      await onTranscriptCallback('weather', 0.9);
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(mockStop).toHaveBeenCalledBefore(mockSpeak);
  });

  it('should handle multilingual keywords', async () => {
    if (onTranscriptCallback) {
      await onTranscriptCallback('घर', 0.9); // Hindi for "home"
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(mockNavigate).toHaveBeenCalledWith('/app');
  });

  it('should show unmatched toast for unrecognized commands', async () => {
    if (onTranscriptCallback) {
      await onTranscriptCallback('unknown command', 0.9);
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Command not recognized',
      })
    );
  });
});

describe('Voice Navigation - Confidence Threshold', () => {
  it('should accept confidence exactly at threshold (0.55)', async () => {
    if (onTranscriptCallback) {
      await onTranscriptCallback('home', 0.55);
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(mockNavigate).toHaveBeenCalled();
  });

  it('should accept undefined confidence (backward compatibility)', async () => {
    if (onTranscriptCallback) {
      await onTranscriptCallback('home', undefined);
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(mockNavigate).toHaveBeenCalled();
  });
});

describe('Voice Navigation - Cooldown Timing', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should allow command after per-command cooldown expires', async () => {
    if (onTranscriptCallback) {
      await onTranscriptCallback('home', 0.9);
      
      // Fast-forward past per-command cooldown (2000ms)
      jest.advanceTimersByTime(2100);
      
      await onTranscriptCallback('home', 0.9);
    }

    await Promise.resolve();

    expect(mockNavigate).toHaveBeenCalledTimes(2);
  });

  it('should allow different command after global cooldown expires', async () => {
    if (onTranscriptCallback) {
      await onTranscriptCallback('home', 0.9);
      
      // Fast-forward past global cooldown (800ms)
      jest.advanceTimersByTime(900);
      
      await onTranscriptCallback('weather', 0.9);
    }

    await Promise.resolve();

    expect(mockNavigate).toHaveBeenCalledTimes(2);
  });
});
