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
    gradient: 'from-emerald-500/15 via-green-500/10 to-teal-500/15',
    border: 'border-l-emerald-500',
    iconBg: 'bg-emerald-500/20',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    Icon: Leaf,
    glow: 'hover:shadow-emerald-500/10'
  },
  fertilizer: {
    gradient: 'from-amber-500/15 via-yellow-500/10 to-orange-500/15',
    border: 'border-l-amber-500',
    iconBg: 'bg-amber-500/20',
    iconColor: 'text-amber-600 dark:text-amber-400',
    Icon: FlaskConical,
    glow: 'hover:shadow-amber-500/10'
  },
  pesticide: {
    gradient: 'from-red-500/15 via-rose-500/10 to-pink-500/15',
    border: 'border-l-red-500',
    iconBg: 'bg-red-500/20',
    iconColor: 'text-red-600 dark:text-red-400',
    Icon: Bug,
    glow: 'hover:shadow-red-500/10'
  },
  hormone: {
    gradient: 'from-violet-500/15 via-purple-500/10 to-indigo-500/15',
    border: 'border-l-violet-500',
    iconBg: 'bg-violet-500/20',
    iconColor: 'text-violet-600 dark:text-violet-400',
    Icon: Sparkles,
    glow: 'hover:shadow-violet-500/10'
  },
  irrigation: {
    gradient: 'from-cyan-500/15 via-blue-500/10 to-sky-500/15',
    border: 'border-l-cyan-500',
    iconBg: 'bg-cyan-500/20',
    iconColor: 'text-cyan-600 dark:text-cyan-400',
    Icon: Droplets,
    glow: 'hover:shadow-cyan-500/10'
  },
  warning: {
    gradient: 'from-orange-500/15 via-amber-500/10 to-yellow-500/15',
    border: 'border-l-orange-500',
    iconBg: 'bg-orange-500/20',
    iconColor: 'text-orange-600 dark:text-orange-400',
    Icon: AlertTriangle,
    glow: 'hover:shadow-orange-500/10'
  },
  success: {
    gradient: 'from-green-500/15 via-emerald-500/10 to-teal-500/15',
    border: 'border-l-green-500',
    iconBg: 'bg-green-500/20',
    iconColor: 'text-green-600 dark:text-green-400',
    Icon: CheckCircle2,
    glow: 'hover:shadow-green-500/10'
  },
  info: {
    gradient: 'from-blue-500/15 via-indigo-500/10 to-violet-500/15',
    border: 'border-l-blue-500',
    iconBg: 'bg-blue-500/20',
    iconColor: 'text-blue-600 dark:text-blue-400',
    Icon: Info,
    glow: 'hover:shadow-blue-500/10'
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
