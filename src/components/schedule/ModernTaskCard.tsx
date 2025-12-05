import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from 'react-i18next';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter 
} from '@/components/ui/dialog';
import { 
  Calendar,
  Clock, 
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
  Shield
} from 'lucide-react';
import { format, isToday, isTomorrow } from 'date-fns';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface TaskCardProps {
  task: any;
  isOverdue: boolean;
  daysUntil: number;
  onSpeak: () => void;
  isSpeaking?: boolean;
  readOnly?: boolean;
}

const taskTypeConfig = {
  irrigation: { 
    icon: Droplets, 
    color: 'text-blue-500', 
    bg: 'from-blue-500/20 to-blue-500/10',
    borderColor: 'border-blue-500/30'
  },
  fertilizer: { 
    icon: Leaf, 
    color: 'text-green-500', 
    bg: 'from-green-500/20 to-green-500/10',
    borderColor: 'border-green-500/30'
  },
  pesticide: { 
    icon: Bug, 
    color: 'text-orange-500', 
    bg: 'from-orange-500/20 to-orange-500/10',
    borderColor: 'border-orange-500/30'
  },
  pest_control: { 
    icon: Bug, 
    color: 'text-orange-500', 
    bg: 'from-orange-500/20 to-orange-500/10',
    borderColor: 'border-orange-500/30'
  },
  weeding: { 
    icon: Scissors, 
    color: 'text-purple-500', 
    bg: 'from-purple-500/20 to-purple-500/10',
    borderColor: 'border-purple-500/30'
  },
  weed_management: { 
    icon: Scissors, 
    color: 'text-purple-500', 
    bg: 'from-purple-500/20 to-purple-500/10',
    borderColor: 'border-purple-500/30'
  },
  harvest: { 
    icon: Package, 
    color: 'text-amber-500', 
    bg: 'from-amber-500/20 to-amber-500/10',
    borderColor: 'border-amber-500/30'
  },
  harvesting: { 
    icon: Package, 
    color: 'text-amber-500', 
    bg: 'from-amber-500/20 to-amber-500/10',
    borderColor: 'border-amber-500/30'
  },
  soil_preparation: { 
    icon: Leaf, 
    color: 'text-brown-500', 
    bg: 'from-amber-700/20 to-amber-700/10',
    borderColor: 'border-amber-700/30'
  },
  sowing: { 
    icon: Leaf, 
    color: 'text-emerald-500', 
    bg: 'from-emerald-500/20 to-emerald-500/10',
    borderColor: 'border-emerald-500/30'
  },
  other: { 
    icon: AlertCircle, 
    color: 'text-gray-500', 
    bg: 'from-gray-500/20 to-gray-500/10',
    borderColor: 'border-gray-500/30'
  }
};

// Format cost with "approximately" prefix
const formatCost = (cost: number | null | undefined, currency?: string): string => {
  if (!cost) return '';
  // Always show "अंदाजे" (approximately) prefix and use ₹
  return `अंदाजे ₹${cost.toLocaleString('en-IN')}`;
};

