import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, TrendingUp, Flame, Target } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

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
  const [stats, setStats] = useState<TaskStats>({
    totalCompleted: 0,
    totalTasks: 0,
    completionRate: 0,
    currentStreak: 0,
    longestStreak: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTaskStatistics();
  }, [scheduleId]);

  const fetchTaskStatistics = async () => {
    try {
      setLoading(true);
      
      const { supabaseWithAuth } = await import('@/integrations/supabase/client');
      const client = supabaseWithAuth();

      // Fetch all tasks for this schedule
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

      // Calculate statistics
      const totalTasks = tasks.length;
      const completedTasks = tasks.filter(t => t.status === 'completed');
      const totalCompleted = completedTasks.length;
      const completionRate = totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0;

      // Calculate streaks (consecutive days with at least one completed task)
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
  };

  const calculateStreaks = (completedTasks: any[]) => {
    if (completedTasks.length === 0) {
      return { current: 0, longest: 0 };
    }

    // Group completed tasks by date
    const tasksByDate = new Map<string, number>();
    completedTasks.forEach(task => {
      if (task.completed_at) {
        const dateKey = new Date(task.completed_at).toISOString().split('T')[0];
        tasksByDate.set(dateKey, (tasksByDate.get(dateKey) || 0) + 1);
      }
    });

    // Sort dates
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
      
      // Check if streak is current (includes today or yesterday)
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
        <CardContent className="p-6">
          <div className="h-24 bg-muted/50 rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2 text-foreground">
          <Target className="h-4 w-4 text-primary" />
          Task Statistics
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Completion Rate - Hero Stat */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary/10 via-primary/5 to-accent/10 p-4 border border-primary/20"
        >
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Completion Rate
              </span>
              <TrendingUp className={cn(
                "h-4 w-4",
                stats.completionRate >= 70 ? "text-success" : 
                stats.completionRate >= 40 ? "text-warning" : "text-muted-foreground"
              )} />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-foreground">
                {stats.completionRate}%
              </span>
              <span className="text-sm text-muted-foreground font-medium">
                {stats.totalCompleted}/{stats.totalTasks} tasks
              </span>
            </div>
          </div>
          
          {/* Progress bar */}
          <div className="mt-3 h-2 bg-muted/50 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${stats.completionRate}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className={cn(
                "h-full rounded-full",
                stats.completionRate >= 70 ? "bg-success" : 
                stats.completionRate >= 40 ? "bg-warning" : "bg-muted-foreground"
              )}
            />
          </div>
        </motion.div>

        {/* Secondary Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Total Completed */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.3 }}
            className="rounded-lg bg-success/10 border border-success/20 p-3"
          >
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <span className="text-[10px] font-medium text-success uppercase tracking-wider">
                Completed
              </span>
            </div>
            <p className="text-2xl font-bold text-foreground">{stats.totalCompleted}</p>
            <p className="text-xs text-muted-foreground font-medium">tasks done</p>
          </motion.div>

          {/* Current Streak */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.3 }}
            className={cn(
              "rounded-lg p-3 border",
              stats.currentStreak >= 3 
                ? "bg-primary/10 border-primary/20" 
                : "bg-muted/50 border-border/50"
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              <Flame className={cn(
                "h-4 w-4",
                stats.currentStreak >= 3 ? "text-primary" : "text-muted-foreground"
              )} />
              <span className={cn(
                "text-[10px] font-medium uppercase tracking-wider",
                stats.currentStreak >= 3 ? "text-primary" : "text-muted-foreground"
              )}>
                Streak
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <p className="text-2xl font-bold text-foreground">{stats.currentStreak}</p>
              <span className="text-xs text-muted-foreground">days</span>
            </div>
            {stats.longestStreak > stats.currentStreak && (
              <p className="text-xs text-muted-foreground font-medium">
                Best: {stats.longestStreak} days
              </p>
            )}
          </motion.div>
        </div>

        {/* Achievement Badge */}
        {stats.completionRate === 100 && (
          <motion.div
            initial={{ scale: 0, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 300, delay: 0.3 }}
            className="flex items-center justify-center"
          >
            <Badge className="gap-1.5 bg-success/10 text-success border-success/20 px-3 py-1.5 font-semibold">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Perfect Score! 🎉
            </Badge>
          </motion.div>
        )}
        
        {stats.currentStreak >= 7 && (
          <motion.div
            initial={{ scale: 0, rotate: 10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 300, delay: 0.4 }}
            className="flex items-center justify-center"
          >
            <Badge className="gap-1.5 bg-primary/10 text-primary border-primary/20 px-3 py-1.5 font-semibold">
              <Flame className="h-3.5 w-3.5" />
              On Fire! {stats.currentStreak} Day Streak 🔥
            </Badge>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}
