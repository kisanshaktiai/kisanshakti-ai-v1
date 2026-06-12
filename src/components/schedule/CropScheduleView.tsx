import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Droplets, Leaf, Bug, Scissors, Package, AlertCircle, Clock, Volume2, Sparkles, RefreshCw, MapPin, ArrowLeft, Plus, FlaskConical, Sprout, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
import { cn } from '@/lib/utils';
import TaskTimeline from './TaskTimeline';
import ModernTaskCard from './ModernTaskCard';
import TaskActionDialog from './TaskActionDialog';
import ClimateAlertBanner from './ClimateAlertBanner';
import { TaskStatisticsWidget } from './TaskStatisticsWidget';
import { TaskPhotoUploadDialog } from './TaskPhotoUploadDialog';
import { useSchedules } from '@/hooks/useSchedules';
import { localDB } from '@/services/localDB';
import { useLandRefLabels } from '@/hooks/useLandRefLabels';
import { useOwnershipLabel } from '@/lib/ownershipLabel';

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
  farming_type?: string;
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
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuthStore();
  const { t, i18n } = useTranslation();
  const { speak, stop, isSpeaking } = useTextToSpeech({ 
    language: i18n.language === 'hi' ? 'hi-IN' : 
             i18n.language === 'mr' ? 'mr-IN' : 
             i18n.language === 'pa' ? 'pa-IN' : 
             i18n.language === 'ta' ? 'ta-IN' : 'en-US'
  });
  
  // Use React Query hook for schedules - replaces offlineDataService
  const { schedules, isLoading: loadingSchedules, refetch: refetchSchedules, isError, error } = useSchedules(landId);
  
  // Debug log to see what the hook returns
  console.log('🔍 [CropScheduleView] Hook return value:', {
    schedules,
    schedulesLength: schedules?.length,
    loadingSchedules,
    isError,
    error: error?.message,
    landId,
    userReady: !!user?.id,
  });
  
  const [schedule, setSchedule] = useState<CropSchedule | null>(null);
  const [tasks, setTasks] = useState<ScheduleTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<ScheduleTask | null>(null);
  const [viewMode, setViewMode] = useState<'today' | 'week' | 'month' | 'all'>('today');
  const [climateData, setClimateData] = useState<any>(null);
  const [speakingTaskId, setSpeakingTaskId] = useState<string | null>(null);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [photoUploadTask, setPhotoUploadTask] = useState<ScheduleTask | null>(null);
  const [showLandPhotoUpload, setShowLandPhotoUpload] = useState(false);
  const [landContext, setLandContext] = useState<{ soil_type?: string; water_source?: string; irrigation_type?: string; ownership_type?: string } | null>(null);
  const refLabels = useLandRefLabels();
  const ownershipLabel = useOwnershipLabel();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!landId) return;
      const { data } = await supabase
        .from('lands')
        .select('soil_type, water_source, irrigation_type, ownership_type')
        .eq('id', landId)
        .maybeSingle();
      if (!cancelled && data) setLandContext(data as any);
    })();
    return () => { cancelled = true; };
  }, [landId]);

  // Task type icons and colors
  const taskTypeConfig = {
    irrigation: { icon: Droplets, color: 'text-info', bg: 'bg-info-soft dark:bg-info/30' },
    fertilizer: { icon: Leaf, color: 'text-success', bg: 'bg-success-soft dark:bg-success/30' },
    pesticide: { icon: Bug, color: 'text-warning', bg: 'bg-warning-soft dark:bg-warning/30' },
    weeding: { icon: Scissors, color: 'text-primary', bg: 'bg-primary-soft dark:bg-primary/30' },
    harvest: { icon: Package, color: 'text-warning', bg: 'bg-warning-soft dark:bg-warning/30' },
    other: { icon: AlertCircle, color: 'text-foreground/80', bg: 'bg-muted dark:bg-foreground/80/30' }
  };

  // Update schedule when schedules data changes from React Query
  useEffect(() => {
    console.log('📋 [CropScheduleView] useEffect triggered:', {
      schedulesCount: schedules?.length,
      loadingSchedules,
      isError,
      landId,
      userReady: !!user?.id,
    });
    
    // Wait for user to be ready
    if (!user?.id) {
      console.log('⏳ [CropScheduleView] Waiting for user authentication...');
      return;
    }
    
    if (loadingSchedules) {
      console.log('⏳ [CropScheduleView] Still loading schedules...');
      return;
    }
    
    if (isError) {
      console.error('❌ [CropScheduleView] Error loading schedules:', error);
      return;
    }
    
    if (schedules && schedules.length > 0) {
      console.log('✅ [CropScheduleView] Processing schedules:', schedules.length);
      // Since useSchedules already filters by is_active=true and landId, just use first match
      const activeSchedule = schedules[0];
      
      if (activeSchedule) {
        console.log('✅ [CropScheduleView] Found active schedule:', {
          id: activeSchedule.id,
          crop_name: activeSchedule.crop_name,
          land_id: activeSchedule.land_id,
          is_active: activeSchedule.is_active
        });
        setSchedule(activeSchedule);
        fetchTasks(activeSchedule.id);
      } else {
        console.log('⚠️ [CropScheduleView] No matching schedule found');
        setSchedule(null);
        setTasks([]);
      }
    } else {
      console.log('⚠️ [CropScheduleView] No schedules available - empty array or null');
      setSchedule(null);
      setTasks([]);
    }
  }, [schedules, landId, loadingSchedules, isError, error, user?.id]);

  const fetchTasks = async (scheduleId: string) => {
    try {
      setLoadingTasks(true);
      console.log('🔍 [CropScheduleView] Fetching tasks for schedule:', scheduleId);
      
      // Guard: Ensure user is authenticated
      if (!user?.id || !user?.tenantId) {
        console.warn('⚠️ [CropScheduleView] Cannot fetch tasks: Missing user authentication');
        setLoadingTasks(false);
        return;
      }
      
      // Try to fetch from API first with authenticated client
      const { supabaseWithAuth } = await import('@/integrations/supabase/client');
      const client = supabaseWithAuth(user.id, user.tenantId);
      
      const { data: tasksData, error: tasksError } = await client
        .from('schedule_tasks')
        .select('*')
        .eq('schedule_id', scheduleId)
        .order('task_date', { ascending: true });

      if (tasksError) {
        console.warn('⚠️ [CropScheduleView] Failed to fetch tasks online:', tasksError);
        // Fallback to local DB
        const localTasks = await localDB.getTasksBySchedule(scheduleId);
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
        console.log(`📦 [CropScheduleView] Loaded ${mappedTasks.length} tasks from localDB`);
        setTasks(mappedTasks);
      } else {
        console.log(`✅ [CropScheduleView] Loaded ${tasksData?.length || 0} tasks from API`);
        setTasks(tasksData || []);
      }

      // Fetch latest climate monitoring data
      const { data: climateMonitoring } = await client
        .from('schedule_climate_monitoring')
        .select('*')
        .eq('schedule_id', scheduleId)
        .order('monitoring_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      setClimateData(climateMonitoring);
    } catch (error) {
      console.error('❌ [CropScheduleView] Error fetching tasks:', error);
      toast({
        title: 'Error',
        description: 'Failed to load schedule tasks',
        variant: 'destructive',
      });
    } finally {
      setLoadingTasks(false);
    }
  };

  // Dynamic Climate Monitoring - Auto-adjust schedule based on weather & NDVI
  // Note: Removed automatic climate monitoring to prevent invalid hook calls
  // Climate monitoring should be triggered manually or via server-side cron jobs
  useEffect(() => {
    if (!schedule?.id) return;
    
    console.log('✅ [CropScheduleView] Active schedule loaded:', schedule.id);
    
    // Climate monitoring has been disabled to prevent invalid hook calls
    // To re-enable, move weather/location logic to component-level hooks
    // or implement as a server-side scheduled task
  }, [schedule?.id, landId, refetchSchedules]);

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


  const handleTaskUpdate = (taskId: string, updates: Partial<ScheduleTask>) => {
    setTasks(prevTasks => 
      prevTasks.map(task => 
        task.id === taskId 
          ? { ...task, ...updates }
          : task
      )
    );
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

  const loading = loadingSchedules || loadingTasks;

  if (loading) {
    return (
      <div className="min-h-full bg-gradient-to-b from-background via-accent/5 to-primary/5">
        {/* Header Skeleton */}
        <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-2xl border-b border-border/50">
          <div className="px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1">
                <Skeleton className="h-9 w-9 rounded-xl" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          </div>
        </div>

        {/* Content Skeleton */}
        <div className="px-4 pt-4 pb-2 space-y-3">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 gap-3">
            {[1, 2].map((i) => (
              <Card key={i} className="animate-pulse">
                <div className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-4 rounded" />
                    <Skeleton className="h-3 w-16 rounded-full" />
                  </div>
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </Card>
            ))}
          </div>

          {/* Tasks Skeleton */}
          <Card className="animate-pulse">
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              {[1, 2].map((i) => (
                <div key={i} className="p-3 rounded-lg bg-muted/20 space-y-2">
                  <div className="flex items-start gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Loading message */}
          <div className="flex items-center justify-center gap-2 text-muted-foreground py-4">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
            <p className="text-sm font-medium">{t('schedule.schedule_view.loading')}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!schedule) {
    return (
      <div className="min-h-full bg-gradient-to-b from-background via-accent/5 to-primary/5">
        {/* Compact inline summary (no sticky — parent provides header) */}
        <div className="px-4 pt-3 pb-1">
          <h2 className="text-base font-bold text-foreground leading-tight">
            {landName}
          </h2>
          <p className="text-xs text-muted-foreground font-medium mt-0.5">
            {t('schedule.schedule_view.no_active_schedule')}
          </p>
        </div>

        {/* Empty State */}
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
          <div className="text-center space-y-4 max-w-sm">
            <div className="relative">
              <Calendar className="h-20 w-20 text-primary/60 mx-auto animate-pulse" />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
            </div>
            <h3 className="text-xl font-bold text-foreground">{t('schedule.schedule_view.no_schedule_available')}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t('schedule.schedule_view.no_schedule_description')}
            </p>
            <div className="pt-4">
              <Button
                onClick={onBack}
                className="bg-gradient-to-r from-primary to-accent hover:shadow-lg hover:shadow-primary/30 transition-all"
              >
                <Plus className="h-4 w-4 mr-2" />
                {t('schedule.schedule_view.generate_schedule')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }


  const filteredTasks = getFilteredTasks();
  const pendingTasks = filteredTasks.filter(t => t.status === 'pending');
  const completedTasks = filteredTasks.filter(t => t.status === 'completed');
  const upcomingCount = pendingTasks.filter(t => !isPast(new Date(t.task_date))).length;
  const todayTasks = tasks.filter(t => isToday(new Date(t.task_date)) && t.status === 'pending');

  // Find real harvest date from tasks (harvest/harvesting task)
  const harvestTask = tasks.find(t => 
    t.task_type?.toLowerCase().includes('harvest') || 
    t.task_name?.toLowerCase().includes('harvest') ||
    t.task_name?.toLowerCase().includes('कटाई') ||
    t.task_name?.toLowerCase().includes('काढणी')
  );
  const realHarvestDate = harvestTask?.task_date || schedule.expected_harvest_date;

  return (
    <div className="min-h-full bg-gradient-to-b from-background via-accent/5 to-primary/5">
      {/* Compact inline crop summary (non-sticky — parent header handles back/nav) */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-foreground flex items-center gap-1.5 leading-tight truncate">
              <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="truncate">{(schedule as any).metadata?.translated_crop_name || schedule.crop_name}</span>
            </h2>
            <p className="text-[11px] text-muted-foreground font-medium mt-0.5 flex items-center gap-1 truncate">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{landName} • {schedule.crop_variety || t('schedule.schedule_view.standard_variety')}</span>
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] px-2 py-0.5 h-5">
              {t('schedule.schedule_view.ai_schedule')}
            </Badge>
            {schedule.farming_type && (
              <Badge
                className={cn(
                  "text-[10px] border px-2 py-0.5 h-5",
                  schedule.farming_type === 'organic_only' && "bg-success/10 text-success border-success/30",
                  schedule.farming_type === 'organic_fertilizer' && "bg-info/10 text-info border-info/30",
                  schedule.farming_type === 'fertilizer_pesticide' && "bg-warning/10 text-warning border-warning/30"
                )}
              >
                {schedule.farming_type === 'organic_only' && (
                  <><Leaf className="h-2.5 w-2.5 mr-0.5" />{t('schedule.farming_type.organic')}</>
                )}
                {schedule.farming_type === 'organic_fertilizer' && (
                  <><Leaf className="h-2.5 w-2.5 mr-0.5" />{t('schedule.farming_type.organic_chemical')}</>
                )}
                {schedule.farming_type === 'fertilizer_pesticide' && (
                  <><FlaskConical className="h-2.5 w-2.5 mr-0.5" />{t('schedule.farming_type.chemical')}</>
                )}
              </Badge>
            )}
          </div>
        </div>
      </div>


      {/* Quick Stats Cards - Mobile Optimized */}
      <div className="px-4 pt-4 pb-2">
        <div className="grid grid-cols-2 gap-3 mb-3">
          <Card className="relative overflow-hidden bg-success-soft border-success/30">
            <div className="absolute inset-y-0 left-0 w-1 bg-success" aria-hidden />
            <div className="p-3 pl-4 space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center justify-center h-6 w-6 rounded-full bg-success/15">
                  <Calendar className="h-3.5 w-3.5 text-success" />
                </div>
                <span className="text-[10px] font-semibold text-success uppercase tracking-wider">{t('schedule.sowing')}</span>
              </div>
              <p className="text-base font-bold text-foreground leading-tight">
                {format(new Date(schedule.sowing_date), 'dd MMM')}
              </p>
              <p className="text-[10px] text-muted-foreground font-medium">
                {differenceInDays(new Date(), new Date(schedule.sowing_date))} {t('schedule.days_ago')}
              </p>
            </div>
          </Card>

          <Card className="relative overflow-hidden bg-warning-soft border-warning/30">
            <div className="absolute inset-y-0 left-0 w-1 bg-warning" aria-hidden />
            <div className="p-3 pl-4 space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center justify-center h-6 w-6 rounded-full bg-warning/15">
                  <Package className="h-3.5 w-3.5 text-warning" />
                </div>
                <span className="text-[10px] font-semibold text-warning uppercase tracking-wider">{t('schedule.harvest')}</span>
              </div>
              <p className="text-base font-bold text-foreground leading-tight">
                {realHarvestDate
                  ? format(new Date(realHarvestDate), 'dd MMM yyyy')
                  : t('schedule.schedule_card.tbd')}
              </p>
              <p className="text-[10px] text-muted-foreground font-medium">
                {realHarvestDate
                  ? `${Math.max(0, differenceInDays(new Date(realHarvestDate), new Date()))} ${t('schedule.days_remaining')}`
                  : ''}
              </p>
            </div>
          </Card>
        </div>

        {/* Climate Alert Banner */}
        <ClimateAlertBanner data={climateData} />

        {/* Task Statistics Widget */}
        <TaskStatisticsWidget scheduleId={schedule.id} className="mb-3" />

        {/* Crop Growth Tracking Card - Upload Photo Button */}
        <Card 
          className="mb-3 border-primary/20 bg-gradient-to-r from-primary/5 to-accent/5"
        >
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-primary/10">
                  <Camera className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">{i18n.language === 'hi' ? 'फसल वृद्धि ट्रैकिंग' : i18n.language === 'mr' ? 'पीक वाढ ट्रॅकिंग' : 'Crop Growth Tracking'}</h3>
                  <p className="text-xs text-muted-foreground">{i18n.language === 'hi' ? 'फोटो अपलोड करें और AI विश्लेषण प्राप्त करें' : i18n.language === 'mr' ? 'फोटो अपलोड करा आणि AI विश्लेषण मिळवा' : 'Upload photos for AI analysis'}</p>
                </div>
              </div>
              <Sprout className="h-5 w-5 text-primary" />
            </div>
            {/* Quick Upload Button */}
            <Button
              variant="default"
              size="sm"
              className="w-full gap-2 bg-gradient-to-r from-primary to-accent hover:shadow-lg"
              onClick={() => setShowLandPhotoUpload(true)}
            >
              <Camera className="h-4 w-4" />
              {i18n.language === 'hi' ? 'फोटो अपलोड करें' : i18n.language === 'mr' ? 'फोटो अपलोड करा' : 'Upload Photo'}
            </Button>
          </div>
        </Card>

        {/* Today's Priority Tasks - Big & Clear for Farmers */}
        {todayTasks.length > 0 && (
          <Card className="mb-3 bg-gradient-to-r from-primary/10 to-accent/10 border-primary/30 shadow-lg">
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  {t('schedule.todays_tasks')}
                </h3>
                <Badge variant="destructive" className="text-[10px]">
                  {todayTasks.length} {t('schedule.pending')}
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
                          <div className="flex items-center gap-2 mt-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                speakTask(task);
                              }}
                            >
                              <Volume2 className="h-3 w-3 mr-1" />
                              {i18n.language === 'hi' ? 'सुनें' : i18n.language === 'mr' ? 'ऐका' : 'Listen'}
                            </Button>
                            {/* Camera button for task photo */}
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1 border-primary/30 text-primary hover:bg-primary/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPhotoUploadTask(task);
                              }}
                            >
                              <Camera className="h-3 w-3" />
                              {i18n.language === 'hi' ? 'फोटो' : i18n.language === 'mr' ? 'फोटो' : 'Photo'}
                            </Button>
                          </div>
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
              onClick={() => refetchSchedules()}
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
                  <TaskTimeline 
                    tasks={filteredTasks} 
                    onTaskClick={(task: any) => setSelectedTask(task as ScheduleTask)}
                    onTaskComplete={refetchSchedules}
                    onTaskUpdate={handleTaskUpdate}
                    onTakePhoto={(task: any) => setPhotoUploadTask(task as ScheduleTask)}
                  />
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
                            onTakePhoto={() => setPhotoUploadTask(task)}
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

      {/* Task Photo Upload Dialog */}
      {photoUploadTask && schedule && user && (
        <TaskPhotoUploadDialog
          isOpen={!!photoUploadTask}
          onClose={() => setPhotoUploadTask(null)}
          taskId={photoUploadTask.id}
          taskType={photoUploadTask.task_type}
          taskName={photoUploadTask.task_name}
          scheduleId={schedule.id}
          landId={landId}
          farmerId={user.id}
          tenantId={user.tenantId || ''}
          cropName={schedule.crop_name}
          onUploadComplete={() => {
            setPhotoUploadTask(null);
            refetchSchedules();
          }}
        />
      )}

      {/* Land Photo Upload Dialog (general) */}
      {showLandPhotoUpload && schedule && user && (
        <TaskPhotoUploadDialog
          isOpen={showLandPhotoUpload}
          onClose={() => setShowLandPhotoUpload(false)}
          scheduleId={schedule.id}
          landId={landId}
          farmerId={user.id}
          tenantId={user.tenantId || ''}
          cropName={schedule.crop_name}
          onUploadComplete={() => {
            setShowLandPhotoUpload(false);
            refetchSchedules();
          }}
        />
      )}
    </div>
  );
};

export default CropScheduleView;