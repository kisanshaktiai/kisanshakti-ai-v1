import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Sprout, X } from 'lucide-react';
import { CropSelectionDialog } from './CropSelectionDialog';
import { supabase } from '@/integrations/supabase/client';

interface CropSelectionButtonProps {
  value?: string; // Crop ID
  cropName?: string; // Crop name (for backward compatibility)
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
  placeholder = "Select a crop",
  className,
  required = false
}: CropSelectionButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [displayName, setDisplayName] = useState<string>("");
  const [cropIcon, setCropIcon] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  // Fetch crop details when value or cropName changes
  useEffect(() => {
    const fetchCropDetails = async () => {
      if (!value && !cropName) {
        setDisplayName("");
        setCropIcon("");
        return;
      }

      setIsLoading(true);
      try {
        let data = null;
        let error = null;

        // Try to fetch by ID first (if value is provided)
        if (value) {
          const result = await supabase
            .from('crops')
            .select('label, icon')
            .eq('id', value)
            .maybeSingle();
          
          data = result.data;
          error = result.error;
        }

        // If no data found by ID, try by label (cropName)
        if (!data && cropName) {
          const result = await supabase
            .from('crops')
            .select('label, icon')
            .eq('label', cropName)
            .maybeSingle();

          data = result.data;
          error = result.error;

          // If still not found, try by value field
          if (!data) {
            const valueResult = await supabase
              .from('crops')
              .select('label, icon')
              .eq('value', cropName)
              .maybeSingle();
            
            data = valueResult.data;
          }
        }

        if (data) {
          setDisplayName(data.label);
          setCropIcon(data.icon || "");
        } else {
          // Fallback to displaying the raw cropName
          setDisplayName(cropName || "");
          setCropIcon("");
        }
      } catch (error) {
        console.error('Error fetching crop details:', error);
        setDisplayName(cropName || "");
        setCropIcon("");
      } finally {
        setIsLoading(false);
      }
    };

    fetchCropDetails();
  }, [value, cropName]);

  const handleSelect = (cropId: string, cropLabel: string) => {
    console.log('Crop selected:', { cropId, cropLabel });
    onChange(cropId, cropLabel);
    setDialogOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDisplayName("");
    setCropIcon("");
    onChange("", "");
    if (onClear) {
      onClear();
    }
  };

  const handleButtonClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('Opening crop selection dialog...');
    setDialogOpen(true);
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
            !displayName && "text-muted-foreground",
            isLoading && "opacity-50"
          )}
          onClick={handleButtonClick}
          disabled={isLoading}
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

        {displayName && !isLoading && (
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
        onClose={() => {
          console.log('Closing crop selection dialog');
          setDialogOpen(false);
        }}
        onSelect={handleSelect}
        selectedCropId={value}
        title={label || "Select Crop"}
      />
    </div>
  );
}