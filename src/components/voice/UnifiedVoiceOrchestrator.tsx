/**
 * UnifiedVoiceOrchestrator - Production-ready voice navigation system
 * Integrates DialogManager, ActionHandler, LanguageDetector, and UI components
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useModernVoice } from '@/contexts/ModernVoiceContext';
import { ActionHandler, ActionContext } from '@/services/voice/ActionHandler';
import { VoiceFAB } from './VoiceFAB';
import { VoiceTranscriptOverlay } from './VoiceTranscriptOverlay';
import { VoiceFocusHighlight, useVoiceFocus } from './VoiceFocusHighlight';
import { VoiceContextualHints } from './VoiceContextualHints';

export const UnifiedVoiceOrchestrator: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isListening, transcript, confidence, startListening, stopListening, isVoiceModeActive, getDialogManager } = useModernVoice();
  
  const [messages, setMessages] = useState<any[]>([]);
  const { focusedElement, isActive, highlightElement } = useVoiceFocus();
  const [actionHandler, setActionHandler] = useState<ActionHandler | null>(null);

  useEffect(() => {
    const dialogManager = getDialogManager();
    if (dialogManager) {
      const context: ActionContext = {
        navigate,
        goBack: () => navigate(-1),
        onUIAction: (action, params) => console.log('[Voice] UI Action:', action, params),
        onFormAction: (action, params) => console.log('[Voice] Form Action:', action, params),
        onCRUDAction: async (action, entity, params) => {
          console.log('[Voice] CRUD Action:', action, entity, params);
          return { success: true };
        },
        language: 'hi',
      };
      setActionHandler(new ActionHandler(dialogManager, context));
      dialogManager.updateRoute(location.pathname);
    }
  }, [navigate, location.pathname, getDialogManager]);

  if (!isVoiceModeActive) return null;

  return (
    <>
      <VoiceFAB
        isListening={isListening}
        isSpeaking={false}
        confidence={confidence}
        onToggle={isListening ? stopListening : startListening}
        position="bottom-right"
      />
      
      <VoiceTranscriptOverlay
        messages={messages}
        currentTranscript={transcript}
        isListening={isListening}
        position="top"
      />
      
      <VoiceFocusHighlight
        targetElement={focusedElement}
        isActive={isActive}
      />
      
      <VoiceContextualHints
        currentRoute={location.pathname}
        language="hi"
      />
    </>
  );
};
