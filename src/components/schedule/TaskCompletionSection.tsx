import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Flag, Check, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface TaskCompletionSectionProps {
  taskId: string;
  status: string;
  completedAt?: string;
  onComplete: (taskId: string) => void;
  isCompacting?: boolean;
}

export function TaskCompletionSection({ 
  taskId, 
  status, 
  completedAt, 
  onComplete,
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

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.3 }}
      className="mt-4 pt-4 border-t border-border/50"
    >
      <div className="flex items-center justify-between gap-4">
        {/* Status Line */}
        <motion.div 
          className="flex items-center gap-2 flex-1"
          animate={isCompleted ? { scale: [1, 1.05, 1] } : {}}
          transition={{ duration: 0.3 }}
        >
          {isPending ? (
            <>
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
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
              <span className="text-sm text-success">
                Completed on {completedAt ? format(new Date(completedAt), 'dd MMM, h:mm a') : 'just now'}
              </span>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">
              Status: {optimisticStatus}
            </span>
          )}
        </motion.div>

        {/* Flag Button */}
        <motion.div
          whileTap={{ scale: 0.95 }}
          animate={isCompleted ? { 
            scale: [1, 1.1, 1],
          } : {}}
          transition={{ duration: 0.4 }}
        >
          <Button
            type="button"
            variant={isCompleted ? "default" : "outline"}
            size="sm"
            onClick={handleComplete}
            disabled={isCompleting || isCompleted}
            className={cn(
              "gap-2 transition-all duration-300 pointer-events-auto",
              isCompleted && "bg-success hover:bg-success/90 text-white border-success"
            )}
          >
            {isCompleting ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                >
                  <Clock className="h-4 w-4" />
                </motion.div>
                <span>Syncing...</span>
              </>
            ) : isCompleted ? (
              <>
                <motion.div
                  initial={{ rotate: -180, scale: 0 }}
                  animate={{ rotate: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 200 }}
                >
                  <Flag className="h-4 w-4 fill-current" />
                </motion.div>
                <span>Completed</span>
              </>
            ) : (
              <>
                <Flag className="h-4 w-4" />
                <span>Mark Done</span>
              </>
            )}
          </Button>
        </motion.div>
      </div>

      {/* Additional Status Badge */}
      {isCompleted && !isCompacting && (
        <div className="mt-3 flex items-center gap-2">
          <Badge className="bg-success/10 text-success border-success/20">
            <Check className="h-3 w-3 mr-1" />
            Task Completed
          </Badge>
        </div>
      )}
    </motion.div>
  );
}
