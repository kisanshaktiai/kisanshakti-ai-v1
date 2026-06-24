import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export const WeatherSkeleton = () => {
  return (
    <div className="min-h-full bg-gradient-to-br from-background to-primary/5 animate-fade-in overflow-hidden">
      {/* Hero Section Skeleton - Matches WeatherHeroCard */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary/20 to-background rounded-b-3xl p-4 pb-6">
        <div className="relative z-10">
          {/* Location and date row */}
          <div className="flex justify-between items-start mb-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-3.5 w-3.5 rounded" />
                <Skeleton className="h-4 w-28" />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
            <Skeleton className="h-9 w-9 rounded-full" />
          </div>

          {/* Main Weather Display Skeleton */}
          <div className="flex justify-between items-center">
            <div className="space-y-3">
              <div className="flex items-baseline gap-2">
                <Skeleton className="h-16 w-20" />
                <Skeleton className="h-6 w-6" />
              </div>
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-3 w-24" />
            </div>
            <div className="flex flex-col items-center gap-2">
              <Skeleton className="h-20 w-20 rounded-2xl" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </div>
        </div>
      </div>

      {/* Sunrise/Sunset Row Skeleton */}
      <div className="px-3 pt-3 pb-1">
        <div className="flex justify-center gap-6">
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-8 w-24 rounded-full" />
        </div>
      </div>

      {/* Quick Stats Grid Skeleton - 3 column top row */}
      <div className="px-3 py-2">
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-card/90 backdrop-blur-xl rounded-2xl p-3 border border-border/50">
              <div className="flex flex-col items-center gap-1">
                <Skeleton className="h-5 w-5 rounded" />
                <Skeleton className="h-6 w-10" />
                <Skeleton className="h-3 w-12" />
              </div>
            </div>
          ))}
        </div>

        {/* 4 column secondary row */}
        <div className="grid grid-cols-4 gap-2 mt-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-card/90 backdrop-blur-xl rounded-2xl p-2 border border-border/50">
              <div className="flex flex-col items-center gap-0.5">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-5 w-8" />
                <Skeleton className="h-2 w-10" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Farming Recommendations Skeleton */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-3">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-5 w-40" />
        </div>
        <div className="flex gap-3 overflow-hidden">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex-none w-[140px]">
              <div className="bg-card rounded-xl p-4 border border-border/50 space-y-2">
                <Skeleton className="h-8 w-8 rounded" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Hourly Chart Skeleton */}
      <div className="px-4 py-3">
        <Card className="bg-card/80 border-border/50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
          </CardHeader>
          <CardContent className="pb-3">
            <Skeleton className="h-[180px] w-full rounded-lg" />
          </CardContent>
        </Card>
      </div>

      {/* Rainfall Skeleton */}
      <div className="px-4 py-3">
        <Card className="bg-card/80 border-border/50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-5 w-12 rounded-full" />
            </div>
          </CardHeader>
          <CardContent className="space-y-2 pb-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Skeleton className="h-2 w-12" />
                <Skeleton className="h-5 w-16" />
              </div>
              <div className="space-y-1">
                <Skeleton className="h-2 w-16" />
                <Skeleton className="h-5 w-16" />
              </div>
            </div>
            <Skeleton className="h-24 w-full rounded-lg" />
          </CardContent>
        </Card>
      </div>

      {/* 7-Day Forecast Skeleton - Modern Vertical Layout */}
      <div className="px-4 py-3 pb-24">
        <div className="flex items-center justify-between mb-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-16" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="bg-card/90 backdrop-blur-xl rounded-xl p-3 border border-border/50">
              <div className="flex items-center gap-3">
                {/* Day label */}
                <div className="w-12 flex-shrink-0 space-y-1">
                  <Skeleton className="h-4 w-8" />
                  <Skeleton className="h-2 w-10" />
                </div>
                {/* Weather icon */}
                <Skeleton className="w-10 h-10 rounded-xl flex-shrink-0" />
                {/* Temperature bar */}
                <div className="flex-1 space-y-1">
                  <div className="flex justify-between">
                    <Skeleton className="h-3 w-6" />
                    <Skeleton className="h-4 w-8" />
                  </div>
                  <Skeleton className="h-2 w-full rounded-full" />
                </div>
                {/* Rain indicator */}
                <div className="w-10 flex-shrink-0 flex flex-col items-center gap-0.5">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-2 w-6" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
