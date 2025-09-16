import React, { useState, useEffect } from 'react';
import { Calendar, Droplets, Leaf, Bug, Scissors, Package, AlertCircle, Check, Clock, X, Mic, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/stores/authStore';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { format, addDays, isToday, isTomorrow, isPast, differenceInDays } from 'date-fns';
import TaskTimeline from './TaskTimeline';
import TaskCard from './TaskCard';
import ScheduleGenerator from './ScheduleGenerator';

interface CropSchedule {
  id: string;
  land_id: string;
  crop_name: string;
  crop_variety?: string;
  sowing_date: string;
  expected_harvest_date?: string;
  is_active: boolean;
  generated_at: string;
  last_weather_update?: string;
}

interface ScheduleTask {
  id: string;
  schedule_id: string;
  task_date: string;
  task_type: string;
  task_name: string;
  task_description?: string;
  duration_hours?: number;
  priority: string;
  weather_dependent: boolean;
  resources?: any;
  estimated_cost?: number;
  instructions?: string[];
  precautions?: string[];
  ideal_weather?: any;
  weather_risk_level?: string;
  status: string;
  completed_at?: string;
  completion_notes?: string;
}

interface CropScheduleViewProps {
  landId: string;
  landName: string;
  currentCrop?: string;
}

const CropScheduleView: React.FC<CropScheduleViewProps> = ({ landId, landName, currentCrop }) => {
  const { toast } = useToast();
  const { user } = useAuthStore();
  const { speak, stop, isSpeaking } = useTextToSpeech();
  
  const [loading, setLoading] = useState(true);
  const [schedule, setSchedule] = useState<CropSchedule | null>(null);
  const [tasks, setTasks] = useState<ScheduleTask[]>([]);
  const [showGenerator, setShowGenerator] = useState(false);
  const [selectedTask, setSelectedTask] = useState<ScheduleTask | null>(null);
  const [viewMode, setViewMode] = useState<'today' | 'week' | 'month' | 'all'>('week');

  // Task type icons and colors
  const taskTypeConfig = {
    irrigation: { icon: Droplets, color: 'text-blue-500', bg: 'bg-blue-50' },
    fertilizer: { icon: Leaf, color: 'text-green-500', bg: 'bg-green-50' },
    pesticide: { icon: Bug, color: 'text-orange-500', bg: 'bg-orange-50' },
    weeding: { icon: Scissors, color: 'text-purple-500', bg: 'bg-purple-50' },
    harvest: { icon: Package, color: 'text-amber-500', bg: 'bg-amber-50' },
    other: { icon: AlertCircle, color: 'text-gray-500', bg: 'bg-gray-50' }
  };

  useEffect(() => {
    fetchSchedule();
  }, [landId]);

  const fetchSchedule = async () => {
    try {
      setLoading(true);
      
      // Fetch active schedule for this land
      const { data: scheduleData, error: scheduleError } = await supabase
        .from('crop_schedules')
        .select('*')
        .eq('land_id', landId)
        .eq('is_active', true)
        .maybeSingle();

      if (scheduleError) throw scheduleError;

      if (scheduleData) {
        setSchedule(scheduleData);
        
        // Fetch tasks for this schedule
        const { data: tasksData, error: tasksError } = await supabase
          .from('schedule_tasks')
          .select('*')
          .eq('schedule_id', scheduleData.id)
          .order('task_date', { ascending: true });

        if (tasksError) throw tasksError;
        setTasks(tasksData || []);
      } else {
        setShowGenerator(true);
      }
    } catch (error) {
      console.error('Error fetching schedule:', error);
      toast({
        title: 'Error',
        description: 'Failed to load crop schedule',
        variant: 'destructive',
      });
      // Show generator on error as well
      setShowGenerator(true);
    } finally {
      setLoading(false);
    }
  };

  const handleTaskAction = async (taskId: string, action: 'completed' | 'skipped' | 'rescheduled', notes?: string) => {
    try {
      // Update task status
      const { error: updateError } = await supabase
        .from('schedule_tasks')
        .update({
          status: action,
          completed_at: action === 'completed' ? new Date().toISOString() : null,
          completed_by: user?.id,
          completion_notes: notes,
        })
        .eq('id', taskId);

      if (updateError) throw updateError;

      // Create completion record
      const { error: completionError } = await supabase
        .from('task_completions')
        .insert({
          task_id: taskId,
          farmer_id: user?.id,
          action: action,
          notes: notes,
        });

      if (completionError) throw completionError;

      toast({
        title: 'Success',
        description: `Task marked as ${action}`,
      });

      // Refresh tasks
      fetchSchedule();
    } catch (error) {
      console.error('Error updating task:', error);
      toast({
        title: 'Error',
        description: 'Failed to update task',
        variant: 'destructive',
      });
    }
  };

  const getFilteredTasks = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (viewMode) {
      case 'today':
        return tasks.filter(task => isToday(new Date(task.task_date)));
      case 'week':
        const weekEnd = addDays(today, 7);
        return tasks.filter(task => {
          const taskDate = new Date(task.task_date);
          return taskDate >= today && taskDate <= weekEnd;
        });
      case 'month':
        const monthEnd = addDays(today, 30);
        return tasks.filter(task => {
          const taskDate = new Date(task.task_date);
          return taskDate >= today && taskDate <= monthEnd;
        });
      default:
        return tasks;
    }
  };

  const speakTask = (task: ScheduleTask) => {
    const text = `${task.task_name}. ${task.task_description || ''}. 
      ${task.instructions ? 'Instructions: ' + task.instructions.join('. ') : ''}
      ${task.precautions ? 'Precautions: ' + task.precautions.join('. ') : ''}`;
    
    if (isSpeaking) {
      stop();
    } else {
      speak(text);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (showGenerator || !schedule) {
    return (
      <ScheduleGenerator
        landId={landId}
        landName={landName}
        currentCrop={currentCrop}
        onComplete={() => {
          setShowGenerator(false);
          fetchSchedule();
        }}
        onCancel={() => setShowGenerator(false)}
      />
    );
  }

  const filteredTasks = getFilteredTasks();
  const pendingTasks = filteredTasks.filter(t => t.status === 'pending');
  const completedTasks = filteredTasks.filter(t => t.status === 'completed');
  const upcomingCount = pendingTasks.filter(t => !isPast(new Date(t.task_date))).length;

  return (
    <div className="min-h-screen">
      {/* Modern Header Card with Glass Effect */}
      <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-accent/10 backdrop-blur-xl border-primary/20 shadow-xl overflow-hidden">
        <div className="relative p-4">
          {/* Background pattern */}
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent" />
          
          <div className="relative space-y-4">
            {/* Crop Info */}
            <div>
              <h2 className="text-xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
                {schedule.crop_name} {schedule.crop_variety && `(${schedule.crop_variety})`}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">For: {landName}</p>
            </div>

            {/* Date Pills */}
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
                <Calendar className="h-3 w-3 text-primary" />
                <span className="text-xs font-medium">
                  Sown: {format(new Date(schedule.sowing_date), 'dd MMM')}
                </span>
              </div>
              {schedule.expected_harvest_date && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-success/10 border border-success/20">
                  <Package className="h-3 w-3 text-success" />
                  <span className="text-xs font-medium">
                    Harvest: {format(new Date(schedule.expected_harvest_date), 'dd MMM')}
                  </span>
                </div>
              )}
            </div>

            {/* Quick Stats - Mobile Optimized Grid */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-background/60 backdrop-blur-sm rounded-xl p-3 text-center border border-border/50">
                <p className="text-2xl font-bold text-info">{upcomingCount}</p>
                <p className="text-[10px] text-muted-foreground font-medium">Upcoming</p>
              </div>
              <div className="bg-background/60 backdrop-blur-sm rounded-xl p-3 text-center border border-border/50">
                <p className="text-2xl font-bold text-success">{completedTasks.length}</p>
                <p className="text-[10px] text-muted-foreground font-medium">Done</p>
              </div>
              <div className="bg-background/60 backdrop-blur-sm rounded-xl p-3 text-center border border-border/50">
                <p className="text-2xl font-bold text-warning">
                  {pendingTasks.filter(t => isPast(new Date(t.task_date))).length}
                </p>
                <p className="text-[10px] text-muted-foreground font-medium">Overdue</p>
              </div>
            </div>

            {/* Regenerate Button - Mobile Friendly */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowGenerator(true)}
              className="w-full bg-background/60 backdrop-blur-sm border-primary/20 hover:bg-primary/10"
            >
              <Leaf className="h-4 w-4 mr-2" />
              Regenerate Schedule
            </Button>
          </div>
        </div>
      </Card>

      {/* Modern Tabs with Smooth Transitions */}
      <div className="mt-6">
        <Tabs value={viewMode} onValueChange={(v: any) => setViewMode(v)} className="w-full">
          <TabsList className="grid w-full grid-cols-4 bg-background/60 backdrop-blur-sm border border-border/50 rounded-xl p-1">
            <TabsTrigger 
              value="today" 
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg text-xs font-medium"
            >
              Today
            </TabsTrigger>
            <TabsTrigger 
              value="week"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg text-xs font-medium"
            >
              Week
            </TabsTrigger>
            <TabsTrigger 
              value="month"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg text-xs font-medium"
            >
              Month
            </TabsTrigger>
            <TabsTrigger 
              value="all"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg text-xs font-medium"
            >
              All
            </TabsTrigger>
          </TabsList>

          <TabsContent value={viewMode} className="mt-4 animate-fade-in">
            {filteredTasks.length === 0 ? (
              <Card className="p-12 text-center bg-background/60 backdrop-blur-sm border-border/50">
                <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No tasks scheduled for this period</p>
              </Card>
            ) : (
              <div className="space-y-4 pb-20">
                {/* Timeline View for Week/Month - Mobile Optimized */}
                {(viewMode === 'week' || viewMode === 'month') && (
                  <div className="animate-scale-in">
                    <TaskTimeline tasks={filteredTasks} onTaskClick={(task: any) => setSelectedTask(task)} />
                  </div>
                )}

                {/* Modern Task Cards Grid */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredTasks.map((task, index) => {
                    const config = taskTypeConfig[task.task_type as keyof typeof taskTypeConfig] || taskTypeConfig.other;
                    const TaskIcon = config.icon;
                    const isOverdue = isPast(new Date(task.task_date)) && task.status === 'pending';
                    const daysUntil = differenceInDays(new Date(task.task_date), new Date());

                    return (
                      <div
                        key={task.id}
                        className="animate-fade-in"
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        <TaskCard
                          task={task}
                          isOverdue={isOverdue}
                          daysUntil={daysUntil}
                          onAction={handleTaskAction}
                          onSpeak={() => speakTask(task)}
                          isSpeaking={isSpeaking}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default CropScheduleView;