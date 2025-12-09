import React from 'react';
import { Card } from '@/components/ui/card';
import { useModernVoice } from '@/contexts/ModernVoiceContext';
import { cn } from '@/lib/utils';

interface VoiceCardProps extends React.HTMLAttributes<HTMLDivElement> {
  voiceLabel: string;
  announceOnHover?: boolean;
}

export const VoiceCard = React.forwardRef<HTMLDivElement, VoiceCardProps>(
  ({ voiceLabel, announceOnHover = true, onMouseEnter, onFocus, onClick, className, children, ...props }, ref) => {
    const { speak, isReady } = useModernVoice();

    const announceElement = (text: string) => {
      if (isReady) {
        speak(text);
      }
    };

    const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
      if (announceOnHover && isReady) {
        announceElement(voiceLabel);
      }
      onMouseEnter?.(e);
    };

    const handleFocus = (e: React.FocusEvent<HTMLDivElement>) => {
      if (isReady) {
        announceElement(voiceLabel);
      }
      onFocus?.(e);
    };

    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
      if (isReady && onClick) {
        announceElement(`${voiceLabel} selected`);
      }
      onClick?.(e);
    };

    return (
      <Card
        ref={ref}
        onMouseEnter={handleMouseEnter}
        onFocus={handleFocus}
        onClick={handleClick}
        tabIndex={onClick ? 0 : undefined}
        aria-label={voiceLabel}
        className={cn(
          onClick && 'cursor-pointer hover:shadow-lg transition-shadow',
          className
        )}
        {...props}
      >
        {children}
      </Card>
    );
  }
);

VoiceCard.displayName = 'VoiceCard';
