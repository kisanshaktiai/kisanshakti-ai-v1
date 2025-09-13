import React, { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Droplets, Leaf, Bug, Scissors, Package, AlertCircle, Check, X, Clock, Volume2, Calendar, DollarSign, Users } from 'lucide-react';
import { format } from 'date-fns';

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
  const [showDetails, setShowDetails] = useState(false);
  const [showActionDialog, setShowActionDialog] = useState(false);
  const [selectedAction, setSelectedAction] = useState<'completed' | 'skipped' | 'rescheduled' | null>(null);
  const [actionNotes, setActionNotes] = useState('');

  const taskTypeConfig = {
    irrigation: { icon: Droplets, color: 'text-blue-500', bg: 'bg-blue-50' },
    fertilizer: { icon: Leaf, color: 'text-green-500', bg: 'bg-green-50' },
    pesticide: { icon: Bug, color: 'text-orange-500', bg: 'bg-orange-50' },
    weeding: { icon: Scissors, color: 'text-purple-500', bg: 'bg-purple-50' },
    harvest: { icon: Package, color: 'text-amber-500', bg: 'bg-amber-50' },
    other: { icon: AlertCircle, color: 'text-gray-500', bg: 'bg-gray-50' }
  };

  const config = taskTypeConfig[task.task_type as keyof typeof taskTypeConfig] || taskTypeConfig.other;
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
        className={`relative overflow-hidden transition-all hover:shadow-lg cursor-pointer ${
          task.status === 'completed' 
            ? 'opacity-75 bg-gray-50' 
            : isOverdue 
              ? 'border-red-300 bg-red-50/30' 
              : ''
        }`}
        onClick={() => setShowDetails(true)}
      >
        {/* Status indicator bar */}
        <div className={`absolute top-0 left-0 right-0 h-1 ${
          task.status === 'completed' 
            ? 'bg-green-500' 
            : isOverdue 
              ? 'bg-red-500' 
              : daysUntil === 0 
                ? 'bg-yellow-500'
                : 'bg-blue-500'
        }`} />

        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-lg ${config.bg} ${config.color}`}>
                <TaskIcon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className={`font-semibold text-gray-900 ${
                  task.status === 'completed' ? 'line-through' : ''
                }`}>
                  {task.task_name}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  <Calendar className="inline h-3 w-3 mr-1" />
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
              className="p-1"
            >
              <Volume2 className={`h-4 w-4 ${isSpeaking ? 'text-primary' : 'text-gray-400'}`} />
            </Button>
          </div>

          <div className="flex flex-wrap gap-2 mt-3">
            <Badge variant={task.priority === 'high' ? 'destructive' : task.priority === 'medium' ? 'default' : 'secondary'}>
              {task.priority} priority
            </Badge>
            {task.weather_dependent && (
              <Badge variant="outline">Weather Dependent</Badge>
            )}
            {isOverdue && (
              <Badge variant="destructive">Overdue</Badge>
            )}
            {daysUntil === 0 && !isOverdue && (
              <Badge className="bg-yellow-100 text-yellow-700">Today</Badge>
            )}
            {daysUntil === 1 && (
              <Badge className="bg-blue-100 text-blue-700">Tomorrow</Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          {task.task_description && (
            <p className="text-sm text-gray-600 mb-3 line-clamp-2">
              {task.task_description}
            </p>
          )}

          {/* Quick info */}
          <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
            {task.duration_hours && (
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {task.duration_hours} hours
              </div>
            )}
            {task.estimated_cost && (
              <div className="flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                ₹{task.estimated_cost}
              </div>
            )}
            {task.resources?.labor_persons && (
              <div className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {task.resources.labor_persons} persons
              </div>
            )}
          </div>

          {/* Action buttons */}
          {task.status === 'pending' && (
            <div className="flex gap-2 mt-4">
              <Button
                size="sm"
                className="flex-1"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAction('completed');
                }}
              >
                <Check className="h-4 w-4 mr-1" />
                Done
              </Button>
              <Button
                size="sm"
                variant="outline"
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

      {/* Details Dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TaskIcon className={`h-5 w-5 ${config.color}`} />
              {task.task_name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">Description</p>
              <p className="text-gray-900">{task.task_description || 'No description available'}</p>
            </div>

            {task.instructions && task.instructions.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-500 mb-2">Instructions</p>
                <ol className="list-decimal list-inside space-y-1">
                  {task.instructions.map((instruction: string, index: number) => (
                    <li key={index} className="text-gray-900">{instruction}</li>
                  ))}
                </ol>
              </div>
            )}

            {task.precautions && task.precautions.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-500 mb-2">Precautions</p>
                <ul className="list-disc list-inside space-y-1">
                  {task.precautions.map((precaution: string, index: number) => (
                    <li key={index} className="text-yellow-700 bg-yellow-50 p-2 rounded">
                      {precaution}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {task.resources && Object.keys(task.resources).length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-500 mb-2">Resources Needed</p>
                <div className="grid grid-cols-2 gap-3">
                  {task.resources.water_liters && (
                    <div className="flex items-center gap-2 p-2 bg-blue-50 rounded">
                      <Droplets className="h-4 w-4 text-blue-500" />
                      <span>{task.resources.water_liters} liters water</span>
                    </div>
                  )}
                  {task.resources.fertilizer_kg && (
                    <div className="flex items-center gap-2 p-2 bg-green-50 rounded">
                      <Leaf className="h-4 w-4 text-green-500" />
                      <span>{task.resources.fertilizer_kg} kg fertilizer</span>
                    </div>
                  )}
                  {task.resources.pesticide_ml && (
                    <div className="flex items-center gap-2 p-2 bg-orange-50 rounded">
                      <Bug className="h-4 w-4 text-orange-500" />
                      <span>{task.resources.pesticide_ml} ml pesticide</span>
                    </div>
                  )}
                  {task.resources.labor_persons && (
                    <div className="flex items-center gap-2 p-2 bg-purple-50 rounded">
                      <Users className="h-4 w-4 text-purple-500" />
                      <span>{task.resources.labor_persons} persons</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {task.ideal_weather && (
              <div>
                <p className="text-sm font-medium text-gray-500 mb-2">Ideal Weather Conditions</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {task.ideal_weather.temperature_min && (
                    <div>Temperature: {task.ideal_weather.temperature_min}°C - {task.ideal_weather.temperature_max}°C</div>
                  )}
                  {task.ideal_weather.humidity_min && (
                    <div>Humidity: {task.ideal_weather.humidity_min}% - {task.ideal_weather.humidity_max}%</div>
                  )}
                  {task.ideal_weather.wind_speed_max && (
                    <div>Max Wind Speed: {task.ideal_weather.wind_speed_max} km/h</div>
                  )}
                  {task.ideal_weather.rainfall_ok !== undefined && (
                    <div>Rainfall OK: {task.ideal_weather.rainfall_ok ? 'Yes' : 'No'}</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Action Confirmation Dialog */}
      <Dialog open={showActionDialog} onOpenChange={setShowActionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedAction === 'completed' && 'Mark as Completed'}
              {selectedAction === 'skipped' && 'Skip Task'}
              {selectedAction === 'rescheduled' && 'Reschedule Task'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p>Add any notes about this action (optional):</p>
            <Textarea
              value={actionNotes}
              onChange={(e) => setActionNotes(e.target.value)}
              placeholder="Enter notes..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowActionDialog(false)}>
              Cancel
            </Button>
            <Button onClick={confirmAction}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TaskCard;