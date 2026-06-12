import React from 'react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sparkles, Calendar, TrendingUp, Volume2, IndianRupee, Droplets } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { useLandRefLabels } from '@/hooks/useLandRefLabels';
import { useOwnershipLabel, ownershipChipClasses } from '@/lib/ownershipLabel';

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
  land?: {
    soil_type?: string;
    water_source?: string;
    irrigation_type?: string;
    ownership_type?: string;
  };
}

const ModernScheduleCard: React.FC<ModernScheduleCardProps> = ({
  schedule,
  totalTasks,
  completedTasks,
  onViewSchedule,
  onSpeak,
  land,
}) => {
  const { t } = useTranslation();
  const refLabels = useLandRefLabels();
  const ownershipLabel = useOwnershipLabel();
  const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
  const daysToHarvest = schedule.expected_harvest_date 
    ? differenceInDays(new Date(schedule.expected_harvest_date), new Date())
    : null;
  const currency = schedule.country === 'India' ? '₹' : '$';

  const seasonColors: Record<string, string> = {
    'Kharif': 'from-success/15 to-success/5 border-success/40',
    'Rabi': 'from-warning/15 to-warning/5 border-warning/40',
    'Zaid': 'from-destructive/15 to-destructive/5 border-destructive/40',
  };

  const seasonColor = schedule.crop_season 
    ? seasonColors[schedule.crop_season] || 'from-primary/15 to-accent/10 border-primary/40'
    : 'from-primary/15 to-accent/10 border-primary/40';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <Card className={`relative overflow-hidden bg-gradient-to-br ${seasonColor} backdrop-blur-2xl border-2 shadow-xl rounded-3xl`}>
        {/* Decorative Elements */}
        <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-primary/8 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-accent/8 to-transparent rounded-full blur-2xl pointer-events-none" />
        
        <div className="relative p-5 space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1.5">
                <div className="p-2 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/10 border border-primary/30 shadow-sm">
                  <Sparkles className="h-5 w-5 text-primary animate-pulse" />
                </div>
                <h3 className="text-xl font-bold text-foreground capitalize tracking-tight">
                  {schedule.crop_name}
                </h3>
              </div>
              {schedule.crop_variety && (
                <p className="text-sm text-muted-foreground ml-12 font-medium">
                  {t('schedule.schedule_card.variety_label')} {schedule.crop_variety}
                </p>
              )}
            </div>
            {schedule.crop_season && (
              <Badge className="bg-primary/15 text-primary border-primary/30 text-xs font-semibold rounded-xl px-3 py-1">
                {schedule.crop_season}
              </Badge>
            )}
          </div>

          {/* Localized land-attribute chips */}
          {land && (land.soil_type || land.water_source || land.irrigation_type || land.ownership_type) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {land.soil_type && (() => {
                const d = refLabels.display(land.soil_type, 'soil');
                return (
                  <Badge variant="outline" className={`text-[10px] px-2 py-0.5 bg-card/60 ${d.isFallback ? 'italic opacity-70' : ''}`}>
                    {d.text}
                  </Badge>
                );
              })()}
              {land.water_source && (() => {
                const d = refLabels.display(land.water_source, 'water');
                return (
                  <Badge variant="outline" className={`text-[10px] px-2 py-0.5 bg-info/10 border-info/30 ${d.isFallback ? 'italic opacity-70' : ''}`}>
                    <Droplets className="h-2.5 w-2.5 mr-1" />
                    {d.text}
                  </Badge>
                );
              })()}
              {land.irrigation_type && (() => {
                const d = refLabels.display(land.irrigation_type, 'irrigation');
                return (
                  <Badge variant="outline" className={`text-[10px] px-2 py-0.5 bg-accent/10 border-accent/30 ${d.isFallback ? 'italic opacity-70' : ''}`}>
                    {d.text}
                  </Badge>
                );
              })()}
              {land.ownership_type && (
                <Badge variant="outline" className={`text-[10px] px-2 py-0.5 font-semibold ${ownershipChipClasses(land.ownership_type)}`}>
                  {ownershipLabel(land.ownership_type)}
                </Badge>
              )}
            </div>
          )}



          {/* Stats Grid - 2030 Ready */}
          <div className="grid grid-cols-2 gap-3">
            {/* Sowing Date */}
            <div className="bg-card/70 backdrop-blur-md rounded-2xl p-4 border border-border/60 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 rounded-xl bg-success/15">
                  <Calendar className="h-3.5 w-3.5 text-success" />
                </div>
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {t('schedule.sowing')}
                </span>
              </div>
              <p className="text-base font-bold text-foreground">
                {format(new Date(schedule.sowing_date), 'dd MMM yyyy')}
              </p>
            </div>

            {/* Harvest Date */}
            <div className="bg-card/70 backdrop-blur-md rounded-2xl p-4 border border-border/60 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 rounded-xl bg-warning/15">
                  <TrendingUp className="h-3.5 w-3.5 text-warning" />
                </div>
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {t('schedule.harvest')}
                </span>
              </div>
              <p className="text-base font-bold text-foreground">
                {schedule.expected_harvest_date 
                  ? format(new Date(schedule.expected_harvest_date), 'dd MMM yyyy')
                  : t('schedule.schedule_card.tbd')}
              </p>
              {daysToHarvest !== null && daysToHarvest > 0 && (
                <p className="text-[11px] text-success font-medium mt-1">
                  {daysToHarvest} {t('schedule.days_remaining')}
                </p>
              )}
            </div>

            {/* Expected Yield */}
            {schedule.expected_yield && (
              <div className="bg-card/70 backdrop-blur-md rounded-2xl p-4 border border-border/60 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-xl bg-success/15">
                    <TrendingUp className="h-3.5 w-3.5 text-success" />
                  </div>
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {t('schedule.schedule_card.yield')}
                  </span>
                </div>
                <p className="text-base font-bold text-foreground">
                  {schedule.expected_yield}
                </p>
              </div>
            )}

            {/* Total Cost */}
            {schedule.total_estimated_cost && (
              <div className="bg-card/70 backdrop-blur-md rounded-2xl p-4 border border-border/60 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-xl bg-warning/15">
                    <IndianRupee className="h-3.5 w-3.5 text-warning" />
                  </div>
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {t('schedule.schedule_card.cost')}
                  </span>
                </div>
                <p className="text-base font-bold text-foreground">
                  {currency}{schedule.total_estimated_cost.toLocaleString()}
                </p>
              </div>
            )}
          </div>

          {/* Progress Bar - Modern 2030 */}
          <div className="space-y-3 bg-card/50 rounded-2xl p-4 border border-border/40">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground font-medium">
                {t('schedule.schedule_card.progress', { completed: completedTasks, total: totalTasks })}
              </span>
              <span className="text-lg font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                {Math.round(progress)}%
              </span>
            </div>
            <div className="h-3 bg-muted/50 rounded-full overflow-hidden border border-border/30">
              <motion.div
                className="h-full bg-gradient-to-r from-success via-success/80 to-accent rounded-full shadow-sm"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 1, ease: 'easeOut' }}
              />
            </div>
          </div>

          {/* Action Buttons - 2030 UI */}
          <div className="flex gap-3 pt-1">
            <Button
              onClick={onViewSchedule}
              className="flex-1 h-12 bg-gradient-to-r from-primary to-primary/85 hover:from-primary/95 hover:to-primary/75 text-primary-foreground shadow-lg rounded-2xl font-semibold text-base transition-all hover:shadow-xl hover:scale-[1.02]"
            >
              {t('schedule.schedule_card.view_schedule')}
            </Button>
            {onSpeak && (
              <Button
                onClick={onSpeak}
                variant="outline"
                size="icon"
                className="h-12 w-12 bg-card/70 backdrop-blur-sm border-border/60 hover:bg-primary/10 hover:border-primary/40 rounded-2xl transition-all"
              >
                <Volume2 className="h-5 w-5" />
              </Button>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  );
};

export default ModernScheduleCard;
