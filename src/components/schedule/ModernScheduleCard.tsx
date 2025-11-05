import React from 'react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sparkles, Calendar, TrendingUp, Volume2, IndianRupee } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { useTranslation } from 'react-i18next';

interface ModernScheduleCardProps {
  schedule: {
    id: string;
    crop_name: string;
    crop_variety?: string;
    crop_season?: string;
    sowing_date: string;
    expected_harvest_date?: string;
    total_estimated_cost?: number;
    expected_yield?: string;
    generation_language?: string;
    country?: string;
  };
  totalTasks: number;
  completedTasks: number;
  onViewSchedule: () => void;
  onSpeak?: () => void;
}

const ModernScheduleCard: React.FC<ModernScheduleCardProps> = ({
  schedule,
  totalTasks,
  completedTasks,
  onViewSchedule,
  onSpeak,
}) => {
  const { t } = useTranslation();
  const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
  const daysToHarvest = schedule.expected_harvest_date 
    ? differenceInDays(new Date(schedule.expected_harvest_date), new Date())
    : null;
  const currency = schedule.country === 'India' ? '₹' : '$';

  const seasonColors: Record<string, string> = {
    'Kharif': 'from-green-500/20 to-emerald-500/20 border-green-500/30',
    'Rabi': 'from-amber-500/20 to-yellow-500/20 border-amber-500/30',
    'Zaid': 'from-orange-500/20 to-red-500/20 border-orange-500/30',
  };

  const seasonColor = schedule.crop_season 
    ? seasonColors[schedule.crop_season] || 'from-primary/20 to-accent/20 border-primary/30'
    : 'from-primary/20 to-accent/20 border-primary/30';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className={`relative overflow-hidden bg-gradient-to-br ${seasonColor} backdrop-blur-xl border-2 shadow-2xl`}>
        {/* Decorative Elements */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary/10 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-accent/10 to-transparent rounded-full blur-2xl" />
        
        <div className="relative p-4 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <div className="p-1.5 rounded-lg bg-primary/20 border border-primary/30">
                  <Sparkles className="h-4 w-4 text-primary animate-pulse" />
                </div>
                <h3 className="text-lg font-bold text-foreground capitalize">
                  {schedule.crop_name}
                </h3>
              </div>
              {schedule.crop_variety && (
                <p className="text-xs text-muted-foreground ml-8">
                  Variety: {schedule.crop_variety}
                </p>
              )}
            </div>
            {schedule.crop_season && (
              <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">
                {schedule.crop_season}
              </Badge>
            )}
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Sowing Date */}
            <div className="bg-background/60 backdrop-blur-sm rounded-lg p-3 border border-border/50">
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="h-3 w-3 text-green-600" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  {t('schedule.sowing')}
                </span>
              </div>
              <p className="text-sm font-bold text-foreground">
                {format(new Date(schedule.sowing_date), 'dd MMM yyyy')}
              </p>
            </div>

            {/* Harvest Date */}
            <div className="bg-background/60 backdrop-blur-sm rounded-lg p-3 border border-border/50">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-3 w-3 text-amber-600" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  {t('schedule.harvest')}
                </span>
              </div>
              <p className="text-sm font-bold text-foreground">
                {schedule.expected_harvest_date 
                  ? format(new Date(schedule.expected_harvest_date), 'dd MMM yyyy')
                  : 'TBD'}
              </p>
              {daysToHarvest !== null && daysToHarvest > 0 && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {daysToHarvest} {t('schedule.daysRemaining')}
                </p>
              )}
            </div>

            {/* Expected Yield */}
            {schedule.expected_yield && (
              <div className="bg-background/60 backdrop-blur-sm rounded-lg p-3 border border-border/50">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="h-3 w-3 text-green-600" />
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Yield
                  </span>
                </div>
                <p className="text-sm font-bold text-foreground">
                  {schedule.expected_yield}
                </p>
              </div>
            )}

            {/* Total Cost */}
            {schedule.total_estimated_cost && (
              <div className="bg-background/60 backdrop-blur-sm rounded-lg p-3 border border-border/50">
                <div className="flex items-center gap-2 mb-1">
                  <IndianRupee className="h-3 w-3 text-orange-600" />
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Cost
                  </span>
                </div>
                <p className="text-sm font-bold text-foreground">
                  {currency}{schedule.total_estimated_cost.toLocaleString()}
                </p>
              </div>
            )}
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground font-medium">
                Progress: {completedTasks}/{totalTasks} tasks
              </span>
              <span className="text-primary font-bold">{Math.round(progress)}%</span>
            </div>
            <div className="h-2 bg-background/60 rounded-full overflow-hidden border border-border/50">
              <motion.div
                className="h-full bg-gradient-to-r from-green-500 to-emerald-500 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <Button
              onClick={onViewSchedule}
              className="flex-1 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-white shadow-lg"
            >
              View Schedule
            </Button>
            {onSpeak && (
              <Button
                onClick={onSpeak}
                variant="outline"
                size="icon"
                className="bg-background/60 backdrop-blur-sm border-primary/20 hover:bg-primary/10"
              >
                <Volume2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  );
};

export default ModernScheduleCard;
