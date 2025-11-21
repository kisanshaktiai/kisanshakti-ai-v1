import { useEffect, useCallback } from 'react';
import { useVoiceNavigation } from '@/contexts/VoiceNavigationContext';

interface VoiceCommand {
  keywords: string[];
  action: () => void;
  description: string;
}

interface UseVoiceCommandsOptions {
  commands: VoiceCommand[];
  enabled?: boolean;
}

export const useVoiceCommands = ({ commands, enabled = true }: UseVoiceCommandsOptions) => {
  const { isEnabled: globalEnabled, announceElement } = useVoiceNavigation();

  const announceAvailableCommands = useCallback(() => {
    if (!enabled || !globalEnabled) return;

    const descriptions = commands.map(cmd => cmd.description).join(', ');
    announceElement(`Available commands: ${descriptions}`);
  }, [commands, enabled, globalEnabled, announceElement]);

  useEffect(() => {
    // You can use this hook to register context-specific commands
    // For now, it provides a way to announce available commands
  }, [commands, enabled, globalEnabled]);

  return {
    announceAvailableCommands,
    isVoiceEnabled: enabled && globalEnabled,
  };
};
