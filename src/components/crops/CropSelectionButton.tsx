import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sprout, X } from 'lucide-react';
import { CropSelectionDialog } from './CropSelectionDialog';
import { cn } from '@/lib/utils';

interface CropSelectionButtonProps {
  value?: string;
  cropName?: string;
  onChange: (cropId: string, cropName: string) => void;
  onClear?: () => void;
  label?: string;
  placeholder?: string;
  className?: string;
  required?: boolean;
}

export function CropSelectionButton({ 
  value, 
  cropName,
  onChange, 
  onClear,
  label,
  placeholder = "Select Crop",
  className,
  required
}: CropSelectionButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleSelect = (cropId: string, selectedCropName: string) => {
    onChange(cropId, selectedCropName);
    setDialogOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onClear) {
      onClear();
    } else {
      onChange('', '');
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <label className="text-sm font-medium text-foreground">
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </label>
      )}
      
      <div className="relative">
        <Button
          type="button"
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            !cropName && "text-muted-foreground"
          )}
          onClick={() => setDialogOpen(true)}
        >
          <Sprout className="mr-2 h-4 w-4" />
          {cropName || placeholder}
        </Button>

        {cropName && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1 h-7 w-7"
            onClick={handleClear}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      <CropSelectionDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSelect={handleSelect}
        selectedCropId={value}
        title={label || "Select Crop"}
      />
    </div>
  );
}