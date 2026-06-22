import React from 'react';

export const PostCardSkeleton: React.FC = () => (
  <div className="bg-card rounded-3xl border border-border p-4 animate-pulse">
    <div className="flex items-center gap-3 mb-4">
      <div className="w-12 h-12 rounded-full bg-muted" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-24 bg-muted rounded" />
        <div className="h-2 w-32 bg-muted/70 rounded" />
      </div>
    </div>
    <div className="space-y-2 mb-3">
      <div className="h-3 w-full bg-muted rounded" />
      <div className="h-3 w-5/6 bg-muted rounded" />
      <div className="h-3 w-3/4 bg-muted rounded" />
    </div>
    <div className="aspect-[4/3] w-full bg-muted/70 rounded-2xl mb-3" />
    <div className="flex gap-2">
      <div className="h-8 w-16 bg-muted rounded-full" />
      <div className="h-8 w-16 bg-muted rounded-full" />
      <div className="h-8 w-16 bg-muted rounded-full" />
    </div>
  </div>
);

export const PostCardSkeletonList: React.FC<{ count?: number }> = ({ count = 3 }) => (
  <div className="space-y-4">
    {Array.from({ length: count }).map((_, i) => (
      <PostCardSkeleton key={i} />
    ))}
  </div>
);
