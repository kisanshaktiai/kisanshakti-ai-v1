import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Droplets, Leaf, Bug, Scissors, Package, AlertCircle, CheckCircle2, Clock, Zap, ChevronDown, Volume2, VolumeX, Calendar, DollarSign, CloudRain, Thermometer, Loader2 } from 'lucide-react';
import { format, isToday, isTomorrow, isPast, differenceInDays } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { TaskCompletionSection } from './TaskCompletionSection';
import { VideoHelpButton } from './VideoHelpButton';
import { cn } from '@/lib/utils';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { supabase } from '@/utils/supabase';
import { toast } from 'sonner';
import { useLanguageStore } from '@/stores/languageStore';

interface Task {
  id: string;
  task_date: string;
  task_type: string;
  task_name: string;
  task_description?: string;
  status: string;
  priority: string;
  weather_dependent: boolean;
  climate_adjusted?: boolean;
  climate_adjustment_reason?: string;
  instructions?: string[];
  precautions?: string[];
  resources?: Record<string, any>;
  ideal_weather?: {
    temperature?: string;
    humidity?: string;
    conditions?: string;
  };
  duration_hours?: number;
  estimated_cost?: number;
  currency?: string;
  completed_at?: string;
}

interface TaskTimelineProps {
  tasks: Task[];
  onTaskClick?: (task: Task) => void;
  onTaskComplete?: () => void;
  onTaskUpdate?: (taskId: string, updates: Partial<Task>) => void;
}

