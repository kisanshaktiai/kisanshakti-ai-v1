import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Sprout, X } from 'lucide-react';
import { CropSelectorModal } from './CropSelectorModal';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface CropInputProps {
  value?: string; // Crop ID
  onChange: (cropId: string, cropName: string) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
  error?: string;
}

export function CropInput({
  value,
  onChange,
  label,
  placeholder = "Click to select crop",
  required = false,
  className,
  error
}: CropInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [cropName, setCropName] = useState<string>("");
  const [cropIcon, setCropIcon] = useState<string>("");

  // Fetch crop details when value changes
  useEffect(() => {
    if (value) {
      fetchCropDetails(value);
    } else {
      setCropName("");
      setCropIcon("");
    }
  }, [value]);

  const fetchCropDetails = async (cropId: string) => {
    try {
      const { data, error } = await supabase
        .from('crops')
        .select('label, icon')
        .eq('id', cropId)
        .single();

      if (!error && data) {
        setCropName(data.label);
        setCropIcon(data.icon || "🌱");
      }
    } catch (err) {
      console.error('Error fetching crop details:', err);
    }
  };

  const handleSelect = (cropId: string, cropLabel: string) => {
    onChange(cropId, cropLabel);
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange("", "");
    setCropName("");
    setCropIcon("");
  };

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <Label>
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </Label>
      )}
      
      <div className="relative">
        <Button
          type="button"
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            !cropName && "text-muted-foreground",
            error && "border-destructive"
          )}
          onClick={() => setIsOpen(true)}
        >
          <div className="flex items-center gap-2 w-full">
            {cropName ? (
              <>
                <span className="text-lg">{cropIcon}</span>
                <span className="truncate">{cropName}</span>
              </>
            ) : (
              <>
                <Sprout className="h-4 w-4" />
                <span>{placeholder}</span>
              </>
            )}
          </div>
        </Button>

        {cropName && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1 h-7 w-7"
            onClick={(e) => {
              e.stopPropagation();
              handleClear();
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      <CropSelectorModal
        open={isOpen}
        onClose={() => setIsOpen(false)}
        onSelect={handleSelect}
        selectedCropId={value}
        title={label || "Select Crop"}
      />
    </div>
  );
}