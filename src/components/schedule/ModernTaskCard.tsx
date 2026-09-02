import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from 'react-i18next';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Calendar,
  Check, 
  Volume2,
  VolumeX,
  AlertCircle,
  Droplets,
  Leaf,
  Bug,
  Scissors,
  Package,
  CloudRain,
  Thermometer,
  BookOpen,
  AlertTriangle,
  Shield,
  IndianRupee,
  Sprout,
  Sun,
  Droplet,
  Sparkles,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Camera
} from 'lucide-react';
import { format, isToday, isTomorrow } from 'date-fns';
import { cn } from '@/lib/utils';
import { formatQuantity } from '@/lib/scheduleFormat';
import { motion, AnimatePresence } from 'framer-motion';
import ProductRecommendationCard from './ProductRecommendationCard';
import StagePhaseBadge from './StagePhaseBadge';
import RescheduledNotice from './RescheduledNotice';
import type { StagePhase } from '@/hooks/useLandStage';
import { resolveTaskTypeConfig } from '@/lib/taskTypeIcons';
import { buildScheduleTaskPresentation } from '@/lib/scheduleTaskPresentation';

interface TaskCardProps {
  task: any;
  isOverdue: boolean;
  daysUntil: number;
  onSpeak: () => void;
  isSpeaking?: boolean;
  readOnly?: boolean;
  onTakePhoto?: () => void;
  /** Phase of this task relative to the land stage SSOT. */
  stagePhase?: StagePhase;
}

const taskTypeConfig = {
  irrigation: { icon: Droplets, color: 'text-info', bg: 'from-info/20 to-info/5', borderColor: 'border-info/30', gradient: 'from-info to-info', emoji: '💧' },
  fertilizer: { icon: Leaf, color: 'text-success', bg: 'from-success/20 to-success/5', borderColor: 'border-success/30', gradient: 'from-success to-success', emoji: '🌿' },
  pesticide: { icon: Bug, color: 'text-warning', bg: 'from-warning/20 to-warning/5', borderColor: 'border-warning/30', gradient: 'from-warning to-warning', emoji: '🐛' },
  pest_control: { icon: Bug, color: 'text-warning', bg: 'from-warning/20 to-warning/5', borderColor: 'border-warning/30', gradient: 'from-warning to-destructive', emoji: '🛡️' },
  weeding: { icon: Scissors, color: 'text-primary', bg: 'from-primary/20 to-primary/5', borderColor: 'border-primary/30', gradient: 'from-primary to-primary', emoji: '✂️' },
  weed_management: { icon: Scissors, color: 'text-primary', bg: 'from-primary/20 to-primary/5', borderColor: 'border-primary/30', gradient: 'from-primary to-primary', emoji: '🌾' },
  harvest: { icon: Package, color: 'text-warning', bg: 'from-warning/20 to-warning/5', borderColor: 'border-warning/30', gradient: 'from-warning to-warning', emoji: '📦' },
  harvesting: { icon: Package, color: 'text-warning', bg: 'from-warning/20 to-warning/5', borderColor: 'border-warning/30', gradient: 'from-warning to-warning', emoji: '🌾' },
  soil_preparation: { icon: Sprout, color: 'text-warning', bg: 'from-warning/20 to-warning/5', borderColor: 'border-warning/30', gradient: 'from-warning to-warning', emoji: '🚜' },
  sowing: { icon: Sprout, color: 'text-success', bg: 'from-success/20 to-success/5', borderColor: 'border-success/30', gradient: 'from-success to-success', emoji: '🌱' },
  other: { icon: AlertCircle, color: 'text-foreground/80', bg: 'from-muted to-muted/20', borderColor: 'border-border/30', gradient: 'from-muted-foreground to-muted-foreground/60', emoji: '📋' }
};

