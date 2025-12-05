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
  Shield,
  Video,
  IndianRupee,
  Sprout,
  Sun,
  Wind
} from 'lucide-react';
import { format, isToday, isTomorrow } from 'date-fns';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

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
    bg: 'from-blue-500/20 to-blue-500/5',
    borderColor: 'border-blue-500/30',
    emoji: '💧'
  },
  fertilizer: { 
    icon: Leaf, 
    color: 'text-green-500', 
    bg: 'from-green-500/20 to-green-500/5',
    borderColor: 'border-green-500/30',
    emoji: '🌿'
  },
  pesticide: { 
    icon: Bug, 
    color: 'text-orange-500', 
    bg: 'from-orange-500/20 to-orange-500/5',
    borderColor: 'border-orange-500/30',
    emoji: '🐛'
  },
  pest_control: { 
    icon: Bug, 
    color: 'text-orange-500', 
    bg: 'from-orange-500/20 to-orange-500/5',
    borderColor: 'border-orange-500/30',
    emoji: '🛡️'
  },
  weeding: { 
    icon: Scissors, 
    color: 'text-purple-500', 
    bg: 'from-purple-500/20 to-purple-500/5',
    borderColor: 'border-purple-500/30',
    emoji: '✂️'
  },
  weed_management: { 
    icon: Scissors, 
    color: 'text-purple-500', 
    bg: 'from-purple-500/20 to-purple-500/5',
    borderColor: 'border-purple-500/30',
    emoji: '🌾'
  },
  harvest: { 
    icon: Package, 
    color: 'text-amber-500', 
    bg: 'from-amber-500/20 to-amber-500/5',
    borderColor: 'border-amber-500/30',
    emoji: '🌾'
  },
  harvesting: { 
    icon: Package, 
    color: 'text-amber-500', 
    bg: 'from-amber-500/20 to-amber-500/5',
    borderColor: 'border-amber-500/30',
    emoji: '📦'
  },
  soil_preparation: { 
    icon: Sprout, 
    color: 'text-amber-700', 
    bg: 'from-amber-700/20 to-amber-700/5',
    borderColor: 'border-amber-700/30',
    emoji: '🚜'
  },
  sowing: { 
    icon: Sprout, 
    color: 'text-emerald-500', 
    bg: 'from-emerald-500/20 to-emerald-500/5',
    borderColor: 'border-emerald-500/30',
    emoji: '🌱'
  },
  other: { 
    icon: AlertCircle, 
    color: 'text-gray-500', 
    bg: 'from-gray-500/20 to-gray-500/5',
    borderColor: 'border-gray-500/30',
    emoji: '📋'
  }
};

// Format cost with "approximately" prefix - more natural display
const formatCost = (cost: number | null | undefined): string => {
  if (!cost || cost <= 0) return '';
  return `अंदाजे ₹${cost.toLocaleString('en-IN')}`;
};

