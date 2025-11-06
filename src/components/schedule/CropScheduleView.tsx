import React, { useState, useEffect } from 'react';
import { Calendar, Droplets, Leaf, Bug, Scissors, Package, AlertCircle, Clock, Volume2, Sparkles, RefreshCw, MapPin, ArrowLeft } from 'lucide-react';
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
import { useTranslation } from 'react-i18next';
import { format, addDays, isToday, isTomorrow, isPast, differenceInDays } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import TaskTimeline from './TaskTimeline';
import ModernTaskCard from './ModernTaskCard';
import TaskActionDialog from './TaskActionDialog';
import ClimateAlertBanner from './ClimateAlertBanner';

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
  language?: string;
  currency?: string;
}

interface CropScheduleViewProps {
  landId: string;
  landName: string;
  currentCrop?: string;
  onBack?: () => void;
}

const CropScheduleView: React.FC<CropScheduleViewProps> = ({ landId, landName, currentCrop, onBack }) => {
  const { toast } = useToast();
  const { user } = useAuthStore();
  const { i18n } = useTranslation();
  const { speak, stop, isSpeaking } = useTextToSpeech({ 
    language: i18n.language === 'hi' ? 'hi-IN' : 
             i18n.language === 'mr' ? 'mr-IN' : 
             i18n.language === 'pa' ? 'pa-IN' : 
             i18n.language === 'ta' ? 'ta-IN' : 'en-US'
  });
  
  const [loading, setLoading] = useState(true);
  const [schedule, setSchedule] = useState<CropSchedule | null>(null);
  const [tasks, setTasks] = useState<ScheduleTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<ScheduleTask | null>(null);
  const [viewMode, setViewMode] = useState<'today' | 'week' | 'month' | 'all'>('today');
  const [climateData, setClimateData] = useState<any>(null);
  const [speakingTaskId, setSpeakingTaskId] = useState<string | null>(null);

  // Task type icons and colors
  const taskTypeConfig = {
    irrigation: { icon: Droplets, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-950/30' },
    fertilizer: { icon: Leaf, color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-950/30' },
    pesticide: { icon: Bug, color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-950/30' },
    weeding: { icon: Scissors, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-950/30' },
    harvest: { icon: Package, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30' },
    other: { icon: AlertCircle, color: 'text-gray-500', bg: 'bg-gray-50 dark:bg-gray-950/30' }
  };

  useEffect(() => {
    fetchSchedule();
  }, [landId]);

  // Dynamic Climate Monitoring - Auto-adjust schedule based on weather & NDVI
  useEffect(() => {
    if (!schedule?.id) return;

    const monitorClimate = async () => {
      try {
        console.log('Running automatic climate monitoring for schedule:', schedule.id);
        
        // Use device location for weather data
        const { useLocation } = await import('@/hooks/useLocation');
        const { useWeather } = await import('@/hooks/useWeather');
        
        const { location: deviceLocation } = useLocation();
        if (!deviceLocation) {
          console.log('No device location available for weather monitoring');
          return;
        }

        const { currentWeather } = useWeather({ lat: deviceLocation.lat, lon: deviceLocation.lon });
        
        // Get latest NDVI data from land data (stored in generation_params)
        const { data: scheduleData } = await supabase
          .from('crop_schedules')
          .select('generation_params')
          .eq('id', schedule.id)
          .single();
        
        // Type assertion for generation_params
        const generationParams = scheduleData?.generation_params as any;
        const ndviValue = generationParams?.calculations?.ndvi_considered ? 0.5 : 0.5;
        
        // Call climate monitor edge function with available data
        const { data: monitorResult, error: monitorError } = await supabase.functions.invoke('ai-schedule-climate-monitor', {
          body: {
            scheduleId: schedule.id,
            climateData: {
              rainfall_24h: 0, // Will be calculated in edge function from weather API
              ndvi_value: ndviValue,
              temperature_avg: currentWeather?.temp || 25,
            }
          }
        });
        
        if (monitorError) {
          console.error('Climate monitoring error:', monitorError);
        } else {
          console.log('Climate monitoring result:', monitorResult);
          
          // If adjustments were made, refresh the schedule
          if (monitorResult?.adjustments_triggered) {
            toast({
              title: '🌦️ Schedule Auto-Adjusted',
              description: `${monitorResult.adjustments_made || 0} tasks rescheduled based on weather & crop health`,
              className: 'bg-blue-50 border-blue-200',
            });
            fetchSchedule(); // Reload to show adjusted tasks
          }
        }
      } catch (error) {
        console.error('Error in climate monitoring:', error);
      }
    };

    // Run monitoring every 6 hours
    const interval = setInterval(monitorClimate, 6 * 60 * 60 * 1000);
    
    // Run once immediately after 30 seconds (allow schedule to settle)
    const initialTimer = setTimeout(monitorClimate, 30000);
    
    return () => {
      clearInterval(interval);
      clearTimeout(initialTimer);
    };
  }, [schedule?.id, landId]);

  const fetchSchedule = async () => {
    try {
      setLoading(true);
      
      // Use offline data service for automatic fallback and proper data isolation
      const { offlineDataService } = await import('@/services/offlineDataService');
      const schedules = await offlineDataService.fetchSchedules(landId);
      
      // Find active schedule for this land
      const activeSchedule = schedules.find((s: any) => s.land_id === landId && s.is_active);
      
      if (activeSchedule) {
        setSchedule(activeSchedule);
        
        // Fetch tasks for this schedule (online with fallback)
        const { supabaseWithAuth } = await import('@/integrations/supabase/client');
        const client = supabaseWithAuth();
        
        const { data: tasksData, error: tasksError } = await client
          .from('schedule_tasks')
          .select('*')
          .eq('schedule_id', activeSchedule.id)
          .order('task_date', { ascending: true });

        if (tasksError) {
          console.warn('Failed to fetch tasks online:', tasksError);
          // Fallback to local DB and map fields
          const { localDB } = await import('@/services/localDB');
          const localTasks = await localDB.getTasksBySchedule(activeSchedule.id);
          // Map local DB fields to component expected fields
          const mappedTasks = (localTasks || []).map((t: any) => ({
            id: t.id,
            schedule_id: t.schedule_id,
            task_date: t.scheduled_date || t.task_date,
            task_type: t.task_type,
            task_name: t.task_name,
            task_description: t.description || t.task_description,
            priority: t.priority || 'medium',
            status: t.status,
            weather_dependent: t.weather_dependent || false,
            instructions: t.instructions,
            precautions: t.precautions,
            language: t.language,
            currency: t.currency,
          }));
          setTasks(mappedTasks);
        } else {
          setTasks(tasksData || []);
        }

        // Fetch latest climate monitoring data
        const { data: climateMonitoring } = await client
          .from('schedule_climate_monitoring')
          .select('*')
          .eq('schedule_id', activeSchedule.id)
          .order('monitoring_date', { ascending: false })
          .limit(1)
          .maybeSingle();

        setClimateData(climateMonitoring);
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

  const speakTask = (task: ScheduleTask) => {
    const text = `${task.task_name}. ${task.task_description || ''}. 
      ${task.instructions ? 'Instructions: ' + task.instructions.join('. ') : ''}
      ${task.precautions ? 'Precautions: ' + task.precautions.join('. ') : ''}`;
    
    if (isSpeaking && speakingTaskId === task.id) {
      stop();
      setSpeakingTaskId(null);
    } else {
      speak(text);
      setSpeakingTaskId(task.id);
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


  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!schedule) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <div className="text-center space-y-4">
          <Calendar className="h-16 w-16 text-primary/60 mx-auto animate-pulse" />
          <h3 className="text-xl font-bold text-foreground">No Schedule Available</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Generate an AI-powered crop schedule from the Schedule page
          </p>
        </div>
      </div>
    );
  }

  const filteredTasks = getFilteredTasks();
  const pendingTasks = filteredTasks.filter(t => t.status === 'pending');
  const completedTasks = filteredTasks.filter(t => t.status === 'completed');
  const upcomingCount = pendingTasks.filter(t => !isPast(new Date(t.task_date))).length;
  const todayTasks = tasks.filter(t => isToday(new Date(t.task_date)) && t.status === 'pending');

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-accent/5 to-primary/5">
      {/* Modern Mobile-First Header - 2025 Design */}
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-2xl border-b border-border/50">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1">
              {onBack && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onBack}
                  className="h-9 w-9 rounded-xl bg-background/50 hover:bg-primary/10"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <div>
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary animate-pulse" />
                  {schedule.crop_name}
                </h2>
                <p className="text-xs text-muted-foreground font-medium">
                  <MapPin className="h-3 w-3 inline mr-1" />
                  {landName} • {schedule.crop_variety || 'Standard Variety'}
                </p>
              </div>
            </div>
            <Badge className="bg-primary/10 text-primary border-primary/20">
              AI Schedule
            </Badge>
          </div>
        </div>
      </div>

      {/* Quick Stats Cards - Mobile Optimized */}
      <div className="px-4 pt-4 pb-2">
        <div className="grid grid-cols-2 gap-3 mb-3">
          <Card className="bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-950/20 dark:to-green-900/10 border-green-200 dark:border-green-800">
            <div className="p-3 space-y-1">
              <div className="flex items-center justify-between">
                <Calendar className="h-4 w-4 text-green-600 dark:text-green-400" />
                <span className="text-[10px] font-medium text-green-700 dark:text-green-300 uppercase tracking-wider">Sowing</span>
              </div>
              <p className="text-base font-bold text-green-900 dark:text-green-100">
                {format(new Date(schedule.sowing_date), 'dd MMM')}
              </p>
              <p className="text-[10px] text-green-700 dark:text-green-300">
                {differenceInDays(new Date(), new Date(schedule.sowing_date))} days ago
              </p>
            </div>
          </Card>
          
          <Card className="bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/20 dark:to-amber-900/10 border-amber-200 dark:border-amber-800">
            <div className="p-3 space-y-1">
              <div className="flex items-center justify-between">
                <Package className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <span className="text-[10px] font-medium text-amber-700 dark:text-amber-300 uppercase tracking-wider">Harvest</span>
              </div>
              <p className="text-base font-bold text-amber-900 dark:text-amber-100">
                {schedule.expected_harvest_date ? format(new Date(schedule.expected_harvest_date), 'dd MMM') : 'TBD'}
              </p>
              <p className="text-[10px] text-amber-700 dark:text-amber-300">
                {schedule.expected_harvest_date && differenceInDays(new Date(schedule.expected_harvest_date), new Date())} days left
              </p>
            </div>
          </Card>
        </div>

        {/* Climate Alert Banner */}
        <ClimateAlertBanner data={climateData} />

        {/* Today's Priority Tasks - Big & Clear for Farmers */}
        {todayTasks.length > 0 && (
          <Card className="mb-3 bg-gradient-to-r from-primary/10 to-accent/10 border-primary/30 shadow-lg">
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  {i18n.t('schedule.todaysTasks')}
                </h3>
                <Badge variant="destructive" className="text-[10px]">
                  {todayTasks.length} {i18n.t('schedule.pending')}
                </Badge>
              </div>
              <div className="space-y-2">
                {todayTasks.slice(0, 2).map((task) => {
                  const config = taskTypeConfig[task.task_type as keyof typeof taskTypeConfig] || taskTypeConfig.other;
                  const Icon = config.icon;
                  return (
                    <div 
                      key={task.id} 
                      className={`p-3 rounded-lg ${config.bg} border border-border/50 cursor-pointer hover:shadow-md transition-shadow`}
                      onClick={() => setSelectedTask(task)}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-full bg-background/80 ${config.color}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-sm text-foreground">{task.task_name}</p>
                          <p className="text-xs text-muted-foreground mt-1">{task.task_description}</p>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs mt-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              speakTask(task);
                            }}
                          >
                            <Volume2 className="h-3 w-3 mr-1" />
                            Listen
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        )}

        {/* Tasks Summary */}
        <Card className="bg-background/60 backdrop-blur-sm border-border/50">
          <div className="p-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-primary/10 rounded-lg p-3">
                <p className="text-2xl font-bold text-primary">{upcomingCount}</p>
                <p className="text-[10px] text-muted-foreground font-medium">{i18n.t('schedule.upcoming')}</p>
              </div>
              <div className="bg-success/10 rounded-lg p-3">
                <p className="text-2xl font-bold text-success">{completedTasks.length}</p>
                <p className="text-[10px] text-muted-foreground font-medium">{i18n.t('schedule.complete')}</p>
              </div>
              <div className="bg-destructive/10 rounded-lg p-3">
                <p className="text-2xl font-bold text-destructive">
                  {pendingTasks.filter(t => isPast(new Date(t.task_date))).length}
                </p>
                <p className="text-[10px] text-muted-foreground font-medium">{i18n.t('schedule.overdue')}</p>
              </div>
            </div>

            {/* Refresh Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchSchedule()}
              className="w-full mt-3 bg-background/60 backdrop-blur-sm border-primary/20 hover:bg-primary/10"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              {i18n.t('schedule.refreshSchedule')}
            </Button>
          </div>
        </Card>
      </div>

      {/* Task Tabs - Simple View Switcher */}
      <div className="px-4 pb-20">
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)} className="mt-4">
          <TabsList className="grid w-full grid-cols-4 bg-background/60 backdrop-blur-sm">
            <TabsTrigger value="today" className="text-xs">{i18n.t('schedule.today')}</TabsTrigger>
            <TabsTrigger value="week" className="text-xs">{i18n.t('schedule.week')}</TabsTrigger>
            <TabsTrigger value="month" className="text-xs">{i18n.t('schedule.month')}</TabsTrigger>
            <TabsTrigger value="all" className="text-xs">{i18n.t('schedule.all')}</TabsTrigger>
          </TabsList>

          <TabsContent value={viewMode} className="mt-3 space-y-3">
            {filteredTasks.length === 0 ? (
              <Card className="p-8 text-center">
                <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">{i18n.t('schedule.noTasks')}</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {viewMode === 'week' || viewMode === 'month' || viewMode === 'all' ? (
                  <TaskTimeline tasks={filteredTasks} onTaskClick={(task: any) => setSelectedTask(task as ScheduleTask)} />
                ) : (
                  <div className="grid gap-3">
                    {filteredTasks.map((task) => {
                      const taskDate = new Date(task.task_date);
                      const isOverdue = isPast(taskDate) && task.status === 'pending';
                      const daysUntil = differenceInDays(taskDate, new Date());
                      
                      return (
                        <div key={task.id} onClick={() => setSelectedTask(task)}>
                          <ModernTaskCard
                            task={task}
                            onSpeak={() => speakTask(task)}
                            isSpeaking={isSpeaking && speakingTaskId === task.id}
                            isOverdue={isOverdue}
                            daysUntil={daysUntil}
                            readOnly={true}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Task Details Dialog - Read Only */}
      {selectedTask && (
        <TaskActionDialog
          task={selectedTask}
          isOpen={!!selectedTask}
          onClose={() => setSelectedTask(null)}
          onSpeak={() => speakTask(selectedTask)}
          readOnly={true}
        />
      )}
    </div>
  );
};

export default CropScheduleView;