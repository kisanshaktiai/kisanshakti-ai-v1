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
import { motion, AnimatePresence } from 'framer-motion';
import ProductRecommendationCard from './ProductRecommendationCard';

interface TaskCardProps {
  task: any;
  isOverdue: boolean;
  daysUntil: number;
  onSpeak: () => void;
  isSpeaking?: boolean;
  readOnly?: boolean;
  onTakePhoto?: () => void;
}

const taskTypeConfig = {
  irrigation: { icon: Droplets, color: 'text-blue-500', bg: 'from-blue-500/20 to-blue-600/5', borderColor: 'border-blue-500/30', gradient: 'from-blue-500 to-cyan-500', emoji: '💧' },
  fertilizer: { icon: Leaf, color: 'text-emerald-500', bg: 'from-emerald-500/20 to-green-600/5', borderColor: 'border-emerald-500/30', gradient: 'from-emerald-500 to-green-500', emoji: '🌿' },
  pesticide: { icon: Bug, color: 'text-orange-500', bg: 'from-orange-500/20 to-amber-600/5', borderColor: 'border-orange-500/30', gradient: 'from-orange-500 to-amber-500', emoji: '🐛' },
  pest_control: { icon: Bug, color: 'text-orange-500', bg: 'from-orange-500/20 to-amber-600/5', borderColor: 'border-orange-500/30', gradient: 'from-orange-500 to-red-500', emoji: '🛡️' },
  weeding: { icon: Scissors, color: 'text-purple-500', bg: 'from-purple-500/20 to-pink-600/5', borderColor: 'border-purple-500/30', gradient: 'from-purple-500 to-pink-500', emoji: '✂️' },
  weed_management: { icon: Scissors, color: 'text-purple-500', bg: 'from-purple-500/20 to-pink-600/5', borderColor: 'border-purple-500/30', gradient: 'from-purple-500 to-fuchsia-500', emoji: '🌾' },
  harvest: { icon: Package, color: 'text-amber-500', bg: 'from-amber-500/20 to-yellow-600/5', borderColor: 'border-amber-500/30', gradient: 'from-amber-500 to-yellow-500', emoji: '📦' },
  harvesting: { icon: Package, color: 'text-amber-500', bg: 'from-amber-500/20 to-yellow-600/5', borderColor: 'border-amber-500/30', gradient: 'from-amber-500 to-orange-500', emoji: '🌾' },
  soil_preparation: { icon: Sprout, color: 'text-amber-700', bg: 'from-amber-700/20 to-orange-600/5', borderColor: 'border-amber-700/30', gradient: 'from-amber-700 to-orange-600', emoji: '🚜' },
  sowing: { icon: Sprout, color: 'text-green-500', bg: 'from-green-500/20 to-emerald-600/5', borderColor: 'border-green-500/30', gradient: 'from-green-500 to-emerald-500', emoji: '🌱' },
  other: { icon: AlertCircle, color: 'text-slate-500', bg: 'from-slate-500/20 to-gray-600/5', borderColor: 'border-slate-500/30', gradient: 'from-slate-500 to-gray-500', emoji: '📋' }
};

// Check if a value is valid
const isValidValue = (value: any): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string' && (value.trim() === '' || value.toLowerCase() === 'null' || value === 'undefined')) return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
};

