import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Droplets, Leaf, Bug, Scissors, Package, AlertCircle } from 'lucide-react';
import { format, isToday, isTomorrow, isPast } from 'date-fns';

interface Task {
  id: string;
  task_date: string;
  task_type: string;
  task_name: string;
  status: string;
  priority: string;
  weather_dependent: boolean;
}

interface TaskTimelineProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

const TaskTimeline: React.FC<TaskTimelineProps> = ({ tasks, onTaskClick }) => {
  const taskTypeConfig = {
    irrigation: { icon: Droplets, color: 'bg-blue-500' },
    fertilizer: { icon: Leaf, color: 'bg-green-500' },
    pesticide: { icon: Bug, color: 'bg-orange-500' },
    weeding: { icon: Scissors, color: 'bg-purple-500' },
    harvest: { icon: Package, color: 'bg-amber-500' },
    other: { icon: AlertCircle, color: 'bg-gray-500' }
  };

  // Group tasks by date
  const groupedTasks = tasks.reduce((acc, task) => {
    const date = task.task_date;
    if (!acc[date]) acc[date] = [];
    acc[date].push(task);
    return acc;
  }, {} as Record<string, Task[]>);

  const getDateLabel = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'EEE, dd MMM');
  };

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">Timeline View</h3>
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gray-200"></div>
        
        {/* Timeline items */}
        <div className="space-y-6">
          {Object.entries(groupedTasks).map(([date, dateTasks], index) => {
            const isPastDate = isPast(new Date(date)) && !isToday(new Date(date));
            
            return (
              <div key={date} className="relative">
                {/* Date marker */}
                <div className="flex items-center mb-3">
                  <div className={`w-4 h-4 rounded-full ${isPastDate ? 'bg-gray-400' : 'bg-primary'} absolute left-6 z-10`}></div>
                  <div className="ml-14">
                    <p className={`font-medium ${isPastDate ? 'text-gray-500' : 'text-gray-900'}`}>
                      {getDateLabel(date)}
                    </p>
                  </div>
                </div>
                
                {/* Tasks for this date */}
                <div className="ml-14 space-y-2">
                  {dateTasks.map((task) => {
                    const config = taskTypeConfig[task.task_type as keyof typeof taskTypeConfig] || taskTypeConfig.other;
                    const TaskIcon = config.icon;
                    
                    return (
                      <div
                        key={task.id}
                        className={`p-3 rounded-lg border cursor-pointer transition-all hover:shadow-md ${
                          task.status === 'completed' 
                            ? 'bg-gray-50 border-gray-200' 
                            : isPastDate 
                              ? 'bg-red-50 border-red-200'
                              : 'bg-white border-gray-200 hover:border-primary/50'
                        }`}
                        onClick={() => onTaskClick(task)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-lg ${config.color} text-white`}>
                              <TaskIcon className="h-4 w-4" />
                            </div>
                            <div>
                              <p className={`font-medium ${task.status === 'completed' ? 'line-through text-gray-500' : ''}`}>
                                {task.task_name}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant={task.priority === 'high' ? 'destructive' : task.priority === 'medium' ? 'default' : 'secondary'} className="text-xs">
                                  {task.priority}
                                </Badge>
                                {task.weather_dependent && (
                                  <Badge variant="outline" className="text-xs">
                                    Weather Dependent
                                  </Badge>
                                )}
                                {task.status === 'completed' && (
                                  <Badge className="bg-green-100 text-green-700 text-xs">
                                    Completed
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
};

export default TaskTimeline;