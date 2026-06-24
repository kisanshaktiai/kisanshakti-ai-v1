import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { motion } from 'framer-motion';

export const HomeSkeleton = () => {
  return (
    <div className="min-h-full bg-background animate-fade-in">
      {/* Floating Weather Card Skeleton */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="fixed top-16 left-4 right-4 z-30 mx-auto max-w-lg"
      >
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/20 via-primary/10 to-background border border-border/50 backdrop-blur-xl shadow-elegant">
          {/* Drag Handle */}
          <div className="flex justify-center pt-2 pb-1">
            <Skeleton className="h-1 w-12 rounded-full bg-muted/50" />
          </div>
          
          <div className="p-4 space-y-4">
            {/* Greeting & Location Row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
              <Skeleton className="h-8 w-8 rounded-full" />
            </div>

            {/* Weather Main Display */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Skeleton className="h-16 w-16 rounded-2xl" />
                <div className="space-y-2">
                  <Skeleton className="h-10 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
              <div className="text-right space-y-2">
                <Skeleton className="h-4 w-20 ml-auto" />
                <Skeleton className="h-3 w-16 ml-auto" />
              </div>
            </div>

            {/* Quick Stats Grid - 3 columns */}
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3].map((i) => (
                <div 
                  key={i} 
                  className="bg-card/60 backdrop-blur-sm rounded-xl p-3 border border-border/30"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Skeleton className="h-4 w-4 rounded" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                  <Skeleton className="h-5 w-14" />
                </div>
              ))}
            </div>

            {/* Farm Stats Grid - 2 columns */}
            <div className="grid grid-cols-2 gap-3">
              {[1, 2].map((i) => (
                <div 
                  key={i} 
                  className="bg-card/60 backdrop-blur-sm rounded-xl p-3 border border-border/30"
                >
                  <div className="flex items-center justify-between mb-2">
                    <Skeleton className="h-4 w-4 rounded" />
                    <Skeleton className="h-4 w-12 rounded-full" />
                  </div>
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-3 w-16 mt-1" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Main Content with padding for weather card */}
      <div className="pt-[380px] px-4 pb-24 space-y-6">
        {/* Main Features Grid - 2x2 */}
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card 
              key={i} 
              className="overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm"
            >
              <div className="h-1 w-full">
                <Skeleton className="h-full w-full rounded-none" />
              </div>
              <CardHeader className="pb-2 pt-4">
                <div className="flex items-start justify-between mb-3">
                  <Skeleton className="h-12 w-12 rounded-2xl" />
                  <Skeleton className="h-5 w-14 rounded-full" />
                </div>
                <Skeleton className="h-5 w-24 mb-1" />
                <Skeleton className="h-3 w-full" />
              </CardHeader>
              <CardContent className="pt-0 pb-4">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-3 w-10" />
                </div>
                <Skeleton className="h-1.5 w-full rounded-full mt-3" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Secondary Features Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-5 w-32" />
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Card 
                key={i} 
                className="border-border/50 bg-card/80 backdrop-blur-sm"
              >
                <CardContent className="p-3">
                  <div className="flex items-center gap-3 mb-2">
                    <Skeleton className="h-10 w-10 rounded-xl" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-4 w-10 rounded-full" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Recent Activity Horizontal Scroll */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-5 w-28" />
          </div>
          
          <div className="flex gap-3 overflow-hidden">
            {[1, 2, 3].map((i) => (
              <div 
                key={i}
                className="flex-shrink-0 w-64 bg-card/80 backdrop-blur-sm rounded-xl p-4 border border-border/50"
              >
                <div className="flex items-center gap-3 mb-3">
                  <Skeleton className="h-3 w-3 rounded-full" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-3 w-full mb-2" />
                <Skeleton className="h-3 w-3/4" />
                <div className="flex items-center justify-between mt-3">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-6 w-16 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Video Help Card Skeleton */}
        <Card className="overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <Skeleton className="h-20 w-32 rounded-xl flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-8 w-24 rounded-full mt-2" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
