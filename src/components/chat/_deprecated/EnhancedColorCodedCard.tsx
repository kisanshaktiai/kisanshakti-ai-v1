// DEPRECATED — not mounted anywhere. Do not edit for chat fixes.
import React from 'react';
import { Card } from '@/components/ui/card';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { 
  Leaf, Droplets, Bug, FlaskConical, AlertTriangle, 
  CheckCircle2, Info, Sparkles 
} from 'lucide-react';

interface EnhancedColorCodedCardProps {
  card: {
    id: string;
    type: 'organic' | 'fertilizer' | 'pesticide' | 'warning' | 'success' | 'info' | 'hormone' | 'irrigation';
    title: string;
    content: string;
    color: string;
    gradient: string[];
    icon: string;
    priority: number;
  };
  index: number;
}

const CARD_THEMES = {
  organic: {
    gradient: 'from-success/15 via-success/10 to-success/15',
    border: 'border-l-emerald-500',
    iconBg: 'bg-success/20',
    iconColor: 'text-success dark:text-success',
    Icon: Leaf,
    glow: 'hover:shadow-success/30/10'
  },
  fertilizer: {
    gradient: 'from-warning/15 via-warning/10 to-warning/15',
    border: 'border-l-amber-500',
    iconBg: 'bg-warning/20',
    iconColor: 'text-warning dark:text-warning',
    Icon: FlaskConical,
    glow: 'hover:shadow-warning/30/10'
  },
  pesticide: {
    gradient: 'from-destructive/15 via-destructive/10 to-primary/15',
    border: 'border-l-red-500',
    iconBg: 'bg-destructive/20',
    iconColor: 'text-destructive dark:text-destructive',
    Icon: Bug,
    glow: 'hover:shadow-destructive/30/10'
  },
  hormone: {
    gradient: 'from-primary/15 via-primary/10 to-info/15',
    border: 'border-l-violet-500',
    iconBg: 'bg-primary/20',
    iconColor: 'text-primary dark:text-primary',
    Icon: Sparkles,
    glow: 'hover:shadow-primary/30/10'
  },
  irrigation: {
    gradient: 'from-info/15 via-info/10 to-info/15',
    border: 'border-l-cyan-500',
    iconBg: 'bg-info/20',
    iconColor: 'text-info dark:text-info',
    Icon: Droplets,
    glow: 'hover:shadow-info/30/10'
  },
  warning: {
    gradient: 'from-warning/15 via-warning/10 to-warning/15',
    border: 'border-l-orange-500',
    iconBg: 'bg-warning/20',
    iconColor: 'text-warning dark:text-warning',
    Icon: AlertTriangle,
    glow: 'hover:shadow-warning/30/10'
  },
  success: {
    gradient: 'from-success/15 via-success/10 to-success/15',
    border: 'border-l-green-500',
    iconBg: 'bg-success/20',
    iconColor: 'text-success dark:text-success',
    Icon: CheckCircle2,
    glow: 'hover:shadow-success/30/10'
  },
  info: {
    gradient: 'from-info/15 via-info/10 to-primary/15',
    border: 'border-l-blue-500',
    iconBg: 'bg-info/20',
    iconColor: 'text-info dark:text-info',
    Icon: Info,
    glow: 'hover:shadow-info/30/10'
  }
};

export function EnhancedColorCodedCard({ card, index }: EnhancedColorCodedCardProps) {
  const theme = CARD_THEMES[card.type] || CARD_THEMES.info;
  const IconComponent = theme.Icon;
  
  // Format content with proper line breaks
  const formatContent = (text: string) => {
    return text
      .split('\n')
      .map((line, idx) => {
        const trimmedLine = line.trim();
        if (!trimmedLine) return null;
        
        // Check if it's a numbered item
        const isNumbered = /^\d+\./.test(trimmedLine);
        // Check if it's a bullet point
        const isBullet = /^[•·-]/.test(trimmedLine);
        
        return (
          <div 
            key={idx} 
            className={cn(
              'mb-1.5 last:mb-0',
              (isNumbered || isBullet) && 'pl-2'
            )}
          >
            {trimmedLine}
          </div>
        );
      })
      .filter(Boolean);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.25 }}
    >
      <div 
        className={cn(
          'w-full relative',
          'border-l-3 rounded-md',
          theme.border,
          'bg-card/50'
        )}
        style={{ borderLeftWidth: '3px' }}
      >
        {/* Content */}
        <div className="px-3 py-2">
          {/* Header with icon and title */}
          {card.title && (
            <div className="flex items-center gap-2 mb-1">
              <div className={cn('p-1 rounded', theme.iconBg)}>
                <IconComponent className={cn('h-3.5 w-3.5', theme.iconColor)} />
              </div>
              <h4 className="font-medium text-sm text-foreground leading-tight flex-1">
                {card.title}
              </h4>
            </div>
          )}
          
          {/* Content */}
          <div className="text-sm text-foreground/90 leading-snug">
            {formatContent(card.content)}
          </div>
        </div>
      </div>
    </motion.div>
  );
}