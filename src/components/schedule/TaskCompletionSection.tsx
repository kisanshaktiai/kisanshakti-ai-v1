import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Flag, Check, Clock, RotateCcw, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

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
      className="mt-4 pt-4 border-t border-border/50"
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
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">
                Mark as done when completed
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
                Completed on {completedAt ? format(new Date(completedAt), 'dd MMM, h:mm a') : 'just now'}
              </span>
            </>
          ) : (
            <span className="text-sm font-medium text-muted-foreground">
              Status: {optimisticStatus}
            </span>
          )}
        </motion.div>

        {/* Action Section */}
        {isCompleted ? (
          <div className="space-y-2">
            {/* Completed Badge */}
            <Badge className="gap-2 bg-success/10 text-success border-success/20 px-3 py-2 font-medium w-fit">
              <Flag className="h-4 w-4 fill-current" />
              <span className="text-sm">Completed</span>
            </Badge>
            
            {/* Unmark Button - Full width and prominent */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleUnmark}
              disabled={isCompleting || !onUnmark}
              className="w-full gap-2 pointer-events-auto bg-card hover:bg-destructive/10 text-muted-foreground hover:text-destructive border-border hover:border-destructive transition-all duration-200"
            >
              {isCompleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm font-medium">Undoing...</span>
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4" />
                  <span className="text-sm font-medium">Unmark as Done</span>
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
              variant="outline"
              size="sm"
              onClick={handleComplete}
              disabled={isCompleting}
              className="w-full gap-2 transition-all duration-300 pointer-events-auto border-primary/30 hover:bg-primary/5 hover:border-primary text-foreground hover:text-primary"
            >
              {isCompleting ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  >
                    <Clock className="h-4 w-4" />
                  </motion.div>
                  <span className="text-sm font-medium">Syncing...</span>
                </>
              ) : (
                <>
                  <Flag className="h-4 w-4" />
                  <span className="text-sm font-medium">Mark Done</span>
                </>
              )}
            </Button>
          </motion.div>
        )}
      </div>

      {/* Additional Status Badge */}
      {isCompleted && !isCompacting && (
        <div className="mt-3 flex items-center gap-2">
          <Badge className="bg-success/10 text-success border-success/20 font-medium">
            <Check className="h-3 w-3 mr-1" />
            <span className="text-xs">Task Completed</span>
          </Badge>
        </div>
      )}
    </motion.div>
  );
}
