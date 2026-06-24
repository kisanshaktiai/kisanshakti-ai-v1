import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, TrendingUp, Flame, Target, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface TaskStatisticsWidgetProps {
  scheduleId: string;
  className?: string;
}

interface TaskStats {
  totalCompleted: number;
  totalTasks: number;
  completionRate: number;
  currentStreak: number;
  longestStreak: number;
}

export function TaskStatisticsWidget({ scheduleId, className }: TaskStatisticsWidgetProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [stats, setStats] = useState<TaskStats>({
    totalCompleted: 0,
    totalTasks: 0,
    completionRate: 0,
    currentStreak: 0,
    longestStreak: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchTaskStatistics = useCallback(async () => {
    try {
      const { supabaseWithAuth } = await import('@/integrations/supabase/client');
      const client = supabaseWithAuth();

      const { data: tasks, error } = await client
        .from('schedule_tasks')
        .select('id, status, completed_at, task_date')
        .eq('schedule_id', scheduleId)
        .order('task_date', { ascending: true });

      if (error) throw error;

      if (!tasks || tasks.length === 0) {
        setLoading(false);
        return;
      }

      const totalTasks = tasks.length;
      const completedTasks = tasks.filter(t => t.status === 'completed');
      const totalCompleted = completedTasks.length;
      const completionRate = totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0;

      const streaks = calculateStreaks(completedTasks);

      setStats({
        totalCompleted,
        totalTasks,
        completionRate,
        currentStreak: streaks.current,
        longestStreak: streaks.longest,
      });
    } catch (error) {
      console.error('Error fetching task statistics:', error);
    } finally {
      setLoading(false);
    }
  }, [scheduleId]);

  // Initial fetch and real-time subscription
  useEffect(() => {
    fetchTaskStatistics();

    // Subscribe to real-time updates for this schedule's tasks
    const channel = supabase
      .channel(`task-stats-${scheduleId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'schedule_tasks',
          filter: `schedule_id=eq.${scheduleId}`
        },
        () => {
          // Refetch stats when any task changes
          fetchTaskStatistics();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [scheduleId, fetchTaskStatistics]);

  const calculateStreaks = (completedTasks: any[]) => {
    if (completedTasks.length === 0) {
      return { current: 0, longest: 0 };
    }

    const tasksByDate = new Map<string, number>();
    completedTasks.forEach(task => {
      if (task.completed_at) {
        const dateKey = new Date(task.completed_at).toISOString().split('T')[0];
        tasksByDate.set(dateKey, (tasksByDate.get(dateKey) || 0) + 1);
      }
    });

    const sortedDates = Array.from(tasksByDate.keys()).sort();
    
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    
    const today = new Date().toISOString().split('T')[0];
    let lastDate: Date | null = null;

    sortedDates.forEach(dateStr => {
      const currentDate = new Date(dateStr);
      
      if (lastDate === null) {
        tempStreak = 1;
      } else {
        const diffDays = Math.floor((currentDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (diffDays === 1) {
          tempStreak++;
        } else {
          longestStreak = Math.max(longestStreak, tempStreak);
          tempStreak = 1;
        }
      }
      
      const diffFromToday = Math.floor((new Date(today).getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffFromToday <= 1) {
        currentStreak = tempStreak;
      }
      
      lastDate = currentDate;
    });

    longestStreak = Math.max(longestStreak, tempStreak);
    
    return { current: currentStreak, longest: longestStreak };
  };

  if (loading) {
    return (
      <Card className={cn("animate-pulse", className)}>
        <div className="p-4">
          <div className="h-12 bg-muted/50 rounded-lg" />
        </div>
      </Card>
    );
  }

  return (
    <Card className={cn("overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm", className)}>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <button className="w-full p-3 flex items-center justify-between hover:bg-accent/5 transition-colors">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">
                {t('schedule.task_statistics.title')}
              </span>
            </div>
            
            {/* Compact summary when collapsed */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  <span className="text-sm font-bold text-foreground">{stats.totalCompleted}/{stats.totalTasks}</span>
                </div>
                <Badge 
                  variant="secondary" 
                  className={cn(
                    "text-xs px-1.5 py-0",
                    stats.completionRate >= 70 ? "bg-success/20 text-success" : 
                    stats.completionRate >= 40 ? "bg-warning/20 text-warning" : "bg-muted"
                  )}
                >
                  {stats.completionRate}%
                </Badge>
                {stats.currentStreak >= 3 && (
                  <div className="flex items-center gap-0.5">
                    <Flame className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-semibold text-primary">{stats.currentStreak}</span>
                  </div>
                )}
              </div>
              {isExpanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
            >
              <CardContent className="pt-0 pb-3 px-3 space-y-3">
                {/* Progress bar */}
                <div className="rounded-lg bg-muted/30 p-3 border border-border/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t('schedule.task_statistics.completion_rate')}
                    </span>
                    <TrendingUp className={cn(
                      "h-3.5 w-3.5",
                      stats.completionRate >= 70 ? "text-success" : 
                      stats.completionRate >= 40 ? "text-warning" : "text-muted-foreground"
                    )} />
                  </div>
                  <div className="h-2 bg-muted/50 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${stats.completionRate}%` }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                      className={cn(
                        "h-full rounded-full",
                        stats.completionRate >= 70 ? "bg-success" : 
                        stats.completionRate >= 40 ? "bg-warning" : "bg-muted-foreground"
                      )}
                    />
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-success/10 border border-success/20 p-2.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                      <span className="text-[10px] font-medium text-success uppercase">
                        {t('schedule.task_statistics.completed')}
                      </span>
                    </div>
                    <p className="text-xl font-bold text-foreground">{stats.totalCompleted}</p>
                  </div>

                  <div className={cn(
                    "rounded-lg p-2.5 border",
                    stats.currentStreak >= 3 
                      ? "bg-primary/10 border-primary/20" 
                      : "bg-muted/30 border-border/30"
                  )}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Flame className={cn(
                        "h-3.5 w-3.5",
                        stats.currentStreak >= 3 ? "text-primary" : "text-muted-foreground"
                      )} />
                      <span className={cn(
                        "text-[10px] font-medium uppercase",
                        stats.currentStreak >= 3 ? "text-primary" : "text-muted-foreground"
                      )}>
                        {t('schedule.task_statistics.streak')}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <p className="text-xl font-bold text-foreground">{stats.currentStreak}</p>
                      <span className="text-[10px] text-muted-foreground">{t('schedule.task_statistics.days')}</span>
                    </div>
                    {stats.longestStreak > stats.currentStreak && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {t('schedule.task_statistics.best_streak', { days: stats.longestStreak })}
                      </p>
                    )}
                  </div>
                </div>

                {/* Achievement Badges */}
                {(stats.completionRate === 100 || stats.currentStreak >= 7) && (
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {stats.completionRate === 100 && (
                      <Badge className="gap-1 bg-success/10 text-success border-success/20 px-2 py-1 text-xs">
                        <CheckCircle2 className="h-3 w-3" />
                        {t('schedule.task_statistics.perfect_score')}
                      </Badge>
                    )}
                    {stats.currentStreak >= 7 && (
                      <Badge className="gap-1 bg-primary/10 text-primary border-primary/20 px-2 py-1 text-xs">
                        <Flame className="h-3 w-3" />
                        {t('schedule.task_statistics.on_fire', { days: stats.currentStreak })}
                      </Badge>
                    )}
                  </div>
                )}
              </CardContent>
            </motion.div>
          </AnimatePresence>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
