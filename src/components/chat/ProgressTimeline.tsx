import React from 'react';
import { motion } from 'framer-motion';
import { Check, Circle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TimelineStage {
  id: string;
  label: string;
  status: 'completed' | 'current' | 'pending';
  date?: string;
  description?: string;
}

interface ProgressTimelineProps {
  stages: TimelineStage[];
  className?: string;
}

export function ProgressTimeline({ stages, className }: ProgressTimelineProps) {
  return (
    <div className={cn("w-full", className)}>
      {/* Desktop View - Horizontal */}
      <div className="hidden md:block">
        <div className="relative flex items-center justify-between">
          {/* Progress Line */}
          <div className="absolute top-6 left-0 right-0 h-0.5 bg-muted">
            <motion.div
              className="h-full bg-primary"
              initial={{ width: 0 }}
              animate={{
                width: `${
                  (stages.filter(s => s.status === 'completed').length /
                    (stages.length - 1)) *
                  100
                }%`
              }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>

          {/* Stages */}
          {stages.map((stage, index) => (
            <div key={stage.id} className="relative flex flex-col items-center z-10">
              {/* Icon */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: index * 0.1, type: 'spring', stiffness: 300 }}
                className={cn(
                  'w-12 h-12 rounded-full flex items-center justify-center border-4 border-background',
                  stage.status === 'completed' && 'bg-primary text-primary-foreground',
                  stage.status === 'current' && 'bg-primary/20 border-primary animate-pulse',
                  stage.status === 'pending' && 'bg-muted text-muted-foreground'
                )}
              >
                {stage.status === 'completed' && <Check className="w-5 h-5" />}
                {stage.status === 'current' && <Clock className="w-5 h-5 text-primary" />}
                {stage.status === 'pending' && <Circle className="w-5 h-5" />}
              </motion.div>

              {/* Label */}
              <div className="mt-3 text-center max-w-[120px]">
                <p
                  className={cn(
                    'text-xs font-medium',
                    stage.status === 'current' && 'text-primary font-semibold',
                    stage.status === 'pending' && 'text-muted-foreground'
                  )}
                >
                  {stage.label}
                </p>
                {stage.date && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {stage.date}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Mobile View - Vertical */}
      <div className="md:hidden space-y-4">
        {stages.map((stage, index) => (
          <div key={stage.id} className="flex gap-3">
            {/* Icon & Line */}
            <div className="flex flex-col items-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: index * 0.1, type: 'spring', stiffness: 300 }}
                className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center border-4 border-background flex-shrink-0',
                  stage.status === 'completed' && 'bg-primary text-primary-foreground',
                  stage.status === 'current' && 'bg-primary/20 border-primary animate-pulse',
                  stage.status === 'pending' && 'bg-muted text-muted-foreground'
                )}
              >
                {stage.status === 'completed' && <Check className="w-4 h-4" />}
                {stage.status === 'current' && <Clock className="w-4 h-4 text-primary" />}
                {stage.status === 'pending' && <Circle className="w-4 h-4" />}
              </motion.div>
              {index < stages.length - 1 && (
                <div
                  className={cn(
                    'w-0.5 h-12 mt-2',
                    stage.status === 'completed' ? 'bg-primary' : 'bg-muted'
                  )}
                />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 pt-1">
              <p
                className={cn(
                  'text-sm font-medium',
                  stage.status === 'current' && 'text-primary font-semibold',
                  stage.status === 'pending' && 'text-muted-foreground'
                )}
              >
                {stage.label}
              </p>
              {stage.date && (
                <p className="text-xs text-muted-foreground mt-1">{stage.date}</p>
              )}
              {stage.description && (
                <p className="text-xs text-muted-foreground mt-2">{stage.description}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