const TaskTimeline: React.FC<TaskTimelineProps> = ({ tasks, onTaskClick, onTaskComplete, onTaskUpdate }) => {
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [speakingTaskId, setSpeakingTaskId] = useState<string | null>(null);
  const { currentLanguage } = useLanguageStore();
  
  // Map language codes to speech synthesis language codes
  const languageMap: Record<string, string> = {
    'hi': 'hi-IN',
    'en': 'en-US',
    'pa': 'pa-IN',
    'mr': 'mr-IN',
    'ta': 'ta-IN',
  };
  
  const speechLanguage = languageMap[currentLanguage] || 'hi-IN';
  
  const { speak, stop, isSpeaking, isSupported, isVoicesLoaded, error: speechError } = useTextToSpeech({ 
    language: speechLanguage, 
    rate: 0.9,
    onError: (error) => {
      toast.error(error, {
        description: 'Try switching to English language for better support'
      });
      setSpeakingTaskId(null);
    }
  });

  const handleTaskComplete = async (taskId: string) => {
    const completedAt = new Date().toISOString();
    
    // OPTIMISTIC UPDATE: Update UI immediately
    if (onTaskUpdate) {
      onTaskUpdate(taskId, { 
        status: 'completed', 
        completed_at: completedAt 
      });
    }

    // Show immediate feedback
    toast.success('✅ Task completed!', {
      description: 'Great work! Syncing...',
      duration: 2000,
    });

    try {
      // Background database update
      const { supabaseWithAuth } = await import('@/integrations/supabase/client');
      const authenticatedClient = supabaseWithAuth();
      
      const { error } = await authenticatedClient
        .from('schedule_tasks')
        .update({
          status: 'completed',
          completed_at: completedAt,
        })
        .eq('id', taskId);

      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }

      // Confirm sync success
      console.log('Task completion synced to database');
      
      // Refresh to get any server-side updates
      if (onTaskComplete) {
        onTaskComplete();
      }
    } catch (error) {
      console.error('Error completing task:', error);
      
      // ROLLBACK: Revert optimistic update on error
      if (onTaskUpdate) {
        onTaskUpdate(taskId, { 
          status: 'pending', 
          completed_at: undefined 
        });
      }
      
      toast.error('❌ Failed to sync completion', {
        description: 'Rolled back. Try again.',
      });
    }
  };

  const handleTaskUnmark = async (taskId: string) => {
    // OPTIMISTIC UPDATE: Revert to pending immediately
    if (onTaskUpdate) {
      onTaskUpdate(taskId, { 
        status: 'pending', 
        completed_at: undefined 
      });
    }

    toast.success('↩️ Task unmarked', {
      description: 'Reverting completion...',
      duration: 2000,
    });

    try {
      const { supabaseWithAuth } = await import('@/integrations/supabase/client');
      const authenticatedClient = supabaseWithAuth();
      
      const { error } = await authenticatedClient
        .from('schedule_tasks')
        .update({
          status: 'pending',
          completed_at: null,
        })
        .eq('id', taskId);

      if (error) throw error;

      console.log('Task unmarked in database');
      
      if (onTaskComplete) {
        onTaskComplete(); // Refresh data
      }
    } catch (error) {
      console.error('Error unmarking task:', error);
      
      // ROLLBACK: Set back to completed on error
      if (onTaskUpdate) {
        onTaskUpdate(taskId, { 
          status: 'completed', 
          completed_at: new Date().toISOString() 
        });
      }
      
      toast.error('❌ Failed to unmark', {
        description: 'Try again.',
      });
    }
  };

  const handleSpeak = (task: Task) => {
    if (!isSupported) {
      toast.error('Text-to-speech is not supported in this browser', {
        description: 'Try using Chrome, Edge, or Safari'
      });
      return;
    }

    if (!isVoicesLoaded) {
      toast.error('Loading speech voices...', {
        description: 'Please try again in a moment'
      });
      return;
    }

    if (isSpeaking && speakingTaskId === task.id) {
      stop();
      setSpeakingTaskId(null);
    } else {
      const textToSpeak = `
        ${task.task_name}. 
        ${task.task_description || ''}. 
        ${task.instructions ? `Instructions: ${task.instructions.join('. ')}` : ''}
        ${task.precautions ? `Precautions: ${task.precautions.join('. ')}` : ''}
      `.trim();
      
      speak(textToSpeak);
      setSpeakingTaskId(task.id);
    }
  };
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
                  
                  const isExpanded = expandedTaskId === task.id;
                  
                  return (
                    <Collapsible
                      key={task.id}
                      open={isExpanded}
                      onOpenChange={(open) => setExpandedTaskId(open ? task.id : null)}
                    >
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: (groupIndex * 0.1) + (taskIndex * 0.05) }}
                        className={cn(
                          "group relative overflow-hidden rounded-xl border-2 transition-all duration-300",
                          isCompleted && "bg-success/5 border-success/20 opacity-70",
                          isOverdue && !isCompleted && "bg-destructive/5 border-destructive/30",
                          !isCompleted && !isOverdue && `${config.lightBg} ${config.border}`,
                          isExpanded && "shadow-lg shadow-primary/20 scale-[1.02]"
                        )}
                      >
                        {/* Gradient Overlay */}
                        <div className={cn(
                          "absolute inset-0 bg-gradient-to-r opacity-0 group-hover:opacity-5 transition-opacity",
                          config.color
                        )} />
                        
                        <CollapsibleTrigger asChild>
                          <div className="relative p-4 cursor-pointer">
                            <div className="flex items-start gap-4">
                              {/* Icon */}
                              <div className={cn(
                                "shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br shadow-lg flex items-center justify-center transition-transform",
                                config.color,
                                isCompleted ? "opacity-50" : "group-hover:scale-110",
                                isExpanded && "scale-110"
                              )}>
                                <TaskIcon className="h-5 w-5 text-white" />
                              </div>

                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <h4 className={cn(
                                    "font-semibold text-sm mb-2",
                                    isCompleted ? "line-through text-muted-foreground" : "text-foreground"
                                  )}>
                                    {task.task_name}
                                  </h4>
                                  
                                  {/* Chevron */}
                                  <motion.div
                                    animate={{ rotate: isExpanded ? 180 : 0 }}
                                    transition={{ duration: 0.3 }}
                                  >
                                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                                  </motion.div>
                                </div>

                                {/* Description (collapsed) */}
                                {!isExpanded && task.task_description && (
                                  <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                                    {task.task_description}
                                  </p>
                                )}

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

                                  {isOverdue && !isCompleted && (
                                    <Badge variant="destructive" className="text-[10px] h-5">
                                      Overdue
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </CollapsibleTrigger>

                        {/* Expanded Content */}
                        <CollapsibleContent className="relative z-10">
                          <div className="px-4 pb-4 space-y-4" onClick={(e) => e.stopPropagation()}>
                            {/* Action Buttons */}
                            <div className="flex justify-end gap-2 relative z-20">
                              {/* Video Help Button */}
                              <VideoHelpButton
                                category={task.task_type}
                                taskType={task.task_name}
                              />

                              {/* Speaker Button */}
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  console.log('Listen button clicked for task:', task.id);
                                  handleSpeak(task);
                                }}
                                disabled={!isSupported || !isVoicesLoaded || (isSpeaking && speakingTaskId !== task.id)}
                                className="gap-2 pointer-events-auto"
                              >
                                {!isSupported ? (
                                  <>
                                    <VolumeX className="h-4 w-4 opacity-50" />
                                    <span>Not Supported</span>
                                  </>
                                ) : !isVoicesLoaded ? (
                                  <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <span>Loading...</span>
                                  </>
                                ) : isSpeaking && speakingTaskId === task.id ? (
                                  <>
                                    <VolumeX className="h-4 w-4 text-primary animate-pulse" />
                                    <span>Stop</span>
                                  </>
                                ) : (
                                  <>
                                    <Volume2 className="h-4 w-4" />
                                    <span>Listen</span>
                                  </>
                                )}
                              </Button>
                            </div>

                            {/* Full Description */}
                            {task.task_description && (
                              <div>
                                <h5 className="text-sm font-medium mb-2">Description</h5>
                                <p className="text-sm text-muted-foreground">{task.task_description}</p>
                              </div>
                            )}

                            {/* Instructions */}
                            {task.instructions && task.instructions.length > 0 && (
                              <div>
                                <h5 className="text-sm font-medium mb-2">Instructions</h5>
                                <ol className="list-decimal list-inside space-y-1">
                                  {task.instructions.map((instruction, idx) => (
                                    <li key={idx} className="text-sm text-muted-foreground">{instruction}</li>
                                  ))}
                                </ol>
                              </div>
                            )}

                            {/* Precautions */}
                            {task.precautions && task.precautions.length > 0 && (
                              <div>
                                <h5 className="text-sm font-medium mb-2 text-warning flex items-center gap-2">
                                  <AlertCircle className="h-4 w-4" />
                                  Precautions
                                </h5>
                                <ul className="list-disc list-inside space-y-1">
                                  {task.precautions.map((precaution, idx) => (
                                    <li key={idx} className="text-sm text-muted-foreground">{precaution}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* Resources */}
                            {task.resources && Object.keys(task.resources).length > 0 && (
                              <div>
                                <h5 className="text-sm font-medium mb-2">Required Resources</h5>
                                <div className="grid grid-cols-2 gap-2">
                                  {Object.entries(task.resources).map(([key, value]) => (
                                    <div key={key} className="flex justify-between text-sm">
                                      <span className="text-muted-foreground capitalize">{key.replace('_', ' ')}:</span>
                                      <span className="font-medium">{String(value)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Quick Info Pills */}
                            <div className="flex flex-wrap gap-2">
                              {task.duration_hours && (
                                <div className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-background/80 border border-border/50">
                                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="text-xs text-muted-foreground">{task.duration_hours}h</span>
                                </div>
                              )}
                              {task.estimated_cost && (
                                <div className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-background/80 border border-border/50">
                                  <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="text-xs text-muted-foreground">
                                    {task.currency === 'INR' ? '₹' : '$'}{task.estimated_cost}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Ideal Weather */}
                            {task.ideal_weather && (
                              <div>
                                <h5 className="text-sm font-medium mb-2 flex items-center gap-2">
                                  <Thermometer className="h-4 w-4 text-info" />
                                  Ideal Weather
                                </h5>
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                  {task.ideal_weather.temperature && (
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Temperature:</span>
                                      <span>{task.ideal_weather.temperature}°C</span>
                                    </div>
                                  )}
                                  {task.ideal_weather.humidity && (
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Humidity:</span>
                                      <span>{task.ideal_weather.humidity}%</span>
                                    </div>
                                  )}
                                  {task.ideal_weather.conditions && (
                                    <div className="col-span-2">
                                      <span className="text-muted-foreground">Conditions:</span> {task.ideal_weather.conditions}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Task Completion Section */}
                            <TaskCompletionSection
                              taskId={task.id}
                              status={task.status}
                              completedAt={task.completed_at}
                              onComplete={handleTaskComplete}
                              onUnmark={handleTaskUnmark}
                            />
                          </div>
                        </CollapsibleContent>

                        {/* Status Indicator Line */}
                        <div className={cn(
                          "absolute bottom-0 left-0 right-0 h-1 transition-all",
                          isCompleted && "bg-success",
                          isOverdue && !isCompleted && "bg-destructive",
                          !isCompleted && !isOverdue && "bg-gradient-to-r from-primary to-accent transform scale-x-0 group-hover:scale-x-100 origin-left"
                        )} />
                      </motion.div>
                    </Collapsible>
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