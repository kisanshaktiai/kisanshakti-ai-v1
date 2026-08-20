import React, { Component, ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

class ScheduleErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false };

  public static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error) {
    console.error('❌ [ScheduleErrorBoundary] Task card render failed:', error);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <Card className="p-3 flex items-center gap-2 border-border/50 bg-muted/40">
          <AlertTriangle className="h-4 w-4 text-muted-foreground shrink-0" />
          <p className="text-xs text-muted-foreground">Could not display this task</p>
        </Card>
      );
    }
    return this.props.children;
  }
}

export default ScheduleErrorBoundary;
