# Voice Assistant Documentation

## Overview

The modernized voice assistant system provides a comprehensive, multilingual, privacy-first voice navigation experience with offline support and natural language understanding.

## Architecture

### Core Components

1. **VoiceService** - Main service layer handling ASR, TTS, and coordination
2. **IntentMatcher** - Pattern-based intent recognition with confidence scoring
3. **VoiceAnalytics** - Privacy-first telemetry and metrics collection
4. **VoiceHUD** - User interface for voice interactions
5. **VoiceOnboarding** - First-time setup and privacy consent

### Data Flow

```
User Speech → ASR (Browser/Cloud) → Intent Matcher → Action Handler → UI/Navigation
                                  ↓
                            Analytics (Optional)
```

## Features

### 1. Multilingual Support

- **Supported Languages**: English, Hindi, Marathi, Tamil, Punjabi
- **Language Detection**: Automatic based on utterance patterns
- **Easy Switching**: Users can switch languages on the fly
- **Localization**: Intent patterns defined per language in JSON files

### 2. Offline/Online Modes

- **Hybrid ASR**: Primary cloud ASR with offline fallback
- **Critical Intents**: Navigation commands work offline
- **Graceful Degradation**: Heavy NLU operations queued when offline
- **Status Indication**: Clear offline/online badge in UI

### 3. Privacy-First Design

#### Privacy Modes

- **Local Only** (default): All processing on-device
- **Cloud Opt-in**: User must explicitly consent

#### Data Collection

When telemetry is enabled, we collect:
- ASR latency metrics
- Intent recognition accuracy
- Language preferences
- Feature usage patterns

We **never** collect:
- Raw audio recordings
- Full transcripts
- Personal identifiable information

### 4. Intent System

Intents are defined in JSON files per language:

```json
{
  "id": "navigate.home",
  "patterns": ["go home", "take me home", "open home"],
  "priority": "high",
  "offline": true,
  "action": "navigate",
  "route": "/app"
}
```

#### Intent Categories

- **Navigation**: Go to different screens
- **Query**: Ask for information
- **Action**: Perform operations

#### Confidence Scoring

- Uses Levenshtein distance for pattern matching
- Threshold: 60% minimum confidence
- Best match selection among all patterns

### 5. SSML Support

Text-to-Speech supports SSML for expressive output:

```typescript
await speak({
  text: '<speak>Opening <emphasis>weather</emphasis> forecast</speak>',
  ssml: true,
  language: 'en',
});
```

### 6. Accessibility

- Screen reader compatible
- Large tap targets (48x48px minimum)
- Clear visual feedback
- Caption support for all voice output
- High contrast UI elements

## Usage

### Basic Integration

```typescript
import { useModernVoice } from '@/contexts/ModernVoiceContext';

function MyComponent() {
  const {
    isListening,
    startListening,
    stopListening,
    speak,
  } = useModernVoice();

  return (
    <button onClick={isListening ? stopListening : startListening}>
      {isListening ? 'Stop' : 'Start'} Listening
    </button>
  );
}
```

### Adding New Intents

1. Edit the appropriate language file in `src/services/voice/intents/`
2. Add intent definition with patterns
3. Update the intent handler in `ModernVoiceContext`

Example:

```json
{
  "id": "action.sync_data",
  "patterns": ["sync my data", "refresh data", "update information"],
  "priority": "medium",
  "offline": false,
  "action": "sync"
}
```

### Changing Language

```typescript
const { changeLanguage } = useModernVoice();
changeLanguage('hi'); // Switch to Hindi
```

## Testing Checklist

### Functional Testing

- [ ] Voice recognition in all supported languages
- [ ] Intent matching accuracy >80%
- [ ] Offline mode functionality
- [ ] Language switching without restart
- [ ] Error recovery and fallbacks

### Accessibility Testing

- [ ] Screen reader announces all voice states
- [ ] Keyboard navigation works
- [ ] Visual feedback is clear
- [ ] High contrast mode support
- [ ] Large text mode support

