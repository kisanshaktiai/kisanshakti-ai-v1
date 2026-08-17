import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarIcon, Save, X, Loader2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { schedulesApi } from '@/services/schedulesApi';

interface Task {
  id: string;
  task_date: string;
  task_type: string;
  task_name: string;
  task_description?: string;
  status: string;
  priority: string;
  weather_dependent: boolean;
  instructions?: string[];
}

interface TaskEditDialogProps {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
}

const TaskEditDialog: React.FC<TaskEditDialogProps> = ({ task, open, onOpenChange, onSave }) => {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [taskName, setTaskName] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskDate, setTaskDate] = useState<Date | undefined>();
  const [priority, setPriority] = useState<string>('medium');
  const [calendarOpen, setCalendarOpen] = useState(false);

  useEffect(() => {
    if (task) {
      setTaskName(task.task_name || '');
      setTaskDescription(task.task_description || '');
      setTaskDate(task.task_date ? parseISO(task.task_date) : undefined);
      setPriority(task.priority || 'medium');
    }
  }, [task]);

  const handleSave = async () => {
    if (!task) return;
    
    setIsLoading(true);
    try {
      // PHASE 0 (security): write via authenticated schedules-api, never direct table access
      await schedulesApi.updateTask(task.id, {
        task_name: taskName,
        task_description: taskDescription,
        task_date: taskDate ? format(taskDate, 'yyyy-MM-dd') : task.task_date,
        priority: priority,
      });


      toast.success(t('schedule.toast.task_updated') || 'Task updated successfully', {
        description: t('schedule.toast.changes_saved') || 'Your changes have been saved',
      });
      
      onSave();
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating task:', error);
      toast.error(t('schedule.toast.update_failed') || 'Failed to update task', {
        description: t('schedule.toast.try_again') || 'Please try again',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md mx-auto max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            {t('schedule.dialog.edit_task') || 'Edit Task'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Task Name */}
          <div className="space-y-2">
            <Label htmlFor="taskName" className="text-sm font-medium">
              {t('schedule.dialog.task_name') || 'Task Name'}
            </Label>
            <Input
              id="taskName"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              placeholder={t('schedule.dialog.enter_task_name') || 'Enter task name'}
              className="w-full"
            />
          </div>

          {/* Task Date */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              {t('schedule.dialog.task_date') || 'Task Date'}
            </Label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !taskDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {taskDate ? format(taskDate, "PPP") : t('schedule.dialog.pick_date') || 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={taskDate}
                  onSelect={(date) => {
                    setTaskDate(date);
                    setCalendarOpen(false);
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              {t('schedule.dialog.priority') || 'Priority'}
            </Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger>
                <SelectValue placeholder={t('schedule.dialog.select_priority') || 'Select priority'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">
                  {t('schedule.priority.low') || 'Low'}
                </SelectItem>
                <SelectItem value="medium">
                  {t('schedule.priority.medium') || 'Medium'}
                </SelectItem>
                <SelectItem value="high">
                  {t('schedule.priority.high') || 'High'}
                </SelectItem>
                <SelectItem value="critical">
                  {t('schedule.priority.critical') || 'Critical'}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="taskDescription" className="text-sm font-medium">
              {t('schedule.dialog.description') || 'Description'}
            </Label>
            <Textarea
              id="taskDescription"
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              placeholder={t('schedule.dialog.enter_description') || 'Enter task description'}
              rows={4}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            <X className="h-4 w-4 mr-2" />
            {t('common.cancel') || 'Cancel'}
          </Button>
          <Button
            onClick={handleSave}
            disabled={isLoading || !taskName.trim()}
            className="bg-gradient-to-r from-primary to-accent text-primary-foreground"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {t('common.save') || 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TaskEditDialog;
