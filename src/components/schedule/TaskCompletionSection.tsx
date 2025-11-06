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
  const isCompleted = status === 'completed';
  const isPending = status === 'pending';

  const handleComplete = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    console.log('Mark Done button clicked for task:', taskId);
    
    if (isCompleting) return;
    
    setIsCompleting(true);
    try {
      await onComplete(taskId);
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
        <div className="flex items-center gap-2 flex-1">
          {isPending ? (
            <>
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Mark as done when completed
              </span>
            </>
          ) : isCompleted ? (
            <>
              <Check className="h-4 w-4 text-success" />
              <span className="text-sm text-success">
                Completed on {completedAt ? format(new Date(completedAt), 'dd MMM, h:mm a') : 'Unknown'}
              </span>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">
              Status: {status}
            </span>
          )}
        </div>

        {/* Flag Button */}
        <Button
          type="button"
          variant={isCompleted ? "default" : "outline"}
          size="sm"
          onClick={handleComplete}
          disabled={isCompleting}
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
              <span>Processing...</span>
            </>
          ) : isCompleted ? (
            <>
              <Flag className="h-4 w-4 fill-current" />
              <span>Completed</span>
            </>
          ) : (
            <>
              <Flag className="h-4 w-4" />
              <span>Mark Done</span>
            </>
          )}
        </Button>
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
