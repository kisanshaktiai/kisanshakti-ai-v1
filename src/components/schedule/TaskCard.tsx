import React, { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Droplets, Leaf, Bug, Scissors, Package, AlertCircle, Check, X, Clock, Volume2, Calendar, DollarSign, Users } from 'lucide-react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { resolveTaskTypeConfig } from '@/lib/taskTypeIcons';

interface TaskCardProps {
  task: any;
  isOverdue: boolean;
  daysUntil: number;
  onAction: (taskId: string, action: 'completed' | 'skipped' | 'rescheduled', notes?: string) => void;
  onSpeak: () => void;
  isSpeaking: boolean;
}

const TaskCard: React.FC<TaskCardProps> = ({ 
  task, 
  isOverdue, 
  daysUntil, 
  onAction, 
  onSpeak,
  isSpeaking 
}) => {
  const { t } = useTranslation();
  const [showDetails, setShowDetails] = useState(false);
  const [showActionDialog, setShowActionDialog] = useState(false);
  const [selectedAction, setSelectedAction] = useState<'completed' | 'skipped' | 'rescheduled' | null>(null);
  const [actionNotes, setActionNotes] = useState('');

  const taskTypeConfig = {
    irrigation: { icon: Droplets, color: 'text-info', bg: 'bg-info/10', border: 'border-info/30' },
    fertilizer: { icon: Leaf, color: 'text-success', bg: 'bg-success/10', border: 'border-success/30' },
    pesticide: { icon: Bug, color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/30' },
    weeding: { icon: Scissors, color: 'text-secondary', bg: 'bg-secondary/10', border: 'border-secondary/30' },
    harvest: { icon: Package, color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/30' },
    other: { icon: AlertCircle, color: 'text-muted-foreground', bg: 'bg-muted/50', border: 'border-border' }
  };

  const config = resolveTaskTypeConfig(taskTypeConfig, task.task_type);
  const TaskIcon = config.icon;

  const handleAction = (action: 'completed' | 'skipped' | 'rescheduled') => {
    setSelectedAction(action);
    setShowActionDialog(true);
  };

  const confirmAction = () => {
    if (selectedAction) {
      onAction(task.id, selectedAction, actionNotes);
      setShowActionDialog(false);
      setActionNotes('');
      setSelectedAction(null);
    }
  };

  return (
    <>
      <Card 
        className={cn(
          "relative overflow-hidden transition-all duration-300 cursor-pointer rounded-3xl border-2",
          "hover:shadow-xl hover:scale-[1.01]",
          task.status === 'completed' 
            ? 'opacity-70 bg-success/5 border-success/20' 
            : isOverdue 
              ? 'border-destructive/40 bg-destructive/5' 
              : `${config.bg} ${config.border}`
        )}
        onClick={() => setShowDetails(true)}
      >
        {/* Status indicator bar */}
        <div className={cn(
          "absolute top-0 left-0 right-0 h-1.5 rounded-t-3xl",
          task.status === 'completed' 
            ? 'bg-gradient-to-r from-success to-success/70' 
            : isOverdue 
              ? 'bg-gradient-to-r from-destructive to-destructive/70'
              : daysUntil === 0 
                ? 'bg-gradient-to-r from-warning to-warning/70'
                : 'bg-gradient-to-r from-primary to-accent'
        )} />

        <CardHeader className="pb-3 pt-5">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className={cn(
                "p-3 rounded-2xl shadow-sm",
                config.bg, config.color
              )}>
                <TaskIcon className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className={cn(
                  "font-bold text-base text-foreground",
                  task.status === 'completed' && "line-through text-muted-foreground"
                )}>
                  {task.task_name}
                </h3>
                <p className="text-sm text-muted-foreground mt-1.5 flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {format(new Date(task.task_date), 'dd MMM yyyy')}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                onSpeak();
              }}
              className="p-2 rounded-xl hover:bg-primary/10"
            >
              <Volume2 className={cn("h-5 w-5", isSpeaking ? 'text-primary' : 'text-muted-foreground')} />
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-4">
            <Badge 
              variant={task.priority === 'high' ? 'destructive' : task.priority === 'medium' ? 'default' : 'secondary'}
              className="rounded-xl font-medium"
            >
              {t(`schedule.task.${task.priority}`)} {t('schedule.task.priority')}
            </Badge>
            {task.weather_dependent && (
              <Badge variant="outline" className="rounded-xl">{t('schedule.task_card.weather_dependent')}</Badge>
            )}
            {isOverdue && (
              <Badge variant="destructive" className="rounded-xl">{t('schedule.task_card.overdue')}</Badge>
            )}
            {daysUntil === 0 && !isOverdue && (
              <Badge className="bg-warning/15 text-warning border-warning/30 rounded-xl">{t('schedule.task_card.today')}</Badge>
            )}
            {daysUntil === 1 && (
              <Badge className="bg-info/15 text-info border-info/30 rounded-xl">{t('schedule.task_card.tomorrow')}</Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="pt-0 pb-5">
          {task.task_description && (
            <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
              {task.task_description}
            </p>
          )}

          {/* Quick info */}
          <div className="grid grid-cols-2 gap-2.5 text-xs">
            {task.duration_hours && (
              <div className="flex items-center gap-2 p-2 rounded-xl bg-muted/30">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-foreground font-medium">{task.duration_hours} {t('schedule.dialog.hours') || 'hours'}</span>
              </div>
            )}
            {task.estimated_cost && (
              <div className="flex items-center gap-2 p-2 rounded-xl bg-muted/30">
                <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-foreground font-medium">₹{task.estimated_cost}</span>
              </div>
            )}
            {task.resources?.labor_persons && (
              <div className="flex items-center gap-2 p-2 rounded-xl bg-muted/30">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-foreground font-medium">{task.resources.labor_persons} {t('schedule.dialog.persons') || 'persons'}</span>
              </div>
            )}
          </div>

          {/* Action buttons */}
          {task.status === 'pending' && (
            <div className="flex gap-2.5 mt-5">
              <Button
                size="sm"
                className="flex-1 h-11 rounded-2xl bg-gradient-to-r from-success to-success/80 hover:from-success/90 hover:to-success/70 text-success-foreground font-semibold"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAction('completed');
                }}
              >
                <Check className="h-4 w-4 mr-2" />
                {t('schedule.done')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-11 w-11 rounded-2xl border-2"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAction('skipped');
                }}
              >
                <X className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-11 w-11 rounded-2xl border-2"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAction('rescheduled');
                }}
              >
                <Clock className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Details Dialog - Modern 2030 UI */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className={cn("p-2.5 rounded-2xl", config.bg)}>
                <TaskIcon className={cn("h-5 w-5", config.color)} />
              </div>
              {task.task_name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div className="bg-muted/30 rounded-2xl p-4">
              <p className="text-sm font-semibold text-muted-foreground mb-2">{t('schedule.task_card.description')}</p>
              <p className="text-foreground">{task.task_description || t('schedule.empty.no_tasks_period')}</p>
            </div>

            {task.instructions && task.instructions.length > 0 && (
              <div className="bg-success/5 rounded-2xl p-4 border border-success/20">
                <p className="text-sm font-semibold text-success mb-3">{t('schedule.task_card.instructions')}</p>
                <ol className="list-decimal list-inside space-y-2">
                  {task.instructions.map((instruction: string, index: number) => (
                    <li key={index} className="text-foreground text-sm">{instruction}</li>
                  ))}
                </ol>
              </div>
            )}

            {task.precautions && task.precautions.length > 0 && (
              <div className="bg-warning/5 rounded-2xl p-4 border border-warning/20">
                <p className="text-sm font-semibold text-warning mb-3">{t('schedule.task_card.precautions')}</p>
                <ul className="space-y-2">
                  {task.precautions.map((precaution: string, index: number) => (
                    <li key={index} className="text-foreground text-sm bg-warning/10 p-2.5 rounded-xl">
                      ⚠️ {precaution}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {task.resources && Object.keys(task.resources).length > 0 && (
              <div>
                <p className="text-sm font-semibold text-muted-foreground mb-3">{t('schedule.task_card.required_resources')}</p>
                <div className="grid grid-cols-2 gap-3">
                  {task.resources.water_liters && (
                    <div className="flex items-center gap-3 p-3 bg-info/10 rounded-2xl border border-info/20">
                      <Droplets className="h-5 w-5 text-info" />
                      <span className="text-sm font-medium">{task.resources.water_liters} L {t('schedule.crop_input.water')}</span>
                    </div>
                  )}
                  {task.resources.fertilizer_kg && (
                    <div className="flex items-center gap-3 p-3 bg-success/10 rounded-2xl border border-success/20">
                      <Leaf className="h-5 w-5 text-success" />
                      <span className="text-sm font-medium">{task.resources.fertilizer_kg} kg {t('schedule.stages.fertilizer')}</span>
                    </div>
                  )}
                  {task.resources.pesticide_ml && (
                    <div className="flex items-center gap-3 p-3 bg-warning/10 rounded-2xl border border-warning/20">
                      <Bug className="h-5 w-5 text-warning" />
                      <span className="text-sm font-medium">{task.resources.pesticide_ml} ml {t('schedule.stages.pest_control')}</span>
                    </div>
                  )}
                  {task.resources.labor_persons && (
                    <div className="flex items-center gap-3 p-3 bg-secondary/10 rounded-2xl border border-secondary/20">
                      <Users className="h-5 w-5 text-secondary" />
                      <span className="text-sm font-medium">{task.resources.labor_persons} {t('schedule.dialog.persons') || 'persons'}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {task.ideal_weather && (
              <div className="bg-info/5 rounded-2xl p-4 border border-info/20">
                <p className="text-sm font-semibold text-info mb-3">{t('schedule.task_card.ideal_weather')}</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {task.ideal_weather.temperature_min && (
                    <div className="p-2 bg-card rounded-xl">{t('schedule.task_card.temperature')}: {task.ideal_weather.temperature_min}°C - {task.ideal_weather.temperature_max}°C</div>
                  )}
                  {task.ideal_weather.humidity_min && (
                    <div className="p-2 bg-card rounded-xl">{t('schedule.task_card.humidity')}: {task.ideal_weather.humidity_min}% - {task.ideal_weather.humidity_max}%</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Action Confirmation Dialog - Modern 2030 UI */}
      <Dialog open={showActionDialog} onOpenChange={setShowActionDialog}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-lg">
              {selectedAction === 'completed' && t('schedule.task.mark_complete')}
              {selectedAction === 'skipped' && t('schedule.task.skip')}
              {selectedAction === 'rescheduled' && t('schedule.task.reschedule')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-muted-foreground">{t('schedule.dialog.notes_label')} {t('schedule.dialog.notes_optional')}</p>
            <Textarea
              value={actionNotes}
              onChange={(e) => setActionNotes(e.target.value)}
              placeholder={t('schedule.dialog.notes_placeholder')}
              rows={3}
              className="rounded-2xl"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowActionDialog(false)} className="rounded-2xl">
              {t('common.cancel')}
            </Button>
            <Button onClick={confirmAction} className="rounded-2xl bg-gradient-to-r from-primary to-primary/80">
              {t('schedule.dialog.done')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TaskCard;