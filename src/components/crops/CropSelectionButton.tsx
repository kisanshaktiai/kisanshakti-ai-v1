import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sprout, X } from 'lucide-react';
import { CropSelectionDialog } from './CropSelectionDialog';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

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
  const [displayName, setDisplayName] = useState<string | null>(cropName || null);
  const [cropIcon, setCropIcon] = useState<string | null>(null);

  // Fetch crop details if we have a crop name but no icon
  useEffect(() => {
    if (cropName) {
      fetchCropDetails(cropName);
    } else {
      setDisplayName(null);
      setCropIcon(null);
    }
  }, [cropName]);

  const fetchCropDetails = async (name: string) => {
    try {
      const { data, error } = await supabase
        .from('crops')
        .select('icon, label')
        .eq('label', name)
        .single();

      if (data && !error) {
        setCropIcon(data.icon);
        setDisplayName(data.label);
      }
    } catch (err) {
      console.error('Error fetching crop details:', err);
      setDisplayName(name);
    }
  };

  const handleSelect = (cropId: string, selectedCropName: string) => {
    onChange(cropId, selectedCropName);
    setDisplayName(selectedCropName);
    // Fetch the icon for the newly selected crop
    fetchCropDetails(selectedCropName);
    setDialogOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDisplayName(null);
    setCropIcon(null);
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
            "w-full justify-start text-left font-normal pr-10",
            !displayName && "text-muted-foreground"
          )}
          onClick={() => setDialogOpen(true)}
        >
          <div className="flex items-center gap-2 w-full">
            {displayName ? (
              <>
                {cropIcon ? (
                  <span className="text-lg flex-shrink-0">{cropIcon}</span>
                ) : (
                  <Sprout className="h-4 w-4 flex-shrink-0" />
                )}
                <span className="truncate">{displayName}</span>
              </>
            ) : (
              <>
                <Sprout className="h-4 w-4 flex-shrink-0" />
                <span>{placeholder}</span>
              </>
            )}
          </div>
        </Button>

        {displayName && (
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