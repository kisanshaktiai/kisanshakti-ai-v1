// Voice System Types

export interface VoiceIntent {
  id: string;
  patterns: string[];
  slots?: VoiceSlot[];
  priority: 'high' | 'medium' | 'low';
  offline: boolean; // Can work offline
  action: string;
  route?: string;
  params?: Record<string, any>;
}

export interface VoiceSlot {
  name: string;
  type: 'string' | 'number' | 'date' | 'enum';
  required: boolean;
  values?: string[];
}

export interface VoiceUtterance {
  text: string;
  intent: string;
  confidence: number;
  slots?: Record<string, any>;
  language: string;
  timestamp: number;
}

export interface VoiceConfig {
  language: string;
  asrProvider: 'browser' | 'cloud' | 'hybrid';
  ttsProvider: 'browser' | 'elevenlabs';
  voiceId?: string;
  wakeWord?: string;
  privacyMode: 'local' | 'cloud-opt-in';
  telemetryEnabled: boolean;
}

export interface VoiceMetrics {
  asrLatency: number;
  intentAccuracy: number;
  ttsLatency: number;
  language: string;
  offline: boolean;
  timestamp: number;
}

export interface VoiceProfile {
  userId: string;
  preferredLanguage: string;
  voiceId: string;
  consentGiven: boolean;
  createdAt: number;
  updatedAt: number;
}

export type ASRProvider = 'browser' | 'cloud' | 'offline';
export type TTSProvider = 'browser' | 'elevenlabs' | 'neural';

export interface ASRResult {
  transcript: string;
  confidence: number;
  isFinal: boolean;
  language: string;
  provider: ASRProvider;
}

export interface TTSOptions {
  text: string;
  language: string;
  voice?: string;
  rate?: number;
  pitch?: number;
  ssml?: boolean;
}

export interface DialogueState {
  currentIntent?: string;
  context: Record<string, any>;
  history: VoiceUtterance[];
  pendingSlots: string[];
}
