import React, { forwardRef } from 'react';
import { Button, ButtonProps } from '@/components/ui/button';
import { useVoiceNavigation } from '@/contexts/VoiceNavigationContext';

interface VoiceButtonProps extends ButtonProps {
  voiceLabel: string;
  announceOnHover?: boolean;
}

export const VoiceButton = forwardRef<HTMLButtonElement, VoiceButtonProps>(
  ({ voiceLabel, announceOnHover = false, onMouseEnter, onFocus, onClick, children, ...props }, ref) => {
    const { announceElement, isEnabled } = useVoiceNavigation();

    const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (announceOnHover && isEnabled) {
        announceElement(voiceLabel);
      }
      onMouseEnter?.(e);
    };

    const handleFocus = (e: React.FocusEvent<HTMLButtonElement>) => {
      if (isEnabled) {
        announceElement(voiceLabel);
      }
      onFocus?.(e);
    };

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (isEnabled) {
        announceElement(`${voiceLabel} activated`);
      }
      onClick?.(e);
    };

    return (
      <Button
        ref={ref}
        onMouseEnter={handleMouseEnter}
        onFocus={handleFocus}
        onClick={handleClick}
        aria-label={voiceLabel}
        {...props}
      >
        {children}
      </Button>
    );
  }
);

VoiceButton.displayName = 'VoiceButton';