### Performance Testing

- [ ] ASR latency <200ms (online)
- [ ] TTS latency <300ms
- [ ] Intent matching <100ms
- [ ] Memory usage <50MB
- [ ] No memory leaks during extended use

### Regional Testing

- [ ] Indian English accent recognition
- [ ] Hindi variants (different regions)
- [ ] Marathi regional accents
- [ ] Tamil spoken vs written forms
- [ ] Punjabi (Indian vs Pakistani)

### Privacy Testing

- [ ] No data sent when privacy mode = local
- [ ] Consent required for cloud mode
- [ ] Telemetry can be disabled
- [ ] No PII in analytics data
- [ ] Clear privacy policy displayed

## Analytics Specification

### Metrics Collected

1. **ASR Performance**
   - Average latency
   - Success rate
   - Language distribution

2. **Intent Recognition**
   - Accuracy per intent
   - Confidence distribution
   - Failure patterns

3. **Usage Patterns**
   - Most used intents
   - Peak usage times
   - Language preferences

4. **Error Tracking**
   - ASR errors by type
   - Intent matching failures
   - System errors

### Data Storage

- Local: Last 1000 interactions (aggregated only)
- Cloud (opt-in): Aggregated daily summaries
- Retention: 90 days maximum

### Privacy Guarantees

- No raw audio stored
- No full transcripts stored
- User IDs are hashed
- Aggregation before transmission
- Opt-out anytime

## SSML Examples

### Navigation Announcements

```xml
<speak>
  <prosody rate="medium">
    Opening <emphasis level="strong">weather</emphasis> forecast
  </prosody>
</speak>
```

### Error Messages

```xml
<speak>
  <prosody rate="slow" pitch="-10%">
    Sorry, I didn't understand that.
  </prosody>
  <break time="500ms"/>
  <prosody rate="medium">
    Try saying <emphasis>show my lands</emphasis> or <emphasis>check weather</emphasis>
  </prosody>
</speak>
```

### Success Feedback

```xml
<speak>
  <prosody rate="fast" pitch="+20%">
    Done!
  </prosody>
  <break time="300ms"/>
  Your lands are now displayed.
</speak>
```

## Extending the System

### Adding a New Language

1. Create `src/services/voice/intents/{lang_code}.json`
2. Define all intents with localized patterns
3. Add language to `languages` array in onboarding
4. Update language code mapping in `VoiceService`
5. Test with native speakers

### Adding Custom TTS Provider

1. Implement TTSProvider interface
2. Add provider option to VoiceConfig
3. Update VoiceService to use provider
4. Handle provider-specific errors

### Adding Wake Word Detection

1. Integrate wake word library (e.g., Porcupine)
2. Add wake word config to VoiceConfig
3. Implement background listener
4. Handle false positives
5. Add battery optimization

## Troubleshooting

### Voice Not Working

1. Check browser support
2. Verify microphone permissions
3. Check online/offline status
4. Verify language is supported
5. Check browser console for errors

### Low Recognition Accuracy

1. Check ambient noise level
2. Verify correct language selected
3. Speak clearly and at moderate pace
4. Check microphone quality
5. Update intent patterns if needed

### High Latency

1. Check network connection
2. Use offline mode for navigation
3. Reduce SSML complexity
4. Check device performance
5. Update browser

## Best Practices

1. **Always provide visual feedback** for voice states
2. **Handle errors gracefully** with clear messages
3. **Keep intents simple** and unambiguous
4. **Test with real users** from target regions
5. **Respect privacy** - local by default
6. **Optimize for mobile** - battery and data usage
7. **Provide examples** to guide users
8. **Support keyboard** as alternative input

## Future Enhancements

- [ ] Wake word detection ("Hey Farmer")
- [ ] Context-aware suggestions
- [ ] Voice-based form filling
- [ ] Multi-turn dialogues
- [ ] Voice biometrics for auth
- [ ] Real-time translation
- [ ] Sentiment analysis
- [ ] Custom wake words per user