// Check if a value is valid (safe to render / show a block for)
const isValidValue = (value: any): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string' && (value.trim() === '' || value.toLowerCase() === 'null' || value === 'undefined')) return false;
  if (Array.isArray(value) && value.length === 0) return false;
  // Structured quantity object { value, unit }: only valid when value is present.
  // Any other plain object is not safely renderable as a React child — treat as invalid.
  if (typeof value === 'object' && !Array.isArray(value)) {
    if ('value' in value) return value.value !== null && value.value !== undefined;
    return false;
  }
  return true;
};

export default function ModernTaskCard({ 
  task, 
  isOverdue, 
  daysUntil, 
  onSpeak,
  isSpeaking = false,
  readOnly = false,
  onTakePhoto,
  stagePhase

}: TaskCardProps) {
  const { t } = useTranslation();
  const [showDetails, setShowDetails] = useState(false);

  const config = resolveTaskTypeConfig(taskTypeConfig, task.task_type);
  const TaskIcon = config.icon;
  
  const isCompleted = task.status === 'completed';
  const isPending = task.status === 'pending';
  const taskDate = new Date(task.task_date);
  
  // Extract data from resources JSON
  const resources = task.resources || {};
  const precautions = Array.isArray(task.precautions) && task.precautions.length > 0 
    ? task.precautions.filter((p: string) => p && p.length > 3)
    : Array.isArray(resources.precautions) && resources.precautions.length > 0 
    ? resources.precautions.filter((p: string) => p && p.length > 3)
    : [];
  const idealWeather = task.ideal_weather || resources.ideal_weather;
  const icarGuideline = task.icar_guideline || resources.icar_guideline;
  const climateRisk = task.climate_risk || resources.climate_risk;
  const quantity = task.quantity || resources.quantity;
  const productDetails = task.product_details || resources.product_details;
  const farmerTask = buildScheduleTaskPresentation(task, t);
  // A recurring task (irrigation window / weekly scouting) is stored ONCE with its
  // cadence — the calendar is never cloned per occurrence.
  const recurrence = resources.recurrence && Number(resources.recurrence.interval_days) > 0
    ? resources.recurrence
    : null;


  const getDateLabel = () => {
    if (isToday(taskDate)) return { text: t('schedule.task_card.today'), color: 'text-primary', badge: 'bg-primary/10 border-primary/30 text-primary' };
    if (isTomorrow(taskDate)) return { text: t('schedule.task_card.tomorrow'), color: 'text-info', badge: 'bg-info/10 border-info/30 text-info' };
    if (isOverdue) return { text: t('schedule.task_card.overdue'), color: 'text-destructive', badge: 'bg-destructive/10 border-destructive/30 text-destructive' };
    if (daysUntil <= 7) return { text: t('schedule.task_card.days_until', { days: daysUntil }), color: 'text-warning', badge: 'bg-warning/10 border-warning/30 text-warning' };
    return { text: format(taskDate, 'dd MMM'), color: 'text-muted-foreground', badge: 'bg-muted/50 border-border' };
  };

  const dateLabel = getDateLabel();

  return (
    <>
      <motion.div 
        whileHover={{ scale: 1.02, y: -2 }} 
        whileTap={{ scale: 0.98 }} 
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
      >
        <Card 
          className={cn(
            "relative overflow-hidden cursor-pointer border-2 transition-all duration-300",
            "bg-gradient-to-br from-card via-card to-muted/20 backdrop-blur-xl",
            config.borderColor, 
            "hover:shadow-2xl hover:shadow-primary/10",
            isCompleted && "opacity-60 grayscale-[30%]"
          )}
          onClick={() => setShowDetails(true)}
        >
          {/* Glass overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
          
          {/* Animated gradient border indicator */}
          <div className={cn(
            "absolute left-0 top-0 bottom-0 w-1.5",
            isOverdue && isPending && "bg-gradient-to-b from-destructive to-destructive/50",
            isToday(taskDate) && isPending && "bg-gradient-to-b from-primary via-accent to-primary animate-pulse",
            isCompleted && "bg-gradient-to-b from-success to-success"
          )} />

          <div className="relative p-4 space-y-3">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                {/* Icon with gradient background */}
                <div className={cn(
                  "relative p-3 rounded-2xl shrink-0 shadow-lg",
                  `bg-gradient-to-br ${config.gradient}`
                )}>
                  <TaskIcon className="h-5 w-5 text-white" />
                  <div className="absolute -top-1 -right-1 text-sm">{config.emoji}</div>
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <h3 className="font-bold text-sm text-foreground leading-tight line-clamp-2">{farmerTask.what}</h3>
                    <StagePhaseBadge phase={stagePhase} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <Badge variant="outline" className={cn("text-[10px] px-2 py-0.5 font-semibold", dateLabel.badge)}>
                      <Calendar className="h-3 w-3 mr-1" />
                      {dateLabel.text}
                    </Badge>
                    {task.priority === 'high' && (
                      <Badge className="bg-gradient-to-r from-destructive to-warning text-white text-[10px] px-2 py-0.5 border-0">
                        🔥 {t('schedule.task_card.high_priority')}
                      </Badge>
                    )}
                    {recurrence && (
                      <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-semibold border-primary/30 text-primary bg-primary/5">
                        🔁 {t('schedule.task_card.repeats', { days: recurrence.interval_days })}
                      </Badge>
                    )}
                  </div>
                  {recurrence && (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {t('schedule.task_card.repeats_window', {
                        start: recurrence.window_start,
                        end: recurrence.window_end,
                      })}
                    </p>
                  )}
                  <RescheduledNotice
                    variant="full"
                    className="mt-2"
                    autoRescheduled={task.auto_rescheduled}
                    originalDate={task.original_date}

                    taskDate={task.task_date}
                    adjustmentReason={task.adjustment_reason ?? task.reschedule_reason}
                  />
                </div>
              </div>
              
              {/* Action buttons */}
              <div className="flex items-center gap-1">
                {/* Camera button for task photo */}
                {onTakePhoto && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-9 w-9 rounded-full shrink-0 hover:bg-primary/10 text-primary"
                    onClick={(e) => { e.stopPropagation(); onTakePhoto(); }}
                  >
                    <Camera className="h-4 w-4" />
                  </Button>
                )}
                
                {/* Speaker button */}
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={cn(
                    "h-9 w-9 rounded-full shrink-0 transition-all",
                    isSpeaking ? "bg-primary/20 text-primary" : "hover:bg-primary/10"
                  )}
                  onClick={(e) => { e.stopPropagation(); onSpeak(); }}
                >
                  {isSpeaking ? <VolumeX className="h-4 w-4 animate-pulse" /> : <Volume2 className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* Farmer-first preview: What / How / How much. Values come only from task data. */}
            <div className="space-y-2 rounded-xl bg-primary/5 border border-primary/15 p-3">
              <div>
                <p className="text-[10px] font-semibold text-primary uppercase tracking-wide">{t('schedule.farmer_task.what')}</p>
                <p className="text-sm font-semibold text-foreground mt-0.5">{farmerTask.what}</p>
              </div>
              {farmerTask.how[0] && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{t('schedule.farmer_task.how')}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-0.5 line-clamp-2">{farmerTask.how[0]}</p>
                </div>
              )}
              {farmerTask.howMuch[0] && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{t('schedule.farmer_task.how_much')}</p>
                  <p className="text-xs font-medium text-foreground mt-0.5">{farmerTask.howMuch[0]}</p>
                </div>
              )}
            </div>

            {/* Scientific Confidence Badge */}
            {task.confidence_score != null && (
              <div className="flex items-center gap-2">
                <div className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold",
                  Math.round(task.confidence_score * 100) >= 80 ? "bg-success/10 border border-success/30 text-success dark:text-success" :
                  Math.round(task.confidence_score * 100) >= 60 ? "bg-warning/10 border border-warning/30 text-warning dark:text-warning" :
                  "bg-destructive/10 border border-destructive/30 text-destructive dark:text-destructive"
                )}>
                  <Sparkles className="h-3 w-3" />
                  {Math.round(task.confidence_score * 100)}% {t('schedule.task_card.confidence', 'confident')}
                </div>
              </div>
            )}

            {/* Quick Info Pills */}
            <div className="flex flex-wrap gap-2">
              {task.weather_dependent && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-info/10 border border-info/20">
                  <CloudRain className="h-3.5 w-3.5 text-info" />
                  <span className="text-xs font-medium text-info dark:text-info">{t('schedule.task_card.weather_dependent')}</span>
                </div>
              )}
            </div>

            {/* First Precaution Preview */}
            {precautions.length > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-gradient-to-r from-warning/5 to-warning/5 border border-warning/20">
                <Shield className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                <span className="text-xs text-warning dark:text-warning leading-relaxed line-clamp-2">{precautions[0]}</span>
              </div>
            )}

            {/* Completed badge */}
            {isCompleted && (
              <div className="flex items-center gap-2">
                <Badge className="bg-gradient-to-r from-success to-success text-white border-0">
                  <Check className="h-3 w-3 mr-1" />{t('schedule.task_card.completed')}
                </Badge>
              </div>
            )}

            {/* View details hint */}
            <div className="flex items-center justify-end text-xs text-muted-foreground">
              <span className="flex items-center gap-1 opacity-60">
                {t('schedule.land_selector.click_to_view')} <ChevronRight className="h-3 w-3" />
              </span>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Modern Task Details Dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0 rounded-3xl">
          {/* Header with gradient */}
          <div className={cn("relative p-5 bg-gradient-to-br", config.bg)}>
            <div className="absolute inset-0 bg-gradient-to-br from-black/5 to-transparent" />
            <DialogHeader className="relative space-y-3">
              <div className="flex items-center gap-4">
                <div className={cn(
                  "p-4 rounded-2xl shadow-xl",
                  `bg-gradient-to-br ${config.gradient}`
                )}>
                  <TaskIcon className="h-7 w-7 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <DialogTitle className="text-lg font-bold leading-tight">{farmerTask.what}</DialogTitle>
                  <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    {format(taskDate, 'EEEE, dd MMMM yyyy')}
                  </p>
                </div>
              </div>
            </DialogHeader>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">

            {/* Scientific Metadata Section */}
            {(task.confidence_score || task.based_on || task.scientific_reason) && (
              <div className="space-y-3 p-4 rounded-xl bg-gradient-to-r from-primary/5 to-accent/5 border border-primary/20">
                {/* Confidence Score */}
                {task.confidence_score != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">{t('schedule.task_card.confidence_level', 'Confidence Level')}</span>
                    <Badge className={cn(
                      "text-xs",
                      Math.round(task.confidence_score * 100) >= 80 ? "bg-success/20 text-success dark:text-success border-success/30" :
                      Math.round(task.confidence_score * 100) >= 60 ? "bg-warning/20 text-warning dark:text-warning border-warning/30" :
                      "bg-destructive/20 text-destructive dark:text-destructive border-destructive/30"
                    )}>
                      {Math.round(task.confidence_score * 100)}%
                    </Badge>
                  </div>
                )}

                {/* Based On */}
                {task.based_on && Array.isArray(task.based_on) && task.based_on.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">{t('schedule.task_card.based_on', 'Based on')}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {task.based_on.map((factor: string, idx: number) => (
                        <Badge key={idx} variant="outline" className="text-[10px] px-2 py-0.5 bg-background/50">
                          {factor}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Scientific Reason */}
                {task.scientific_reason && (
                  <div className="space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">{t('schedule.task_card.scientific_reason', 'Scientific Reason')}</span>
                    <p className="text-xs text-foreground/80 leading-relaxed">{task.scientific_reason}</p>
                  </div>
                )}

                {/* Risk if Ignored */}
                {task.risk_if_ignored && (
                  <div className="mt-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                      <div>
                        <span className="text-[10px] font-semibold text-destructive">{t('schedule.task_card.risk_if_ignored', 'Risk if ignored')}</span>
                        <p className="text-xs text-destructive/80">{task.risk_if_ignored}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Farmer-first action contract. Never fabricates missing agronomy. */}
            <div className="space-y-3 p-4 rounded-2xl bg-primary/5 border border-primary/20">
              <div className="space-y-1">
                <h4 className="text-sm font-bold flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  {t('schedule.farmer_task.what')}
                </h4>
                <p className="text-sm text-foreground leading-relaxed">{farmerTask.what}</p>
              </div>
              <div className="space-y-2">
                <h4 className="text-sm font-bold flex items-center gap-2">
                  📋 {t('schedule.farmer_task.how')}
                </h4>
                {farmerTask.how.length ? farmerTask.how.map((step: string, index: number) => (
                  <div key={index} className="flex items-start gap-3 text-sm p-3 rounded-xl bg-background/70">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary font-bold text-xs shrink-0">{index + 1}</span>
                    <span className="text-foreground leading-relaxed">{step}</span>
                  </div>
                )) : (
                  <p className="text-sm text-muted-foreground">{t('schedule.farmer_task.how_not_available')}</p>
                )}
              </div>
              <div className="space-y-2">
                <h4 className="text-sm font-bold flex items-center gap-2">
                  <Package className="h-4 w-4 text-info" />
                  {t('schedule.farmer_task.how_much')}
                </h4>
                {farmerTask.howMuch.length ? (
                  <div className="space-y-2">
                    {farmerTask.howMuch.map((amount: string, index: number) => (
                      <p key={index} className="text-sm font-medium text-foreground p-3 rounded-xl bg-info/5 border border-info/20">{amount}</p>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t('schedule.farmer_task.amount_not_available')}</p>
                )}
              </div>
            </div>

            {/* Product Details */}
            {formatQuantity(productDetails) && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Leaf className="h-4 w-4 text-success" />
                  {t('schedule.task_card.product_details')}
                </h4>
                <div className="p-3 rounded-xl bg-success/5 border border-success/20">
                  <p className="text-sm text-muted-foreground leading-relaxed">{formatQuantity(productDetails)}</p>
                </div>
              </div>
            )}

            {/* ICAR Guideline */}
            {isValidValue(icarGuideline) && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2 text-info dark:text-info">
                  <BookOpen className="h-4 w-4" />
                  {t('schedule.task_card.icar_guideline')}
                </h4>
                <div className="p-3 rounded-xl bg-info/5 border border-info/20">
                  <p className="text-sm text-muted-foreground leading-relaxed">{icarGuideline}</p>
                </div>
              </div>
            )}

            {/* Climate Risk */}
            {isValidValue(climateRisk) && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2 text-warning dark:text-warning">
                  <AlertTriangle className="h-4 w-4" />
                  {t('schedule.task_card.climate_risk')}
                </h4>
                <div className="p-3 rounded-xl bg-gradient-to-r from-warning/10 to-destructive/5 border border-warning/20">
                  <p className="text-sm text-warning dark:text-warning leading-relaxed">{climateRisk}</p>
                </div>
              </div>
            )}

            {/* Precautions */}
            {precautions.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2 text-warning dark:text-warning">
                  <Shield className="h-4 w-4" />
                  {t('schedule.task_card.precautions')}
                </h4>
                <div className="space-y-2">
                  {precautions.map((precaution: string, index: number) => (
                    <motion.div 
                      key={index}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="flex items-start gap-3 text-sm p-3 rounded-xl bg-gradient-to-r from-warning/5 to-warning/5 border border-warning/20"
                    >
                      <span className="text-warning shrink-0 text-base">⚠️</span>
                      <span className="text-warning dark:text-warning leading-relaxed">{precaution}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* Yield Impact */}
            {isValidValue(task.yield_impact) && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2 text-success dark:text-success">
                  <TrendingUp className="h-4 w-4" />
                  {t('schedule.task_card.yield_impact') || 'Yield Impact'}
                </h4>
                <div className="p-3 rounded-xl bg-gradient-to-r from-success/10 to-success/5 border border-success/20">
                  <p className="text-sm text-success dark:text-success leading-relaxed">{task.yield_impact}</p>
                </div>
              </div>
            )}

            {/* Skip Penalty */}
            {isValidValue(task.skip_penalty) && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2 text-destructive dark:text-destructive">
                  <TrendingDown className="h-4 w-4" />
                  {t('schedule.task_card.skip_penalty') || 'If Skipped'}
                </h4>
                <div className="p-3 rounded-xl bg-gradient-to-r from-destructive/10 to-warning/5 border border-destructive/20">
                  <p className="text-sm text-destructive dark:text-destructive leading-relaxed">{task.skip_penalty}</p>
                </div>
              </div>
            )}

            {/* Product Recommendations with FULL labor breakdown */}
            {(Array.isArray(task.product_recommendations) && task.product_recommendations.length > 0) || 
             (resources?.labor_cost > 0) || (task.labor_cost > 0) ? (
              <ProductRecommendationCard 
                products={task.product_recommendations || []} 
                landAreaAcres={1}
                laborCost={resources?.labor_cost || task.labor_cost || 0}
                laborDays={resources?.labor_days || task.labor_total_days || 0}
                laborWorkers={resources?.labor_workers || task.labor_workers || 0}
                laborDaysPerAcre={resources?.labor_days_per_acre || task.labor_days_per_acre || 0}
                laborDailyWage={resources?.labor_daily_wage || task.labor_daily_wage || 350}
                laborDescription={resources?.labor_description || task.labor_description || ''}
              />
            ) : null}

            {/* Ideal Weather */}
            {idealWeather && typeof idealWeather === 'object' && (isValidValue(idealWeather.temperature) || isValidValue(idealWeather.humidity) || isValidValue(idealWeather.conditions)) && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2 text-info dark:text-info">
                  <Sun className="h-4 w-4" />
                  {t('schedule.task_card.ideal_weather')}
                </h4>
                <div className="grid gap-2">
                  {isValidValue(idealWeather.temperature) && (
                    <div className="flex items-center gap-3 text-sm p-3 rounded-xl bg-info/5 border border-info/20">
                      <Thermometer className="h-4 w-4 text-info shrink-0" />
                      <span className="text-muted-foreground">{t('schedule.task_card.temperature')}:</span>
                      <span className="font-semibold ml-auto">{idealWeather.temperature}°C</span>
                    </div>
                  )}
                  {isValidValue(idealWeather.humidity) && (
                    <div className="flex items-center gap-3 text-sm p-3 rounded-xl bg-info/5 border border-info/20">
                      <Droplet className="h-4 w-4 text-info shrink-0" />
                      <span className="text-muted-foreground">{t('schedule.task_card.humidity')}:</span>
                      <span className="font-semibold ml-auto">{idealWeather.humidity}%</span>
                    </div>
                  )}
                  {isValidValue(idealWeather.conditions) && (
                    <div className="flex items-center gap-3 text-sm p-3 rounded-xl bg-info/5 border border-info/20">
                      <CloudRain className="h-4 w-4 text-info shrink-0" />
                      <span className="text-muted-foreground">{t('schedule.task_card.conditions')}:</span>
                      <span className="font-semibold ml-auto">{idealWeather.conditions}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t bg-muted/20">
            <Button onClick={() => setShowDetails(false)} className="w-full rounded-xl h-11 font-semibold">
              {t('schedule.close')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}