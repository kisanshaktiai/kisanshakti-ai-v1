# Voice Navigation System Documentation

## Overview

The Voice Navigation system provides hands-free navigation throughout the KisanShakti app using voice commands in multiple Indian languages. It features robust error handling, accessibility support, and privacy-focused telemetry.

## Architecture

```
User Speech → Web Speech API → useSpeechRecognition Hook
                                        ↓
                        VoiceNavigationContext (Handler)
                                        ↓
                    ┌───────────────────┴───────────────────┐
                    ↓                                       ↓
            Confidence Check                        Command Matching
            Cooldown Check                          (Word Boundary Regex)
                    ↓                                       ↓
            Text-to-Speech                          React Router Navigation
                    ↓                                       ↓
              Voice Indicator                         Toast Notification
              (Accessibility)                         Telemetry Event
```

## Supported Commands

| Command | Keywords (English/Hindi/Punjabi/Marathi) | Route |
|---------|------------------------------------------|-------|
| **Home** | home, घर, ਘਰ, मुख्य | `/app` |
| **Lands** | land, lands, जमीन, ਜ਼ਮੀਨ, खेत, farm | `/lands` |
| **Weather** | weather, मौसम, ਮੌਸਮ | `/weather` |
| **Schedule** | schedule, समय, ਸਮਾਂ, कार्यक्रम | `/schedule` |
| **Chat** | chat, बात, ਗੱਲਬਾਤ, सहायक, assistant | `/chat` |
| **Market** | market, बाजार, ਬਾਜ਼ਾਰ, marketplace | `/market` |
| **Profile** | profile, प्रोफ़ाइल, ਪ੍ਰੋਫਾਈਲ, account | `/profile` |
| **Community** | community, समुदाय, ਕਮਿਊਨਿਟੀ, social | `/social` |
| **Analytics** | analytics, विश्लेषण, ਵਿਸ਼ਲੇਸ਼ਣ, stats | `/analytics` |

## Confidence Threshold & Behavior

### Confidence Scoring
- **Threshold**: 0.55 (55%)
- **Source**: Web Speech API `SpeechRecognitionResult.confidence`
- **Fallback**: If confidence is undefined (e.g., older browsers), command is accepted

### Confidence Handling
```typescript
if (confidence < 0.55) {
  // Show toast: "Voice not clear"
  // Track event: voice_low_confidence
  // Do NOT execute command
}
```

## Cooldown Mechanics

### Global Throttle
- **Duration**: 800ms
- **Purpose**: Prevent any command execution within 800ms of the last command
- **Use Case**: Prevents accidental rapid-fire commands

### Per-Command Cooldown
- **Duration**: 2000ms (2 seconds)
- **Purpose**: Prevent duplicate execution of the same command
- **Use Case**: User says "home home" quickly - only first is executed

### Implementation
```typescript
lastCommandAtRef.current = {
  '_global': timestamp,
  'home': timestamp,
  'weather': timestamp,
  // ... per-command tracking
}
```

## Word-Boundary Matching

### Problem: False Positives
Without word boundaries, "homework" would match "home", "weather forecast" would match "weather" (but this is actually desired).

### Solution: Regex Word Boundaries
```typescript
function hasKeywordWordBoundary(text: string, keyword: string): boolean {
  const re = new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i');
  return re.test(text);
}
```

**Examples:**
- ✅ "go to home" → matches `home`
- ✅ "show me weather" → matches `weather`
- ❌ "homework" → does NOT match `home`
- ❌ "homestead" → does NOT match `home`

## Text-to-Speech Cancellation

### Behavior
1. User speaks command
2. System cancels any ongoing TTS (`stopSpeech()`)
3. System starts new TTS announcement
4. Wait for TTS to start (race with 450ms timeout)
5. Navigate to route

### Code Flow
```typescript
if (stopSpeech) stopSpeech(); // Cancel prior speech

const announcement = "Opening Home";
const speakPromise = speak(announcement);

await Promise.race([
  speakPromise,
  new Promise(resolve => setTimeout(resolve, 450))
]);

navigate('/app');
```

## Accessibility Features

### Visual Indicator (`VoiceIndicator`)
- **Location**: Fixed bottom-right (above bottom navigation)
- **States**:
  - 🔴 **Listening**: Red background, microphone icon, "Listening..."
  - 🟢 **Speaking**: Green background, speaker icon, "Speaking..."
- **Hidden**: When neither listening nor speaking
- **Accessibility**: `aria-hidden="true"` (visual only)

### Screen Reader Support
- **Element**: `<div id="voice-announcer" aria-live="polite">`
- **Location**: Visually hidden (`.sr-only`)
- **Updates**: Text content updated on `announceElement()` calls
- **Behavior**: Screen readers announce changes without interrupting

## Privacy & Telemetry

### Privacy Rules
1. ✅ **Never persist raw transcripts** in logs or storage
2. ✅ Only send anonymized command names and metrics
3. ✅ User can opt-out via `privacyMode: 'local'`
4. ✅ Local-only aggregation by default

### Telemetry Events

| Event | Payload | Privacy |
|-------|---------|---------|
| `voice_listen_start` | `{ language }` | ✅ Safe |
| `voice_listen_stop` | `{}` | ✅ Safe |
| `voice_command_executed` | `{ command, confidence, language }` | ✅ Safe (no transcript) |
| `voice_command_failed` | `{ command, error }` | ✅ Safe (no transcript) |
| `voice_command_unmatched` | `{ confidence }` | ✅ Safe (no transcript) |
| `voice_low_confidence` | `{ confidence }` | ✅ Safe (no transcript) |
| `voice_permission_denied` | `{ platform }` | ✅ Safe |