// Check if a value is valid (not null, undefined, empty string, or "null" string)
const isValidValue = (value: any): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string' && (value.trim() === '' || value.toLowerCase() === 'null')) return false;
  if (Array.isArray(value) && value.length === 0) return false;
  if (typeof value === 'object' && Object.keys(value).length === 0) return false;
  return true;
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
  const resources = task.resources || {};
  const precautions = task.precautions || resources.precautions || [];
  const idealWeather = task.ideal_weather || resources.ideal_weather;
  const icarGuideline = task.icar_guideline || resources.icar_guideline;
  const climateRisk = task.climate_risk || resources.climate_risk;
  const quantity = task.quantity || resources.quantity;

  // Filter out internal fields from resources for display
  const displayResources = Object.entries(resources).filter(([key]) => 
    !['precautions', 'ideal_weather', 'icar_guideline', 'climate_risk'].includes(key)
  );

  const getDateLabel = () => {
    if (isToday(taskDate)) return { text: t('schedule.task_card.today'), color: 'text-primary', badge: 'bg-primary/10 border-primary/30' };
    if (isTomorrow(taskDate)) return { text: t('schedule.task_card.tomorrow'), color: 'text-info', badge: 'bg-info/10 border-info/30' };
    if (isOverdue) return { text: t('schedule.task_card.overdue'), color: 'text-destructive', badge: 'bg-destructive/10 border-destructive/30' };
    if (daysUntil <= 7) return { text: t('schedule.task_card.days_until', { days: daysUntil }), color: 'text-warning', badge: 'bg-warning/10 border-warning/30' };
    return { text: format(taskDate, 'dd MMM'), color: 'text-muted-foreground', badge: 'bg-muted/50' };
  };

  const dateLabel = getDateLabel();

  return (
    <>
      <motion.div
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        transition={{ type: "spring", stiffness: 400, damping: 20 }}
      >
        <Card 
          className={cn(
            "relative overflow-hidden cursor-pointer",
            "bg-card/80 backdrop-blur-xl",
            "border-2 transition-all duration-300",
            config.borderColor,
            "hover:shadow-xl hover:shadow-primary/5",
            isCompleted && "opacity-60"
          )}
          onClick={() => setShowDetails(true)}
        >
          {/* Gradient Background */}
          <div className={cn(
            "absolute inset-0 bg-gradient-to-br opacity-40",
            config.bg
          )} />
          
          {/* Status Indicator Line */}
          <div className={cn(
            "absolute left-0 top-0 bottom-0 w-1.5 rounded-l",
            isOverdue && isPending && "bg-destructive",
            isToday(taskDate) && isPending && "bg-primary animate-pulse",
            isCompleted && "bg-success"
          )} />

          <div className="relative p-4 space-y-3">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className={cn(
                  "p-2.5 rounded-xl bg-gradient-to-br shrink-0",
                  config.bg,
                  "border",
                  config.borderColor
                )}>
                  <TaskIcon className={cn("h-5 w-5", config.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm text-foreground leading-tight">
                    {task.task_name}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <Badge variant="outline" className={cn("text-[10px] px-2 py-0.5 font-medium", dateLabel.badge)}>
                      {dateLabel.text}
                    </Badge>
                    {task.priority === 'high' && (
                      <Badge variant="destructive" className="text-[10px] px-2 py-0.5">
                        🔥 {t('schedule.task_card.high_priority')}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Action Buttons */}
              <div className="flex items-center gap-1 shrink-0">
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
                    <VolumeX className="h-4 w-4 text-primary" />
                  ) : (
                    <Volume2 className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>

            {/* Description */}
            {task.task_description && (
              <p className="text-sm text-muted-foreground leading-relaxed">
                {task.task_description}
              </p>
            )}

            {/* Quick Info Pills */}
            <div className="flex flex-wrap gap-2">
              {task.estimated_cost > 0 && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/5 border border-primary/20">
                  <IndianRupee className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-medium text-primary">
                    {formatCost(task.estimated_cost)}
                  </span>
                </div>
              )}
              {task.duration_hours && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted/50 border border-border/50">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{task.duration_hours} घंटे</span>
                </div>
              )}
              {task.weather_dependent && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <CloudRain className="h-3.5 w-3.5 text-blue-500" />
                  <span className="text-xs text-blue-600 dark:text-blue-400">हवामान</span>
                </div>
              )}
              {isValidValue(climateRisk) && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20">
                  <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />
                  <span className="text-xs text-orange-600 dark:text-orange-400">⚠️ जोखीम</span>
                </div>
              )}
            </div>

            {/* Precautions Preview */}
            {isValidValue(precautions) && precautions.length > 0 && (
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-warning/5 border border-warning/20">
                <Shield className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                <span className="text-xs text-warning leading-relaxed">{precautions[0]}</span>
              </div>
            )}

            {/* Completed Status */}
            {isCompleted && (
              <div className="flex items-center gap-2 pt-1">
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

      {/* Task Details Dialog - Modern Design */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-hidden flex flex-col p-0">
          {/* Header with gradient */}
          <div className={cn(
            "p-4 bg-gradient-to-br",
            config.bg,
            "border-b"
          )}>
            <DialogHeader className="space-y-2">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "p-3 rounded-xl bg-background/80 backdrop-blur",
                  "border shadow-sm"
                )}>
                  <TaskIcon className={cn("h-6 w-6", config.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <DialogTitle className="text-lg leading-tight">{task.task_name}</DialogTitle>
                  <DialogDescription className="text-sm mt-1">
                    📅 {format(taskDate, 'EEEE, dd MMMM yyyy')}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Cost Display - Prominent */}
            {task.estimated_cost > 0 && (
              <div className="p-4 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <IndianRupee className="h-5 w-5 text-primary" />
                    <span className="text-sm text-muted-foreground">अंदाजे खर्च</span>
                  </div>
                  <span className="text-xl font-bold text-primary">
                    ₹{task.estimated_cost.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            )}

            {/* Description */}
            {task.task_description && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  📝 वर्णन
                </h4>
                <p className="text-sm text-muted-foreground leading-relaxed bg-muted/30 p-3 rounded-lg">
                  {task.task_description}
                </p>
              </div>
            )}

            {/* Quantity Info */}
            {isValidValue(quantity) && (
              <div className="p-3 rounded-lg bg-muted/30 border">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">मात्रा:</span>
                  <span className="text-sm text-muted-foreground">{quantity}</span>
                </div>
              </div>
            )}

            {/* ICAR Guideline Reference */}
            {isValidValue(icarGuideline) && (
              <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20">
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2 text-blue-600 dark:text-blue-400">
                  <BookOpen className="h-4 w-4" />
                  📚 ICAR शिफारस
                </h4>
                <p className="text-sm text-muted-foreground leading-relaxed">{icarGuideline}</p>
              </div>
            )}

            {/* Climate Risk Alert */}
            {isValidValue(climateRisk) && (
              <div className="p-4 rounded-xl bg-orange-500/5 border border-orange-500/20">
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2 text-orange-600 dark:text-orange-400">
                  <AlertTriangle className="h-4 w-4" />
                  ⚠️ हवामान जोखीम
                </h4>
                <p className="text-sm text-muted-foreground leading-relaxed">{climateRisk}</p>
              </div>
            )}

            {/* Instructions */}
            {isValidValue(task.instructions) && task.instructions.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  📋 सूचना
                </h4>
                <ul className="space-y-2">
                  {task.instructions.map((instruction: string, index: number) => (
                    <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/30 p-2.5 rounded-lg">
                      <span className="text-primary font-bold shrink-0">{index + 1}.</span>
                      <span className="leading-relaxed">{instruction}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Precautions */}
            {isValidValue(precautions) && precautions.length > 0 && (
              <div className="p-4 rounded-xl bg-warning/5 border border-warning/20">
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2 text-warning">
                  <Shield className="h-4 w-4" />
                  🛡️ सावधानी
                </h4>
                <ul className="space-y-2">
                  {precautions.map((precaution: string, index: number) => (
                    <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="text-warning shrink-0">•</span>
                      <span className="leading-relaxed">{precaution}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Ideal Weather */}
            {isValidValue(idealWeather) && (
              <div className="p-4 rounded-xl bg-sky-500/5 border border-sky-500/20">
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2 text-sky-600 dark:text-sky-400">
                  <Sun className="h-4 w-4" />
                  ☀️ योग्य हवामान
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  {isValidValue(idealWeather.temperature) && (
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-background/50">
                      <Thermometer className="h-4 w-4 text-red-500" />
                      <div>
                        <div className="text-[10px] text-muted-foreground">तापमान</div>
                        <div className="text-sm font-medium">{idealWeather.temperature}°C</div>
                      </div>
                    </div>
                  )}
                  {isValidValue(idealWeather.humidity) && (
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-background/50">
                      <Droplets className="h-4 w-4 text-blue-500" />
                      <div>
                        <div className="text-[10px] text-muted-foreground">आर्द्रता</div>
                        <div className="text-sm font-medium">{idealWeather.humidity}%</div>
                      </div>
                    </div>
                  )}
                  {isValidValue(idealWeather.conditions) && (
                    <div className="col-span-2 flex items-center gap-2 p-2 rounded-lg bg-background/50">
                      <Wind className="h-4 w-4 text-gray-500" />
                      <div>
                        <div className="text-[10px] text-muted-foreground">परिस्थिती</div>
                        <div className="text-sm font-medium">{idealWeather.conditions}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          {!readOnly && (
            <div className="p-4 border-t bg-muted/30">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    onSpeak();
                  }}
                  className="flex-1"
                >
                  <Volume2 className="h-4 w-4 mr-2" />
                  सुनाओ
                </Button>
                <Button
                  variant="default"
                  onClick={() => setShowDetails(false)}
                  className="flex-1"
                >
                  <Check className="h-4 w-4 mr-2" />
                  ठीक है
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
