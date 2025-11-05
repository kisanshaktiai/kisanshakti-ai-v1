import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Droplets, Leaf, Bug, Scissors, Package, AlertCircle, CheckCircle2, Clock, Zap } from 'lucide-react';
import { format, isToday, isTomorrow, isPast, differenceInDays } from 'date-fns';
import { motion } from 'framer-motion';

interface Task {
  id: string;
  task_date: string;
  task_type: string;
  task_name: string;
  status: string;
  priority: string;
  weather_dependent: boolean;
  climate_adjusted?: boolean;
  climate_adjustment_reason?: string;
}

interface TaskTimelineProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

const TaskTimeline: React.FC<TaskTimelineProps> = ({ tasks, onTaskClick }) => {
  const taskTypeConfig = {
    irrigation: { 
      icon: Droplets, 
      color: 'from-blue-500 to-cyan-500',
      lightBg: 'bg-blue-50 dark:bg-blue-950/20',
      border: 'border-blue-200 dark:border-blue-800'
    },
    fertilizer: { 
      icon: Leaf, 
      color: 'from-green-500 to-emerald-500',
      lightBg: 'bg-green-50 dark:bg-green-950/20',
      border: 'border-green-200 dark:border-green-800'
    },
    pesticide: { 
      icon: Bug, 
      color: 'from-orange-500 to-amber-500',
      lightBg: 'bg-orange-50 dark:bg-orange-950/20',
      border: 'border-orange-200 dark:border-orange-800'
    },
    weeding: { 
      icon: Scissors, 
      color: 'from-purple-500 to-pink-500',
      lightBg: 'bg-purple-50 dark:bg-purple-950/20',
      border: 'border-purple-200 dark:border-purple-800'
    },
    harvest: { 
      icon: Package, 
      color: 'from-amber-500 to-yellow-500',
      lightBg: 'bg-amber-50 dark:bg-amber-950/20',
      border: 'border-amber-200 dark:border-amber-800'
    },
    other: { 
      icon: AlertCircle, 
      color: 'from-gray-500 to-slate-500',
      lightBg: 'bg-gray-50 dark:bg-gray-950/20',
      border: 'border-gray-200 dark:border-gray-800'
    }
  };

  // Group tasks by date
  const groupedTasks = tasks.reduce((acc, task) => {
    const date = task.task_date;
    if (!acc[date]) acc[date] = [];
    acc[date].push(task);
    return acc;
  }, {} as Record<string, Task[]>);

  const getDateLabel = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) return { label: 'Today', variant: 'today' as const };
    if (isTomorrow(date)) return { label: 'Tomorrow', variant: 'tomorrow' as const };
    
    const daysFromNow = differenceInDays(date, new Date());
    if (daysFromNow > 0 && daysFromNow <= 7) {
      return { label: format(date, 'EEEE'), variant: 'soon' as const };
    }
    
    return { label: format(date, 'EEE, dd MMM'), variant: 'future' as const };
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-success/10 border-success/30 text-success';
      case 'skipped':
        return 'bg-muted border-border text-muted-foreground';
      case 'overdue':
        return 'bg-destructive/10 border-destructive/30 text-destructive';
      default:
        return 'bg-card border-border text-foreground';
    }
  };

  return (
    <div className="space-y-4">
      {/* Modern Header */}
      <div className="flex items-center justify-between px-1">
        <h3 className="text-lg font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          Timeline View
        </h3>
        <Badge variant="outline" className="font-mono text-xs">
          {tasks.length} tasks
        </Badge>
      </div>

      {/* Modern Timeline */}
      <div className="relative pl-8 space-y-8">
        {/* Animated Gradient Line */}
        <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-gradient-to-b from-primary via-accent to-primary/20" />
        
        {Object.entries(groupedTasks).map(([date, dateTasks], groupIndex) => {
          const isPastDate = isPast(new Date(date)) && !isToday(new Date(date));
          const dateInfo = getDateLabel(date);
          const allCompleted = dateTasks.every(t => t.status === 'completed');
          
          return (
            <motion.div
              key={date}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: groupIndex * 0.1 }}
              className="relative"
            >
              {/* Date Marker with Pulse */}
              <div className="absolute -left-[1.875rem] top-3">
                <div className={`relative w-6 h-6 rounded-full flex items-center justify-center ${
                  allCompleted 
                    ? 'bg-success shadow-lg shadow-success/50'
                    : dateInfo.variant === 'today'
                    ? 'bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/50 animate-pulse'
                    : dateInfo.variant === 'tomorrow' || dateInfo.variant === 'soon'
                    ? 'bg-primary shadow-md shadow-primary/30'
                    : 'bg-muted'
                }`}>
                  {allCompleted ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                  ) : (
                    <Clock className="h-3.5 w-3.5 text-white" />
                  )}
                </div>
              </div>

              {/* Date Label */}
              <div className="mb-4">
                <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full backdrop-blur-sm ${
                  dateInfo.variant === 'today'
                    ? 'bg-gradient-to-r from-primary/20 to-accent/20 border border-primary/30'
                    : dateInfo.variant === 'tomorrow' || dateInfo.variant === 'soon'
                    ? 'bg-primary/10 border border-primary/20'
                    : 'bg-card/50 border border-border'
                }`}>
                  <span className={`font-bold text-sm ${
                    dateInfo.variant === 'today' || dateInfo.variant === 'tomorrow' || dateInfo.variant === 'soon'
                      ? 'bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent'
                      : 'text-foreground'
                  }`}>
                    {dateInfo.label}
                  </span>
                  <Badge variant="secondary" className="text-[10px] h-5">
                    {dateTasks.length} {dateTasks.length === 1 ? 'task' : 'tasks'}
                  </Badge>
                </div>
              </div>

              {/* Tasks */}
              <div className="space-y-3">
                {dateTasks.map((task, taskIndex) => {
                  const config = taskTypeConfig[task.task_type as keyof typeof taskTypeConfig] || taskTypeConfig.other;
                  const TaskIcon = config.icon;
                  const isCompleted = task.status === 'completed';
                  const isOverdue = isPastDate && task.status === 'pending';
                  
                  return (
                    <motion.div
                      key={task.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: (groupIndex * 0.1) + (taskIndex * 0.05) }}
                      className={`group relative overflow-hidden rounded-xl border-2 transition-all duration-300 cursor-pointer
                        ${isCompleted 
                          ? 'bg-success/5 border-success/20 hover:border-success/40 hover:bg-success/10' 
                          : isOverdue
                          ? 'bg-destructive/5 border-destructive/30 hover:border-destructive/50 hover:bg-destructive/10'
                          : `${config.lightBg} ${config.border} hover:shadow-lg hover:shadow-primary/10 hover:-translate-y-0.5`
                        }`}
                      onClick={() => onTaskClick(task)}
                    >
                      {/* Gradient Overlay */}
                      <div className={`absolute inset-0 bg-gradient-to-r ${config.color} opacity-0 group-hover:opacity-5 transition-opacity`} />
                      
                      <div className="relative p-4">
                        <div className="flex items-start gap-4">
                          {/* Icon */}
                          <div className={`shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br ${config.color} shadow-lg flex items-center justify-center ${
                            isCompleted ? 'opacity-50' : 'group-hover:scale-110 transition-transform'
                          }`}>
                            <TaskIcon className="h-5 w-5 text-white" />
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <h4 className={`font-semibold text-sm mb-2 ${
                              isCompleted ? 'line-through text-muted-foreground' : 'text-foreground'
                            }`}>
                              {task.task_name}
                            </h4>

                            {/* Badges */}
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge 
                                variant={task.priority === 'high' ? 'destructive' : task.priority === 'medium' ? 'default' : 'secondary'}
                                className="text-[10px] h-5 font-medium"
                              >
                                {task.priority}
                              </Badge>

                              {task.weather_dependent && (
                                <Badge variant="outline" className="text-[10px] h-5 gap-1">
                                  <Droplets className="h-2.5 w-2.5" />
                                  Weather
                                </Badge>
                              )}

                              {task.climate_adjusted && (
                                <Badge className="bg-accent/10 text-accent border-accent/30 text-[10px] h-5 gap-1">
                                  <Zap className="h-2.5 w-2.5" />
                                  AI Adjusted
                                </Badge>
                              )}

                              {isCompleted && (
                                <Badge className="bg-success/20 text-success border-success/30 text-[10px] h-5 gap-1">
                                  <CheckCircle2 className="h-2.5 w-2.5" />
                                  Done
                                </Badge>
                              )}

                              {isOverdue && (
                                <Badge variant="destructive" className="text-[10px] h-5">
                                  Overdue
                                </Badge>
                              )}
                            </div>

                            {/* Climate Adjustment Reason */}
                            {task.climate_adjustment_reason && (
                              <p className="text-xs text-muted-foreground mt-2 italic">
                                {task.climate_adjustment_reason}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Hover Indicator */}
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-primary to-accent transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left" />
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default TaskTimeline;