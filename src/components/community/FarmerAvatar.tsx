import React from 'react';
import { cn } from '@/lib/utils';

interface FarmerAvatarProps {
  name?: string | null;
  seed?: string | null;
  imageUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

// Stable hue from seed for consistent farmer colors
const hashString = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return Math.abs(h);
};

// Use semantic theme tokens so avatars adapt to light/dark theme
const PALETTE = [
  'hsl(var(--primary))',
  'hsl(var(--accent))',
  'hsl(var(--info))',
  'hsl(var(--warning))',
  'hsl(var(--success))',
  'hsl(var(--crop-stage-flowering))',
  'hsl(var(--crop-stage-fruiting))',
  'hsl(var(--crop-stage-vegetative))',
];

const SIZES = {
  sm: 'w-9 h-9 text-sm',
  md: 'w-12 h-12 text-base',
  lg: 'w-16 h-16 text-xl',
};

export const FarmerAvatar: React.FC<FarmerAvatarProps> = ({
  name,
  seed,
  imageUrl,
  size = 'md',
  className,
}) => {
  const initial = (name?.trim()?.[0] || '?').toUpperCase();
  const bg = PALETTE[hashString(seed || name || 'x') % PALETTE.length];

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name || 'Farmer'}
        className={cn('rounded-full object-cover', SIZES[size], className)}
      />
    );
  }

  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center font-semibold text-primary-foreground select-none',
        SIZES[size],
        className
      )}
      style={{ background: bg }}
      aria-label={name || 'Farmer'}
    >
      {initial}
    </div>
  );
};
