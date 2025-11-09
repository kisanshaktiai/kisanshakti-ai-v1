import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export const WeatherSkeleton = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-primary/5 animate-fade-in">
      {/* Hero Section Skeleton */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary/20 to-background p-4 pb-6">
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-3.5 w-3.5 rounded" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="h-3 w-40" />
            </div>
            <Skeleton className="h-10 w-10 rounded-lg" />
          </div>

          {/* Main Weather Display Skeleton */}
          <div className="flex justify-between items-center mb-6">
            <div className="space-y-3">
              <div className="flex items-baseline gap-2">
                <Skeleton className="h-16 w-24" />
                <Skeleton className="h-8 w-8" />
              </div>
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-24 w-24 rounded-2xl" />
          </div>
        </div>
      </div>

      {/* Quick Stats Grid Skeleton */}
      <div className="px-3 -mt-3 relative z-20">
        <div className="grid grid-cols-2 gap-2 mb-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-card/90 backdrop-blur-xl rounded-xl p-3 border border-border/50">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Skeleton className="h-3.5 w-3.5 rounded" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <div className="flex items-baseline gap-1">
                  <Skeleton className="h-6 w-12" />
                  <Skeleton className="h-3 w-8" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs Skeleton */}
        <Card className="mb-4">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-20 rounded-lg" />
              <Skeleton className="h-8 w-20 rounded-lg" />
              <Skeleton className="h-8 w-20 rounded-lg" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
                <div className="text-right space-y-2">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-3 w-12" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Chart Skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-48 w-full rounded-lg" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
