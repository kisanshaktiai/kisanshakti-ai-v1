import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { LucideIcon } from 'lucide-react';

interface NutrientCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  letter: string;
  letterColor: string;
  level?: string;
  kgPerHa?: number;
  totalKg?: number;
  text?: string;
  maxValue?: number;
}

export function NutrientCard({
  icon: Icon,
  title,
  description,
  letter,
  letterColor,
  level,
  kgPerHa,
  totalKg,
  text,
  maxValue = 500,
}: NutrientCardProps) {
  const getNutrientColor = (lvl: string | undefined) => {
    if (!lvl) return 'bg-muted';
    const normalized = lvl.toLowerCase();
    if (normalized.includes('high') || normalized.includes('good')) return 'bg-success';
    if (normalized.includes('medium') || normalized.includes('moderate')) return 'bg-warning';
    return 'bg-destructive';
  };

  const getNutrientProgress = (value: number | undefined) => {
    if (!value) return 0;
    return Math.min((value / maxValue) * 100, 100);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full ${letterColor} flex items-center justify-center`}>
            <span className="text-lg font-bold">{letter}</span>
          </div>
          <div>
            <p className="font-semibold">{title}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <Badge className={getNutrientColor(level)}>
          {level || 'N/A'}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-4 pl-13">
        <div>
          <p className={`text-2xl font-bold ${letterColor.replace('bg-', 'text-').replace('/10', '')}`}>
            {kgPerHa || 'N/A'}
          </p>
          <p className="text-xs text-muted-foreground">kg/ha</p>
        </div>
        {totalKg && (
          <div>
            <p className={`text-2xl font-bold ${letterColor.replace('bg-', 'text-').replace('/10', '')}`}>
              {totalKg}
            </p>
            <p className="text-xs text-muted-foreground">Total kg</p>
          </div>
        )}
      </div>
      {text && (
        <p className="text-sm text-muted-foreground mt-2 pl-13">{text}</p>
      )}
      {kgPerHa && (
        <Progress value={getNutrientProgress(kgPerHa)} className="mt-3 h-2" />
      )}
    </div>
  );
}
