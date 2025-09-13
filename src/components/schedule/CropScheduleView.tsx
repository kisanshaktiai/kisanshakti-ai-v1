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
    <div className="space-y-6">
      {/* Header */}
      <Card className="p-6 bg-gradient-to-r from-green-50 to-blue-50 border-none">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {schedule.crop_name} {schedule.crop_variety && `(${schedule.crop_variety})`}
            </h2>
            <p className="text-gray-600">For: {landName}</p>
            <div className="flex gap-4 mt-3 text-sm">
              <div>
                <span className="text-gray-500">Sowing:</span>{' '}
                <span className="font-medium">{format(new Date(schedule.sowing_date), 'dd MMM yyyy')}</span>
              </div>
              {schedule.expected_harvest_date && (
                <div>
                  <span className="text-gray-500">Expected Harvest:</span>{' '}
                  <span className="font-medium">{format(new Date(schedule.expected_harvest_date), 'dd MMM yyyy')}</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowGenerator(true)}
            >
              Regenerate Schedule
            </Button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-4 mt-6">
          <div className="bg-white/80 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-blue-600">{upcomingCount}</p>
            <p className="text-sm text-gray-600">Upcoming Tasks</p>
          </div>
          <div className="bg-white/80 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-green-600">{completedTasks.length}</p>
            <p className="text-sm text-gray-600">Completed</p>
          </div>
          <div className="bg-white/80 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-orange-600">
              {pendingTasks.filter(t => isPast(new Date(t.task_date))).length}
            </p>
            <p className="text-sm text-gray-600">Overdue</p>
          </div>
        </div>
      </Card>

      {/* View Mode Tabs */}
      <Tabs value={viewMode} onValueChange={(v: any) => setViewMode(v)} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="week">This Week</TabsTrigger>
          <TabsTrigger value="month">This Month</TabsTrigger>
          <TabsTrigger value="all">All Tasks</TabsTrigger>
        </TabsList>

        <TabsContent value={viewMode} className="mt-6">
          {filteredTasks.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-gray-500">No tasks scheduled for this period</p>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Timeline View for Week/Month */}
              {(viewMode === 'week' || viewMode === 'month') && (
                <TaskTimeline tasks={filteredTasks} onTaskClick={(task: any) => setSelectedTask(task)} />
              )}

              {/* Task Cards */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredTasks.map((task) => {
                  const config = taskTypeConfig[task.task_type as keyof typeof taskTypeConfig] || taskTypeConfig.other;
                  const TaskIcon = config.icon;
                  const isOverdue = isPast(new Date(task.task_date)) && task.status === 'pending';
                  const daysUntil = differenceInDays(new Date(task.task_date), new Date());

                  return (
                    <TaskCard
                      key={task.id}
                      task={task}
                      isOverdue={isOverdue}
                      daysUntil={daysUntil}
                      onAction={handleTaskAction}
                      onSpeak={() => speakTask(task)}
                      isSpeaking={isSpeaking}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CropScheduleView;