import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { PlayCircle } from 'lucide-react';
import { VideoHelpDialog } from './VideoHelpDialog';
import { useVideoTutorials } from '@/hooks/useVideoTutorials';
import { cn } from '@/lib/utils';

interface VideoHelpButtonProps {
  category: string;
  taskType?: string;
  className?: string;
  size?: 'sm' | 'default' | 'lg' | 'icon';
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
}

export function VideoHelpButton({ 
  category, 
  taskType, 
  className,
  size = 'sm',
  variant = 'ghost'
}: VideoHelpButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { data: videos, isLoading } = useVideoTutorials({ 
    category,
    enabled: isOpen // Only load when dialog is opened
  });

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    console.log('Video Help button clicked for category:', category);
    setIsOpen(true);
  };

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={handleClick}
        className={cn("gap-2 pointer-events-auto", className)}
      >
        <PlayCircle className="h-4 w-4 text-blue-500" />
        <span>See Video</span>
      </Button>
      
      <VideoHelpDialog
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        videos={videos}
        category={category}
        isLoading={isLoading}
      />
    </>
  );
}