### Implementation
```typescript
function trackEvent(name: string, payload: Record<string, any> = {}) {
  // Privacy: Remove transcript before sending
  const sanitizedPayload = { ...payload };
  delete sanitizedPayload.transcript;
  
  if ((window as any)?.analytics?.track) {
    (window as any).analytics.track(name, sanitizedPayload);
  }
}
```

## Testing

### Run Unit Tests
```bash
# Run all voice navigation tests
pnpm test tests/unit/voice-navigation.test.ts

# Run with coverage
pnpm test tests/unit/voice-navigation.test.ts --coverage

# Watch mode
pnpm test tests/unit/voice-navigation.test.ts --watch
```

### Test Coverage
- ✅ Navigation with high confidence (≥0.55)
- ✅ Rejection of low confidence (<0.55)
- ✅ Per-command cooldown enforcement
- ✅ Global throttle enforcement
- ✅ Word-boundary matching (no false positives)
- ✅ TTS cancellation before new speech
- ✅ Multilingual keyword matching
- ✅ Unmatched command handling
- ✅ Backward compatibility (undefined confidence)
- ✅ Cooldown expiration timing

### Manual Testing

#### 1. Chrome DevTools Simulation
```javascript
// In browser console:
// Simulate high-confidence command
onTranscriptCallback('home', 0.9);

// Simulate low-confidence command
onTranscriptCallback('weather', 0.4);

// Test cooldown
onTranscriptCallback('home', 0.9);
onTranscriptCallback('home', 0.9); // Should be ignored
```

#### 2. Live Microphone Testing
1. Click voice button in app
2. Grant microphone permission
3. Speak clearly: "Go to weather"
4. Verify navigation + toast
5. Immediately speak again: "Go to home"
6. Verify throttling behavior

#### 3. Accessibility Testing
1. Enable screen reader (VoiceOver on iOS, TalkBack on Android)
2. Trigger voice command
3. Verify announcement in screen reader
4. Check `VoiceIndicator` visibility during listening/speaking

## Troubleshooting

### Issue: Commands Not Recognized
**Symptoms**: "Command not recognized" toast appears frequently

**Possible Causes:**
1. Low confidence scores (check browser mic quality)
2. Background noise
3. Language mismatch (app language ≠ speech language)
4. Keywords not in command list

**Solutions:**
- Check microphone permissions
- Speak clearly in quiet environment
- Verify app language matches speech language
- Add regional keywords to `VOICE_COMMANDS`

### Issue: Commands Execute Twice
**Symptoms**: Navigation happens multiple times for single speech

**Cause**: Cooldown timing issue or multiple listeners

**Solution:**
- Verify `GLOBAL_COOLDOWN_MS` and `PER_COMMAND_COOLDOWN_MS` are set
- Check for duplicate `VoiceNavigationProvider` instances

### Issue: TTS Interrupts Speech
**Symptoms**: Can't speak command while system is speaking

**Cause**: TTS not being cancelled properly

**Solution:**
- Verify `stopSpeech()` is called before new TTS
- Check `useTextToSpeech` hook implementation

### Issue: False Positives (e.g., "homework" → "home")
**Symptoms**: Commands trigger on partial word matches

**Cause**: Word-boundary regex not applied

**Solution:**
- Verify `hasKeywordWordBoundary()` is used for matching
- Check regex escaping in `escapeRegex()`

## Browser Compatibility

| Browser | Speech Recognition | Text-to-Speech | Notes |
|---------|-------------------|----------------|-------|
| Chrome (Android) | ✅ Full support | ✅ Full support | Best experience |
| Chrome (Desktop) | ✅ Full support | ✅ Full support | Requires HTTPS |
| Safari (iOS) | ⚠️ Limited | ✅ Full support | Requires user interaction |
| Safari (macOS) | ⚠️ Limited | ✅ Full support | Requires user interaction |
| Firefox | ❌ Not supported | ✅ Full support | - |
| Edge | ✅ Full support | ✅ Full support | Chromium-based |

### iOS Safari Limitations
- Requires explicit user gesture to start recognition
- May timeout after 60 seconds
- No continuous recognition support
- Recommend manual "Add to Home Screen" instructions

## Performance Optimization

### Memory Management
- Cooldown refs (`lastCommandAtRef`) cleared on unmount
- Transcript handler ref (`transcriptHandlerRef`) updated only when deps change
- No transcript persistence (privacy + memory)

### Bundle Size
- Lazy-load voice components (future optimization)
- Use native Web Speech API (no external dependencies)
- Minimal telemetry payload

## Future Enhancements

### Planned Features
- [ ] Wake word detection ("Hey KisanShakti")
- [ ] Custom keyword training
- [ ] Voice command history (with privacy controls)
- [ ] Multi-step voice workflows
- [ ] Voice-controlled forms

### Under Consideration
- [ ] Offline ASR (local model)
- [ ] ElevenLabs integration for premium TTS
- [ ] Voice biometric authentication
- [ ] Regional dialect support

## References

- [Web Speech API Specification](https://wicg.github.io/speech-api/)
- [WCAG 2.1 Accessibility Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [React Hook Best Practices](https://react.dev/reference/react)
- [Telemetry Privacy Best Practices](https://www.w3.org/TR/privacy-principles/)

---

**Last Updated**: 2025-01-28
**Version**: 1.0.0
**Maintainers**: KisanShakti Voice Team