export default function ModernTaskCard({ 
  task, 
  isOverdue, 
  daysUntil, 
  onSpeak,
  isSpeaking = false,
  readOnly = false
}: TaskCardProps) {
  const { t } = useTranslation();
  const [showDetails, setShowDetails] = useState(false);

  const config = taskTypeConfig[task.task_type as keyof typeof taskTypeConfig] || taskTypeConfig.other;
  const TaskIcon = config.icon;
  
  const isCompleted = task.status === 'completed';
  const isPending = task.status === 'pending';
  const taskDate = new Date(task.task_date);
  
  // Extract data from resources JSON if available
  const precautions = task.precautions || task.resources?.precautions || [];
  const idealWeather = task.ideal_weather || task.resources?.ideal_weather;
  const icarGuideline = task.icar_guideline || task.resources?.icar_guideline;
  const climateRisk = task.climate_risk || task.resources?.climate_risk;

  const getDateLabel = () => {
    if (isToday(taskDate)) return { text: t('schedule.task_card.today'), color: 'text-primary' };
    if (isTomorrow(taskDate)) return { text: t('schedule.task_card.tomorrow'), color: 'text-info' };
    if (isOverdue) return { text: t('schedule.task_card.overdue'), color: 'text-destructive' };
    if (daysUntil <= 7) return { text: t('schedule.task_card.days_until', { days: daysUntil }), color: 'text-warning' };
    return { text: format(taskDate, 'dd MMM'), color: 'text-muted-foreground' };
  };

  const dateLabel = getDateLabel();

  return (
    <>
      <motion.div
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        transition={{ type: "spring", stiffness: 400, damping: 17 }}
      >
        <Card 
          className={cn(
            "relative overflow-hidden cursor-pointer group",
            "bg-background/60 backdrop-blur-xl",
            "border transition-all duration-300",
            config.borderColor,
            "hover:shadow-lg hover:shadow-primary/10",
            isCompleted && "opacity-70"
          )}
          onClick={() => setShowDetails(true)}
        >
          {/* Gradient Background */}
          <div className={cn(
            "absolute inset-0 bg-gradient-to-br opacity-50",
            config.bg
          )} />
          
          {/* Status Indicator Line */}
          <div className={cn(
            "absolute left-0 top-0 bottom-0 w-1",
            isOverdue && isPending && "bg-destructive",
            isToday(taskDate) && isPending && "bg-primary animate-pulse",
            isCompleted && "bg-success"
          )} />

          <div className="relative p-4 space-y-3">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className={cn(
                  "p-2 rounded-xl bg-gradient-to-br",
                  config.bg,
                  "border",
                  config.borderColor
                )}>
                  <TaskIcon className={cn("h-4 w-4", config.color)} />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-sm text-foreground line-clamp-2">
                    {task.task_name}
                  </h3>
                  <div className="flex items-center gap-3 mt-1">
                    <span className={cn("text-xs font-medium", dateLabel.color)}>
                      {dateLabel.text}
                    </span>
                    {task.priority === 'high' && (
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                        {t('schedule.task_card.high_priority')}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Voice Button */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full hover:bg-primary/10"
                onClick={(e) => {
                  e.stopPropagation();
                  onSpeak();
                }}
              >
                {isSpeaking ? (
                  <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </Button>
            </div>

            {/* Description */}
            {task.task_description && (
              <p className="text-xs text-muted-foreground line-clamp-2">
                {task.task_description}
              </p>
            )}

            {/* Quick Info Pills */}
            <div className="flex flex-wrap gap-2">
              {task.duration_hours && (
                <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-background/80 border border-border/50">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">{task.duration_hours}h</span>
                </div>
              )}
              {task.estimated_cost && (
                <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-background/80 border border-border/50">
                  <span className="text-[10px] text-muted-foreground">
                    {formatCost(task.estimated_cost, task.currency)}
                  </span>
                </div>
              )}
              {task.weather_dependent && (
                <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-500/10 border border-blue-500/20">
                  <CloudRain className="h-3 w-3 text-blue-500" />
                  <span className="text-[10px] text-blue-600 dark:text-blue-400">{t('schedule.task_card.weather')}</span>
                </div>
              )}
              {climateRisk && (
                <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-orange-500/10 border border-orange-500/20">
                  <AlertTriangle className="h-3 w-3 text-orange-500" />
                  <span className="text-[10px] text-orange-600 dark:text-orange-400">⚠️</span>
                </div>
              )}
            </div>

            {/* Precautions Preview (if available) */}
            {precautions && precautions.length > 0 && (
              <div className="flex items-center gap-1 text-xs text-warning">
                <Shield className="h-3 w-3" />
                <span className="line-clamp-1">{precautions[0]}</span>
              </div>
            )}

            {/* Completed Status */}
            {isCompleted && (
              <div className="flex items-center gap-2 pt-2">
                <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                  <Check className="h-3 w-3 mr-1" />
                  {t('schedule.task_card.completed')}
                </Badge>
                {task.completed_at && (
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(task.completed_at), 'dd MMM, h:mm a')}
                  </span>
                )}
              </div>
            )}
          </div>
        </Card>
      </motion.div>

      {/* Task Details Dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className={cn(
                "p-2 rounded-xl bg-gradient-to-br",
                config.bg,
                "border",
                config.borderColor
              )}>
                <TaskIcon className={cn("h-5 w-5", config.color)} />
              </div>
              <div>
                <DialogTitle>{task.task_name}</DialogTitle>
                <DialogDescription>
                  {format(taskDate, 'EEEE, dd MMMM yyyy')}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Cost Display */}
            {task.estimated_cost && (
              <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">अंदाजे खर्च:</span>
                  <span className="text-lg font-semibold text-primary">
                    {formatCost(task.estimated_cost, task.currency)}
                  </span>
                </div>
              </div>
            )}

            {task.task_description && (
              <div>
                <h4 className="text-sm font-medium mb-2">{t('schedule.task_card.description')}</h4>
                <p className="text-sm text-muted-foreground">{task.task_description}</p>
              </div>
            )}

            {/* ICAR Guideline Reference */}
            {icarGuideline && (
              <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2 text-blue-600 dark:text-blue-400">
                  <BookOpen className="h-4 w-4" />
                  ICAR शिफारस
                </h4>
                <p className="text-sm text-muted-foreground">{icarGuideline}</p>
              </div>
            )}

            {/* Climate Risk Alert */}
            {climateRisk && (
              <div className="p-3 rounded-lg bg-orange-500/5 border border-orange-500/20">
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2 text-orange-600 dark:text-orange-400">
                  <AlertTriangle className="h-4 w-4" />
                  हवामान जोखीम
                </h4>
                <p className="text-sm text-muted-foreground">{climateRisk}</p>
              </div>
            )}

            {task.instructions && task.instructions.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">{t('schedule.task_card.instructions')}</h4>
                <ul className="list-disc list-inside space-y-1">
                  {task.instructions.map((instruction: string, index: number) => (
                    <li key={index} className="text-sm text-muted-foreground">{instruction}</li>
                  ))}
                </ul>
              </div>
            )}

            {precautions && precautions.length > 0 && (
              <div className="p-3 rounded-lg bg-warning/5 border border-warning/20">
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2 text-warning">
                  <Shield className="h-4 w-4" />
                  {t('schedule.task_card.precautions')}
                </h4>
                <ul className="list-disc list-inside space-y-1">
                  {precautions.map((precaution: string, index: number) => (
                    <li key={index} className="text-sm text-muted-foreground">{precaution}</li>
                  ))}
                </ul>
              </div>
            )}

            {task.resources && Object.keys(task.resources).length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">{t('schedule.task_card.required_resources')}</h4>
                <div className="space-y-1">
                  {Object.entries(task.resources).map(([key, value]) => (
                    <div key={key} className="flex justify-between text-sm">
                      <span className="text-muted-foreground capitalize">{key.replace('_', ' ')}:</span>
                      <span className="font-medium">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {idealWeather && (
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Thermometer className="h-4 w-4 text-info" />
                  {t('schedule.task_card.ideal_weather')}
                </h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {idealWeather.temperature && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('schedule.task_card.temperature')}:</span>
                      <span>{idealWeather.temperature}°C</span>
                    </div>
                  )}
                  {idealWeather.humidity && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('schedule.task_card.humidity')}:</span>
                      <span>{idealWeather.humidity}%</span>
                    </div>
                  )}
                  {idealWeather.conditions && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">{t('schedule.task_card.conditions')}:</span> {idealWeather.conditions}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {!readOnly && (
            <DialogFooter>
              <Button
                variant="default"
                onClick={() => {
                  onSpeak();
                  setShowDetails(false);
                }}
                className="w-full"
              >
                <Volume2 className="h-4 w-4 mr-2" />
                {t('schedule.task_card.read_aloud')}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

    </>
  );
}
