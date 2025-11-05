import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Check, X, Calendar, Droplets, Leaf, Bug, Scissors, Package, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';

interface TaskActionDialogProps {
  task: any;
  isOpen: boolean;
  onClose: () => void;
  onAction?: (taskId: string, action: 'completed' | 'skipped' | 'rescheduled', notes?: string) => void;
  onSpeak?: () => void;
  readOnly?: boolean;
}

const TaskActionDialog: React.FC<TaskActionDialogProps> = ({ task, isOpen, onClose, onAction, onSpeak, readOnly = false }) => {
  const { t } = useTranslation();
  const [notes, setNotes] = useState('');
  const [selectedAction, setSelectedAction] = useState<'completed' | 'skipped' | null>(null);

  const taskTypeConfig = {
    irrigation: { icon: Droplets, color: 'text-blue-500', bg: 'bg-blue-50' },
    fertilizer: { icon: Leaf, color: 'text-green-500', bg: 'bg-green-50' },
    pesticide: { icon: Bug, color: 'text-orange-500', bg: 'bg-orange-50' },
    weeding: { icon: Scissors, color: 'text-purple-500', bg: 'bg-purple-50' },
    harvest: { icon: Package, color: 'text-amber-500', bg: 'bg-amber-50' },
    other: { icon: AlertCircle, color: 'text-gray-500', bg: 'bg-gray-50' }
  };

  const config = taskTypeConfig[task?.task_type as keyof typeof taskTypeConfig] || taskTypeConfig.other;
  const Icon = config.icon;

  const handleSubmit = () => {
    if (selectedAction && onAction) {
      onAction(task.id, selectedAction, notes || undefined);
      setNotes('');
      setSelectedAction(null);
    }
  };

  if (!task) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md mx-auto bg-background/95 backdrop-blur-xl border-border/50">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-3">
            <div className={`p-3 rounded-xl ${config.bg}`}>
              <Icon className={`h-6 w-6 ${config.color}`} />
            </div>
            <span className="text-foreground">{t('schedule.taskDetails')}</span>
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Update task status and add notes
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Task Info */}
          <div className={`p-4 rounded-xl ${config.bg} border border-border/30`}>
            <h3 className="font-semibold text-lg text-foreground mb-2">{task.task_name}</h3>
            <p className="text-sm text-muted-foreground mb-3">{task.task_description}</p>
            
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span>{format(new Date(task.task_date), 'dd MMM yyyy')}</span>
              <Badge variant={task.priority === 'high' ? 'destructive' : 'secondary'} className="text-xs">
                {t(`schedule.${task.priority}`)}
              </Badge>
              {task.weather_dependent && (
                <Badge variant="outline" className="text-xs">{t('schedule.weather')}</Badge>
              )}
            </div>
          </div>

          {/* Resources */}
          {task.required_resources && (
            <div className="bg-muted/30 p-3 rounded-lg border border-border/30">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Resources Needed:</p>
              <p className="text-sm text-foreground">{task.required_resources}</p>
            </div>
          )}

          {/* Action Buttons - Only show if not read-only */}
          {!readOnly && onAction && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant={selectedAction === 'completed' ? 'default' : 'outline'}
                  className={`h-auto py-4 flex-col gap-2 ${
                    selectedAction === 'completed' ? 'bg-success text-success-foreground' : ''
                  }`}
                  onClick={() => setSelectedAction('completed')}
                >
                  <Check className="h-5 w-5" />
                  <span className="text-sm font-semibold">{t('schedule.done')}</span>
                </Button>
                
                <Button
                  variant={selectedAction === 'skipped' ? 'default' : 'outline'}
                  className={`h-auto py-4 flex-col gap-2 ${
                    selectedAction === 'skipped' ? 'bg-destructive text-destructive-foreground' : ''
                  }`}
                  onClick={() => setSelectedAction('skipped')}
                >
                  <X className="h-5 w-5" />
                  <span className="text-sm font-semibold">{t('schedule.skipped')}</span>
                </Button>
              </div>

              {/* Notes */}
              {selectedAction && (
                <div className="space-y-2 animate-in slide-in-from-top-2">
                  <label className="text-sm font-medium text-foreground">
                    Notes <span className="text-muted-foreground">(Optional)</span>
                  </label>
                  <Textarea
                    placeholder="Add any notes about this task..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="resize-none bg-background/60 border-border/50"
                    rows={3}
                  />
                </div>
              )}

              {/* Submit Button */}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="flex-1"
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={!selectedAction}
                  className="flex-1 bg-primary hover:bg-primary/90"
                >
                  {t('common.save')}
                </Button>
              </div>
            </>
          )}

          {/* Read-only mode - Just show close and listen buttons */}
          {readOnly && (
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={onClose}
                className="flex-1"
              >
                {t('schedule.close')}
              </Button>
              {onSpeak && (
                <Button
                  onClick={() => {
                    onSpeak();
                    onClose();
                  }}
                  className="flex-1 bg-primary hover:bg-primary/90"
                >
                  {t('schedule.listen')}
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TaskActionDialog;