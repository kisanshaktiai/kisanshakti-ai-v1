import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Flag, Check, Clock, RotateCcw, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

interface TaskCompletionSectionProps {
  taskId: string;
  status: string;
  completedAt?: string;
  onComplete: (taskId: string) => void;
  onUnmark?: (taskId: string) => void;
  isCompacting?: boolean;
}

export function TaskCompletionSection({ 
  taskId, 
  status, 
  completedAt, 
  onComplete,
  onUnmark,
  isCompacting = false 
}: TaskCompletionSectionProps) {
  const { t } = useTranslation();
  const [isCompleting, setIsCompleting] = React.useState(false);
  const [optimisticStatus, setOptimisticStatus] = React.useState(status);
  const isCompleted = optimisticStatus === 'completed';
  const isPending = optimisticStatus === 'pending';

  // Sync optimistic state with prop changes
  React.useEffect(() => {
    setOptimisticStatus(status);
  }, [status]);

  const handleComplete = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    console.log('Mark Done button clicked for task:', taskId);
    
    if (isCompleting) return;
    
    // Optimistically set to completed
    setOptimisticStatus('completed');
    setIsCompleting(true);
    
    try {
      await onComplete(taskId);
    } catch (error) {
      // Rollback on error
      setOptimisticStatus(status);
    } finally {
      setIsCompleting(false);
    }
  };

  const handleUnmark = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    console.log('Unmark button clicked for task:', taskId);
    
    if (isCompleting) return;
    
    // Optimistically set back to pending
    setOptimisticStatus('pending');
    setIsCompleting(true);
    
    try {
      if (onUnmark) {
        await onUnmark(taskId);
      }
    } catch (error) {
      // Rollback on error
      setOptimisticStatus(status);
    } finally {
      setIsCompleting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.3 }}
      className="mt-4 border-t-2 border-border pt-4"
    >
      <div className="space-y-3">
        {/* Status Line */}
        <motion.div 
          className="flex items-center gap-2"
          animate={isCompleted ? { scale: [1, 1.05, 1] } : {}}
          transition={{ duration: 0.3 }}
        >
          {isPending ? (
            <>
              <Clock className="h-4 w-4 text-foreground" />
              <span className="text-sm font-bold text-foreground">
                {t('schedule.completion.mark_when_finished')}
              </span>
            </>
          ) : isCompleted ? (
            <>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <Check className="h-4 w-4 text-success" />
              </motion.div>
              <span className="text-sm font-medium text-success">
                {t('schedule.completion.completed_on', { date: completedAt ? format(new Date(completedAt), 'dd MMM, h:mm a') : t('schedule.completion.just_now') })}
              </span>
            </>
          ) : (
            <span className="text-sm font-medium text-muted-foreground">
              {t('schedule.completion.status', { status: optimisticStatus })}
            </span>
          )}
        </motion.div>

        {/* Action Section */}
        {isCompleted ? (
          <div className="space-y-2">
            {/* Completed Badge */}
            <Badge className="w-fit gap-2 border-success bg-success px-3 py-2 font-medium text-success-foreground">
              <Flag className="h-4 w-4 fill-current" />
               <span className="text-sm">{t('schedule.completion.completed')}</span>
            </Badge>
            
            {/* Unmark Button - Full width and prominent */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleUnmark}
              disabled={isCompleting || !onUnmark}
              className="min-h-12 w-full gap-2 border-2 border-border bg-card text-card-foreground pointer-events-auto"
            >
              {isCompleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm font-bold">{t('schedule.completion.undoing')}</span>
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4" />
                  <span className="text-sm font-bold">{t('schedule.completion.unmark')}</span>
                </>
              )}
            </Button>
          </div>
        ) : (
          /* Mark Done Button */
          <motion.div
            whileTap={{ scale: 0.95 }}
            transition={{ duration: 0.4 }}
          >
            <Button
              type="button"
              variant="default"
              onClick={handleComplete}
              disabled={isCompleting}
              className="min-h-14 w-full gap-2 border-2 border-primary bg-primary text-base font-extrabold text-primary-foreground pointer-events-auto"
            >
              {isCompleting ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  >
                    <Clock className="h-4 w-4" />
                  </motion.div>
                   <span className="text-sm font-bold">{t('schedule.completion.syncing')}</span>
                </>
              ) : (
                <>
                  <Flag className="h-4 w-4" />
                   <span className="text-base font-extrabold">{t('schedule.completion.mark_done')}</span>
                </>
              )}
            </Button>
          </motion.div>
        )}
      </div>

      {/* Additional Status Badge */}
      {isCompleted && !isCompacting && (
        <div className="mt-3 flex items-center gap-2">
          <Badge className="border-success bg-success font-medium text-success-foreground">
            <Check className="h-3 w-3 mr-1" />
            <span className="text-xs">{t('schedule.completion.task_completed')}</span>
          </Badge>
        </div>
      )}
    </motion.div>
  );
}