export default function ModernTaskCard({ 
  task, 
  isOverdue, 
  daysUntil, 
  onSpeak,
  isSpeaking = false,
  readOnly = false,
  onTakePhoto
}: TaskCardProps) {
  const { t } = useTranslation();
  const [showDetails, setShowDetails] = useState(false);

  const config = taskTypeConfig[task.task_type as keyof typeof taskTypeConfig] || taskTypeConfig.other;
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

  const getDateLabel = () => {
    if (isToday(taskDate)) return { text: t('schedule.task_card.today'), color: 'text-primary', badge: 'bg-primary/10 border-primary/30 text-primary' };
    if (isTomorrow(taskDate)) return { text: t('schedule.task_card.tomorrow'), color: 'text-blue-500', badge: 'bg-blue-500/10 border-blue-500/30 text-blue-500' };
    if (isOverdue) return { text: t('schedule.task_card.overdue'), color: 'text-destructive', badge: 'bg-destructive/10 border-destructive/30 text-destructive' };
    if (daysUntil <= 7) return { text: t('schedule.task_card.days_until', { days: daysUntil }), color: 'text-amber-500', badge: 'bg-amber-500/10 border-amber-500/30 text-amber-500' };
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
            isCompleted && "bg-gradient-to-b from-emerald-500 to-green-500"
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
                  <h3 className="font-bold text-sm text-foreground leading-tight line-clamp-2">{task.task_name}</h3>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <Badge variant="outline" className={cn("text-[10px] px-2 py-0.5 font-semibold", dateLabel.badge)}>
                      <Calendar className="h-3 w-3 mr-1" />
                      {dateLabel.text}
                    </Badge>
                    {task.priority === 'high' && (
                      <Badge className="bg-gradient-to-r from-red-500 to-orange-500 text-white text-[10px] px-2 py-0.5 border-0">
                        🔥 {t('schedule.task_card.high_priority')}
                      </Badge>
                    )}
                  </div>
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

            {/* Description preview */}
            {task.task_description && (
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 pl-1">{task.task_description}</p>
            )}

            {/* Scientific Confidence Badge */}
            {task.confidence_score != null && (
              <div className="flex items-center gap-2">
                <div className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold",
                  Math.round(task.confidence_score * 100) >= 80 ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400" :
                  Math.round(task.confidence_score * 100) >= 60 ? "bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400" :
                  "bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400"
                )}>
                  <Sparkles className="h-3 w-3" />
                  {Math.round(task.confidence_score * 100)}% {t('schedule.task_card.confidence', 'confident')}
                </div>
              </div>
            )}

            {/* Quick Info Pills */}
            <div className="flex flex-wrap gap-2">
              {task.weather_dependent && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-sky-500/10 border border-sky-500/20">
                  <CloudRain className="h-3.5 w-3.5 text-sky-500" />
                  <span className="text-xs font-medium text-sky-600 dark:text-sky-400">{t('schedule.task_card.weather_dependent')}</span>
                </div>
              )}
            </div>

            {/* First Precaution Preview */}
            {precautions.length > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-gradient-to-r from-amber-500/5 to-orange-500/5 border border-amber-500/20">
                <Shield className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <span className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed line-clamp-2">{precautions[0]}</span>
              </div>
            )}

            {/* Completed badge */}
            {isCompleted && (
              <div className="flex items-center gap-2">
                <Badge className="bg-gradient-to-r from-emerald-500 to-green-500 text-white border-0">
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
                  <DialogTitle className="text-lg font-bold leading-tight">{task.task_name}</DialogTitle>
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
                      Math.round(task.confidence_score * 100) >= 80 ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" :
                      Math.round(task.confidence_score * 100) >= 60 ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30" :
                      "bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30"
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

            {/* Description */}
            {task.task_description && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  {t('schedule.task_card.description')}
                </h4>
                <p className="text-sm text-muted-foreground leading-relaxed p-3 rounded-xl bg-muted/30">{task.task_description}</p>
              </div>
            )}

            {/* Quantity */}
            {isValidValue(quantity) && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Package className="h-4 w-4 text-blue-500" />
                  {t('schedule.task_card.quantity')}
                </h4>
                <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/20">
                  <p className="text-sm font-medium text-foreground">{quantity}</p>
                </div>
              </div>
            )}

            {/* Product Details */}
            {isValidValue(productDetails) && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Leaf className="h-4 w-4 text-emerald-500" />
                  {t('schedule.task_card.product_details')}
                </h4>
                <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                  <p className="text-sm text-muted-foreground leading-relaxed">{productDetails}</p>
                </div>
              </div>
            )}

            {/* ICAR Guideline */}
            {isValidValue(icarGuideline) && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2 text-blue-600 dark:text-blue-400">
                  <BookOpen className="h-4 w-4" />
                  {t('schedule.task_card.icar_guideline')}
                </h4>
                <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/20">
                  <p className="text-sm text-muted-foreground leading-relaxed">{icarGuideline}</p>
                </div>
              </div>
            )}

            {/* Climate Risk */}
            {isValidValue(climateRisk) && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2 text-orange-600 dark:text-orange-400">
                  <AlertTriangle className="h-4 w-4" />
                  {t('schedule.task_card.climate_risk')}
                </h4>
                <div className="p-3 rounded-xl bg-gradient-to-r from-orange-500/10 to-red-500/5 border border-orange-500/20">
                  <p className="text-sm text-orange-700 dark:text-orange-300 leading-relaxed">{climateRisk}</p>
                </div>
              </div>
            )}

            {/* Instructions */}
            {Array.isArray(task.instructions) && task.instructions.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  📋 {t('schedule.task_card.instructions')}
                </h4>
                <div className="space-y-2">
                  {task.instructions.map((instruction: string, index: number) => (
                    <motion.div 
                      key={index} 
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="flex items-start gap-3 text-sm p-3 rounded-xl bg-muted/30"
                    >
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary font-bold text-xs shrink-0">
                        {index + 1}
                      </span>
                      <span className="text-muted-foreground leading-relaxed">{instruction}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* Precautions */}
            {precautions.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2 text-amber-600 dark:text-amber-400">
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
                      className="flex items-start gap-3 text-sm p-3 rounded-xl bg-gradient-to-r from-amber-500/5 to-orange-500/5 border border-amber-500/20"
                    >
                      <span className="text-amber-500 shrink-0 text-base">⚠️</span>
                      <span className="text-amber-700 dark:text-amber-300 leading-relaxed">{precaution}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* Yield Impact */}
            {isValidValue(task.yield_impact) && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2 text-green-600 dark:text-green-400">
                  <TrendingUp className="h-4 w-4" />
                  {t('schedule.task_card.yield_impact') || 'Yield Impact'}
                </h4>
                <div className="p-3 rounded-xl bg-gradient-to-r from-green-500/10 to-emerald-500/5 border border-green-500/20">
                  <p className="text-sm text-green-700 dark:text-green-300 leading-relaxed">{task.yield_impact}</p>
                </div>
              </div>
            )}

            {/* Skip Penalty */}
            {isValidValue(task.skip_penalty) && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2 text-red-600 dark:text-red-400">
                  <TrendingDown className="h-4 w-4" />
                  {t('schedule.task_card.skip_penalty') || 'If Skipped'}
                </h4>
                <div className="p-3 rounded-xl bg-gradient-to-r from-red-500/10 to-orange-500/5 border border-red-500/20">
                  <p className="text-sm text-red-700 dark:text-red-300 leading-relaxed">{task.skip_penalty}</p>
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
            {isValidValue(idealWeather) && typeof idealWeather === 'object' && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2 text-sky-600 dark:text-sky-400">
                  <Sun className="h-4 w-4" />
                  {t('schedule.task_card.ideal_weather')}
                </h4>
                <div className="grid gap-2">
                  {isValidValue(idealWeather.temperature) && (
                    <div className="flex items-center gap-3 text-sm p-3 rounded-xl bg-sky-500/5 border border-sky-500/20">
                      <Thermometer className="h-4 w-4 text-sky-500 shrink-0" />
                      <span className="text-muted-foreground">{t('schedule.task_card.temperature')}:</span>
                      <span className="font-semibold ml-auto">{idealWeather.temperature}°C</span>
                    </div>
                  )}
                  {isValidValue(idealWeather.humidity) && (
                    <div className="flex items-center gap-3 text-sm p-3 rounded-xl bg-sky-500/5 border border-sky-500/20">
                      <Droplet className="h-4 w-4 text-sky-500 shrink-0" />
                      <span className="text-muted-foreground">{t('schedule.task_card.humidity')}:</span>
                      <span className="font-semibold ml-auto">{idealWeather.humidity}%</span>
                    </div>
                  )}
                  {isValidValue(idealWeather.conditions) && (
                    <div className="flex items-center gap-3 text-sm p-3 rounded-xl bg-sky-500/5 border border-sky-500/20">
                      <CloudRain className="h-4 w-4 text-sky-500 shrink-0" />
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
